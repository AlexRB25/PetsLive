// Mascotas: un mismo motor dibuja los personajes del catálogo y los creados con IA (un "diseño" en JSON
// por partes), y también las mascotas hechas con imágenes subidas por el usuario.
// Las partes llevan clases fijas (fig, top, armL, armR, footL, footR…) para que las 8 animaciones
// funcionen igual en cualquier personaje. La cara (ojos, boca, cachetes) es común a todos.

// ---------- colores ----------

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(Math.min(255, Math.max(0, f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const HEX = /^#[0-9a-f]{6}$/i;
export const COLOR_TOKENS = ['body', 'bodyDark', 'bodyLight', 'accent', 'accentLight', 'eyes', 'white', 'extra1', 'extra2', 'none'];

function palette(m, design) {
  return {
    body: m.body,
    bodyDark: shade(m.body, -0.28),
    bodyLight: shade(m.body, 0.55),
    accent: m.accent,
    accentLight: shade(m.accent, 0.5),
    eyes: m.eyes,
    white: '#ffffff',
    extra1: design?.colors?.extra1 || '#ffffff',
    extra2: design?.colors?.extra2 || '#2b2140',
    none: 'none',
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- diseños ----------

export const PARTS = ['back', 'top', 'footL', 'footR', 'armL', 'armR', 'body', 'belly', 'front'];
export const SHAPES = ['ellipse', 'circle', 'rect', 'polygon', 'path'];
export const TOP_ANIMS = ['flicker', 'wiggle', 'none'];

// Atajos para escribir el catálogo: [parte, tipo, números, relleno, borde, grosor, d]
const s = (part, kind, nums, fill, stroke = 'none', strokeWidth = 0, d = '') => ({ part, kind, nums, fill, stroke, strokeWidth, d });
const pair = (part, kind, numsL, fill, stroke, sw) => {
  const numsR = [...numsL];
  if (kind === 'rect') numsR[0] = 200 - numsL[0] - numsL[2];
  else numsR[0] = 200 - numsL[0];
  return [s(`${part}L`, kind, numsL, fill, stroke, sw), s(`${part}R`, kind, numsR, fill, stroke, sw)];
};

export const CATALOG = {
  chispa: {
    name: 'Chispa', topAnim: 'flicker', headTop: 58, faceY: 0, colors: { body: '#ffb547', accent: '#ff6b8a' },
    shapes: [
      s('top', 'path', [], 'accent', 'none', 0, 'M100 66 C 80 52 86 26 100 8 C 104 26 122 30 112 52 C 110 58 106 62 100 66 Z'),
      s('top', 'path', [], 'accentLight', 'none', 0, 'M100 62 C 92 52 96 38 101 28 C 104 40 110 44 105 56 Z'),
      ...pair('foot', 'ellipse', [74, 206, 20, 11], 'bodyDark'),
      ...pair('arm', 'ellipse', [36, 138, 15, 26], 'body', 'bodyDark', 4),
      s('body', 'ellipse', [100, 134, 70, 76], 'body', 'bodyDark', 5),
      s('belly', 'ellipse', [100, 160, 42, 40], 'bodyLight'),
    ],
  },
  gato: {
    name: 'Michi', topAnim: 'wiggle', headTop: 68, faceY: 4, colors: { body: '#a3a3b8', accent: '#ff8fb1' },
    shapes: [
      s('back', 'path', [], 'none', 'bodyDark', 14, 'M148 196 C 190 194 196 156 176 126'),
      s('top', 'polygon', [52, 100, 60, 38, 100, 74], 'body', 'bodyDark', 5),
      s('top', 'polygon', [62, 88, 66, 54, 88, 76], 'accent'),
      s('top', 'polygon', [148, 100, 140, 38, 100, 74], 'body', 'bodyDark', 5),
      s('top', 'polygon', [138, 88, 134, 54, 112, 76], 'accent'),
      ...pair('foot', 'ellipse', [76, 207, 18, 10], 'bodyDark'),
      ...pair('arm', 'ellipse', [40, 146, 13, 22], 'body', 'bodyDark', 4),
      s('body', 'ellipse', [100, 140, 66, 70], 'body', 'bodyDark', 5),
      s('belly', 'ellipse', [100, 168, 38, 32], 'bodyLight'),
      s('front', 'path', [], 'none', 'bodyDark', 3, 'M38 126 L62 132 M38 140 L62 138'),
      s('front', 'path', [], 'none', 'bodyDark', 3, 'M162 126 L138 132 M162 140 L138 138'),
    ],
  },
  robot: {
    name: 'Bolt', topAnim: 'wiggle', headTop: 60, faceY: 0, colors: { body: '#60a5fa', accent: '#facc15' },
    shapes: [
      s('top', 'rect', [96, 28, 8, 34, 3], 'bodyDark'),
      s('top', 'circle', [100, 24, 10], 'accent', 'bodyDark', 3),
      ...pair('foot', 'rect', [62, 196, 30, 16, 6], 'bodyDark'),
      ...pair('arm', 'rect', [16, 108, 24, 58, 12], 'bodyDark'),
      s('body', 'rect', [38, 60, 124, 142, 30], 'body', 'bodyDark', 5),
      s('belly', 'rect', [62, 156, 76, 32, 10], 'bodyLight'),
      s('front', 'circle', [82, 172, 6], 'accent'),
      s('front', 'circle', [100, 172, 6], 'extra1'),
      s('front', 'circle', [118, 172, 6], 'accent'),
    ],
  },
  fantasma: {
    name: 'Boo', topAnim: 'none', headTop: 42, faceY: -6, colors: { body: '#e9e5ff', accent: '#a78bfa' },
    shapes: [
      ...pair('arm', 'ellipse', [32, 140, 12, 18], 'body', 'bodyDark', 4),
      s('body', 'path', [], 'body', 'bodyDark', 5, 'M30 140 C 30 70 60 40 100 40 C 140 40 170 70 170 140 L 170 206 L 150 190 L 130 206 L 110 190 L 90 206 L 70 190 L 50 206 L 30 190 Z'),
    ],
  },
  dino: {
    name: 'Rexi', topAnim: 'wiggle', headTop: 64, faceY: 2, colors: { body: '#4ade80', accent: '#f97316' },
    shapes: [
      s('back', 'path', [], 'body', 'bodyDark', 4, 'M140 192 Q 192 202 198 158 Q 182 186 140 170 Z'),
      s('top', 'polygon', [68, 76, 78, 48, 92, 70], 'accent'),
      s('top', 'polygon', [90, 66, 101, 34, 114, 64], 'accent'),
      s('top', 'polygon', [112, 70, 124, 46, 134, 78], 'accent'),
      ...pair('foot', 'ellipse', [76, 207, 20, 11], 'bodyDark'),
      ...pair('arm', 'ellipse', [44, 150, 11, 17], 'body', 'bodyDark', 4),
      s('body', 'ellipse', [100, 138, 64, 74], 'body', 'bodyDark', 5),
      s('belly', 'ellipse', [100, 166, 36, 36], 'bodyLight'),
    ],
  },
  osito: {
    name: 'Tobi', topAnim: 'wiggle', headTop: 56, faceY: 0, colors: { body: '#c08457', accent: '#f9a8d4' },
    shapes: [
      s('top', 'circle', [58, 72, 20], 'body', 'bodyDark', 5),
      s('top', 'circle', [58, 72, 10], 'accent'),
      s('top', 'circle', [142, 72, 20], 'body', 'bodyDark', 5),
      s('top', 'circle', [142, 72, 10], 'accent'),
      ...pair('foot', 'ellipse', [74, 207, 20, 11], 'bodyDark'),
      ...pair('arm', 'ellipse', [38, 146, 14, 24], 'body', 'bodyDark', 4),
      s('body', 'ellipse', [100, 138, 68, 74], 'body', 'bodyDark', 5),
      s('belly', 'ellipse', [100, 168, 40, 34], 'bodyLight'),
      s('belly', 'ellipse', [100, 141, 24, 16], 'bodyLight'),
    ],
  },
};

export const SPECIES = Object.keys(CATALOG);

const PATH_D = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]{1,4000}$/;
const clamp = (v, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : null);

// Valida un diseño (de la IA o del catálogo). Devuelve una copia limpia o null.
// Solo deja pasar formas simples con números y colores de la paleta: nada de texto, enlaces ni scripts.
export function validateDesign(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.shapes)) return null;
  const shapes = [];
  for (const sh of d.shapes.slice(0, 80)) {
    if (!sh || !PARTS.includes(sh.part) || !SHAPES.includes(sh.kind)) continue;
    const fill = COLOR_TOKENS.includes(sh.fill) ? sh.fill : 'body';
    const stroke = COLOR_TOKENS.includes(sh.stroke) ? sh.stroke : 'none';
    const strokeWidth = clamp(sh.strokeWidth, 0, 20) ?? 0;
    const nums = Array.isArray(sh.nums) ? sh.nums.slice(0, 40).map((n) => clamp(n, -60, 300)) : [];
    if (nums.some((n) => n === null)) continue;
    const need = { ellipse: 4, circle: 3, rect: 4, polygon: 6, path: 0 }[sh.kind];
    if (nums.length < need) continue;
    if (sh.kind === 'polygon' && nums.length % 2) continue;
    const d2 = sh.kind === 'path' ? String(sh.d || '').trim() : '';
    if (sh.kind === 'path' && !PATH_D.test(d2)) continue;
    shapes.push({ part: sh.part, kind: sh.kind, nums, fill, stroke, strokeWidth, d: d2 });
  }
  if (!shapes.some((x) => x.part === 'body')) return null;
  const colors = /** @type {{ body?: string, accent?: string, extra1?: string, extra2?: string }} */ ({});
  for (const k of ['body', 'accent', 'extra1', 'extra2']) if (HEX.test(d.colors?.[k] || '')) colors[k] = d.colors[k];
  return {
    name: typeof d.name === 'string' ? d.name.replace(/[<>{}]/g, '').trim().slice(0, 24) || 'Mascota' : 'Mascota',
    topAnim: TOP_ANIMS.includes(d.topAnim) ? d.topAnim : 'wiggle',
    headTop: clamp(d.headTop, 0, 140) ?? 58,
    faceY: clamp(d.faceY, -40, 40) ?? 0,
    colors,
    shapes,
  };
}

function shapeSVG(sh, pal) {
  const n = sh.nums.map((v) => Math.round(v * 10) / 10);
  const paint = `fill="${pal[sh.fill]}"${sh.stroke !== 'none' && sh.strokeWidth > 0 ? ` stroke="${pal[sh.stroke]}" stroke-width="${sh.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"` : ''}`;
  switch (sh.kind) {
    case 'ellipse': return `<ellipse cx="${n[0]}" cy="${n[1]}" rx="${Math.abs(n[2])}" ry="${Math.abs(n[3])}" ${paint}/>`;
    case 'circle': return `<circle cx="${n[0]}" cy="${n[1]}" r="${Math.abs(n[2])}" ${paint}/>`;
    case 'rect': return `<rect x="${n[0]}" y="${n[1]}" width="${Math.abs(n[2])}" height="${Math.abs(n[3])}" rx="${Math.abs(n[4] || 0)}" ${paint}/>`;
    case 'polygon': return `<polygon points="${n.join(' ')}" ${paint}/>`;
    default: return `<path d="${sh.d}" ${paint}/>`;
  }
}

const ACCESSORIES = {
  ninguno: '',
  gorra: `<g class="acc"><path d="M58 70 Q100 30 142 70 Z" fill="#3b82f6"/><path d="M128 66 Q160 64 168 74 Q150 78 130 74 Z" fill="#1d4ed8"/><circle cx="100" cy="44" r="5" fill="#1d4ed8"/></g>`,
  'moño': `<g class="acc"><path d="M100 58 L78 44 Q72 58 78 72 Z" fill="#ec4899"/><path d="M100 58 L122 44 Q128 58 122 72 Z" fill="#ec4899"/><circle cx="100" cy="58" r="7" fill="#be185d"/></g>`,
  corona: `<g class="acc"><path d="M70 62 L74 34 L88 50 L100 28 L112 50 L126 34 L130 62 Z" fill="#facc15" stroke="#ca8a04" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="50" r="4" fill="#ef4444"/></g>`,
};

function face(pal, faceY) {
  const eyes = pal.eyes;
  return `<g class="face" transform="translate(0 ${faceY})">
    <ellipse cx="66" cy="132" rx="11" ry="7" fill="${pal.accent}" opacity=".45"/>
    <ellipse cx="134" cy="132" rx="11" ry="7" fill="${pal.accent}" opacity=".45"/>
    <g class="eyes">
      <g class="e-normal">
        <ellipse cx="78" cy="108" rx="10" ry="14" fill="${eyes}"/><ellipse cx="122" cy="108" rx="10" ry="14" fill="${eyes}"/>
        <circle cx="81" cy="102" r="4" fill="#fff"/><circle cx="125" cy="102" r="4" fill="#fff"/>
      </g>
      <g class="e-happy" fill="none" stroke="${eyes}" stroke-width="6" stroke-linecap="round">
        <path d="M66 112 Q78 96 90 112"/><path d="M110 112 Q122 96 134 112"/>
      </g>
      <g class="e-big">
        <circle cx="78" cy="106" r="16" fill="#fff" stroke="${eyes}" stroke-width="4"/><circle cx="122" cy="106" r="16" fill="#fff" stroke="${eyes}" stroke-width="4"/>
        <circle cx="78" cy="106" r="6" fill="${eyes}"/><circle cx="122" cy="106" r="6" fill="${eyes}"/>
      </g>
      <g class="e-sad">
        <ellipse cx="78" cy="110" rx="9" ry="11" fill="${eyes}"/><ellipse cx="122" cy="110" rx="9" ry="11" fill="${eyes}"/>
        <path d="M64 102 L90 92" stroke="${eyes}" stroke-width="5" stroke-linecap="round"/><path d="M136 102 L110 92" stroke="${eyes}" stroke-width="5" stroke-linecap="round"/>
        <path class="tear" d="M70 124 Q66 134 70 138 Q76 134 70 124 Z" fill="#60a5fa"/>
      </g>
    </g>
    <g class="mouth">
      <path class="m-smile" d="M86 136 Q100 148 114 136" fill="none" stroke="${eyes}" stroke-width="5" stroke-linecap="round"/>
      <path class="m-grin" d="M80 132 Q100 162 120 132 Z" fill="${eyes}"/>
      <ellipse class="m-o" cx="100" cy="142" rx="10" ry="13" fill="${eyes}"/>
      <path class="m-sad" d="M86 146 Q100 134 114 146" fill="none" stroke="${eyes}" stroke-width="5" stroke-linecap="round"/>
    </g>
  </g>`;
}

/** Diseño que corresponde a la configuración de la mascota (catálogo o IA). */
export function designFor(m) {
  if (m.kind === 'ia' && m.design) return m.design;
  return CATALOG[m.species] || CATALOG.chispa;
}

export function designSVG(design, m) {
  const pal = palette(m, design);
  const group = (part, cls = part) => {
    const inner = design.shapes.filter((x) => x.part === part).map((x) => shapeSVG(x, pal)).join('');
    return inner ? `<g class="${cls}">${inner}</g>` : '';
  };
  const top = design.shapes.filter((x) => x.part === 'top').map((x) => shapeSVG(x, pal)).join('');
  return `
<svg class="mascot-svg" viewBox="0 0 200 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(m.name)}">
  <ellipse class="shadow" cx="100" cy="220" rx="56" ry="8" fill="#000" opacity=".22"/>
  <g class="fig">
    ${group('back')}
    ${top ? `<g class="top anim-${design.topAnim}">${top}</g>` : ''}
    ${group('footL', 'foot footL')}${group('footR', 'foot footR')}
    ${group('armL', 'arm armL')}${group('armR', 'arm armR')}
    ${group('body')}
    ${group('belly')}
    ${face(pal, design.faceY)}
    ${group('front')}
    ${ACCESSORIES[m.accessory] ? `<g transform="translate(0 ${design.headTop - 58})">${ACCESSORIES[m.accessory]}</g>` : ''}
  </g>
  <g class="fx-surprise"><text x="166" y="56" font-size="44" font-weight="900" fill="${pal.accent}" font-family="system-ui, sans-serif">!</text></g>
</svg>`;
}

// Mascota hecha con imágenes del usuario: una imagen por emoción (las que falten usan la base).
function imageHTML(m) {
  const img = m.images || {};
  const src = (k) => esc(img[k] || img.base || '');
  const one = (cls, k) => `<img class="img ${cls}" src="${src(k)}" alt="" draggable="false"/>`;
  return `<div class="mascot-img" role="img" aria-label="${esc(m.name)}">
    <div class="fig">${one('img-base', 'base')}${one('img-feliz', 'feliz')}${one('img-triste', 'triste')}${one('img-sorpresa', 'sorpresa')}</div>
    <div class="shadow-html"></div>
  </div>`;
}

/** HTML de la mascota según su tipo: catálogo, IA o imágenes propias. */
export function mascotHTML(m) {
  if (m.kind === 'imagen' && m.images?.base) return imageHTML(m);
  return designSVG(designFor(m), m);
}

/** Alias usado antes del catálogo. */
export const mascotSVG = mascotHTML;

export const MASCOT_CSS = `
.mascot { position: relative; }
.mascot-svg { width: 100%; height: auto; overflow: visible; display: block; }
.mascot-svg * { transform-box: fill-box; }
.fig { transform-origin: 50% 100%; }
.arm.armL { transform-origin: 80% 15%; }
.arm.armR { transform-origin: 20% 15%; }
.top { transform-origin: 50% 100%; }
.top.anim-flicker { animation: flicker 1.4s ease-in-out infinite; }
.top.anim-wiggle { animation: wiggle 3s ease-in-out infinite; }
.shadow { transform-origin: 50% 50%; }
.eyes > g, .mouth > *, .fx-surprise { display: none; }

/* mascota con imágenes */
.mascot-img { position: relative; width: 100%; }
.mascot-img .fig { position: relative; width: 100%; aspect-ratio: 1 / 1; }
.mascot-img .img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: none; user-select: none; }
.mascot-img .shadow-html { width: 56%; height: 14px; margin: -10px auto 0; border-radius: 50%; background: rgba(0,0,0,.22); }
.st-reposo .img-base, .st-sorpresa .img-sorpresa, .st-tristeza .img-triste,
.st-saludo .img-feliz, .st-salto .img-feliz, .st-baile .img-feliz, .st-celebracion .img-feliz, .st-agradecimiento .img-feliz { display: block; }

/* expresión por estado */
.st-reposo .e-normal, .st-sorpresa .e-big, .st-tristeza .e-sad,
.st-saludo .e-happy, .st-salto .e-happy, .st-baile .e-happy, .st-celebracion .e-happy, .st-agradecimiento .e-happy { display: inline; }
.st-reposo .m-smile, .st-agradecimiento .m-smile, .st-salto .m-o, .st-sorpresa .m-o, .st-tristeza .m-sad,
.st-saludo .m-grin, .st-baile .m-grin, .st-celebracion .m-grin { display: inline; }
.st-sorpresa .fx-surprise { display: inline; animation: pop .5s ease-out both; }

/* reposo: respira y parpadea */
.st-reposo .fig { animation: breathe 3.2s ease-in-out infinite; }
.st-reposo .e-normal { transform-origin: 50% 50%; animation: blink 4.5s infinite; }

.st-saludo .armR { animation: wave .5s ease-in-out infinite alternate; }
.st-saludo .fig { animation: tilt 1.3s ease-in-out infinite alternate; }

.st-salto .fig { animation: jump .9s cubic-bezier(.3,.7,.4,1) infinite; }
.st-salto .shadow, .st-celebracion .shadow, .st-salto .shadow-html, .st-celebracion .shadow-html { animation: shadowJump .9s cubic-bezier(.3,.7,.4,1) infinite; }
.st-salto .armL { animation: armsUpL .9s ease-in-out infinite; }
.st-salto .armR { animation: armsUpR .9s ease-in-out infinite; }

.st-baile .fig { animation: dance .6s ease-in-out infinite alternate; }
.st-baile .armL { animation: armSwingL .3s ease-in-out infinite alternate; }
.st-baile .armR { animation: armSwingR .3s ease-in-out infinite alternate; }
.st-baile .footL { animation: step .3s ease-in-out infinite alternate; }
.st-baile .footR { animation: step .3s ease-in-out infinite alternate-reverse; }

.st-sorpresa .fig { animation: startle .5s cubic-bezier(.2,1.6,.4,1) both; }
.st-sorpresa .top { animation: shake .12s linear infinite; }
.st-sorpresa .armL { animation: armsOutL .3s ease-out both; }
.st-sorpresa .armR { animation: armsOutR .3s ease-out both; }

.st-celebracion .fig { animation: jump .9s cubic-bezier(.3,.7,.4,1) infinite; }
.st-celebracion .armL { animation: armsHoldL .4s ease-out both; }
.st-celebracion .armR { animation: armsHoldR .4s ease-out both; }

.st-tristeza .fig { animation: droop 1s ease-out both, sob 1.2s ease-in-out 1s infinite; }
.st-tristeza .tear { animation: tear 1.4s ease-in infinite; }
.st-tristeza .top { animation: flameDown 1s ease-out both; }

.st-agradecimiento .fig { animation: bow 1.6s ease-in-out infinite; }
.st-agradecimiento .armL { animation: hugL 1.6s ease-in-out infinite; }
.st-agradecimiento .armR { animation: hugR 1.6s ease-in-out infinite; }

@keyframes flicker { 50% { transform: scaleY(1.1) rotate(3deg); } }
@keyframes wiggle { 0%, 100% { transform: rotate(0); } 45% { transform: rotate(-3deg); } 55% { transform: rotate(3deg); } }
@keyframes breathe { 50% { transform: scale(1.03, .97); } }
@keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
@keyframes wave { from { transform: rotate(-150deg); } to { transform: rotate(-110deg); } }
@keyframes tilt { from { transform: rotate(-3deg); } to { transform: rotate(3deg); } }
@keyframes jump { 0%, 100% { transform: translateY(0) scale(1.08, .92); } 15% { transform: translateY(0) scale(.95, 1.06); } 50% { transform: translateY(-34%) scale(.98, 1.03); } 85% { transform: translateY(0) scale(1.06, .94); } }
@keyframes shadowJump { 50% { transform: scale(.6); opacity: .1; } }
@keyframes armsUpL { 50% { transform: rotate(160deg); } }
@keyframes armsUpR { 50% { transform: rotate(-160deg); } }
@keyframes armsHoldL { to { transform: rotate(160deg); } }
@keyframes armsHoldR { to { transform: rotate(-160deg); } }
@keyframes dance { from { transform: rotate(-9deg) translateX(-4%); } to { transform: rotate(9deg) translateX(4%); } }
@keyframes armSwingL { from { transform: rotate(20deg); } to { transform: rotate(140deg); } }
@keyframes armSwingR { from { transform: rotate(-140deg); } to { transform: rotate(-20deg); } }
@keyframes step { to { transform: translateY(-14%); } }
@keyframes startle { 0% { transform: scale(1); } 40% { transform: scale(.85, 1.2) translateY(-8%); } 100% { transform: scale(1.05); } }
@keyframes shake { 0% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } 100% { transform: rotate(-8deg); } }
@keyframes armsOutL { to { transform: rotate(60deg); } }
@keyframes armsOutR { to { transform: rotate(-60deg); } }
@keyframes droop { to { transform: scale(1.04, .9); } }
@keyframes sob { 0%, 100% { transform: scale(1.04, .9); } 50% { transform: scale(1.06, .88) translateY(1%); } }
@keyframes tear { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(260%); opacity: 0; } }
@keyframes flameDown { to { transform: rotate(35deg) scaleY(.8); } }
@keyframes bow { 0%, 100% { transform: rotate(0); } 40%, 60% { transform: rotate(0) scale(1.02, .88); } }
@keyframes hugL { 0%, 100% { transform: rotate(0); } 40%, 60% { transform: rotate(-40deg); } }
@keyframes hugR { 0%, 100% { transform: rotate(0); } 40%, 60% { transform: rotate(40deg); } }
@keyframes pop { from { transform: scale(0); } to { transform: scale(1); } }
`;
