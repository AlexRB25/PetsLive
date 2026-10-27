// TikTok LIVE — EXPERIMENTAL Y NO OFICIAL. TikTok no ofrece una API pública para los eventos de LIVE;
// esto usa tiktok-live-connector, que lee el servicio interno de TikTok. Puede dejar de funcionar o ser
// bloqueado en cualquier momento y va contra los términos de uso automatizado de TikTok.
// TIKTOK_SIGN_API_KEY (Euler Stream) es opcional, pero sin ella el firmado tiene límites bajos.
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { Connector } from './base.js';

const nick = (d) => d?.user?.nickname || d?.user?.uniqueId || '';
const msgId = (d) => (d?.common?.msgId ? `tt-${d.common.msgId}` : undefined);

export function giftEvent(d) {
  const g = d?.gift || d?.giftDetails || {};
  const type = g.type ?? g.giftType;
  // Los regalos en racha llegan varias veces; solo se agradece al terminar la racha.
  if (type === 1 && !d.repeatEnd) return null;
  const count = Number(d.repeatCount) || 1;
  return {
    type: 'gift',
    id: msgId(d),
    user: nick(d),
    gift: g.name || g.giftName || 'regalo',
    amount: count,
    value: (Number(g.diamondCount) || 0) * count,
  };
}

export class TikTokConnector extends Connector {
  constructor(ctx) {
    super('tiktok', ctx);
    this.conn = null;
  }

  start() {
    const user = String(this.ctx.settings.username || '').trim().replace(/^@/, '');
    if (!/^[\w.]{2,24}$/.test(user)) return this.status('error', 'Escribe tu usuario de TikTok');
    this.username = user;
    this.connect();
  }

  async connect() {
    this.status('connecting', `conectando con @${this.username} (experimental)…`);
    const conn = new TikTokLiveConnection(this.username, {
      signApiKey: process.env.TIKTOK_SIGN_API_KEY || undefined,
      processInitialData: false,
    });
    this.conn = conn;
    const mine = () => this.conn === conn && !this.stopped;

    conn.on(WebcastEvent.MEMBER, (d) => mine() && this.emit({ type: 'join', id: msgId(d), user: nick(d) }));
    conn.on(WebcastEvent.CHAT, (d) => mine() && this.emit({ type: 'chat', id: msgId(d), user: nick(d), text: d.comment || '' }));
    conn.on(WebcastEvent.LIKE, (d) => mine() && this.emit({ type: 'like', user: nick(d), amount: Number(d.likeCount) || 1 }));
    conn.on(WebcastEvent.FOLLOW, (d) => mine() && this.emit({ type: 'follow', id: msgId(d), user: nick(d) }));
    conn.on(WebcastEvent.GIFT, (d) => {
      const evt = mine() && giftEvent(d);
      if (evt) this.emit(evt);
    });
    conn.on(WebcastEvent.STREAM_END, () => {
      if (!mine()) return;
      this.status('waiting', 'el directo de TikTok terminó; esperando uno nuevo');
      this.later(() => this.connect(), 60000);
    });
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (!mine() || this.state === 'waiting') return;
      this.status('connecting', 'conexión perdida; reintentando…');
      this.later(() => this.connect(), 10000);
    });
    conn.on(ControlEvent.ERROR, () => {});

    try {
      await conn.connect();
      if (mine()) this.status('live', `@${this.username} · experimental`);
    } catch (e) {
      if (!mine()) return;
      const name = e?.constructor?.name || '';
      if (name === 'UserOfflineError' || /offline|not live|isn't online/i.test(String(e?.message))) {
        this.status('waiting', `@${this.username} no está en vivo todavía`);
        this.later(() => this.connect(), 60000);
      } else if (/rate.?limit/i.test(name + e?.message)) {
        this.status('error', 'TikTok/Euler limitó las conexiones; reintentando en 2 min');
        this.later(() => this.connect(), 120000);
      } else {
        this.status('error', `TikTok: ${String(e?.message || e).slice(0, 160)}`);
        this.later(() => this.connect(), 60000);
      }
    }
  }

  close() {
    const conn = this.conn;
    this.conn = null;
    if (conn) conn.disconnect().catch(() => {});
  }
}
