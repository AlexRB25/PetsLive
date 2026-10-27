// Twitch: chat por IRC anónimo oficial (mensajes, bits, suscripciones, raids) y, si el streamer
// conectó su cuenta, follows por EventSub (WebSocket) con su token.
import { Connector } from './base.js';

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';

let appToken = null; // token de la app (client credentials) para saber si un canal está en vivo

async function getAppToken() {
  if (appToken && appToken.until > Date.now() + 60000) return appToken.token;
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  appToken = { token: j.access_token, until: Date.now() + (j.expires_in || 3600) * 1000 };
  return appToken.token;
}

/** true/false si el canal transmite; null si no se pudo saber (sin credenciales de la app). */
export async function isLive(login) {
  const token = await getAppToken();
  if (!token) return null;
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, {
    headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) appToken = null;
  if (!res.ok) return null;
  return ((await res.json()).data || []).length > 0;
}

function parseTags(raw) {
  const tags = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    tags[part.slice(0, i)] = part.slice(i + 1).replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\');
  }
  return tags;
}

export function parseLine(line) {
  let rest = line;
  let tags = {};
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    tags = parseTags(rest.slice(1, sp));
    rest = rest.slice(sp + 1);
  }
  let prefix = '';
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ');
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  const ti = rest.indexOf(' :');
  const trailing = ti >= 0 ? rest.slice(ti + 2) : '';
  const params = (ti >= 0 ? rest.slice(0, ti) : rest).split(' ');
  return { tags, prefix, command: params[0], params: params.slice(1), trailing };
}

// Convierte una línea IRC en un evento normalizado o null.
export function toEvent(msg) {
  const user = msg.tags['display-name'] || msg.tags.login || msg.prefix.split('!')[0] || '';
  const id = msg.tags.id ? `tw-${msg.tags.id}` : undefined;
  if (msg.command === 'PRIVMSG') {
    const bits = Number(msg.tags.bits || 0);
    if (bits > 0) return { type: 'gift', id, user, gift: 'bits', amount: bits, value: bits };
    return { type: 'chat', id, user, text: msg.trailing };
  }
  if (msg.command === 'USERNOTICE') {
    const kind = msg.tags['msg-id'];
    if (kind === 'sub' || kind === 'resub') return { type: 'sub', id, user };
    if (kind === 'subgift' || kind === 'submysterygift') {
      const n = Number(msg.tags['msg-param-mass-gift-count'] || 1);
      return { type: 'gift', id, user, gift: 'suscripciones', amount: n, value: n * 500 };
    }
    if (kind === 'raid') return { type: 'join', id, user };
  }
  return null;
}

export class TwitchConnector extends Connector {
  constructor(ctx) {
    super('twitch', ctx);
    this.irc = null;
    this.es = null;
    this.retry = 0;
    this.follows = false;
    this.joined = false;
    this.onAir = null;
    this.liveTimer = null;
  }

  start() {
    const channel = String(this.ctx.settings.channel || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!channel) return this.status('error', 'Falta el canal de Twitch');
    this.channel = channel;
    this.connectIrc();
    if (this.ctx.getTokens()) this.connectEventSub(EVENTSUB_URL, false);
    this.checkLive();
  }

  // Solo cuenta como en vivo (y se cobra) si Twitch dice que el canal está transmitiendo.
  async checkLive() {
    if (this.stopped) return;
    try { this.onAir = await isLive(this.channel); } catch { this.onAir = null; }
    this.refresh();
    this.liveTimer = setTimeout(() => this.checkLive(), 120000);
  }

  refresh() {
    if (!this.joined) return;
    if (this.onAir === false) this.status('waiting', `chat de #${this.channel} conectado; el canal no está en vivo`);
    else this.status('live', this.label());
  }

  label() {
    return `#${this.channel}${this.follows ? ' · chat y follows' : ' · chat (conecta tu cuenta para recibir follows)'}`;
  }

  connectIrc() {
    this.status('connecting', `conectando a #${this.channel}…`);
    const ws = new WebSocket(IRC_URL);
    this.irc = ws;
    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
      ws.send(`JOIN #${this.channel}`);
    };
    ws.onmessage = (e) => {
      for (const line of String(e.data).split('\r\n')) {
        if (!line) continue;
        if (line.startsWith('PING')) { ws.send(line.replace('PING', 'PONG')); continue; }
        const msg = parseLine(line);
        if (msg.command === 'JOIN') { this.retry = 0; this.joined = true; this.refresh(); continue; }
        if (msg.command === 'RECONNECT') { ws.close(); continue; }
        const evt = toEvent(msg);
        if (evt) this.emit(evt);
      }
    };
    ws.onclose = () => {
      if (this.irc !== ws || this.stopped) return;
      this.joined = false;
      const wait = Math.min(30000, 1000 * 2 ** this.retry++);
      this.status('connecting', `reconectando en ${Math.round(wait / 1000)} s…`);
      this.later(() => this.connectIrc(), wait);
    };
    ws.onerror = () => {};
  }

  async accessToken(force = false) {
    const t = this.ctx.getTokens();
    if (!t) return null;
    if (!force && t.expires_at > Date.now() + 60000) return t.access_token;
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: t.refresh_token,
        client_id: process.env.TWITCH_CLIENT_ID || '',
        client_secret: process.env.TWITCH_CLIENT_SECRET || '',
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const next = { ...t, access_token: j.access_token, refresh_token: j.refresh_token || t.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000 };
    await this.ctx.saveTokens(next);
    return next.access_token;
  }

  async subscribeFollow(sessionId) {
    const t = this.ctx.getTokens();
    const body = JSON.stringify({
      type: 'channel.follow',
      version: '2',
      condition: { broadcaster_user_id: t.user_id, moderator_user_id: t.user_id },
      transport: { method: 'websocket', session_id: sessionId },
    });
    for (const force of [false, true]) {
      const token = await this.accessToken(force);
      if (!token) break;
      const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok || res.status === 409) {
        this.follows = true;
        this.refresh();
        return;
      }
      if (res.status !== 401) break;
    }
    this.follows = false;
    if (this.state === 'live') this.status('live', `#${this.channel} · chat (no se activaron los follows: vuelve a conectar tu cuenta)`);
  }

  connectEventSub(url, isReconnect) {
    const ws = new WebSocket(url);
    const previous = this.es;
    this.es = ws;
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      const type = m.metadata?.message_type;
      if (type === 'session_welcome') {
        // En una reconexión las suscripciones se conservan; solo se cierra el socket viejo.
        if (isReconnect && previous) try { previous.close(); } catch {}
        if (!isReconnect) this.subscribeFollow(m.payload.session.id).catch(() => {});
      } else if (type === 'session_reconnect') {
        this.connectEventSub(m.payload.session.reconnect_url, true);
      } else if (type === 'notification' && m.payload?.subscription?.type === 'channel.follow') {
        this.emit({ type: 'follow', id: `twf-${m.metadata.message_id}`, user: m.payload.event?.user_name || '' });
      } else if (type === 'revocation') {
        this.follows = false;
      }
    };
    ws.onclose = () => {
      if (this.es !== ws || this.stopped) return;
      this.follows = false;
      setTimeout(() => { if (!this.stopped && this.es === ws) this.connectEventSub(EVENTSUB_URL, false); }, 5000);
    };
    ws.onerror = () => {};
  }

  close() {
    clearTimeout(this.liveTimer);
    const irc = this.irc;
    const es = this.es;
    this.irc = null;
    this.es = null;
    if (irc) irc.close();
    if (es) es.close();
  }
}
