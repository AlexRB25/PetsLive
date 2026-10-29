// Worker de Mascota LIVE: servicio Node siempre encendido (Railway, Render, Fly…).
// Mantiene las conexiones a Twitch, YouTube, Facebook y TikTok, corre el motor de reacciones de cada
// streamer y reparte las animaciones al overlay de OBS y al panel por Server-Sent Events.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { REACTIONS } from '../core/config.js';
import { db, userFromToken } from './src/db.js';
import { Tenant } from './src/tenant.js';
import { getAudio } from './src/voice.js';

const PORT = Number(process.env.PORT) || 8080;
const ORIGINS = (process.env.SITE_URL || 'http://localhost:3000').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);

for (const k of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'TOKENS_KEY']) {
  if (!process.env[k]) console.warn(`Falta la variable ${k}`);
}

const tenants = new Map(); // userId → Tenant
const tickets = new Map(); // ticket de un solo uso para el SSE del panel → { userId, until }
const keyCache = new Map(); // overlay_key → { userId, until }
const simLimit = new Map(); // userId → marcas de tiempo (simulador)

async function tenantFor(userId) {
  let t = tenants.get(userId);
  if (!t) {
    t = new Tenant(userId);
    tenants.set(userId, t);
    t.loading = t.load().catch((e) => { tenants.delete(userId); throw e; });
  }
  await t.loading;
  return t;
}

async function userFromOverlayKey(key) {
  if (!/^[0-9a-f]{36}$/.test(key || '')) return null;
  const hit = keyCache.get(key);
  if (hit && hit.until > Date.now()) return hit.userId;
  const r = await db().from('mascots').select('user_id').eq('overlay_key', key).maybeSingle();
  if (r.error) throw r.error;
  if (!r.data) return null;
  keyCache.set(key, { userId: r.data.user_id, until: Date.now() + 5 * 60000 });
  return r.data.user_id;
}

// ---------- utilidades HTTP ----------

function cors(req, res, open = false) {
  const origin = req.headers.origin;
  if (open) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin && ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 200_000) { reject(new Error('cuerpo demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function openStream(req, res, tenant, role) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const client = { res, role };
  tenant.addClient(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    tenant.removeClient(client);
  });
}

async function authUser(req) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  return userFromToken(token);
}

function allowSim(userId) {
  const now = Date.now();
  const list = (simLimit.get(userId) || []).filter((t) => now - t < 60000);
  if (list.length >= 30) return false;
  list.push(now);
  simLimit.set(userId, list);
  return true;
}

// ---------- rutas ----------

