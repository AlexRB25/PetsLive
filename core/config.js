// Configuración de la mascota: valores por defecto y validación. Se usa en la web y en el worker.
import { SPECIES, validateDesign } from './mascot.js';
import { DEFAULT_GAME, sanitizeGame } from './game.js';

export const REACTIONS = ['reposo', 'saludo', 'salto', 'baile', 'sorpresa', 'celebracion', 'tristeza', 'agradecimiento'];

export const VOICE_ENGINES = ['navegador', 'grabada', 'elevenlabs', 'elevenlabs_propia'];
// Grupos de audios grabados: uno por reacción y otro para las invitaciones.
export const CLIP_KEYS = ['saludo', 'salto', 'baile', 'sorpresa', 'celebracion', 'tristeza', 'agradecimiento', 'idle'];

// Fondos listos para la pantalla de espera (los dibuja el overlay).
export const SCENE_PRESETS = {
  atardecer: 'linear-gradient(160deg, #ff7e5f 0%, #feb47b 45%, #6a3093 100%)',
  noche: 'linear-gradient(180deg, #0f172a 0%, #312e81 60%, #7c3aed 100%)',
  espacio: 'radial-gradient(2px 2px at 20% 30%, #fff, transparent), radial-gradient(2px 2px at 70% 15%, #fff, transparent), radial-gradient(1.5px 1.5px at 40% 70%, #fff, transparent), radial-gradient(2px 2px at 85% 60%, #fff, transparent), radial-gradient(1.5px 1.5px at 10% 85%, #fff, transparent), radial-gradient(ellipse at 50% 120%, #4c1d95 0%, #0b0820 60%)',
  bosque: 'linear-gradient(180deg, #a7f3d0 0%, #34d399 40%, #065f46 100%)',
  oceano: 'linear-gradient(180deg, #67e8f9 0%, #0ea5e9 45%, #1e3a8a 100%)',
  caramelo: 'linear-gradient(135deg, #f9a8d4 0%, #c4b5fd 50%, #93c5fd 100%)',
};

export const EVENT_TYPES = ['join', 'chat', 'follow', 'like', 'gift', 'sub', 'purchase', 'win', 'lose', 'scare'];

