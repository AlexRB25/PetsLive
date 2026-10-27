// YouTube Live: chat del directo con la API oficial (YouTube Data API v3) y la clave del servidor.
// Recibe mensajes, Super Chats, Super Stickers y membresías. Los "suscriptores" del canal no llegan por el chat.
// Cuota: cada lectura del chat gasta unidades de la cuota diaria del proyecto de Google (10 000 por defecto),
// así que se lee como mínimo cada YT_MIN_POLL_MS y hay que pedir más cuota a Google para muchos usuarios.
import { Connector } from './base.js';

const API = 'https://www.googleapis.com/youtube/v3';
const MIN_POLL = () => Math.max(3000, Number(process.env.YT_MIN_POLL_MS) || 10000);

export function parseVideoId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12) || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v').slice(0, 11);
    const m = u.pathname.match(/\/(live|shorts|embed)\/([\w-]{11})/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

export function toEvent(item) {
  const sn = item.snippet || {};
  const user = item.authorDetails?.displayName || '';
  const id = `yt-${item.id}`;
  switch (sn.type) {
    case 'textMessageEvent':
      return { type: 'chat', id, user, text: sn.displayMessage || sn.textMessageDetails?.messageText || '' };
    case 'superChatEvent':
    case 'superStickerEvent': {
      const d = sn.superChatDetails || sn.superStickerDetails || {};
      const value = Math.round((Number(d.amountMicros) || 0) / 1e6);
      return { type: 'gift', id, user, gift: d.amountDisplayString || 'Super Chat', amount: 1, value };
    }
    case 'newSponsorEvent':
    case 'memberMilestoneChatEvent':
      return { type: 'sub', id, user };
    case 'membershipGiftingEvent': {
      const n = Number(sn.membershipGiftingDetails?.giftMembershipsCount) || 1;
      return { type: 'gift', id, user, gift: 'membresías', amount: n, value: n * 50 };
    }
    default:
      return null;
  }
}

export class YouTubeConnector extends Connector {
  constructor(ctx) {
    super('youtube', ctx);
    this.chatId = null;
    this.pageToken = null;
    this.channelId = null;
  }

  async api(path, params) {
    const q = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY || '' });
    const res = await fetch(`${API}/${path}?${q}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.reason = body?.error?.errors?.[0]?.reason || '';
      throw err;
    }
    return body;
  }

  start() {
    if (!process.env.YOUTUBE_API_KEY) return this.status('error', 'El servidor no tiene YOUTUBE_API_KEY');
    this.resolve();
  }

  async findLiveByChannel(channel) {
    if (!this.channelId) {
      const c = String(channel).trim();
      if (/^UC[\w-]{22}$/.test(c)) this.channelId = c;
      else {
        const handle = c.replace(/^https?:\/\/(www\.)?youtube\.com\//, '').replace(/^@?/, '@').split(/[/?]/)[0];
        const r = await this.api('channels', { part: 'id', forHandle: handle });
        this.channelId = r.items?.[0]?.id || null;
        if (!this.channelId) throw Object.assign(new Error('No se encontró ese canal de YouTube'), { reason: 'notFound' });
      }
    }
    // search.list cuesta 100 unidades: por eso se reintenta con calma.
    const r = await this.api('search', { part: 'id', channelId: this.channelId, eventType: 'live', type: 'video', maxResults: '1' });
    return r.items?.[0]?.id?.videoId || null;
  }

  async resolve() {
    const s = this.ctx.settings;
    try {
      this.status('connecting', 'buscando tu directo…');
      let videoId = parseVideoId(s.liveUrl);
      if (!videoId && s.channel) videoId = await this.findLiveByChannel(s.channel);
      if (!videoId) {
        this.status('waiting', 'esperando tu directo en YouTube');
        return this.later(() => this.resolve(), s.liveUrl ? 60000 : 180000);
      }
      const v = await this.api('videos', { part: 'liveStreamingDetails', id: videoId });
      const chatId = v.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
      if (!chatId) {
        this.status('waiting', 'el video no tiene un chat en vivo activo todavía');
        return this.later(() => this.resolve(), 60000);
      }
      this.chatId = chatId;
      this.pageToken = null;
      this.first = true;
      this.status('live', 'chat de YouTube conectado');
      this.poll();
    } catch (e) {
      this.fail(e);
    }
  }

  fail(e) {
    if (e.reason === 'quotaExceeded' || e.reason === 'rateLimitExceeded') {
      this.status('error', 'Se agotó la cuota diaria de la API de YouTube; se reintentará más tarde');
      return this.later(() => this.resolve(), 30 * 60000);
    }
    if (e.reason === 'liveChatEnded' || e.reason === 'liveChatNotFound' || e.status === 404) {
      this.chatId = null;
      this.status('waiting', 'el directo terminó; esperando uno nuevo');
      return this.later(() => this.resolve(), 60000);
    }
    if (e.reason === 'notFound') return this.status('error', e.message);
    this.status('error', `YouTube: ${e.message}`);
    this.later(() => this.resolve(), 60000);
  }

  async poll() {
    if (!this.chatId) return;
    try {
      const params = { liveChatId: this.chatId, part: 'snippet,authorDetails', maxResults: '200' };
      if (this.pageToken) params.pageToken = this.pageToken;
      const r = await this.api('liveChat/messages', params);
      this.pageToken = r.nextPageToken || this.pageToken;
      // La primera página trae mensajes viejos: no se reacciona a ellos.
      if (!this.first) for (const item of r.items || []) {
        const evt = toEvent(item);
        if (evt) this.emit(evt);
      }
      this.first = false;
      if (r.offlineAt) {
        this.chatId = null;
        this.status('waiting', 'el directo terminó; esperando uno nuevo');
        return this.later(() => this.resolve(), 60000);
      }
      this.later(() => this.poll(), Math.max(Number(r.pollingIntervalMillis) || 0, MIN_POLL()));
    } catch (e) {
      this.fail(e);
    }
  }
}
