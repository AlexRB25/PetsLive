"use client";
// Directos recientes (minutos cobrados, resumen por plataforma) y pagos del usuario.
import { Fragment, useEffect, useState } from "react";
import SessionSummary, { type Summary } from "./SessionSummary";
import { supabase } from "@/lib/supabase-browser";
import { hours, mxn, PLATFORM_LABELS, type Platform } from "@/lib/types";

interface LiveSession { id: string; started_at: string; ended_at: string | null; minutes: number; platforms: Platform[]; events: number; reactions: number; end_reason: string | null;
  stats: Record<string, never>; summary: Summary | null }
interface Payment { mp_id: string; kind: string; ref: string; amount: number; minutes: number; created_at: string }

const when = (s: string) => new Date(s).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

export default function Usage() {
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [open, setOpen] = useState("");

  useEffect(() => {
    supabase().from("live_sessions").select("*").order("started_at", { ascending: false }).limit(30).then((r) => setSessions((r.data as LiveSession[]) ?? []));
    supabase().from("payments").select("*").order("created_at", { ascending: false }).limit(30).then((r) => setPayments((r.data as Payment[]) ?? []));
  }, []);

  if (!sessions) return <p className="muted">Cargando…</p>;
  const month = sessions.filter((s) => new Date(s.started_at).getMonth() === new Date().getMonth()).reduce((n, s) => n + s.minutes, 0);

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>Este mes: <strong>{hours(month)}</strong> en vivo cobradas. Solo cuentan los minutos con al menos una plataforma transmitiendo.</p>
      <div className="scroll-x">
        <table className="list">
          <thead><tr><th>Inicio</th><th>Plataformas</th><th>Minutos</th><th>Eventos</th><th>Reacciones</th><th>Fin</th><th></th></tr></thead>
          <tbody>
            {sessions.length === 0 && <tr><td colSpan={7} className="muted">Todavía no has hecho ningún directo con la mascota.</td></tr>}
            {sessions.map((s) => (
              <Fragment key={s.id}>
              <tr>
                <td>{when(s.started_at)}</td>
                <td>{s.platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(", ")}</td>
                <td>{s.minutes}</td>
                <td>{s.events}</td>
                <td>{s.reactions}</td>
                <td className="muted">{s.ended_at ? s.end_reason ?? "" : "en curso"}</td>
                <td><button className={`btn sm ${open === s.id ? "on" : ""}`} onClick={() => setOpen(open === s.id ? "" : s.id)}>{s.summary ? "Ver resumen" : "Resumen"}</button></td>
              </tr>
              {open === s.id && (
                <tr><td colSpan={7}><SessionSummary id={s.id} stats={s.stats} initial={s.summary} ended={Boolean(s.ended_at)} /></td></tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {payments.length > 0 && (
        <>
          <h3>Pagos</h3>
          <div className="scroll-x">
            <table className="list">
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Horas</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.mp_id}>
                    <td>{when(p.created_at)}</td>
                    <td>{p.kind === "suscripcion" ? `Plan ${p.ref}` : `Recarga ${p.ref}`}</td>
                    <td>{mxn(p.amount)}</td>
                    <td>{hours(p.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