export const DEFAULT_CONFIG = {
  mascot: {
    kind: 'catalogo', // catalogo | ia | imagen
    species: 'chispa',
    design: null, // diseño creado con IA (ver mascot.js)
    images: { base: '', feliz: '', triste: '', sorpresa: '' },
    name: 'Chispa',
    body: '#ffb547',
    accent: '#ff6b8a',
    eyes: '#2b2140',
    accessory: 'ninguno', // ninguno | gorra | moño | corona
    size: 260,
    position: 'abajo-derecha', // abajo-derecha | abajo-izquierda | arriba-derecha | arriba-izquierda | centro | libre
    offsetX: 40,
    offsetY: 40,
    // posición libre (arrastrada en la vista previa): punto bajo los pies de la mascota, en % del ancho y alto
    x: 85,
    y: 92,
  },
  voice: {
    output: 'panel', // overlay | panel | off
    // navegador: voces del sistema (gratis) · grabada: audios del streamer · elevenlabs: voces de la plataforma
    // (cupo por plan) · elevenlabs_propia: su propia cuenta de ElevenLabs (incluye su voz clonada)
    engine: 'navegador',
    clips: {}, // { saludo: [url, …], celebracion: […], …, idle: […] }
    elevenVoice: '',
    ownVoice: '',
    lang: 'es-MX',
    rate: 1.05,
    pitch: 1.5,
    volume: 0.9,
  },
  behavior: {
    paused: false,
    silent: false, // sin voz ni globo de texto; solo animación
    maxPerMinute: 12,
    minGapMs: 600,
    maxQueue: 8,
    maxWaitMs: 20000,
    allowInterrupt: true,
    interruptPriority: 4,
    userCooldownMs: 30000,
    dedupWindowMs: 10000,
    likeThreshold: 50,
    likeWindowMs: 20000,
    joinBatchMs: 4000,
    giftMergeMs: 5000,
    // Invitaciones cuando nadie interactúa: tras idleAfterMs sin eventos, una cada idleEveryMs.
    idleAfterMs: 45000,
    idleEveryMs: 90000,
    bigGiftAmount: 100,
    commandCooldownMs: 15000,
    schedule: { enabled: false, start: '18:00', end: '23:59' },
    blockedWords: ['puta', 'puto', 'pendejo', 'verga', 'nazi', 'hitler', 'mierda', 'idiota'],
    fallbackName: 'amigo',
  },
  durations: {
    reposo: 0,
    saludo: 2600,
    salto: 2200,
    baile: 3600,
    sorpresa: 2200,
    celebracion: 3800,
    tristeza: 3000,
    agradecimiento: 3200,
  },
  rules: {
    join: { enabled: true, reaction: 'saludo', priority: 1, phrases: ['¡Hola, {user}!', '¡Bienvenido, {user}!', '¡Qué bueno verte, {user}!'] },
    joinGroup: { enabled: true, reaction: 'saludo', priority: 1, phrases: ['¡Bienvenidos, {names}!', '¡Hola a todos: {names}!'] },
    chat: { enabled: true, reaction: 'sorpresa', priority: 2, onlyMentions: true, phrases: ['¿Me llamaste, {user}?', '¡Aquí estoy, {user}!', '¡Te leí, {user}!'] },
    follow: { enabled: true, reaction: 'celebracion', priority: 3, phrases: ['¡Gracias por seguirnos, {user}!', '¡{user} se unió a la familia!'] },
    like: { enabled: true, reaction: 'salto', priority: 2, phrases: ['¡Ya van {count} likes más!', '¡{count} likes! ¡Sigan así!'] },
    gift: { enabled: true, reaction: 'agradecimiento', priority: 4, phrases: ['¡Gracias por {gift}, {user}!', '¡{user}, eres lo máximo! Gracias por {gift}.'] },
    giftBig: { enabled: true, reaction: 'celebracion', priority: 5, phrases: ['¡WOW, {user}! ¡Gracias por {gift}!', '¡Increíble, {user}! ¡Mil gracias!'] },
    sub: { enabled: true, reaction: 'celebracion', priority: 4, phrases: ['¡Gracias por suscribirte, {user}!', '¡{user} ya es parte del club!'] },
    purchase: { enabled: true, reaction: 'agradecimiento', priority: 4, phrases: ['¡Gracias por tu compra, {user}!', '¡{user} se llevó {gift}! Gracias.'] },
    win: { enabled: true, reaction: 'celebracion', priority: 3, phrases: ['¡GANAMOS!', '¡Victoria! ¡Qué partidazo!'] },
    lose: { enabled: true, reaction: 'tristeza', priority: 3, phrases: ['Ay, no… la próxima sí.', 'Perdimos, pero con estilo.'] },
    scare: { enabled: true, reaction: 'sorpresa', priority: 3, phrases: ['¡AAAH! ¡Qué susto!', '¡No hagas eso!'] },
    command: { enabled: true, priority: 2, phrases: ['¡Va, {user}!', '¡A la orden, {user}!'] },
    gameWin: { enabled: true, reaction: 'celebracion', priority: 5, phrases: ['¡Llegamos a la cima! ¡Gracias a todos!', '¡LO LOGRAMOS! ¡Cima conquistada!'] },
    gameDrop: { enabled: true, reaction: 'sorpresa', priority: 2, phrases: ['¡Oye, {user}! ¡Me tiraste!', '¡Nooo! {user} me bajó con {gift}.'] },
    idle: {
      enabled: true,
      reaction: 'saludo',
      priority: 1,
      phrases: [
        '¡Si te está gustando, deja tu like!',
        '¿De dónde nos ven? ¡Cuéntenme en los comentarios!',
        '¡Sígueme para no perderte el próximo directo!',
        '¡Toquen la pantalla para mandar likes!',
        '¡Compartan el directo con un amigo!',
        'Escriban {mascota} en el chat y los saludo.',
      ],
    },
  },
  commands: { '!baila': 'baile', '!salta': 'salto', '!hola': 'saludo', '!fiesta': 'celebracion' },
  // Guardar los comentarios del directo para el resumen (se borran al generarlo o a los 30 días).
  summary: { saveComments: true },
  // Juego "¡Llévame a la cima!" (ver game.js).
  game: DEFAULT_GAME,
  // Fondo detrás de la mascota, para directos donde solo sale ella (sin cámara ni juego atrás).
  scene: {
    mode: 'apagado', // apagado | encendido | sin-directo (mientras el directo no está iniciado en el panel)
    kind: 'preset', // preset | color | imagen
    preset: 'atardecer',
    color: '#1e1b4b',
    image: '',
    title: '',
    subtitle: '',
  },
};

