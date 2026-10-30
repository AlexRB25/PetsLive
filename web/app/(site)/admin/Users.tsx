"use client";
// Usuarios: búsqueda, lista y ficha con acciones (horas, regalar plan, cancelar suscripción, suspender, notas).
import { useCallback, useEffect, useState } from "react";
import { hours, mxn, PLATFORM_LABELS, type Platform } from "@/lib/types";
import { date, dateTime, getJSON, postJSON } from "./api";

interface Row {
  id: string; email: string; created_at: string; last_sign_in_at: string | null; blocked: boolean; is_admin: boolean;
  plan: string; plan_minutes: number | null; extra_minutes: number | null; last_sub: string | null;
  live_minutes: number; last_live: string | null; paid: number;
}

export default function Users() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; rows: Row[]; pageSize: number } | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr("");
    getJSON<{ total: number; rows: Row[]; pageSize: number }>(`/api/admin/usuarios?q=${encodeURIComponent(search)}&page=${page}`)
      .then(setData).catch((e) => setErr(e.message));
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  if (open) return <UserDetail id={open} onBack={() => { setOpen(null); load(); }} />;

  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;
  return (
    <div className="stack">
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(0); setSearch(q.trim()); }}>
        <input className="grow" type="text" placeholder="Buscar por correo o id" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">Buscar</button>
        {data && <span className="muted small">{data.total.toLocaleString("es-MX")} usuarios</span>}
      </form>
      {err && <div className="err">{err}</div>}
      {data && (
        <div className="scroll-x">
          <table className="list">
            <thead>
              <tr><th>Correo</th><th>Registro</th><th>Último acceso</th><th>Plan</th><th>Horas disp.</th><th>Suscripción</th><th>En vivo total</th><th>Último directo</th><th>Pagado</th><th></th></tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setOpen(r.id)}>
                  <td>{r.email}{r.is_admin && <span className="pill tiny" style={{ marginLeft: 6 }}>admin</span>}</td>
                  <td>{date(r.created_at)}</td>
                  <td>{date(r.last_sign_in_at)}</td>
                  <td>{r.plan}</td>
                  <td>{hours((r.plan_minutes ?? 0) + (r.extra_minutes ?? 0))}</td>
                  <td className="muted">{r.last_sub ? r.last_sub.replace(":mercadopago", "").replace(":admin", " (regalo)") : "—"}</td>
                  <td>{hours(r.live_minutes)}</td>
                  <td>{date(r.last_live)}</td>
                  <td>{r.paid > 0 ? mxn(r.paid) : "—"}</td>
                  <td>{r.blocked ? <span className="pill bad"><i />suspendida</span> : ""}</td>
                </tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan={10} className="muted">Sin resultados.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="row">
          <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
          <span className="small muted">Página {page + 1} de {pages}</span>
          <button className="btn sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Siguiente</button>
        </div>
      )}
    </div>
  );
}

interface Detail {
  user: { id: string; email: string; created_at: string; last_sign_in_at: string | null; banned_until: string | null };
  profile: { is_admin: boolean; blocked: boolean; blocked_reason: string; notes: string } | null;
  wallet: { plan_id: string; plan_minutes: number; extra_minutes: number; period_end: string; credits?: number } | null;
  plan: string;
  subscriptions: { id: string; plan_id: string; source: string; status: string; amount: number; next_payment_date: string | null; paid_until: string | null; created_at: string; payer_email: string }[];
  payments: { mp_id: string; kind: string; ref: string; amount: number; minutes: number; created_at: string }[];
  sessions: { id: string; started_at: string; ended_at: string | null; minutes: number; platforms: Platform[]; events: number; reactions: number; end_reason: string | null }[];
  connections: { platform: Platform; enabled: boolean; detail: string }[];
  designs: { id: string; prompt: string; status: string; created_at: string }[];
  actions: { id: number; action: string; detail: Record<string, unknown>; created_at: string }[];
}

