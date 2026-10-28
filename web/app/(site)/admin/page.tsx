"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import LoginGate from "@/components/LoginGate";
import { useSession } from "@/components/Auth";
import { authFetch } from "@/lib/supabase-browser";
import Metrics from "./Metrics";
import Users from "./Users";
import Plans from "./Plans";

const TABS = [["resumen", "Resumen"], ["usuarios", "Usuarios"], ["planes", "Planes y recargas"]] as const;

export default function Admin() {
  const { session, ready } = useSession();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("resumen");

  useEffect(() => {
    if (!session) return;
    authFetch("/api/admin/soy").then((r) => r.json()).then((d) => setAllowed(Boolean(d.admin))).catch(() => setAllowed(false));
  }, [session]);

  if (ready && !session) return (<><Header /><LoginGate title="Administración" text="Entra con una cuenta de administrador." /></>);

  return (
    <>
      <Header />
      <main className="wrap" style={{ paddingBottom: 40 }}>
        {allowed === null ? (
          <p className="muted">Cargando…</p>
        ) : !allowed ? (
          <div className="err">Esta cuenta no tiene acceso de administrador. Agrega tu correo a ADMIN_EMAILS en Vercel o marca is_admin en la tabla profiles.</div>
        ) : (
          <>
            <div className="row between" style={{ marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontSize: 24 }}>Administración</h1>
            </div>
            <div className="tabs" role="tablist">
              {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
            </div>
            {tab === "resumen" && <Metrics />}
            {tab === "usuarios" && <Users />}
            {tab === "planes" && <Plans />}
          </>
        )}
      </main>
    </>
  );
}