async function route(req, res, url) {
  const path = url.pathname;

  // commit: versión desplegada (Render la pone en RENDER_GIT_COMMIT) para saber si el worker está al día.
  if (path === '/health') return json(res, 200, { ok: true, commit: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7), tenants: tenants.size, live: [...tenants.values()].filter((t) => t.session).length });

  // Audios de ElevenLabs generados para las reacciones (los pide el overlay o el panel).
  const audio = path.match(/^\/audio\/([0-9a-f]{32})\.mp3$/);
  if (audio && req.method === 'GET') {
    const buf = getAudio(audio[1]);
    cors(req, res, true);
    if (!buf) return json(res, 404, { error: 'audio no encontrado' });
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=86400' });
    return res.end(buf);
  }

  if (path === '/overlay/stream' && req.method === 'GET') {
    cors(req, res, true);
    const userId = await userFromOverlayKey(url.searchParams.get('key'));
    if (!userId) return json(res, 404, { error: 'overlay desconocido' });
    const t = await tenantFor(userId);
    if (t.overlayKey !== url.searchParams.get('key')) return json(res, 404, { error: 'overlay desconocido' });
    return openStream(req, res, t, url.searchParams.has('preview') ? 'preview' : 'overlay');
  }

  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (path === '/panel/stream' && req.method === 'GET') {
    const tk = tickets.get(url.searchParams.get('ticket') || '');
    tickets.delete(url.searchParams.get('ticket') || '');
    if (!tk || tk.until < Date.now()) return json(res, 401, { error: 'ticket vencido' });
    return openStream(req, res, await tenantFor(tk.userId), 'panel');
  }

  if (!path.startsWith('/panel/') || req.method !== 'POST') return json(res, 404, { error: 'no encontrado' });
  const userId = await authUser(req);
  if (!userId) return json(res, 401, { error: 'Inicia sesión de nuevo.' });

  if (path === '/panel/ticket') {
    const ticket = randomBytes(24).toString('hex');
    tickets.set(ticket, { userId, until: Date.now() + 60000 });
    return json(res, 200, { ticket });
  }

  const t = await tenantFor(userId);
  const body = await readBody(req);

  if (path === '/panel/event') {
    if (!allowSim(userId)) return json(res, 429, { error: 'Demasiadas pruebas seguidas; espera un momento.' });
    const list = Array.isArray(body) ? body.slice(0, 300) : [body];
    return json(res, 200, { results: list.map((e) => t.ingest(e, 'simulador')) });
  }
  if (path === '/panel/test') {
    if (!REACTIONS.slice(1).includes(body.reaction)) return json(res, 400, { error: 'reacción desconocida' });
    return json(res, 200, t.engine.test(body.reaction, body.text));
  }
  if (path === '/panel/control') {
    switch (body.action) {
      case 'clear': t.engine.clear('manual'); break;
      case 'idle': t.engine.idleTick(true); break;
      case 'game-reset': t.engine.game.reset(); break;
      case 'clear-history': t.engine.log = []; t.send('history', [], ['panel']); break;
      case 'reload': await t.load(); keyCache.clear(); break;
      case 'start': return json(res, 200, await t.startSession());
      case 'stop': await t.stopSession('Detenida desde el panel.'); break;
      default: return json(res, 400, { error: 'acción desconocida' });
    }
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'no encontrado' });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    await route(req, res, url);
  } catch (e) {
    console.error(req.method, url.pathname, e);
    if (!res.headersSent) json(res, 500, { error: 'Error del servidor; intenta de nuevo.' });
    else res.end();
  }
});

// Limpieza: tickets vencidos y streamers sin pantallas ni directo desde hace 10 minutos.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of tickets) if (v.until < now) tickets.delete(k);
  for (const [id, t] of tenants) {
    if (t.idle() && now - t.lastActive > 10 * 60000) {
      t.engine?.clear('inactivo');
      tenants.delete(id);
    }
  }
}, 60000).unref();

// Los comentarios guardados para resúmenes que nunca se pidieron se borran a los 30 días.
setInterval(async () => {
  if (!process.env.SUPABASE_URL) return;
  const r = await db().from('session_comments').delete().lt('created_at', new Date(Date.now() - 30 * 86400000).toISOString());
  if (r.error) console.error('limpieza de comentarios', r.error.message);
}, 3600000).unref();

// Al apagarse, las sesiones quedan abiertas en la base y se reanudan al arrancar (despliegues, caídas).
async function resumeSessions() {
  const r = await db().from('live_sessions').select('id, user_id').is('ended_at', null);
  if (r.error) return console.error('no se pudieron leer las sesiones abiertas', r.error.message);
  for (const s of r.data) {
    await db().from('live_sessions').update({ ended_at: new Date().toISOString(), end_reason: 'Reinicio del servidor; se reanudó sola.' }).eq('id', s.id);
    try {
      const t = await tenantFor(s.user_id);
      const res = await t.startSession();
      if (!res.ok) console.log('no se reanudó', s.user_id, res.error);
    } catch (e) {
      console.error('no se reanudó', s.user_id, e.message);
    }
  }
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

server.listen(PORT, () => {
  console.log(`Worker de Mascota LIVE en el puerto ${PORT}`);
  if (process.env.SUPABASE_URL) resumeSessions();
});
