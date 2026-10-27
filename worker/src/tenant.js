// Un streamer dentro del worker: su motor de reacciones, sus pantallas conectadas (overlay, vista previa,
// panel), sus conexiones a plataformas y el medidor de minutos en vivo.
import { Engine } from '../../core/engine.js';
import { sanitizeConfig } from '../../core/config.js';
import { encryptJSON, decryptJSON } from '../../core/tokens.js';
import { db } from './db.js';
import { TwitchConnector } from './connectors/twitch.js';
import { YouTubeConnector } from './connectors/youtube.js';
import { FacebookConnector } from './connectors/facebook.js';
import { TikTokConnector } from './connectors/tiktok.js';

export const CONNECTORS = { twitch: TwitchConnector, youtube: YouTubeConnector, facebook: FacebookConnector, tiktok: TikTokConnector };

const NO_LIVE_LIMIT = 20 * 60000; // sin ninguna plataforma en vivo
const NO_OVERLAY_LIMIT = 15 * 60000; // sin OBS conectado

export class Tenant {
  constructor(userId) {
    this.userId = userId;
    this.clients = new Set(); // { res, role }
    this.connectors = {};
    this.platforms = {}; // estado visible: { twitch: { state, text } }
    this.tokens = {};
    this.session = null;
    this.meterTimer = null;
    this.lastActive = Date.now();
  }

  async load() {
    let m = await db().from('mascots').select('overlay_key, config').eq('user_id', this.userId).maybeSingle();
    if (m.error) throw m.error;
    if (!m.data) {
      m = await db().from('mascots').upsert({ user_id: this.userId }, { onConflict: 'user_id' }).select('overlay_key, config').single();
      if (m.error) throw m.error;
    }
    const oldKey = this.overlayKey;
    this.overlayKey = m.data.overlay_key;
    this.config = sanitizeConfig(m.data.config);
    if (this.engine) this.engine.setConfig(this.config);
    else this.engine = new Engine(this.config, (kind, payload) => this.onEngine(kind, payload));
    // Si se cambió la URL del overlay, la vieja deja de funcionar al instante.
    if (oldKey && oldKey !== this.overlayKey) {
      for (const c of this.clients) if (c.role !== 'panel') c.res.end();
    }
    this.send('config', this.config);
  }

  onEngine(kind, payload) {
    if (kind === 'play' && this.session) this.session.reactions++;
    if (kind === 'log' || kind === 'state') this.send(kind, payload, ['panel']);
    else this.send(kind, payload);
  }

  // ---------- clientes ----------

