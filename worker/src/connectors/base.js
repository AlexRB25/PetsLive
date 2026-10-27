// Base de los conectores: estado visible en el panel y reintentos que se cancelan al detener.
// Estados: connecting | waiting (aún no hay directo) | live | error | off
export class Connector {
  constructor(platform, ctx) {
    this.platform = platform;
    this.ctx = ctx; // { userId, settings, emit(evt), onStatus(platform, state, text), getTokens(), saveTokens(t) }
    this.stopped = false;
    this.timer = null;
    this.state = 'off';
    this.text = '';
  }

  status(state, text) {
    this.state = state;
    this.text = text;
    this.ctx.onStatus(this.platform, state, text);
  }

  later(fn, ms) {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => { if (!this.stopped) fn(); }, ms);
  }

  emit(evt) {
    if (!this.stopped) this.ctx.emit(evt);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    try { this.close(); } catch {}
    this.status('off', 'apagado');
  }

  close() {}
}

// Lee un flujo Server-Sent Events con fetch (Node no trae EventSource).
export async function readSSE(url, signal, onData) {
  const res = await fetch(url, { signal, headers: { Accept: 'text/event-stream' } });
  if (!res.ok || !res.body) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.body = await res.text().catch(() => '');
    throw err;
  }
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      try { onData(JSON.parse(line.slice(5).trim())); } catch {}
    }
  }
}
