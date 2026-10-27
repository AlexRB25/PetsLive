"use client";

import { useState } from "react";
import { LoginModal } from "./Auth";

/** Aviso para las páginas que piden cuenta. */
export default function LoginGate({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="wrap">
      <div className="card stack" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>{title}</h1>
        <p className="muted" style={{ margin: 0 }}>{text}</p>
        <div><button className="btn primary lg" onClick={() => setOpen(true)}>Entrar o crear cuenta</button></div>
      </div>
      <LoginModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