const clone = (v) => JSON.parse(JSON.stringify(v));

const clampNum = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

const str = (v, max, def) => (typeof v === 'string' ? v.slice(0, max) : def);

const color = (v, def) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : def);

const oneOf = (v, list, def) => (list.includes(v) ? v : def);

// Solo enlaces https (las imágenes viven en Supabase Storage).
const imageUrl = (v) => (typeof v === 'string' && /^https:\/\/[^\s"'<>]{8,480}$/.test(v) ? v : '');

const audioUrl = (v) => (typeof v === 'string' && /^https:\/\/[^\s"'<>]{8,480}$/.test(v) ? v : '');

const time = (v, def) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : def);

const phrases = (v, def) => {
  if (!Array.isArray(v)) return def;
  const out = v.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim().slice(0, 140)).slice(0, 20);
  return out.length ? out : def;
};

// Mezcla lo recibido con los valores por defecto y descarta todo lo inválido.
export function sanitizeConfig(input = {}) {
  const d = DEFAULT_CONFIG;
  const i = input && typeof input === 'object' ? input : {};
  const m = i.mascot || {};
  const v = i.voice || {};
  const b = i.behavior || {};
  const s = b.schedule || {};
  const sc = i.scene || {};
  const out = {
    mascot: {
      kind: oneOf(m.kind, ['catalogo', 'ia', 'imagen'], d.mascot.kind),
      species: oneOf(m.species, SPECIES, d.mascot.species),
      design: validateDesign(m.design),
      images: Object.fromEntries(['base', 'feliz', 'triste', 'sorpresa'].map((k) => [k, imageUrl(m.images?.[k])])),
      name: str(m.name, 24, d.mascot.name).replace(/[<>{}]/g, '').trim() || d.mascot.name,
      body: color(m.body, d.mascot.body),
      accent: color(m.accent, d.mascot.accent),
      eyes: color(m.eyes, d.mascot.eyes),
      accessory: oneOf(m.accessory, ['ninguno', 'gorra', 'moño', 'corona'], d.mascot.accessory),
      size: clampNum(m.size, 80, 800, d.mascot.size),
      position: oneOf(m.position, ['abajo-derecha', 'abajo-izquierda', 'arriba-derecha', 'arriba-izquierda', 'centro', 'libre'], d.mascot.position),
      x: clampNum(m.x, 0, 100, d.mascot.x),
      y: clampNum(m.y, 5, 100, d.mascot.y),
      offsetX: clampNum(m.offsetX, 0, 1000, d.mascot.offsetX),
      offsetY: clampNum(m.offsetY, 0, 1000, d.mascot.offsetY),
    },
    voice: {
      output: oneOf(v.output, ['overlay', 'panel', 'off'], d.voice.output),
      engine: oneOf(v.engine, VOICE_ENGINES, d.voice.engine),
      clips: Object.fromEntries(CLIP_KEYS.map((k) => [k, Array.isArray(v.clips?.[k]) ? v.clips[k].map(audioUrl).filter(Boolean).slice(0, 5) : []]).filter(([, l]) => l.length)),
      elevenVoice: typeof v.elevenVoice === 'string' && /^[A-Za-z0-9]{1,40}$/.test(v.elevenVoice) ? v.elevenVoice : '',
      ownVoice: typeof v.ownVoice === 'string' && /^[A-Za-z0-9]{1,40}$/.test(v.ownVoice) ? v.ownVoice : '',
      lang: str(v.lang, 12, d.voice.lang),
      rate: clampNum(v.rate, 0.5, 2, d.voice.rate),
      pitch: clampNum(v.pitch, 0, 2, d.voice.pitch),
      volume: clampNum(v.volume, 0, 1, d.voice.volume),
    },
    behavior: {
      paused: typeof b.paused === 'boolean' ? b.paused : d.behavior.paused,
      silent: typeof b.silent === 'boolean' ? b.silent : d.behavior.silent,
      maxPerMinute: clampNum(b.maxPerMinute, 1, 120, d.behavior.maxPerMinute),
      minGapMs: clampNum(b.minGapMs, 0, 10000, d.behavior.minGapMs),
      maxQueue: clampNum(b.maxQueue, 1, 50, d.behavior.maxQueue),
      maxWaitMs: clampNum(b.maxWaitMs, 2000, 120000, d.behavior.maxWaitMs),
      allowInterrupt: typeof b.allowInterrupt === 'boolean' ? b.allowInterrupt : d.behavior.allowInterrupt,
      interruptPriority: clampNum(b.interruptPriority, 1, 5, d.behavior.interruptPriority),
      userCooldownMs: clampNum(b.userCooldownMs, 0, 600000, d.behavior.userCooldownMs),
      dedupWindowMs: clampNum(b.dedupWindowMs, 0, 120000, d.behavior.dedupWindowMs),
      likeThreshold: clampNum(b.likeThreshold, 1, 100000, d.behavior.likeThreshold),
      likeWindowMs: clampNum(b.likeWindowMs, 1000, 600000, d.behavior.likeWindowMs),
      joinBatchMs: clampNum(b.joinBatchMs, 0, 30000, d.behavior.joinBatchMs),
      giftMergeMs: clampNum(b.giftMergeMs, 0, 60000, d.behavior.giftMergeMs),
      idleAfterMs: clampNum(b.idleAfterMs, 10000, 1800000, d.behavior.idleAfterMs),
      idleEveryMs: clampNum(b.idleEveryMs, 15000, 1800000, d.behavior.idleEveryMs),
      bigGiftAmount: clampNum(b.bigGiftAmount, 1, 1000000, d.behavior.bigGiftAmount),
      commandCooldownMs: clampNum(b.commandCooldownMs, 0, 600000, d.behavior.commandCooldownMs),
      schedule: {
        enabled: typeof s.enabled === 'boolean' ? s.enabled : d.behavior.schedule.enabled,
        start: time(s.start, d.behavior.schedule.start),
        end: time(s.end, d.behavior.schedule.end),
      },
      blockedWords: Array.isArray(b.blockedWords)
        ? b.blockedWords.filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim().toLowerCase().slice(0, 40)).slice(0, 300)
        : clone(d.behavior.blockedWords),
      fallbackName: str(b.fallbackName, 24, d.behavior.fallbackName).trim() || d.behavior.fallbackName,
    },
    durations: {},
    rules: {},
    commands: {},
    game: sanitizeGame(i.game),
    scene: {
      mode: oneOf(sc.mode, ['apagado', 'encendido', 'sin-directo'], d.scene.mode),
      kind: oneOf(sc.kind, ['preset', 'color', 'imagen'], d.scene.kind),
      preset: oneOf(sc.preset, Object.keys(SCENE_PRESETS), d.scene.preset),
      color: color(sc.color, d.scene.color),
      image: imageUrl(sc.image),
      title: str(sc.title, 60, d.scene.title).replace(/[<>{}]/g, '').trim(),
      subtitle: str(sc.subtitle, 100, d.scene.subtitle).replace(/[<>{}]/g, '').trim(),
    },
    summary: { saveComments: typeof i.summary?.saveComments === 'boolean' ? i.summary.saveComments : d.summary.saveComments },
  };
  for (const r of REACTIONS) out.durations[r] = clampNum(i.durations?.[r], 0, 15000, d.durations[r]);
  for (const [key, def] of Object.entries(d.rules)) {
    const r = i.rules?.[key] || {};
    const rule = {
      enabled: typeof r.enabled === 'boolean' ? r.enabled : def.enabled,
      priority: clampNum(r.priority, 1, 5, def.priority),
      phrases: phrases(r.phrases, clone(def.phrases)),
    };
    if ('reaction' in def) rule.reaction = oneOf(r.reaction, REACTIONS.slice(1), def.reaction);
    if ('onlyMentions' in def) rule.onlyMentions = typeof r.onlyMentions === 'boolean' ? r.onlyMentions : def.onlyMentions;
    out.rules[key] = rule;
  }
  const cmds = i.commands && typeof i.commands === 'object' ? i.commands : d.commands;
  for (const [k, reaction] of Object.entries(cmds).slice(0, 30)) {
    const cmd = String(k).trim().toLowerCase().slice(0, 24);
    if (/^!\S+$/.test(cmd) && REACTIONS.slice(1).includes(reaction)) out.commands[cmd] = reaction;
  }
  // Sin diseño o sin imagen base, vuelve al catálogo.
  if (out.mascot.kind === 'ia' && !out.mascot.design) out.mascot.kind = 'catalogo';
  if (out.mascot.kind === 'imagen' && !out.mascot.images.base) out.mascot.kind = 'catalogo';
  if (out.scene.kind === 'imagen' && !out.scene.image) out.scene.kind = 'preset';
  return out;
}

