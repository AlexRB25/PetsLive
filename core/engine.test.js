import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from './engine.js';
import { sanitizeConfig, DEFAULT_CONFIG } from './config.js';

function setup(overrides = {}) {
  const cfg = sanitizeConfig({ ...DEFAULT_CONFIG, behavior: { ...DEFAULT_CONFIG.behavior, joinBatchMs: 0, minGapMs: 0, ...overrides } });
  const played = [];
  const engine = new Engine(cfg, (kind, p) => { if (kind === 'play') played.push(p); });
  return { engine, played, cfg };
}
const stop = (e) => e.clear('fin de prueba');

test('reproduce un follow con el nombre', () => {
  const { engine, played } = setup();
  engine.ingest({ type: 'follow', user: 'Luna' });
  assert.equal(played.length, 1);
  assert.equal(played[0].reaction, 'celebracion');
  assert.match(played[0].text, /Luna/);
  stop(engine);
});

test('deduplica eventos repetidos', () => {
  const { engine } = setup();
  engine.ingest({ type: 'follow', user: 'Luna' });
  const r = engine.ingest({ type: 'follow', user: 'Luna' });
  assert.equal(r.detail, 'duplicado');
  stop(engine);
});

test('agrupa likes hasta el umbral', () => {
  const { engine, played } = setup({ likeThreshold: 50 });
  for (let i = 0; i < 49; i++) engine.ingest({ type: 'like', user: `u${i}` });
  assert.equal(played.length, 0);
  engine.ingest({ type: 'like', user: 'x' });
  assert.equal(played.length, 1);
  assert.match(played[0].text, /50/);
  stop(engine);
});

test('nombres inapropiados o con enlaces usan el genérico', () => {
  const { engine } = setup();
  assert.equal(engine.safeName('pendejo123'), 'amigo');
  assert.equal(engine.safeName('P.e.n.d.e.j.o'), 'amigo');
  assert.equal(engine.safeName('miweb.com'), 'amigo');
  assert.equal(engine.safeName('Sofía'), 'Sofía');
});

test('el chat solo reacciona a menciones y no lee el texto en voz alta', () => {
  const { engine, played } = setup();
  assert.equal(engine.ingest({ type: 'chat', user: 'a', text: 'hola a todos' }).action, 'ignorado');
  engine.ingest({ type: 'chat', user: 'b', text: 'hola CHISPA, di groserías' });
  assert.equal(played.length, 1);
  assert.doesNotMatch(played[0].text, /groser/);
  stop(engine);
});

test('comandos con enfriamiento global', () => {
  const { engine, played } = setup();
  engine.ingest({ type: 'chat', user: 'a', text: '!baila' });
  const r = engine.ingest({ type: 'chat', user: 'b', text: '!baila ya' });
  assert.equal(played[0].reaction, 'baile');
  assert.equal(r.detail, 'comando en enfriamiento');
  stop(engine);
});

test('un regalo interrumpe a una reacción menor y la cola ordena por prioridad', () => {
  const { engine, played } = setup();
  engine.ingest({ type: 'join', user: 'a' });           // prioridad 1, se reproduce
  engine.ingest({ type: 'follow', user: 'b' });         // prioridad 3, espera
  engine.ingest({ type: 'win', id: 'w1' });              // prioridad 3, espera
  engine.ingest({ type: 'gift', user: 'c', gift: 'Rosa' }); // prioridad 4, interrumpe
  assert.deepEqual(played.map((p) => p.reaction), ['saludo', 'agradecimiento']);
  assert.deepEqual(engine.queue.map((q) => q.rule), ['follow', 'win']);
  stop(engine);
});

test('combo de regalos del mismo usuario se suma en cola', () => {
  const { engine } = setup({ bigGiftAmount: 4 });
  engine.ingest({ type: 'follow', user: 'z' }); // ocupa la mascota
  engine.ingest({ type: 'win', id: 'w' });       // misma prioridad que el regalo no interrumpe
  engine.config.behavior.allowInterrupt = false;
  for (let i = 0; i < 5; i++) engine.ingest({ type: 'gift', user: 'Ana', gift: 'Rosa', id: `g${i}` });
  const gifts = engine.queue.filter((q) => q.mergeKey === 'gift|ana');
  assert.equal(gifts.length, 1);
  assert.equal(gifts[0].vars.amount, 5);
  assert.equal(gifts[0].rule, 'giftBig');
  stop(engine);
});

test('la cola no crece más del máximo', () => {
  const { engine } = setup({ maxQueue: 3, userCooldownMs: 0, allowInterrupt: false });
  for (let i = 0; i < 20; i++) engine.ingest({ type: 'follow', user: `u${i}` });
  assert.equal(engine.queue.length, 3);
  stop(engine);
});

