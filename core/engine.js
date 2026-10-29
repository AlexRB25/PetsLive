// Motor de eventos: normaliza, deduplica, aplica reglas y reparte reacciones de una en una.
// Flujo: fuente → ingest() → validación → reglas → cola con prioridad → emit('play') → overlay.
import { EVENT_TYPES } from './config.js';
import { Game } from './game.js';

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export class Engine {
  constructor(config, emit, now = () => Date.now()) {
    this.config = config;
    this.emit = emit; // emit(kind, payload)
    this.now = now;
    this.queue = [];
    this.current = null;
    this.playTimer = null;
    this.pumpTimer = null;
    this.plays = []; // marcas de tiempo de reacciones reproducidas (límite por minuto)
    this.seen = new Map(); // clave de evento → ts (deduplicación)
    this.cooldowns = new Map(); // "tipo|usuario" → ts
    this.lastPhrase = new Map(); // regla → índice usado la última vez
    this.lastCommandAt = 0;
    this.likes = { count: 0, since: 0 };
    this.joinBatch = { names: [], timer: null };
    this.log = [];
    this.seq = 0;
    this.lastActivity = now(); // último evento del público (para las invitaciones)
    this.game = new Game(config.game, {
      emit: (state) => this.emit('game', state),
      onWin: () => this.gameEvent('gameWin', {}),
      onDrop: (evt) => this.gameEvent('gameDrop', { user: evt.name, gift: evt.gift || 'eso' }),
      now,
    });
    this.lastIdleAt = 0;
  }

  setConfig(config) {
    this.game?.setConfig(config.game);
    this.config = config;
    if (config.behavior.paused) this.clear('pausa');
    this.pump();
  }

  // ---------- entrada ----------

  ingest(raw, source = 'simulador') {
    const evt = this.normalize(raw, source);
    if (!evt) return { ok: false, reason: 'evento inválido' };
    this.lastActivity = evt.ts;
    const b = this.config.behavior;
    const t = this.now();

    this.gcMaps(t);
    const key = evt.id ? `id|${evt.id}` : `${evt.type}|${evt.userKey}|${evt.text}|${evt.amount}|${evt.gift}`;
    // Los likes y entradas se agrupan aparte; la deduplicación aplica a todo lo demás.
    if (evt.type !== 'like' && b.dedupWindowMs > 0) {
      const prev = this.seen.get(key);
      if (prev && t - prev < b.dedupWindowMs) return this.record(evt, 'descartado', 'duplicado');
      this.seen.set(key, t);
    }
    if (b.paused) return this.record(evt, 'descartado', 'mascota en pausa');
    if (!this.inSchedule()) return this.record(evt, 'descartado', 'fuera de horario');
    this.game.apply(evt);

    switch (evt.type) {
      case 'join': return this.onJoin(evt, t);
      case 'like': return this.onLike(evt, t);
      case 'chat': return this.onChat(evt, t);
      case 'gift': return this.onGift(evt, t);
      case 'follow':
      case 'sub':
        if (this.onCooldown(evt, t)) return this.record(evt, 'descartado', 'mismo usuario hace poco');
        return this.fromRule(evt, evt.type, { user: evt.name });
      default: // purchase, win, lose, scare
        return this.fromRule(evt, evt.type, { user: evt.name, gift: evt.gift || 'eso' });
    }
  }

  normalize(raw, source) {
    if (!raw || typeof raw !== 'object' || !EVENT_TYPES.includes(raw.type)) return null;
    const rawUser = typeof raw.user === 'string' ? raw.user : '';
    const amount = Math.max(1, Math.min(1_000_000, Math.floor(Number(raw.amount) || 1)));
    return {
      type: raw.type,
      id: typeof raw.id === 'string' ? raw.id.slice(0, 80) : null,
      user: rawUser.slice(0, 40),
      userKey: rawUser.trim().toLowerCase().slice(0, 40),
      name: this.safeName(rawUser),
      text: typeof raw.text === 'string' ? raw.text.slice(0, 300) : '',
      gift: this.safeLabel(raw.gift),
      amount,
      // valor del regalo (diamantes, bits, moneda) para decidir si es grande; si no hay, cuenta la cantidad
      value: Number(raw.value) > 0 ? Math.min(1e9, Number(raw.value)) : amount,
      source,
      ts: this.now(),
    };
  }

  // Nombre solo si está disponible y es apropiado; si no, el genérico.
  safeName(name) {
    const fb = this.config.behavior.fallbackName;
    if (typeof name !== 'string') return fb;
    const clean = name.replace(/[\u0000-\u001f\u007f<>{}]/g, '').replace(/\s+/g, ' ').trim();
    if (!clean || clean.length > 24) return fb;
    if (/https?:|www\.|\.(com|net|ly|gg|io)\b/i.test(clean)) return fb;
    if (/(.)\1{5,}/.test(clean)) return fb;
    const flat = strip(clean).replace(/[^a-z0-9]/g, '');
    if (this.config.behavior.blockedWords.some((w) => w && flat.includes(strip(w).replace(/[^a-z0-9]/g, '')))) return fb;
    return clean;
  }

  safeLabel(label) {
    if (typeof label !== 'string') return '';
    const clean = label.replace(/[\u0000-\u001f\u007f<>{}]/g, '').trim().slice(0, 30);
    return this.safeName(clean) === this.config.behavior.fallbackName && clean ? '' : clean;
  }

  onCooldown(evt, t) {
    const cd = this.config.behavior.userCooldownMs;
    if (!evt.userKey || cd <= 0) return false;
    const k = `${evt.type}|${evt.userKey}`;
    const prev = this.cooldowns.get(k);
    if (prev && t - prev < cd) return true;
    this.cooldowns.set(k, t);
    return false;
  }

  onJoin(evt, t) {
    if (!this.config.rules.join.enabled) return this.record(evt, 'descartado', 'regla desactivada');
    if (this.onCooldown(evt, t)) return this.record(evt, 'descartado', 'ya saludado hace poco');
    const ms = this.config.behavior.joinBatchMs;
    if (ms <= 0) return this.fromRule(evt, 'join', { user: evt.name });
    this.joinBatch.names.push(evt.name);
    if (!this.joinBatch.timer) {
      this.joinBatch.timer = setTimeout(() => this.flushJoins(), ms);
    }
    return this.record(evt, 'agrupado', `entradas en espera: ${this.joinBatch.names.length}`);
  }

  flushJoins() {
    const names = [...new Set(this.joinBatch.names)];
    this.joinBatch = { names: [], timer: null };
    if (!names.length) return;
    const fake = { type: 'join', user: '', name: names[0], source: 'agrupación', ts: this.now() };
    if (names.length === 1) return this.fromRule(fake, 'join', { user: names[0] });
    const shown = names.slice(0, 3);
    const rest = names.length - shown.length;
    const list = rest > 0 ? `${shown.join(', ')} y ${rest} más` : `${shown.slice(0, -1).join(', ')} y ${shown.at(-1)}`;
    const rule = this.config.rules.joinGroup.enabled ? 'joinGroup' : 'join';
    return this.fromRule(fake, rule, { names: list, user: list, count: names.length });
  }

  onLike(evt, t) {
    const b = this.config.behavior;
    if (!this.config.rules.like.enabled) return this.record(evt, 'descartado', 'regla desactivada');
    if (t - this.likes.since > b.likeWindowMs) this.likes = { count: 0, since: t };
    this.likes.count += evt.amount;
    if (this.likes.count < b.likeThreshold) {
      return this.record(evt, 'agrupado', `likes acumulados: ${this.likes.count}/${b.likeThreshold}`);
    }
    const count = this.likes.count;
    this.likes = { count: 0, since: t };
    return this.fromRule(evt, 'like', { count, user: evt.name });
  }

  onChat(evt, t) {
    const b = this.config.behavior;
    const word = evt.text.trim().split(/\s+/)[0]?.toLowerCase() || '';
    const reaction = this.config.commands[word];
    if (reaction) {
      if (!this.config.rules.command.enabled) return this.record(evt, 'descartado', 'comandos desactivados');
      if (t - this.lastCommandAt < b.commandCooldownMs) return this.record(evt, 'descartado', 'comando en enfriamiento');
      this.lastCommandAt = t;
      return this.fromRule(evt, 'command', { user: evt.name }, reaction);
    }
    const rule = this.config.rules.chat;
    if (!rule.enabled) return this.record(evt, 'ignorado', 'regla desactivada');
    if (rule.onlyMentions && !strip(evt.text).includes(strip(this.config.mascot.name))) {
      return this.record(evt, 'ignorado', 'no menciona a la mascota');
    }
    if (this.onCooldown(evt, t)) return this.record(evt, 'descartado', 'mismo usuario hace poco');
    return this.fromRule(evt, 'chat', { user: evt.name });
  }

  onGift(evt, t) {
    const b = this.config.behavior;
    // Combos del mismo usuario: se suman al agradecimiento que sigue en cola.
    const queued = this.queue.find((q) => q.mergeKey === `gift|${evt.userKey}` && t - q.ts < b.giftMergeMs);
    if (queued && evt.userKey) {
      queued.vars.amount += evt.amount;
      queued.vars.value += evt.value;
      queued.vars.gift = this.giftText(queued.vars.giftName, queued.vars.amount);
      if (queued.rule === 'gift' && queued.vars.value >= b.bigGiftAmount && this.config.rules.giftBig.enabled) {
        queued.rule = 'giftBig';
        queued.reaction = this.config.rules.giftBig.reaction;
        queued.priority = this.config.rules.giftBig.priority;
        this.sortQueue();
      }
      this.broadcastState();
      return this.record(evt, 'agrupado', `combo de regalos: ${queued.vars.amount}`);
    }
    const big = evt.value >= b.bigGiftAmount && this.config.rules.giftBig.enabled;
    const giftName = evt.gift || 'el regalo';
    return this.fromRule(evt, big ? 'giftBig' : 'gift', {
      user: evt.name,
      giftName,
      amount: evt.amount,
      value: evt.value,
      gift: this.giftText(giftName, evt.amount),
    }, null, evt.userKey ? `gift|${evt.userKey}` : null);
  }

  giftText(name, amount) {
    return amount > 1 ? `${amount}× ${name}` : name;
  }

  fromRule(evt, ruleKey, vars, reactionOverride = null, mergeKey = null) {
    const rule = this.config.rules[ruleKey];
    if (!rule || !rule.enabled) return this.record(evt, 'descartado', 'regla desactivada');
    const item = {
      id: ++this.seq,
      rule: ruleKey,
      reaction: reactionOverride || rule.reaction,
      priority: rule.priority,
      vars: { mascota: this.config.mascot.name, count: 0, amount: 1, gift: '', names: '', user: this.config.behavior.fallbackName, ...vars },
      ts: this.now(),
      mergeKey,
      label: `${evt.type}${evt.name ? ' · ' + evt.name : ''}`,
    };
    const res = this.enqueue(item);
    return this.record(evt, res.ok ? 'en cola' : 'descartado', res.ok ? `${item.reaction} (prioridad ${item.priority})` : res.reason);
  }

  // Festejo o queja de la mascota por el juego.
  gameEvent(rule, vars) {
    return this.fromRule({ type: 'juego', name: '', source: 'juego', ts: this.now() }, rule, vars);
  }

  // Invitación a interactuar (like, comentar, seguir…) cuando nadie participa desde hace rato.
  // La llama el worker cada pocos segundos durante un directo; force la lanza ya (botón de prueba).
  idleTick(force = false) {
    const b = this.config.behavior;
    const rule = this.config.rules.idle;
    if (!rule?.enabled || b.paused || !this.inSchedule()) return false;
    const t = this.now();
    if (!force) {
      if (this.current || this.queue.length) return false;
      if (t - this.lastActivity < b.idleAfterMs || t - this.lastIdleAt < b.idleEveryMs) return false;
    }
    this.lastIdleAt = t;
    return this.fromRule({ type: 'idle', name: '', source: 'mascota', ts: t }, 'idle', {}).ok;
  }

  // Reacciones de prueba desde el panel: entran con prioridad máxima e ignoran límites.
  test(reaction, text) {
    const item = {
      id: ++this.seq,
      rule: 'test',
      reaction,
      priority: 5,
      vars: {},
      fixedText: typeof text === 'string' ? text.slice(0, 140) : '',
      ts: this.now(),
      test: true,
      label: `prueba · ${reaction}`,
    };
    this.queue = this.queue.filter((q) => !q.test);
    this.interruptWith(item);
    return { ok: true };
  }

  // ---------- cola ----------

  enqueue(item) {
    const b = this.config.behavior;
    const c = this.current;
    if (c && b.allowInterrupt && item.priority >= b.interruptPriority && item.priority > c.priority) {
      this.interruptWith(item);
      return { ok: true };
    }
    this.queue.push(item);
    this.sortQueue();
    while (this.queue.length > b.maxQueue) {
      const dropped = this.queue.pop();
      this.pushLog({ kind: 'cola', action: 'descartado', detail: `${dropped.label}: cola llena` });
    }
    if (!this.queue.includes(item)) return { ok: false, reason: 'cola llena (prioridad baja)' };
    this.broadcastState();
    this.pump();
    return { ok: true };
  }

  sortQueue() {
    this.queue.sort((a, b) => b.priority - a.priority || a.ts - b.ts);
  }

  interruptWith(item) {
    if (this.current) this.pushLog({ kind: 'cola', action: 'interrumpido', detail: this.current.label });
    clearTimeout(this.playTimer);
    clearTimeout(this.pumpTimer);
    this.pumpTimer = null;
    this.current = null;
    this.play(item);
  }

  pump() {
    if (this.current || this.pumpTimer || !this.queue.length) return;
    const b = this.config.behavior;
    const t = this.now();
    // Las reacciones que esperaron demasiado ya no tienen sentido (saludar 1 min tarde).
    const fresh = this.queue.filter((q) => q.test || t - q.ts <= b.maxWaitMs);
    for (const q of this.queue) if (!fresh.includes(q)) this.pushLog({ kind: 'cola', action: 'caducado', detail: q.label });
    this.queue = fresh;
    if (!this.queue.length) return this.broadcastState();

    this.plays = this.plays.filter((p) => t - p < 60000);
    const next = this.queue[0];
    if (!next.test && next.priority < 5 && this.plays.length >= b.maxPerMinute) {
      const wait = 60000 - (t - this.plays[0]) + 5;
      this.pumpTimer = setTimeout(() => { this.pumpTimer = null; this.pump(); }, Math.min(wait, 1000));
      return;
    }
    this.queue.shift();
    this.play(next);
  }

  play(item) {
    const b = this.config.behavior;
    const t = this.now();
    if (!item.test) this.plays.push(t);
    const text = b.silent ? '' : (item.test ? item.fixedText : this.render(item));
    const duration = this.config.durations[item.reaction] || 2500;
    this.current = { ...item, startedAt: t, duration, text };
    this.emit('play', { id: item.id, reaction: item.reaction, rule: item.rule, text, duration, priority: item.priority });
    this.pushLog({ kind: 'reacción', action: 'reproducido', detail: `${item.label} → ${item.reaction}${text ? ` · “${text}”` : ''}` });
    this.broadcastState();
    this.playTimer = setTimeout(() => {
      this.current = null;
      this.emit('idle', {});
      this.broadcastState();
      this.pumpTimer = setTimeout(() => { this.pumpTimer = null; this.pump(); }, b.minGapMs);
    }, duration);
  }

  // Frase aleatoria de la regla, sin repetir la última usada.
  render(item) {
    const list = this.config.rules[item.rule]?.phrases || [];
    if (!list.length) return '';
    let idx = Math.floor(Math.random() * list.length);
    const last = this.lastPhrase.get(item.rule);
    if (list.length > 1 && idx === last) idx = (idx + 1) % list.length;
    this.lastPhrase.set(item.rule, idx);
    return list[idx].replace(/\{(\w+)\}/g, (m, k) => (k in item.vars ? String(item.vars[k]) : m));
  }

  clear(reason = 'manual') {
    clearTimeout(this.playTimer);
    clearTimeout(this.pumpTimer);
    clearTimeout(this.joinBatch.timer);
    this.pumpTimer = null;
    this.joinBatch = { names: [], timer: null };
    const n = this.queue.length + (this.current ? 1 : 0);
    this.queue = [];
    this.current = null;
    this.likes = { count: 0, since: 0 };
    this.emit('idle', {});
    if (n) this.pushLog({ kind: 'cola', action: 'vaciada', detail: `${n} reacciones (${reason})` });
    this.broadcastState();
  }

  inSchedule() {
    const s = this.config.behavior.schedule;
    if (!s.enabled) return true;
    const d = new Date(this.now());
    const cur = d.getHours() * 60 + d.getMinutes();
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    const a = sh * 60 + sm;
    const z = eh * 60 + em;
    return a <= z ? cur >= a && cur <= z : cur >= a || cur <= z; // admite horarios que cruzan medianoche
  }

  gcMaps(t) {
    if (this.seen.size > 5000) for (const [k, v] of this.seen) if (t - v > this.config.behavior.dedupWindowMs) this.seen.delete(k);
    if (this.cooldowns.size > 5000) for (const [k, v] of this.cooldowns) if (t - v > this.config.behavior.userCooldownMs) this.cooldowns.delete(k);
  }

  // ---------- estado y registro ----------

  // El historial vive solo en memoria (lo ve solo el streamer en su panel); incluye el comentario leído.
  record(evt, action, detail) {
    const text = evt.type === 'chat' && evt.text ? evt.text.slice(0, 140) : undefined;
    this.pushLog({ kind: evt.type, source: evt.source, user: evt.name, text, action, detail });
    return { ok: action !== 'descartado', action, detail };
  }

  pushLog(entry) {
    const e = { ts: this.now(), ...entry };
    this.log.push(e);
    if (this.log.length > 200) this.log.shift();
    this.emit('log', e);
  }

  state() {
    const t = this.now();
    return {
      current: this.current && { reaction: this.current.reaction, label: this.current.label, priority: this.current.priority, remaining: Math.max(0, this.current.startedAt + this.current.duration - t) },
      queue: this.queue.map((q) => ({ id: q.id, reaction: q.reaction, label: q.label, priority: q.priority })),
      playsLastMinute: this.plays.filter((p) => t - p < 60000).length,
      likes: this.likes.count,
      inSchedule: this.inSchedule(),
    };
  }

  broadcastState() {
    this.emit('state', this.state());
  }
}
