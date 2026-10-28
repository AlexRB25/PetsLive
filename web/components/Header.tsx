"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoginModal, useSession } from "./Auth";
import { authFetch, supabase } from "@/lib/supabase-browser";

/** Encabezado del sitio con el inicio de sesión. */
export default function Header() {
  const { session, recovery, endRecovery } = useSession();
  const [open, setOpen] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    if (!session) return setAdmin(false);
    authFetch("/api/admin/soy").then((r) => r.json()).then((d) => setAdmin(Boolean(d.admin))).catch(() => {});
  }, [session]);

  return (
    <header className="wrap top">
      <Link href="/" className="brand"><span className="spark">✦</span> Mascota LIVE</Link>
      <nav className="nav">
        <Link className="btn ghost sm" href="/planes">Planes</Link>
        {session ? (
          <>
            {admin && <Link className="btn ghost sm" href="/admin">Admin</Link>}
            <Link className="btn sm primary" href="/panel">Mi panel</Link>
            <button className="btn ghost sm" onClick={() => supabase().auth.signOut()} title={session.user.email}>Salir</button>
          </>
        ) : (
          <button className="btn sm primary" onClick={() => setOpen(true)}>Entrar</button>
        )}
      </nav>
      <LoginModal
        open={open}
        recovery={recovery}
        onClose={() => { setOpen(false); endRecovery(); }}
      />
    </header>
  );
}