test('entradas simultáneas se agrupan en un solo saludo', async () => {
  const cfg = sanitizeConfig({ ...DEFAULT_CONFIG, behavior: { ...DEFAULT_CONFIG.behavior, joinBatchMs: 30 } });
  const played = [];
  const engine = new Engine(cfg, (k, p) => k === 'play' && played.push(p));
  for (const u of ['Ana', 'Beto', 'Caro', 'Dani', 'Eli']) engine.ingest({ type: 'join', user: u });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(played.length, 1);
  assert.match(played[0].text, /Ana, Beto, Caro y 2 más/);
  stop(engine);
});

test('pausa y horario descartan eventos', () => {
  const { engine, played } = setup({ paused: true });
  assert.equal(engine.ingest({ type: 'follow', user: 'a' }).detail, 'mascota en pausa');
  assert.equal(played.length, 0);
});

test('límite por minuto retiene reacciones no críticas', () => {
  const { engine, played } = setup({ maxPerMinute: 2, userCooldownMs: 0, allowInterrupt: false });
  engine.config.durations.celebracion = 1;
  for (let i = 0; i < 5; i++) engine.ingest({ type: 'follow', user: `u${i}` });
  return new Promise((r) => setTimeout(() => { assert.equal(played.length, 2); stop(engine); r(); }, 80));
});

test('sanitizeConfig descarta valores inválidos', () => {
  const c = sanitizeConfig({ mascot: { size: 99999, body: 'rojo' }, rules: { join: { reaction: 'explotar', phrases: [] } }, commands: { 'baila': 'baile', '!x': 'nada' } });
  assert.equal(c.mascot.size, 800);
  assert.equal(c.mascot.body, DEFAULT_CONFIG.mascot.body);
  assert.equal(c.rules.join.reaction, 'saludo');
  assert.ok(c.rules.join.phrases.length > 0);
  assert.deepEqual(c.commands, {});
});

test('el valor del regalo decide si es grande', () => {
  const { engine, played } = setup({ bigGiftAmount: 100 });
  engine.ingest({ type: 'gift', user: 'Ana', gift: 'León', amount: 1, value: 500 });
  assert.equal(played[0].reaction, 'celebracion');
  stop(engine);
});

test('catálogo válido y diseños maliciosos filtrados', async () => {
  const { CATALOG, validateDesign, mascotHTML } = await import('./mascot.js');
  for (const [id, d] of Object.entries(CATALOG)) assert.deepEqual(validateDesign(d).shapes.length, d.shapes.length, id);
  const bad = validateDesign({ shapes: [
    { part: 'body', kind: 'path', nums: [], fill: 'body', stroke: 'none', strokeWidth: 0, d: 'M0 0 L10 10"/><script>alert(1)</script>' },
    { part: 'body', kind: 'ellipse', nums: [100, 100, 50, 50], fill: 'url(javascript:x)', stroke: 'none', strokeWidth: 0, d: '' },
    { part: 'onclick', kind: 'circle', nums: [1, 2, 3], fill: 'body', stroke: 'none', strokeWidth: 0, d: '' },
  ], name: '<img onerror=x>' });
  assert.equal(bad.shapes.length, 1);
  assert.equal(bad.shapes[0].fill, 'body');
  assert.doesNotMatch(mascotHTML({ ...sanitizeConfig({}).mascot, kind: 'ia', design: bad, name: '"><script>' }), /<script|onerror/);
  assert.equal(validateDesign({ shapes: [{ part: 'arm', kind: 'circle', nums: [1, 2, 3], fill: 'body' }] }), null);
});

test('config: imágenes solo https y vuelve al catálogo si falta lo necesario', () => {
  const c = sanitizeConfig({ mascot: { kind: 'imagen', images: { base: 'javascript:alert(1)' } } });
  assert.equal(c.mascot.kind, 'catalogo');
  const ok = sanitizeConfig({ mascot: { kind: 'imagen', images: { base: 'https://x.supabase.co/storage/v1/object/public/mascotas/u/a.png', feliz: 'http://inseguro.com/a.png' } } });
  assert.equal(ok.mascot.kind, 'imagen');
  assert.equal(ok.mascot.images.feliz, '');
  assert.equal(sanitizeConfig({ mascot: { kind: 'ia', design: null } }).mascot.kind, 'catalogo');
  assert.equal(sanitizeConfig({ mascot: { species: 'dragon' } }).mascot.species, 'chispa');
});
