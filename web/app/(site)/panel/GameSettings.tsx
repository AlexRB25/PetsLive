"use client";
// Juego "¡Llévame a la cima!": activar, meta, reglas de puntos y marcador en vivo.
import type { GameState } from "@/lib/game-widget";
import type { MascotConfig } from "@/lib/types";

type Update = (fn: (c: MascotConfig) => void) => void;
type Rule = MascotConfig["game"]["rules"][number];

const EVENTS: [string, string][] = [
  ["follow", "Follow"], ["like", "Likes"], ["gift", "Regalo"], ["sub", "Suscripción / membresía"], ["chat", "Palabra en el chat"], ["join", "Entrada"],
];

interface Props {
  config: MascotConfig;
  update: Update;
  state: GameState | null;
  call: (path: string, body: unknown) => Promise<unknown>;
}

export default function GameSettings({ config, update, state, call }: Props) {
  const g = config.game;
  const set = (fn: (g: MascotConfig["game"]) => void) => update((c) => fn(c.game));
  const setRule = (i: number, patch: Partial<Rule>) => set((g) => { g.rules[i] = { ...g.rules[i], ...patch }; });

  return (
    <div className="stack">
      <div className="row between">
        <label className="check"><input type="checkbox" checked={g.enabled} onChange={(e) => set((g) => { g.enabled = e.target.checked; })} /> <strong>Activar “{g.title}”</strong></label>
        {state?.enabled && (
          <div className="row">
            <span className="pill">{state.won ? "¡Llegó a la cima!" : `${state.progress} / ${state.goal}`} · {state.wins} cima{state.wins === 1 ? "" : "s"}</span>
            <button className="btn sm" onClick={() => call("/panel/control", { action: "game-reset" }).catch(() => {})}>Reiniciar</button>
          </div>
        )}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Aparece una montaña con una mini versión de tu mascota. Lo que hace el público la sube o la baja (por ejemplo, follows y likes suben y cada rosa la tira).
        Al llegar a la cima, la mascota festeja con la frase de la regla “Llegó a la cima” (pestaña Reglas y frases; pon ahí tu premio) y el juego empieza de nuevo.
        Pruébalo con el simulador.
      </p>

      <div className="form">
        <label>Título <input type="text" maxLength={40} value={g.title} onChange={(e) => set((g) => { g.title = e.target.value; })} /></label>
        <label>Puntos para llegar a la cima <input type="number" min={10} value={g.goal} onChange={(e) => set((g) => { g.goal = Number(e.target.value); })} /></label>
        <label>Lado
          <select value={g.side} onChange={(e) => set((g) => { g.side = e.target.value as "izquierda" | "derecha"; })}>
            <option value="izquierda">Izquierda</option><option value="derecha">Derecha</option>
          </select>
        </label>
        <label>Empieza a (% desde arriba) <input type="number" min={0} max={80} value={g.top} onChange={(e) => set((g) => { g.top = Number(e.target.value); })} /></label>
        <label>Alto (px) <input type="number" min={200} max={1600} step={50} value={g.height} onChange={(e) => set((g) => { g.height = Number(e.target.value); })} /></label>
        <label>Reiniciar tras ganar (s) <input type="number" min={2} max={120} value={g.resetSec} onChange={(e) => set((g) => { g.resetSec = Number(e.target.value); })} /></label>
      </div>

      <h3>Qué sube y qué baja</h3>
      <p className="muted tiny" style={{ margin: 0 }}>
        Puntos positivos suben, negativos bajan. En regalos, escribe el nombre (varios separados por coma, por ejemplo “rosa, rose”); un regalo sin nombre aplica a todos los demás.
        En el chat, la palabra exacta (por ejemplo “!sube”). En TikTok los nombres de regalos pueden venir en inglés.
      </p>
      <div className="scroll-x">
        <table className="list edit">
          <thead><tr><th>Cuando…</th><th>Nombre o palabra</th><th>Cada</th><th>Puntos</th><th></th></tr></thead>
          <tbody>
            {g.rules.map((r, i) => (
              <tr key={i}>
                <td>
                  <select value={r.event} onChange={(e) => setRule(i, { event: e.target.value })} style={{ width: "auto" }}>
                    {EVENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td>{r.event === "gift" || r.event === "chat"
                  ? <input type="text" value={r.match} placeholder={r.event === "gift" ? "cualquier regalo" : "!sube"} onChange={(e) => setRule(i, { match: e.target.value })} />
                  : <span className="muted tiny">—</span>}</td>
                <td><input type="number" min={1} value={r.per} onChange={(e) => setRule(i, { per: Number(e.target.value) })} title={r.event === "like" ? "Cada cuántos likes" : "Cada cuántos"} /></td>
                <td><input type="number" value={r.points} onChange={(e) => setRule(i, { points: Number(e.target.value) })} /></td>
                <td><button className="btn sm ghost" title="Quitar" onClick={() => set((g) => { g.rules.splice(i, 1); })}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div><button className="btn sm" disabled={g.rules.length >= 12} onClick={() => set((g) => { g.rules.push({ event: "gift", match: "", points: 5, per: 1 }); })}>Añadir regla</button></div>
    </div>
  );
}
