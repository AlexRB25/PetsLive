"use client";
// Resumen del negocio: KPIs y tres series diarias de 30 días (registros, minutos en vivo, ingresos).
import { useEffect, useState } from "react";
import { hours, mxn, PLATFORM_LABELS, type Platform } from "@/lib/types";
import { getJSON } from "./api";

interface Day { day: string; signups: number; live_minutes: number; revenue: number }
interface MetricsData {
  users_total: number; users_7d: number; users_30d: number; blocked: number;
  subs_by_plan: { plan_id: string; source: string; users: number }[];
  mrr: number; revenue_30d: number; revenue_month: number;
  live_now: number; live_minutes_30d: number; sessions_30d: number; streamers_30d: number;
  ai_designs_month: number; summaries_month: number;
  platforms_30d: Record<string, number>;
  daily: Day[];
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card kpi">
      <div className="muted small">{label}</div>
      <div className="kpi-value">{value}</div>
      {note && <div className="muted tiny">{note}</div>}
    </div>
  );
}

const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" });

/** Barras diarias de una sola serie: el título nombra la serie, cada barra tiene su valor al pasar el mouse. */
function DailyBars({ title, days, pick, format }: { title: string; days: Day[]; pick: (d: Day) => number; format: (n: number) => string }) {
  const values = days.map(pick);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const peak = values.indexOf(Math.max(...values));
  return (
    <figure className="card chart">
      <figcaption className="row between">
        <span className="small"><strong>{title}</strong> <span className="muted">· últimos 30 días</span></span>
        <span className="small">{format(total)}</span>
      </figcaption>
      <div className="bars" role="img" aria-label={`${title}: total ${format(total)} en 30 días`}>
        {days.map((d, i) => (
          <div key={d.day} className="bar-slot" tabIndex={0}>
            <div className="bar" style={{ height: `${values[i] ? Math.max(3, (values[i] / max) * 100) : 0}%` }} />
            <span className="bar-tip">{shortDay(d.day)}: {format(values[i])}</span>
            {i === peak && values[i] > 0 && <span className="bar-label">{format(values[i])}</span>}
          </div>
        ))}
      </div>
      <div className="row between tiny muted"><span>{shortDay(days[0].day)}</span><span>hoy</span></div>
      <details className="tiny">
        <summary className="muted">Ver como tabla</summary>
        <table className="list"><tbody>{days.map((d, i) => <tr key={d.day}><td>{shortDay(d.day)}</td><td>{format(values[i])}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

export default function Metrics() {
  const [m, setM] = useState<MetricsData | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { getJSON<MetricsData>("/api/admin/metricas").then(setM).catch((e) => setErr(e.message)); }, []);

  if (err) return <div className="err">{err}</div>;
  if (!m) return <p className="muted">Cargando métricas…</p>;

  const paidSubs = m.subs_by_plan.filter((s) => s.plan_id !== "gratis");
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="kpis">
        <Tile label="Usuarios registrados" value={m.users_total.toLocaleString("es-MX")} note={`+${m.users_7d} en 7 días · +${m.users_30d} en 30 días`} />
        <Tile label="Suscripciones activas" value={paidSubs.reduce((a, s) => a + s.users, 0).toLocaleString("es-MX")} note={paidSubs.map((s) => `${s.plan_id}${s.source === "admin" ? " (regalo)" : ""}: ${s.users}`).join(" · ") || "ninguna"} />
        <Tile label="Ingreso mensual recurrente" value={mxn(m.mrr)} note="suscripciones activas en Mercado Pago" />
        <Tile label="Cobrado este mes" value={mxn(m.revenue_month)} note={`${mxn(m.revenue_30d)} en 30 días`} />
        <Tile label="En vivo ahora" value={String(m.live_now)} note={`${m.streamers_30d} streamers activos en 30 días`} />
        <Tile label="Horas en vivo (30 días)" value={hours(m.live_minutes_30d)} note={`${m.sessions_30d} directos`} />
        <Tile label="IA este mes" value={`${m.ai_designs_month + m.summaries_month}`} note={`${m.ai_designs_month} mascotas · ${m.summaries_month} resúmenes`} />
        <Tile label="Cuentas suspendidas" value={String(m.blocked)} />
      </div>

      <div className="charts">
        <DailyBars title="Registros" days={m.daily} pick={(d) => d.signups} format={(n) => n.toLocaleString("es-MX")} />
        <DailyBars title="Horas en vivo" days={m.daily} pick={(d) => d.live_minutes} format={(n) => hours(n)} />
        <DailyBars title="Ingresos" days={m.daily} pick={(d) => Number(d.revenue)} format={(n) => mxn(n)} />
      </div>

      {Object.keys(m.platforms_30d).length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Directos por plataforma (30 días)</h3>
          <table className="list">
            <tbody>
              {Object.entries(m.platforms_30d).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
                <tr key={p}><td>{PLATFORM_LABELS[p as Platform] ?? p}</td><td>{n} directos</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
