// Juego "¡Llévame a la cima!": los eventos del público suben o bajan a la mascota en una montaña.
// Al llegar a la meta se festeja y el juego vuelve a empezar. Lo usa el motor (engine.js).

export const GAME_EVENTS = ['follow', 'like', 'gift', 'sub', 'chat', 'join'];

export const DEFAULT_GAME = {
  enabled: false,
  title: '¡Llévame a la cima!',
  goal: 100,
  side: 'izquierda', // izquierda | derecha | libre (arrastrado en la vista previa)
  x: 16, // con side libre: centro del juego en % del ancho
  top: 18, // % desde arriba donde empieza la montaña
  height: 900, // px de alto del juego
  resetSec: 8,
  rules: [
    { event: 'follow', match: '', points: 10, per: 1 },
    { event: 'like', match: '', points: 1, per: 20 },
    { event: 'sub', match: '', points: 20, per: 1 },
    { event: 'gift', match: 'rosa, rose', points: -10, per: 1 },
    { event: 'gift', match: '', points: 5, per: 1 },
    { event: 'chat', match: '!sube', points: 2, per: 1 },
    { event: 'chat', match: '!baja', points: -2, per: 1 },
  ],
};

const clampNum = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

export function sanitizeGame(g = {}) {
  const d = DEFAULT_GAME;
  const i = g && typeof g === 'object' ? g : {};
  const rules = Array.isArray(i.rules)
    ? i.rules.filter((r) => r && GAME_EVENTS.includes(r.event)).slice(0, 12).map((r) => ({
        event: r.event,
        match: typeof r.match === 'string' ? r.match.replace(/[<>{}]/g, '').trim().toLowerCase().slice(0, 60) : '',
        points: clampNum(r.points, -1000, 1000, 0),
        per: clampNum(r.per, 1, 100000, 1),
      }))
    : d.rules.map((r) => ({ ...r }));
  return {
    enabled: typeof i.enabled === 'boolean' ? i.enabled : d.enabled,
    title: typeof i.title === 'string' && i.title.trim() ? i.title.replace(/[<>{}]/g, '').trim().slice(0, 40) : d.title,
    goal: clampNum(i.goal, 10, 100000, d.goal),
    side: ['derecha', 'libre'].includes(i.side) ? i.side : 'izquierda',
    x: clampNum(i.x, 0, 100, d.x),
    top: clampNum(i.top, 0, 80, d.top),
    height: clampNum(i.height, 200, 1600, d.height),
    resetSec: clampNum(i.resetSec, 2, 120, d.resetSec),
    rules,
  };
}

const words = (match) => match.split(',').map((w) => w.trim()).filter(Boolean);
const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export class Game {
  /**
   * emit(state): manda el estado al overlay y al panel. onWin(): avisa al motor para festejar.
   * onDrop(evt, delta): avisa de una caída fuerte para que la mascota reaccione.
   */
  constructor(cfg, { emit, onWin, onDrop, now = () => Date.now() }) {
    this.emit = emit;
    this.onWin = onWin;
    this.onDrop = onDrop;
    this.now = now;
    this.progress = 0;
    this.wins = 0;
    this.likeAcc = new Map(); // regla → likes acumulados
    this.chatCooldown = new Map(); // usuario → ts
    this.resetTimer = null;
    this.setConfig(cfg);
  }

  setConfig(cfg) {
    this.cfg = sanitizeGame(cfg);
    if (this.progress > this.cfg.goal) this.progress = this.cfg.goal;
    this.publish();
  }

  state(extra = {}) {
    const c = this.cfg;
    return {
      enabled: c.enabled, title: c.title, goal: c.goal, side: c.side, x: c.x, top: c.top, height: c.height,
      progress: this.progress, wins: this.wins, won: this.won || false,
      legend: c.rules.filter((r) => r.points !== 0).map((r) => ({ event: r.event, match: r.match, points: r.points, per: r.per })),
      ...extra,
    };
  }

  publish(extra) {
    this.emit(this.state(extra));
  }

  /** Puntos que da un evento según las reglas. En regalos, una regla con nombre gana a la genérica. */
  pointsFor(evt) {
    const rules = this.cfg.rules.filter((r) => r.event === evt.type);
    if (!rules.length) return 0;
    if (evt.type === 'gift') {
      const name = strip(evt.gift);
      const specific = rules.filter((r) => r.match && words(r.match).some((w) => name.includes(strip(w))));
      const use = specific.length ? specific : rules.filter((r) => !r.match);
      return use.reduce((n, r) => n + r.points * Math.floor(Math.max(1, evt.amount) / r.per), 0);
    }
    if (evt.type === 'chat') {
      const text = strip(evt.text);
      const hit = rules.filter((r) => r.match && words(r.match).some((w) => text.split(/\s+/).includes(strip(w))));
      if (!hit.length) return 0;
      // Que nadie gane solo escribiendo sin parar: una vez cada 3 s por persona.
      const key = evt.userKey || evt.name;
      const t = this.now();
      if (key && t - (this.chatCooldown.get(key) || 0) < 3000) return 0;
      if (key) this.chatCooldown.set(key, t);
      if (this.chatCooldown.size > 5000) this.chatCooldown.clear();
      return hit.reduce((n, r) => n + r.points, 0);
    }
    if (evt.type === 'like') {
      let n = 0;
      for (const [i, r] of this.cfg.rules.entries()) {
        if (r.event !== 'like') continue;
        const acc = (this.likeAcc.get(i) || 0) + Math.max(1, evt.amount);
        n += r.points * Math.floor(acc / r.per);
        this.likeAcc.set(i, acc % r.per);
      }
      return n;
    }
    return rules.reduce((n, r) => n + r.points * Math.floor(1 / r.per), 0);
  }

  apply(evt) {
    if (!this.cfg.enabled || this.won) return 0;
    const delta = this.pointsFor(evt);
    if (!delta) return 0;
    const before = this.progress;
    this.progress = Math.min(this.cfg.goal, Math.max(0, this.progress + delta));
    const moved = this.progress - before;
    if (!moved) return 0;
    if (this.progress >= this.cfg.goal) {
      this.won = true;
      this.wins++;
      this.publish({ delta: moved, by: evt.name, gift: evt.gift || '' });
      this.onWin?.();
      clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => this.reset(), this.cfg.resetSec * 1000);
      return moved;
    }
    this.publish({ delta: moved, by: evt.name, gift: evt.gift || '' });
    if (moved <= -10) this.onDrop?.(evt, moved);
    return moved;
  }

  reset() {
    clearTimeout(this.resetTimer);
    this.progress = 0;
    this.won = false;
    this.likeAcc.clear();
    this.publish();
  }

  stop() {
    clearTimeout(this.resetTimer);
  }
}
