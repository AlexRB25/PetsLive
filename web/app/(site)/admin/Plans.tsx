"use client";
// Edición de planes y recargas (precio, horas, cupos, activar/desactivar).
import { useCallback, useEffect, useState } from "react";
import { getJSON, postJSON } from "./api";

interface PlanRow { id: string; name: string; price_mxn: number; minutes: number; max_platforms: number; ai_designs: number; summaries: boolean; description: string; active: boolean; sort: number }
interface PackRow { id: string; name: string; price_mxn: number; minutes: number; active: boolean; sort: number }

export default function Plans() {
  const [data, setData] = useState<{ plans: PlanRow[]; packs: PackRow[] } | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => { getJSON<{ plans: PlanRow[]; packs: PackRow[] }>("/api/admin/planes").then(setData).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  async function save(table: "plans" | "hour_packs", row: PlanRow | PackRow) {
    setErr(""); setMsg("");
    try {
      await postJSON("/api/admin/planes", { table, id: row.id, patch: { ...row, minutes: Number(row.minutes), price_mxn: Number(row.price_mxn) } });
      setMsg(`Guardado: ${row.name}`);
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (!data) return err ? <div className="err">{err}</div> : <p className="muted">Cargando…</p>;

  return (
    <div className="stack" style={{ gap: 14 }}>
      {msg && <div className="okbox small">{msg}</div>}
      {err && <div className="err small">{err}</div>}
      <p className="muted small" style={{ margin: 0 }}>
        Cambiar el precio aplica a nuevas suscripciones; las que ya existen en Mercado Pago siguen cobrando su monto. Un plan desactivado deja de venderse, pero quien ya lo tiene lo conserva.
      </p>
      <div className="card scroll-x">
        <h3 style={{ marginTop: 0 }}>Planes</h3>
        <table className="list edit">
          <thead><tr><th>Nombre</th><th>Precio MXN/mes</th><th>Horas/mes</th><th>Plataformas</th><th>Mascotas IA/mes</th><th>Resumen IA</th><th>Activo</th><th>Descripción</th><th></th></tr></thead>
          <tbody>{data.plans.map((p) => <PlanEditor key={p.id} row={p} onSave={(r) => save("plans", r)} />)}</tbody>
        </table>
      </div>
      <div className="card scroll-x">
        <h3 style={{ marginTop: 0 }}>Recargas de horas</h3>
        <table className="list edit">
          <thead><tr><th>Nombre</th><th>Precio MXN</th><th>Horas</th><th>Activa</th><th></th></tr></thead>
          <tbody>{data.packs.map((p) => <PackEditor key={p.id} row={p} onSave={(r) => save("hour_packs", r)} />)}</tbody>
        </table>
      </div>
      <p className="muted tiny" style={{ margin: 0 }}>Para crear un plan o recarga nueva, agrégala en Supabase (tablas plans y hour_packs); aquí se edita.</p>
    </div>
  );
}

function PlanEditor({ row, onSave }: { row: PlanRow; onSave: (r: PlanRow) => void }) {
  const [r, setR] = useState(row);
  useEffect(() => setR(row), [row]);
  const free = row.id === "gratis";
  const changed = JSON.stringify(r) !== JSON.stringify(row);
  return (
    <tr>
      <td><input type="text" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></td>
      <td><input type="number" min={0} disabled={free} value={r.price_mxn} onChange={(e) => setR({ ...r, price_mxn: Number(e.target.value) })} /></td>
      <td><input type="number" min={0} step={0.5} value={r.minutes / 60} onChange={(e) => setR({ ...r, minutes: Math.round(Number(e.target.value) * 60) })} /></td>
      <td><input type="number" min={1} max={4} value={r.max_platforms} onChange={(e) => setR({ ...r, max_platforms: Number(e.target.value) })} /></td>
      <td><input type="number" min={0} value={r.ai_designs} onChange={(e) => setR({ ...r, ai_designs: Number(e.target.value) })} /></td>
      <td><input type="checkbox" checked={r.summaries} onChange={(e) => setR({ ...r, summaries: e.target.checked })} /></td>
      <td><input type="checkbox" disabled={free} checked={r.active} onChange={(e) => setR({ ...r, active: e.target.checked })} /></td>
      <td><input type="text" value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} /></td>
      <td><button className="btn sm primary" disabled={!changed} onClick={() => onSave(r)}>Guardar</button></td>
    </tr>
  );
}

function PackEditor({ row, onSave }: { row: PackRow; onSave: (r: PackRow) => void }) {
  const [r, setR] = useState(row);
  useEffect(() => setR(row), [row]);
  const changed = JSON.stringify(r) !== JSON.stringify(row);
  return (
    <tr>
      <td><input type="text" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></td>
      <td><input type="number" min={1} value={r.price_mxn} onChange={(e) => setR({ ...r, price_mxn: Number(e.target.value) })} /></td>
      <td><input type="number" min={0.5} step={0.5} value={r.minutes / 60} onChange={(e) => setR({ ...r, minutes: Math.round(Number(e.target.value) * 60) })} /></td>
      <td><input type="checkbox" checked={r.active} onChange={(e) => setR({ ...r, active: e.target.checked })} /></td>
      <td><button className="btn sm primary" disabled={!changed} onClick={() => onSave(r)}>Guardar</button></td>
    </tr>
  );
}
