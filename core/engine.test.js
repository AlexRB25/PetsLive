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

test('invita a interactuar solo tras un rato sin actividad y sin repetir seguido', () => {
  let t = 1_000_000;
  const cfg = sanitizeConfig({ ...DEFAULT_CONFIG, behavior: { ...DEFAULT_CONFIG.behavior, idleAfterMs: 30000, idleEveryMs: 60000, minGapMs: 0 } });
  const played = [];
  const engine = new Engine(cfg, (k, p) => k === 'play' && played.push(p), () => t);
  t += 10000;
  assert.equal(engine.idleTick(), false); // apenas 10 s
  t += 25000;
  assert.equal(engine.idleTick(), true);
  assert.equal(played.length, 1);
  engine.clear('x');
  t += 30000;
  assert.equal(engine.idleTick(), false); // aún no pasan 60 s desde la última invitación
  t += 31000;
  engine.ingest({ type: 'chat', user: 'a', text: 'hola' });
  assert.equal(engine.idleTick(), false); // alguien acaba de comentar
  t += 31000;
  assert.equal(engine.idleTick(), true);
  assert.notEqual(played[0].text, played[1].text);
  assert.equal(engine.idleTick(true), true); // prueba manual
  engine.clear('fin');
});

test('config de voz: motor, audios solo https y voces con id válido', () => {
  const c = sanitizeConfig({ voice: { engine: 'elevenlabs', elevenVoice: 'abc123', ownVoice: 'x"><', clips: { saludo: ['https://x.supabase.co/a.webm', 'javascript:1'], inventado: ['https://x/a.mp3'] } } });
  assert.equal(c.voice.engine, 'elevenlabs');
  assert.equal(c.voice.elevenVoice, 'abc123');
  assert.equal(c.voice.ownVoice, '');
  assert.deepEqual(c.voice.clips, { saludo: ['https://x.supabase.co/a.webm'] });
  assert.equal(sanitizeConfig({ voice: { engine: 'otro' } }).voice.engine, 'navegador');
});

test('juego: follows y likes suben, las rosas tiran, y al llegar a la cima festeja y reinicia', async () => {
  const cfg = sanitizeConfig({ ...DEFAULT_CONFIG, behavior: { ...DEFAULT_CONFIG.behavior, joinBatchMs: 0, minGapMs: 0, userCooldownMs: 0, dedupWindowMs: 0 }, game: { enabled: true, goal: 30, resetSec: 2 } });
  const states = [];
  const played = [];
  const engine = new Engine(cfg, (k, p) => { if (k === 'game') states.push(p); if (k === 'play') played.push(p); });
  const last = () => states.at(-1);

  engine.ingest({ type: 'follow', user: 'Ana' });
  assert.equal(last().progress, 10);
  engine.ingest({ type: 'like', user: 'x', amount: 15 });
  assert.equal(last().progress, 10); // aún no llega a 20 likes
  engine.ingest({ type: 'like', user: 'y', amount: 10 });
  assert.equal(last().progress, 11);
  engine.ingest({ type: 'gift', user: 'Troll', gift: 'Rose', amount: 2, id: 'g1' });
  assert.equal(last().progress, 0); // 2 rosas = -20, no baja de 0
  assert.ok(played.some((p) => p.rule === 'gameDrop') || engine.queue.some((q) => q.rule === 'gameDrop'));
  engine.ingest({ type: 'gift', user: 'Luis', gift: 'León', amount: 1, id: 'g2' });
  assert.equal(last().progress, 5); // regalo genérico +5
  engine.ingest({ type: 'chat', user: 'Bea', text: '!sube' });
  engine.ingest({ type: 'chat', user: 'Bea', text: '!sube ya' }); // misma persona en menos de 3 s
  assert.equal(last().progress, 7);
  engine.ingest({ type: 'sub', user: 'Caro' });
  engine.ingest({ type: 'follow', user: 'Dani' });
  assert.equal(last().progress, 30);
  assert.equal(last().won, true);
  assert.equal(last().wins, 1);
  assert.ok(played.some((p) => p.rule === 'gameWin') || engine.queue.some((q) => q.rule === 'gameWin'));
  engine.ingest({ type: 'follow', user: 'Eli' });
  assert.equal(last().progress, 30); // ganado: ignora hasta reiniciar
  engine.game.reset();
  assert.equal(last().progress, 0);
  engine.game.stop();
  engine.clear('fin');
});

test('juego: apagado no cuenta y la config se valida', () => {
  const engine = new Engine(sanitizeConfig({}), () => {});
  assert.equal(engine.game.apply({ type: 'follow', name: 'a' }), 0);
  const g = sanitizeConfig({ game: { enabled: true, goal: 5, rules: [{ event: 'hackear', points: 9 }, { event: 'follow', points: 99999, per: 0, match: '<b>' }] } }).game;
  assert.equal(g.goal, 10);
  assert.deepEqual(g.rules, [{ event: 'follow', match: 'b', points: 1000, per: 1 }]);
  engine.clear('fin');
});

test('el historial incluye el comentario leído', () => {
  const log = [];
  const engine = new Engine(sanitizeConfig({}), (k, p) => k === 'log' && log.push(p));
  engine.ingest({ type: 'chat', user: 'Ana', text: 'hola Chispa, ¿cómo estás?' });
  assert.equal(log.at(-1).text, 'hola Chispa, ¿cómo estás?');
  engine.ingest({ type: 'follow', user: 'Beto' });
  assert.equal(log.find((e) => e.kind === 'follow').text, undefined);
  engine.clear('fin');
});

test('fondo: valida modo, tipo, imagen y textos', () => {
  const d = sanitizeConfig({});
  assert.equal(d.scene.mode, 'apagado');
  const s = sanitizeConfig({ scene: { mode: 'sin-directo', kind: 'imagen', image: 'javascript:alert(1)', preset: 'x', title: '<b>Ya volvemos</b>', color: 'red' } }).scene;
  assert.equal(s.mode, 'sin-directo');
  assert.equal(s.kind, 'preset'); // imagen inválida → vuelve al degradado
  assert.equal(s.image, '');
  assert.equal(s.preset, 'atardecer');
  assert.equal(s.title, 'bYa volvemos/b');
  assert.equal(s.color, '#1e1b4b');
  assert.equal(sanitizeConfig({ scene: { kind: 'imagen', image: 'https://x.supabase.co/storage/v1/object/public/mascotas/u/fondo.png' } }).scene.kind, 'imagen');
});