const ACTION_LABELS: Record<string, string> = {
  minutes: "Ajuste de horas", credits: "Ajuste de créditos de IA", gift: "Plan regalado", cancel_sub: "Suscripción cancelada", block: "Cuenta suspendida",
  unblock: "Cuenta reactivada", notes: "Notas editadas", admin: "Permiso de admin",
};

function UserDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [minutes, setMinutes] = useState({ kind: "extra", hours: "1", sign: "1", reason: "" });
  const [credits, setCredits] = useState({ amount: "100", sign: "1", reason: "" });
  const [gift, setGift] = useState({ plan: "creator", months: "1" });
  const [notes, setNotes] = useState("");

  const load = useCallback(() => {
    getJSON<Detail>(`/api/admin/usuarios/${id}`).then((r) => { setD(r); setNotes(r.profile?.notes ?? ""); }).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, done: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      await postJSON(`/api/admin/usuarios/${id}`, body);
      setMsg(done);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <div className="stack"><button className="btn sm" onClick={onBack}>← Volver</button>{err ? <div className="err">{err}</div> : <p className="muted">Cargando…</p>}</div>;

  const w = d.wallet;
  const activeSubs = d.subscriptions.filter((s) => ["authorized", "paused", "pending"].includes(s.status));
  const blocked = Boolean(d.profile?.blocked);
  const mins = Math.round(Number(minutes.hours) * 60) * Number(minutes.sign);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row between">
        <button className="btn sm" onClick={onBack}>← Volver a usuarios</button>
        {blocked && <span className="pill bad"><i />Cuenta suspendida{d.profile?.blocked_reason ? `: ${d.profile.blocked_reason}` : ""}</span>}
      </div>
      {msg && <div className="okbox small">{msg}</div>}
      {err && <div className="err small">{err}</div>}

      <div className="kpis">
        <div className="card kpi"><div className="muted small">Cuenta</div><div style={{ fontWeight: 600, wordBreak: "break-all" }}>{d.user.email}</div><div className="muted tiny">Registro {date(d.user.created_at)} · último acceso {dateTime(d.user.last_sign_in_at)}</div><div className="muted tiny">{d.user.id}</div></div>
        <div className="card kpi"><div className="muted small">Plan vigente</div><div className="kpi-value">{d.plan}</div><div className="muted tiny">{activeSubs.length ? activeSubs.map((s) => `${s.plan_id} ${s.source === "admin" ? "(regalo)" : ""} ${s.status}`).join(" · ") : "sin suscripción activa"}</div></div>
        <div className="card kpi"><div className="muted small">Horas disponibles</div><div className="kpi-value">{hours((w?.plan_minutes ?? 0) + (w?.extra_minutes ?? 0))}</div><div className="muted tiny">{hours(w?.plan_minutes ?? 0)} del plan (renueva {date(w?.period_end)}) · {hours(w?.extra_minutes ?? 0)} extra</div></div>
        <div className="card kpi"><div className="muted small">Total pagado</div><div className="kpi-value">{mxn(d.payments.reduce((a, p) => a + Number(p.amount), 0))}</div><div className="muted tiny">{d.payments.length} pagos</div></div>
      </div>

      <div className="admin-actions">
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Horas</h3>
          <div className="row">
            <select value={minutes.sign} onChange={(e) => setMinutes({ ...minutes, sign: e.target.value })} style={{ width: "auto" }}>
              <option value="1">Dar</option><option value="-1">Quitar</option>
            </select>
            <input type="number" min={0.25} step={0.25} value={minutes.hours} onChange={(e) => setMinutes({ ...minutes, hours: e.target.value })} style={{ width: 90 }} />
            <span className="small">horas</span>
            <select value={minutes.kind} onChange={(e) => setMinutes({ ...minutes, kind: e.target.value })} style={{ width: "auto" }}>
              <option value="extra">extra (no caducan)</option><option value="plan">del plan (este mes)</option>
            </select>
          </div>
          <input type="text" placeholder="Motivo (opcional)" value={minutes.reason} onChange={(e) => setMinutes({ ...minutes, reason: e.target.value })} />
          <button className="btn primary sm" disabled={busy || !mins} onClick={() => act({ action: "minutes", plan: minutes.kind === "plan" ? mins : 0, extra: minutes.kind === "extra" ? mins : 0, reason: minutes.reason }, `Listo: ${mins > 0 ? "+" : ""}${hours(Math.abs(mins))}${mins < 0 ? " quitadas" : ""}.`)}>Aplicar</button>
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0 }}>Créditos de IA <span className="muted small">· saldo {w?.credits ?? 0}</span></h3>
          <div className="row">
            <select value={credits.sign} onChange={(e) => setCredits({ ...credits, sign: e.target.value })} style={{ width: "auto" }}>
              <option value="1">Dar</option><option value="-1">Quitar</option>
            </select>
            <input type="number" min={1} step={1} value={credits.amount} onChange={(e) => setCredits({ ...credits, amount: e.target.value })} style={{ width: 90 }} />
            <span className="small">créditos</span>
          </div>
          <input type="text" placeholder="Motivo (sale en el historial del usuario)" value={credits.reason} onChange={(e) => setCredits({ ...credits, reason: e.target.value })} />
          <button className="btn primary sm" disabled={busy || !Math.round(Number(credits.amount))} onClick={() => {
            const amount = Math.round(Number(credits.amount)) * Number(credits.sign);
            act({ action: "credits", amount, reason: credits.reason }, `Listo: ${amount > 0 ? "+" : ""}${amount} créditos.`);
          }}>Aplicar</button>
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0 }}>Regalar suscripción</h3>
          <div className="row">
            <select value={gift.plan} onChange={(e) => setGift({ ...gift, plan: e.target.value })} style={{ width: "auto" }}>
              <option value="creator">Creator</option><option value="pro">Pro</option><option value="business">Business</option>
            </select>
            <span className="small">por</span>
            <input type="number" min={1} max={36} value={gift.months} onChange={(e) => setGift({ ...gift, months: e.target.value })} style={{ width: 70 }} />
            <span className="small">meses</span>
          </div>
          <p className="muted tiny" style={{ margin: 0 }}>Sin cobro. Da las horas del plan ahora y se renuevan cada mes mientras dure. Reemplaza otro regalo activo.</p>
          <button className="btn primary sm" disabled={busy} onClick={() => act({ action: "gift", plan: gift.plan, months: Number(gift.months) }, "Plan regalado.", `¿Regalar el plan ${gift.plan} por ${gift.months} mes(es)?`)}>Regalar</button>
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0 }}>Restringir</h3>
          <button className="btn sm" disabled={busy || !activeSubs.length} onClick={() => act({ action: "cancel_sub" }, "Suscripción cancelada; conserva el plan hasta el final del periodo pagado.", "¿Cancelar los cobros? El usuario conserva el plan hasta el final del periodo pagado.")}>Cancelar suscripción (al final del periodo)</button>
          <button className="btn sm danger" disabled={busy || !activeSubs.length} onClick={() => act({ action: "cancel_sub", immediate: true, removeMinutes: true }, "Suscripción cancelada de inmediato y horas del plan retiradas.", "¿Cancelar YA la suscripción y quitarle las horas del plan? No hay reembolso automático; si corresponde, hazlo desde Mercado Pago.")}>Cancelar de inmediato y quitar horas</button>
          {blocked ? (
            <button className="btn sm" disabled={busy} onClick={() => act({ action: "unblock" }, "Cuenta reactivada.")}>Reactivar cuenta</button>
          ) : (
            <button className="btn sm danger" disabled={busy} onClick={() => {
              const reason = prompt("Motivo de la suspensión (lo verás en la ficha):");
              if (reason !== null) act({ action: "block", reason }, "Cuenta suspendida: ya no puede entrar y su directo se corta en menos de un minuto.");
            }}>Suspender cuenta</button>
          )}
          <label className="check small">
            <input type="checkbox" checked={Boolean(d.profile?.is_admin)} disabled={busy} onChange={(e) => act({ action: "admin", value: e.target.checked }, e.target.checked ? "Ahora es administrador." : "Ya no es administrador.", e.target.checked ? "¿Dar acceso total de administrador a esta cuenta?" : undefined)} />
            Administrador
          </label>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Notas internas</h3>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Solo las ven los administradores" />
        <div><button className="btn sm" disabled={busy || notes === (d.profile?.notes ?? "")} onClick={() => act({ action: "notes", notes }, "Notas guardadas.")}>Guardar notas</button></div>
      </div>

      <Section title={`Suscripciones (${d.subscriptions.length})`}>
        <thead><tr><th>Alta</th><th>Plan</th><th>Origen</th><th>Estado</th><th>Monto</th><th>Pagado hasta</th><th>Correo MP</th></tr></thead>
        <tbody>{d.subscriptions.map((s) => <tr key={s.id}><td>{date(s.created_at)}</td><td>{s.plan_id}</td><td>{s.source === "admin" ? "regalo" : "Mercado Pago"}</td><td>{s.status}</td><td>{s.amount ? mxn(s.amount) : "—"}</td><td>{date(s.paid_until)}</td><td className="muted">{s.payer_email || "—"}</td></tr>)}</tbody>
      </Section>
      <Section title={`Pagos (${d.payments.length})`}>
        <thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Horas</th><th>Id</th></tr></thead>
        <tbody>{d.payments.map((p) => <tr key={p.mp_id}><td>{dateTime(p.created_at)}</td><td>{p.kind === "suscripcion" ? `Plan ${p.ref}` : p.kind === "creditos" ? `Créditos ${p.ref}` : `Recarga ${p.ref}`}</td><td>{mxn(p.amount)}</td><td>{hours(p.minutes)}</td><td className="muted">{p.mp_id}</td></tr>)}</tbody>
      </Section>
      <Section title={`Directos recientes (${d.sessions.length})`}>
        <thead><tr><th>Inicio</th><th>Plataformas</th><th>Minutos</th><th>Eventos</th><th>Reacciones</th><th>Fin</th></tr></thead>
        <tbody>{d.sessions.map((s) => <tr key={s.id}><td>{dateTime(s.started_at)}</td><td>{s.platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(", ")}</td><td>{s.minutes}</td><td>{s.events}</td><td>{s.reactions}</td><td className="muted">{s.ended_at ? s.end_reason : "en vivo"}</td></tr>)}</tbody>
      </Section>
      <Section title="Conexiones">
        <thead><tr><th>Plataforma</th><th>Activa</th><th>Cuenta</th></tr></thead>
        <tbody>{d.connections.map((c) => <tr key={c.platform}><td>{PLATFORM_LABELS[c.platform] ?? c.platform}</td><td>{c.enabled ? "sí" : "no"}</td><td className="muted">{c.detail || "—"}</td></tr>)}</tbody>
      </Section>
      <Section title={`Mascotas con IA (${d.designs.length})`}>
        <thead><tr><th>Fecha</th><th>Descripción</th><th>Estado</th></tr></thead>
        <tbody>{d.designs.map((a) => <tr key={a.id}><td>{dateTime(a.created_at)}</td><td>{a.prompt}</td><td>{a.status}</td></tr>)}</tbody>
      </Section>
      <Section title={`Acciones de administración (${d.actions.length})`}>
        <thead><tr><th>Fecha</th><th>Acción</th><th>Detalle</th></tr></thead>
        <tbody>{d.actions.map((a) => <tr key={a.id}><td>{dateTime(a.created_at)}</td><td>{ACTION_LABELS[a.action] ?? a.action}</td><td className="muted">{JSON.stringify(a.detail)}</td></tr>)}</tbody>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="card" open>
      <summary><strong className="small">{title}</strong></summary>
      <div className="scroll-x" style={{ marginTop: 8 }}><table className="list">{children}</table></div>
    </details>
  );
}
