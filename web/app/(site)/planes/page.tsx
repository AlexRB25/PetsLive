"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import LoginGate from "@/components/LoginGate";
import Pricing from "@/components/Pricing";
import { useSession } from "@/components/Auth";
import { postJSON, supabase } from "@/lib/supabase-browser";
import { hours, type AccountStatus, type HourPack, type Plan } from "@/lib/types";

const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "—");

export default function Planes() {
  const { session, ready } = useSession();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [askEmail, setAskEmail] = useState<Plan | null>(null);
  const [email, setEmail] = useState("");

  const load = useCallback(async () => {
    const r = await supabase().rpc("my_status");
    if (!r.error) setStatus(r.data as AccountStatus);
  }, []);

  // Al volver de Mercado Pago: sincroniza sin esperar el webhook.
  useEffect(() => {
    if (!session) return;
    setEmail((e) => e || session.user.email || "");
    const q = new URLSearchParams(location.search);
    const pre = q.get("preapproval_id");
    const pay = q.get("payment_id") || q.get("collection_id");
    (async () => {
      try {
        if (pre) {
          await postJSON("/api/suscripcion", { action: "sync", id: pre });
          setMsg("¡Listo! Tu suscripción quedó registrada. Si Mercado Pago tarda en confirmar el cobro, tus horas aparecerán en unos minutos.");
        } else if (pay) {
          await postJSON("/api/horas/sincronizar", { payment_id: pay });
          setMsg(q.get("status") === "approved" || q.get("collection_status") === "approved" ? "¡Pago recibido! Tus horas extra ya están en tu cuenta." : "Recibimos tu pago; en cuanto Mercado Pago lo apruebe se suman tus horas.");
        }
      } catch (e) {
        setErr((e as Error).message);
      }
      if (pre || pay) history.replaceState(null, "", "/planes");
      load();
    })();
  }, [session, load]);

  async function subscribe(plan: Plan) {
    setErr("");
    setBusy(plan.id);
    try {
      const { url } = await postJSON<{ url: string }>("/api/suscribir", { plan: plan.id, email });
      location.href = url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }

  async function buy(pack: HourPack) {
    setErr("");
    setBusy(pack.id);
    try {
      const { url } = await postJSON<{ url: string }>("/api/horas/comprar", { pack: pack.id });
      location.href = url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }

  async function cancel() {
    if (!confirm("¿Cancelar la suscripción? Conservas tu plan hasta el final del periodo pagado.")) return;
    setBusy("cancel");
    try {
      await postJSON("/api/suscripcion", { action: "cancel" });
      setMsg("Suscripción cancelada. No se harán más cobros.");
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (ready && !session) {
    return (
      <>
        <Header />
        <LoginGate title="Planes de Mascota LIVE" text="Entra o crea tu cuenta para elegir un plan o comprar horas extra. Crear la cuenta es gratis." />
        <main className="wrap"><Pricing /></main>
      </>
    );
  }

  const sub = status?.subscription;
  return (
    <>
      <Header />
      <main className="wrap stack" style={{ paddingBottom: 40 }}>
        <h1 style={{ margin: "10px 0 0" }}>Planes y horas</h1>
        {msg && <div className="okbox">{msg}</div>}
        {err && <div className="err">{err}</div>}
        {status && (
          <div className="card row between">
            <div>
              <div className="muted small">Tu plan</div>
              <strong style={{ fontSize: 20 }}>{status.plan.name}</strong>
              {sub && <div className="muted small">Suscripción {sub.status === "authorized" ? "activa" : sub.status === "pending" ? "pendiente de confirmar" : sub.status}{sub.next_payment_date ? ` · próximo cobro ${date(sub.next_payment_date)}` : ""}</div>}
            </div>
            <div>
              <div className="muted small">Horas disponibles</div>
              <strong style={{ fontSize: 20 }}>{hours(status.plan_minutes + status.extra_minutes)}</strong>
              <div className="muted small">{hours(status.plan_minutes)} del plan (se renuevan el {date(status.period_end)}) · {hours(status.extra_minutes)} extra</div>
            </div>
            {sub && (sub.status === "authorized" || sub.status === "paused") && (
              <button className="btn ghost sm" disabled={busy === "cancel"} onClick={cancel}>Cancelar suscripción</button>
            )}
          </div>
        )}
        <label className="block" style={{ maxWidth: 420, margin: 0 }}>
          Correo de tu cuenta de Mercado Pago (para la suscripción)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <Pricing currentPlan={status?.plan.id} busy={busy} onSubscribe={(p) => (email ? subscribe(p) : setAskEmail(p))} onBuyPack={buy} />
        {askEmail && <div className="warn small">Escribe arriba el correo de tu cuenta de Mercado Pago y vuelve a elegir el plan {askEmail.name}.</div>}
        <p className="muted small">
          Las horas cuentan solo mientras al menos una de tus plataformas está transmitiendo con la mascota activa. Las del plan se renuevan cada mes; las extra no caducan.
          Cobro recurrente con Mercado Pago en MXN.
        </p>
      </main>
    </>
  );
}