  send(kind, payload, roles = null) {
    const data = `event: ${kind}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const c of this.clients) if (!roles || roles.includes(c.role)) c.res.write(data);
  }

  sendTo(client, kind, payload) {
    client.res.write(`event: ${kind}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  addClient(client) {
    this.clients.add(client);
    this.lastActive = Date.now();
    this.sendTo(client, 'config', this.config);
    if (client.role === 'panel') {
      this.sendTo(client, 'state', this.engine.state());
      this.sendTo(client, 'history', this.engine.log);
      this.sendTo(client, 'platforms', this.platforms);
      this.sendTo(client, 'session', this.sessionInfo());
    }
    const cur = this.engine.current;
    if (cur) this.sendTo(client, 'play', { id: cur.id, reaction: cur.reaction, text: cur.text, duration: Math.max(300, cur.startedAt + cur.duration - Date.now()), resume: true });
    this.send('clients', this.counts(), ['panel']);
  }

  removeClient(client) {
    this.clients.delete(client);
    this.lastActive = Date.now();
    this.send('clients', this.counts(), ['panel']);
  }

  counts() {
    const n = { overlay: 0, preview: 0, panel: 0 };
    for (const c of this.clients) n[c.role]++;
    return n;
  }

  idle() {
    return !this.session && this.clients.size === 0;
  }

  // ---------- eventos ----------

  ingest(evt, source) {
    this.lastActive = Date.now();
    if (source !== 'simulador') {
      if (!this.session) return { ok: false };
      this.session.events++;
    }
    return this.engine.ingest(evt, source);
  }

  // ---------- sesión en vivo y cobro ----------

  sessionInfo() {
    const s = this.session;
    if (!s) return { active: false, lastEnd: this.lastEnd || null };
    return { active: true, startedAt: s.startedAt, minutes: s.minutes, remaining: s.remaining, platforms: s.platforms, events: s.events, reactions: s.reactions };
  }

  async startSession() {
    if (this.session) return { ok: true };
    const uid = this.userId;
    const [conns, planId, left, toks] = await Promise.all([
      db().from('connections').select('platform, settings').eq('user_id', uid).eq('enabled', true),
      db().rpc('effective_plan', { p_user: uid }),
      db().rpc('consume_minutes', { p_user: uid, p_minutes: 0 }),
      db().from('platform_tokens').select('platform, data').eq('user_id', uid),
    ]);
    for (const r of [conns, planId, left, toks]) if (r.error) throw r.error;
    const plan = await db().from('plans').select('name, max_platforms').eq('id', planId.data).single();
    if (plan.error) throw plan.error;

    const list = conns.data.filter((c) => CONNECTORS[c.platform]);
    if (!list.length) return { ok: false, error: 'Activa al menos una plataforma en la pestaña Conexiones.' };
    if (list.length > plan.data.max_platforms) {
      return { ok: false, error: `Tu plan ${plan.data.name} permite ${plan.data.max_platforms} plataforma${plan.data.max_platforms > 1 ? 's' : ''} a la vez. Desactiva alguna o mejora tu plan.` };
    }
    if (left.data <= 0) return { ok: false, error: 'Se acabaron tus minutos en vivo. Compra horas extra o mejora tu plan.' };

    this.tokens = {};
    for (const t of toks.data) {
      try { this.tokens[t.platform] = decryptJSON(t.data); } catch (e) { console.error('token ilegible', uid, t.platform, e.message); }
    }

    const ins = await db().from('live_sessions').insert({ user_id: uid, platforms: list.map((c) => c.platform) }).select('id').single();
    if (ins.error) throw ins.error;

    const now = Date.now();
    this.session = {
      id: ins.data.id,
      startedAt: now,
      minutes: 0,
      remaining: left.data,
      platforms: list.map((c) => c.platform),
      events: 0,
      reactions: 0,
      noLiveSince: now,
      noOverlaySince: this.counts().overlay ? null : now,
    };
    this.platforms = {};
    for (const c of list) {
      const conn = new CONNECTORS[c.platform]({
        userId: uid,
        settings: c.settings || {},
        emit: (evt) => this.ingest(evt, c.platform),
        onStatus: (platform, state, text) => {
          this.platforms[platform] = { state, text };
          this.send('platforms', this.platforms, ['panel']);
        },
        getTokens: () => this.tokens[c.platform] || null,
        saveTokens: (t) => this.saveTokens(c.platform, t),
      });
      this.connectors[c.platform] = conn;
      conn.start();
    }
    this.meterTimer = setInterval(() => this.meter().catch((e) => console.error('medidor', uid, e.message)), 60000);
    this.engine.pushLog({ kind: 'sesión', action: 'iniciada', detail: this.session.platforms.join(', ') });
    this.send('session', this.sessionInfo(), ['panel']);
    return { ok: true };
  }

  async saveTokens(platform, value) {
    this.tokens[platform] = value;
    const r = await db().from('platform_tokens').upsert({ user_id: this.userId, platform, data: encryptJSON(value), updated_at: new Date().toISOString() });
    if (r.error) console.error('no se guardó el token', this.userId, platform, r.error.message);
  }

  // Cada minuto: solo se cobra si al menos una plataforma está en vivo.
  async meter() {
    const s = this.session;
    if (!s) return;
    const now = Date.now();
    const anyLive = Object.values(this.connectors).some((c) => c.state === 'live');
    s.noLiveSince = anyLive ? null : (s.noLiveSince ?? now);
    s.noOverlaySince = this.counts().overlay ? null : (s.noOverlaySince ?? now);
    if (s.noLiveSince && now - s.noLiveSince > NO_LIVE_LIMIT) return this.stopSession('No se detectó ningún directo en 20 minutos.');
    if (s.noOverlaySince && now - s.noOverlaySince > NO_OVERLAY_LIMIT) return this.stopSession('El overlay de OBS estuvo desconectado 15 minutos.');

    if (anyLive) {
      const r = await db().rpc('consume_minutes', { p_user: this.userId, p_minutes: 1 });
      if (r.error) throw r.error;
      if (r.data < 0) return this.stopSession('Se acabaron tus minutos en vivo.');
      s.minutes++;
      s.remaining = r.data;
    }
    await db().from('live_sessions').update({ minutes: s.minutes, events: s.events, reactions: s.reactions }).eq('id', s.id);
    this.send('session', this.sessionInfo(), ['panel']);
  }

  async stopSession(reason = 'Detenida desde el panel.') {
    const s = this.session;
    if (!s) return;
    this.session = null;
    clearInterval(this.meterTimer);
    for (const c of Object.values(this.connectors)) c.stop();
    this.connectors = {};
    this.lastEnd = { reason, at: Date.now(), minutes: s.minutes };
    this.engine.pushLog({ kind: 'sesión', action: 'terminada', detail: `${reason} (${s.minutes} min cobrados)` });
    this.send('session', this.sessionInfo(), ['panel']);
    this.send('platforms', this.platforms, ['panel']);
    const r = await db().from('live_sessions')
      .update({ ended_at: new Date().toISOString(), minutes: s.minutes, events: s.events, reactions: s.reactions, end_reason: reason })
      .eq('id', s.id);
    if (r.error) console.error('no se cerró la sesión', s.id, r.error.message);
  }
}
