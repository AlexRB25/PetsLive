// Un streamer dentro del worker: su motor de reacciones, sus pantallas conectadas (overlay, vista previa,
// panel), sus conexiones a plataformas y el medidor de minutos en vivo.
import { Engine } from '../../core/engine.js';
import { sanitizeConfig } from '../../core/config.js';
import { encryptJSON, decryptJSON } from '../../core/tokens.js';
import { db } from './db.js';
import { SessionStats } from './stats.js';
import { cachedAudio, synthesize } from './voice.js';
import { TwitchConnector } from './connectors/twitch.js';
import { YouTubeConnector } from './connectors/youtube.js';
import { FacebookConnector } from './connectors/facebook.js';
import { TikTokConnector } from './connectors/tiktok.js';

export const CONNECTORS = { twitch: TwitchConnector, youtube: YouTubeConnector, facebook: FacebookConnector, tiktok: TikTokConnector };

const NO_LIVE_LIMIT = 20 * 60000; // sin ninguna plataforma en vivo
const NO_OVERLAY_LIMIT = 15 * 60000; // sin OBS conectado
const MAX_COMMENTS = 5000; // comentarios guardados por directo para el resumen

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
    // Llave de ElevenLabs propia del streamer (opcional), cifrada como los demás tokens.
    const ev = await db().from('platform_tokens').select('data').eq('user_id', this.userId).eq('platform', 'elevenlabs').maybeSingle();
    this.elevenKey = null;
    if (ev.data?.data) try { this.elevenKey = decryptJSON(ev.data.data).apiKey || null; } catch (e) { console.error('llave ElevenLabs ilegible', this.userId, e.message); }
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
    // La voz llega aparte (event audio) para no retrasar la animación.
    if (kind === 'play' && !payload.resume) {
      this.voiceFor(payload)
        .then((v) => v && this.send('audio', { id: payload.id, ...v }))
        .catch((e) => {
          console.error('voz', this.userId, e.message);
          this.send('audio', { id: payload.id, fallback: true });
        });
    }
  }

  /**
   * Qué audio acompaña a una reacción: { url } (grabado o ElevenLabs), { fallback: true } (usar la voz
   * del navegador) o null (la voz del navegador ya la maneja el cliente o no hay nada que decir).
   */
  async voiceFor(p) {
    const v = this.config.voice;
    if (v.output === 'off' || this.config.behavior.silent || v.engine === 'navegador') return null;
    if (v.engine === 'grabada') {
      const list = v.clips[p.rule === 'idle' ? 'idle' : p.reaction] || [];
      if (!list.length) return p.text ? { fallback: true } : null;
      let i = Math.floor(Math.random() * list.length);
      if (list.length > 1 && list[i] === this.lastClip) i = (i + 1) % list.length;
      this.lastClip = list[i];
      return { url: list[i] };
    }
    if (!p.text) return null;
    const own = v.engine === 'elevenlabs_propia';
    const apiKey = own ? this.elevenKey : process.env.ELEVENLABS_API_KEY;
    const voice = own ? v.ownVoice : v.elevenVoice || process.env.ELEVENLABS_DEFAULT_VOICE || '';
    if (!apiKey || !voice) return { fallback: true };
    const text = p.text.slice(0, 300);
    // Con la cuenta de la plataforma se descuenta del cupo del plan (lo que ya está en caché no cuenta).
    if (!own && !cachedAudio(voice, text)) {
      const q = await db().rpc('consume_tts', { p_user: this.userId, p_chars: text.length });
      if (q.error) throw q.error;
      if (!q.data) {
        if (Date.now() - (this.ttsWarnedAt || 0) > 3600000) {
          this.ttsWarnedAt = Date.now();
          this.engine.pushLog({ kind: 'voz', action: 'descartado', detail: 'Se acabaron los caracteres de voz de este mes; se usa la voz del navegador.' });
        }
        return { fallback: true };
      }
    }
    return { url: `/audio/${await synthesize(apiKey, voice, text)}.mp3` };
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
    this.sendTo(client, 'game', this.engine.game.state());
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
      const s = this.session;
      if (!s) return { ok: false };
      s.events++;
      s.stats.add(evt, source);
      // Comentarios para el resumen del directo (sin nombre; se borran al hacer el resumen).
      const text = evt.type === 'chat' && typeof evt.text === 'string' ? evt.text.trim() : '';
      if (text && this.config.summary.saveComments && s.savedComments + s.pending.length < MAX_COMMENTS) {
        s.pending.push({ session_id: s.id, user_id: this.userId, platform: source, text: text.slice(0, 300) });
      }
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
    if (await this.isBlocked()) return { ok: false, error: 'Tu cuenta está suspendida. Escríbenos si crees que es un error.' };
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
      stats: new SessionStats(),
      pending: [],
      savedComments: 0,
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
    // Invitaciones a interactuar cuando el chat está quieto.
    this.engine.lastActivity = now;
    this.idleTimer = setInterval(() => this.engine.idleTick(), 5000);
    this.engine.pushLog({ kind: 'sesión', action: 'iniciada', detail: this.session.platforms.join(', ') });
    this.send('session', this.sessionInfo(), ['panel']);
    return { ok: true };
  }

  async saveTokens(platform, value) {
    this.tokens[platform] = value;
    const r = await db().from('platform_tokens').upsert({ user_id: this.userId, platform, data: encryptJSON(value), updated_at: new Date().toISOString() });
    if (r.error) console.error('no se guardó el token', this.userId, platform, r.error.message);
  }

  async isBlocked() {
    const r = await db().from('profiles').select('blocked').eq('id', this.userId).maybeSingle();
    return Boolean(r.data?.blocked);
  }

  // Cada minuto: solo se cobra si al menos una plataforma está en vivo.
  async meter() {
    const s = this.session;
    if (!s) return;
    if (await this.isBlocked()) return this.stopSession('La cuenta fue suspendida.');
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
    await this.flushComments(s);
    await db().from('live_sessions').update({ minutes: s.minutes, events: s.events, reactions: s.reactions, stats: s.stats.toJSON() }).eq('id', s.id);
    this.send('session', this.sessionInfo(), ['panel']);
  }

  async flushComments(s) {
    if (!s.pending.length) return;
    const rows = s.pending.splice(0);
    const r = await db().from('session_comments').insert(rows);
    if (r.error) console.error('no se guardaron comentarios', s.id, r.error.message);
    else s.savedComments += rows.length;
  }

  async stopSession(reason = 'Detenida desde el panel.') {
    const s = this.session;
    if (!s) return;
    this.session = null;
    clearInterval(this.meterTimer);
    clearInterval(this.idleTimer);
    for (const c of Object.values(this.connectors)) c.stop();
    this.connectors = {};
    this.lastEnd = { reason, at: Date.now(), minutes: s.minutes };
    this.engine.pushLog({ kind: 'sesión', action: 'terminada', detail: `${reason} (${s.minutes} min cobrados)` });
    this.send('session', this.sessionInfo(), ['panel']);
    this.send('platforms', this.platforms, ['panel']);
    await this.flushComments(s);
    const r = await db().from('live_sessions')
      .update({ ended_at: new Date().toISOString(), minutes: s.minutes, events: s.events, reactions: s.reactions, stats: s.stats.toJSON(), end_reason: reason })
      .eq('id', s.id);
    if (r.error) console.error('no se cerró la sesión', s.id, r.error.message);
  }
}
