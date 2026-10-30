"use client";
// Conversación con IA: elegir modelo (y su costo en créditos), personalidad, comprar créditos e historial.
import { useCallback, useEffect, useState } from "react";
import { AI_MODELS } from "@core/config.js";
import { postJSON, supabase } from "@/lib/supabase-browser";
import type { MascotConfig } from "@/lib/types";

type Update = (fn: (c: MascotConfig) => void) => void;
type ModelKey = keyof typeof AI_MODELS;

interface Pack { id: string; name: string; credits: number; price_mxn: number }
interface Move { id: number; delta: number; balance: number; kind: string; model: string; detail: string; created_at: string }

const KIND: Record<string, string> = { compra: "Compra", uso: "Respuesta", reembolso: "Devolución", admin: "Ajuste" };
const PAGE = 30;
const money = (n: number) => `$${Number(n).toLocaleString("es-MX")} MXN`;
const when = (s: string) => new Date(s).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function AiSettings({ config, update }: { config: MascotConfig; update: Update }) {
  const ai = config.ai;
  const set = (fn: (a: MascotConfig["ai"]) => void) => update((c) => fn(c.ai));
  const [balance, setBalance] = useState<number | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async (count = PAGE) => {
    const [w, l] = await Promise.all([
      supabase().from("wallets").select("credits").maybeSingle(),
      supabase().from("credit_ledger").select("id, delta, balance, kind, model, detail, created_at").order("id", { ascending: false }).range(0, count),
    ]);
    if (!w.error) setBalance(w.data?.credits ?? 0);
    if (!l.error) {
      setMoves(l.data.slice(0, count) as Move[]);
      setMore(l.data.length > count);
    }
  }, []);

  useEffect(() => {
    load();
    supabase().from("credit_packs").select("id, name, credits, price_mxn").order("sort").then((r) => { if (!r.error) setPacks(r.data as Pack[]); });
    // El saldo baja mientras la mascota responde: se refresca solo.
    const t = setInterval(() => load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  async function buy(pack: Pack) {
    setErr("");
    setBusy(pack.id);
    try {
      const { url } = await postJSON<{ url: string }>("/api/creditos/comprar", { pack: pack.id });
      location.href = url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }

  const cost = AI_MODELS[ai.model as ModelKey]?.credits ?? 1;

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        Con la IA, la mascota platica de verdad: lee el comentario, recuerda lo último que se dijo en el chat y contesta con su personalidad,
        en lugar de usar las frases fijas. Cada respuesta descuenta créditos según el modelo. Si se acaban, vuelve a las frases normales.
      </p>

      <div className="row between" style={{ flexWrap: "wrap", gap: 12 }}>
        <label className="check"><input type="checkbox" checked={ai.enabled} onChange={(e) => set((a) => { a.enabled = e.target.checked; })} /> <strong>Activar conversación con IA</strong></label>
        <span className="pill">
          {balance === null ? "Cargando saldo…" : <><strong>{balance.toLocaleString("es-MX")}</strong>&nbsp;créditos · ≈ {Math.floor(balance / cost).toLocaleString("es-MX")} respuestas {AI_MODELS[ai.model as ModelKey]?.label.toLowerCase()}s</>}
        </span>
      </div>
      {ai.enabled && balance === 0 && <div className="warn small">No tienes créditos: compra un paquete abajo para que la IA empiece a responder.</div>}

      <h3>Versión de la IA</h3>
      <div className="row" style={{ flexWrap: "wrap", gap: 10, alignItems: "stretch" }}>
        {(Object.entries(AI_MODELS) as [ModelKey, (typeof AI_MODELS)[ModelKey]][]).map(([key, m]) => (
          <button key={key} className={`btn ${ai.model === key ? "on" : ""}`} aria-pressed={ai.model === key} onClick={() => set((a) => { a.model = key; })}
            style={{ flex: "1 1 180px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, textAlign: "left", padding: 12 }}>
            <strong>{m.label}</strong>
            <span className="tiny" style={{ opacity: 0.85 }}>{m.detail}</span>
            <span className="small"><strong>{m.credits}</strong> crédito{m.credits === 1 ? "" : "s"} por respuesta</span>
          </button>
        ))}
      </div>

      <div className="form">
        <label>Responder a
          <select value={ai.replyTo} onChange={(e) => set((a) => { a.replyTo = e.target.value as typeof a.replyTo; })}>
            <option value="menciones">Solo comentarios que mencionan a {config.mascot.name}</option>
            <option value="todos">Todos los comentarios (gasta más créditos)</option>
          </select>
        </label>
        <label>Máximo de respuestas con IA por minuto
          <input type="number" min={1} max={20} value={ai.perMinute} onChange={(e) => set((a) => { a.perMinute = Number(e.target.value); })} />
        </label>
      </div>
      <label className="stack" style={{ gap: 4 }}>Personalidad
        <textarea rows={2} maxLength={400} value={ai.personality} placeholder="Ej.: Sarcástica pero tierna, le encantan los dinosaurios y habla como pirata." onChange={(e) => set((a) => { a.personality = e.target.value; })} />
      </label>
      <label className="stack" style={{ gap: 4 }}>Sobre tu directo (lo que la mascota puede contar)
        <textarea rows={3} maxLength={600} value={ai.about} placeholder="Ej.: Tienda de impresiones 3D: figuras, llaveros y piezas a medida. Pedidos por WhatsApp; envíos a todo México." onChange={(e) => set((a) => { a.about = e.target.value; })} />
      </label>
      <p className="muted tiny" style={{ margin: 0 }}>
        La IA no sigue instrucciones del chat, no inventa precios ni promociones que no estén aquí y respeta tus palabras bloqueadas (pestaña Límites).
        Pruébala con el simulador: escribe un comentario que mencione a {config.mascot.name}. Las pruebas también descuentan créditos.
      </p>

      <h3>Comprar créditos</h3>
      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
        {packs.map((p) => (
          <div key={p.id} className="card" style={{ flex: "1 1 180px", padding: 12 }}>
            <strong>{p.name}</strong>
            <div className="muted tiny">≈ {Math.floor(p.credits / cost).toLocaleString("es-MX")} respuestas con el modelo elegido · no caducan</div>
            <button className="btn primary sm" style={{ marginTop: 8 }} disabled={!!busy} onClick={() => buy(p)}>{busy === p.id ? "Abriendo Mercado Pago…" : money(p.price_mxn)}</button>
          </div>
        ))}
        {!packs.length && <span className="muted small">Todavía no hay paquetes disponibles.</span>}
      </div>
      {err && <div className="err small">{err}</div>}

      <h3>Historial de créditos</h3>
      {moves.length ? (
        <div className="scroll-x">
          <table className="list">
            <thead><tr><th>Fecha</th><th>Movimiento</th><th>Detalle</th><th style={{ textAlign: "right" }}>Créditos</th><th style={{ textAlign: "right" }}>Saldo</th></tr></thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="tiny">{when(m.created_at)}</td>
                  <td>{KIND[m.kind] ?? m.kind}{m.model ? <span className="muted tiny"> · {AI_MODELS[m.model as ModelKey]?.label ?? m.model}</span> : null}</td>
                  <td className="small">{m.detail}</td>
                  <td style={{ textAlign: "right", color: m.delta < 0 ? "var(--bad, #f87171)" : "var(--ok, #4ade80)" }}>{m.delta > 0 ? "+" : ""}{m.delta}</td>
                  <td style={{ textAlign: "right" }}>{m.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted small">Aún no hay movimientos.</p>}
      {more && <div><button className="btn sm" onClick={() => load(moves.length + PAGE)}>Ver más</button></div>}
    </div>
  );
}
