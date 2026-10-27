// Sesión en vivo y cobro por minuto con una base falsa en memoria y conectores falsos.
// Se corre con: node --test --experimental-test-module-mocks
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.TOKENS_KEY = Buffer.alloc(32, 1).toString('base64');

const store = {
  wallet: 3, // minutos disponibles
  plan: { name: 'Gratis', max_platforms: 1 },
  connections: [{ platform: 'twitch', settings: { channel: 'x' } }],
  sessions: [],
  calls: [],
};

// Imita lo justo del cliente de Supabase que usa tenant.js.
function query(table) {
  const q = { table, op: 'select', filters: {} };
  const result = () => {
    store.calls.push(`${q.op}:${table}`);
    if (table === 'mascots') return { data: { overlay_key: 'k'.repeat(36), config: {} }, error: null };
    if (table === 'connections') return { data: store.connections, error: null };
    if (table === 'platform_tokens') return { data: [], error: null };
    if (table === 'plans') return { data: store.plan, error: null };
    if (table === 'live_sessions') {
      if (q.op === 'insert') { store.sessions.push({ id: 's1', ...q.row }); return { data: { id: 's1' }, error: null }; }
      if (q.op === 'update') { Object.assign(store.sessions[0], q.row); return { data: null, error: null }; }
    }
    return { data: null, error: null };
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    insert: (row) => { q.op = 'insert'; q.row = row; return chain; },
    update: (row) => { q.op = 'update'; q.row = row; return chain; },
    upsert: (row) => { q.op = 'upsert'; q.row = row; return chain; },
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (ok, ko) => Promise.resolve(result()).then(ok, ko),
  };
  return chain;
}

const fakeDb = {
  from: query,
  rpc: async (name, args) => {
    if (name === 'effective_plan') return { data: 'gratis', error: null };
    if (name === 'consume_minutes') {
      if (store.wallet < args.p_minutes) return { data: -1, error: null };
      store.wallet -= args.p_minutes;
      return { data: store.wallet, error: null };
    }
    return { data: null, error: null };
  },
};

mock.module('../src/db.js', { namedExports: { db: () => fakeDb, userFromToken: async () => 'u1' } });
const { Tenant, CONNECTORS } = await import('../src/tenant.js');

class FakeConnector {
  constructor(ctx) { this.ctx = ctx; this.state = 'off'; FakeConnector.last = this; }
  start() { this.state = 'connecting'; }
  stop() { this.state = 'off'; this.stopped = true; }
}
CONNECTORS.twitch = FakeConnector;

const fakeClient = () => ({ res: { write() {}, end() {} }, role: 'overlay' });

test('inicia, cobra solo con directo activo y se detiene al acabarse los minutos', async () => {
  const t = new Tenant('u1');
  await t.load();
  t.addClient(fakeClient()); // OBS conectado
  const r = await t.startSession();
  assert.equal(r.ok, true);
  clearInterval(t.meterTimer); // el minuto se avanza a mano

  // Conectando: no se cobra.
  await t.meter();
  assert.equal(store.wallet, 3);
  assert.equal(t.session.minutes, 0);

  // En vivo: un minuto por llamada.
  FakeConnector.last.state = 'live';
  await t.meter();
  await t.meter();
  assert.equal(store.wallet, 1);
  assert.equal(t.session.minutes, 2);

  // Los eventos reales cuentan solo con sesión.
  t.ingest({ type: 'follow', user: 'Ana' }, 'twitch');
  assert.equal(t.session.events, 1);

  await t.meter(); // último minuto
  await t.meter(); // ya no alcanza
  assert.equal(t.session, null);
  assert.equal(FakeConnector.last.stopped, true);
  assert.equal(store.sessions[0].minutes, 3);
  assert.match(store.sessions[0].end_reason, /minutos/);
  t.engine.clear('fin');
});

test('no inicia sin minutos, sin plataformas o con más plataformas que el plan', async () => {
  const t = new Tenant('u2');
  await t.load();
  store.wallet = 0;
  assert.match((await t.startSession()).error, /minutos/);
  store.wallet = 10;
  store.connections = [];
  assert.match((await t.startSession()).error, /al menos una plataforma/);
  store.connections = [{ platform: 'twitch', settings: {} }, { platform: 'youtube', settings: {} }];
  assert.match((await t.startSession()).error, /permite 1 plataforma/);
  assert.equal(t.session, null);
  t.engine.clear('fin');
});

test('sin sesión, los eventos de plataformas se ignoran pero el simulador funciona', async () => {
  const played = [];
  const t = new Tenant('u3');
  await t.load();
  const orig = t.engine.emit;
  t.engine.emit = (k, p) => { if (k === 'play') played.push(p); orig(k, p); };
  assert.equal(t.ingest({ type: 'follow', user: 'Ana' }, 'tiktok').ok, false);
  t.ingest({ type: 'follow', user: 'Beto' }, 'simulador');
  assert.equal(played.length, 1);
  t.engine.clear('fin');
});

test('se detiene si no hay directo en 20 minutos', async () => {
  store.connections = [{ platform: 'twitch', settings: {} }];
  store.wallet = 100;
  const t = new Tenant('u4');
  await t.load();
  t.addClient(fakeClient());
  await t.startSession();
  clearInterval(t.meterTimer);
  t.session.noLiveSince = Date.now() - 21 * 60000;
  await t.meter();
  assert.equal(t.session, null);
  assert.equal(store.wallet, 100);
  t.engine.clear('fin');
});
