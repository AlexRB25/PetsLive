"use client";

import { REACTION_LABELS, type EngineState, type LogEntry } from "@/lib/types";

const KIND: Record<string, string> = {
  join: "entrada", chat: "chat", follow: "follow", like: "likes", gift: "regalo", sub: "suscripción",
  purchase: "compra", win: "victoria", lose: "derrota", scare: "susto",
};
const SOURCE: Record<string, string> = { twitch: "Twitch", youtube: "YouTube", facebook: "Facebook", tiktok: "TikTok", simulador: "simulador" };

const time = (ts: number) => new Date(ts).toLocaleTimeString("es-MX", { hour12: false });

interface Props {
  state: EngineState | null;
  log: LogEntry[];
  maxPerMinute: number;
  call: (path: string, body: unknown) => Promise<unknown>;
}

export default function QueueLog({ state, log, maxPerMinute, call }: Props) {
  return (
    <section className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Cola</h2>
        <button className="btn sm ghost" onClick={() => call("/panel/control", { action: "clear" }).catch(() => {})}>Vaciar</button>
      </div>
      <div className="now" style={{ marginTop: 8 }}>
        {state?.current ? `▶ ${REACTION_LABELS[state.current.reaction] ?? state.current.reaction} — ${state.current.label}` : state && !state.inSchedule ? "Fuera de horario" : "En reposo"}
      </div>
      <ol className="queue">
        {state?.queue.map((q) => (
          <li key={q.id}><span className="prio">{q.priority}</span>{REACTION_LABELS[q.reaction] ?? q.reaction} — {q.label}</li>
        ))}
      </ol>
      <div className="muted tiny">{state ? `${state.playsLastMinute}/${maxPerMinute} reacciones en el último minuto${state.likes ? ` · ${state.likes} likes acumulados` : ""}` : ""}</div>

      <div className="row between" style={{ marginTop: 16 }}>
        <h2 style={{ margin: 0 }}>Eventos recientes</h2>
        <button className="btn sm ghost" onClick={() => call("/panel/control", { action: "clear-history" }).catch(() => {})}>Borrar</button>
      </div>
      <p className="muted tiny" style={{ margin: "4px 0 6px" }}>Esta lista vive solo en memoria. Para el resumen del directo se guardan los comentarios sin nombres hasta generarlo (máx. 30 días); se desactiva en Límites.</p>
      <ul className="log">
        {log.map((e, i) => (
          <li key={`${e.ts}-${i}`}>
            <time>{time(e.ts)}</time>
            <span>
              <span className={`tag ${e.action.replace(/\s/g, "")}`}>{e.action}</span>{" "}
              {KIND[e.kind] ?? e.kind}
              {e.source && e.source !== "simulador" ? ` (${SOURCE[e.source] ?? e.source})` : ""}
              {e.user ? ` · ${e.user}` : ""}
              {e.detail ? ` — ${e.detail}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
