"use client";
// Iniciar/detener el directo, minutos, estado de cada plataforma y la URL para OBS.
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { hours, PLATFORM_LABELS, type AccountStatus, type Connection, type Platform } from "@/lib/types";
import type { useWorker } from "./useWorker";

const DOT: Record<string, string> = { live: "ok", waiting: "warn", connecting: "warn", error: "bad", off: "" };

function elapsed(since: number) {
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
}

interface Props {
  worker: ReturnType<typeof useWorker>;
  status: AccountStatus | null;
  connections: Connection[];
  overlayKey: string;
  onNewKey: (k: string) => void;
  voiceFromPanel: boolean;
}

export default function LiveCard({ worker, status, connections, overlayKey, onNewKey, voiceFromPanel }: Props) {
  const { session, platforms, clients } = worker;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);
  const [voiceOk, setVoiceOk] = useState(false);

  useEffect(() => {
    if (!session.active) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [session.active]);

  useEffect(() => {
    const unlock = () => setVoiceOk(true);
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  const obsUrl = typeof window === "undefined" ? "" : `${location.origin}/o/${overlayKey}`;
  const enabled = connections.filter((c) => c.enabled).map((c) => c.platform);
  const total = status ? status.plan_minutes + status.extra_minutes : 0;
  const remaining = session.active && typeof session.remaining === "number" ? session.remaining : total;
  const planTotal = status?.plan.minutes || 1;

  async function toggle() {
    setErr("");
    setBusy(true);
    try {
      const r = await worker.call("/panel/control", { action: session.active ? "stop" : "start" });
      if (r && (r as { ok?: boolean }).ok === false) setErr(String((r as { error?: string }).error));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function newKey() {
    if (!confirm("Se creará una URL nueva y la actual dejará de funcionar. Tendrás que pegarla otra vez en OBS. ¿Continuar?")) return;
    const r = await supabase().rpc("regenerate_overlay_key");
    if (r.error) return setErr(r.error.message);
    onNewKey(r.data as string);
    worker.call("/panel/control", { action: "reload" }).catch(() => {});
  }

  const shown: Platform[] = session.active ? (session.platforms ?? []) : enabled;

  return (
    <section className="card live-card">
      <div className="stack" style={{ gap: 8 }}>
        <div className="row">
          <span className={`pill ${worker.connected ? "ok" : "bad"}`}><i />{worker.connected ? "Servidor conectado" : "Conectando…"}</span>
          <span className={`pill ${clients.overlay ? "ok" : "warn"}`}><i />{clients.overlay ? `OBS conectado${clients.overlay > 1 ? ` (${clients.overlay})` : ""}` : "OBS sin conectar"}</span>
          {session.active && <span className="pill ok"><i />En vivo · {elapsed(session.startedAt!)}</span>}
          {status && <span className="pill">Plan {status.plan.name}</span>}
        </div>

        <div>
          <div className="row between small">
            <span><strong>{hours(remaining)}</strong> <span className="muted">disponibles</span></span>
            <Link href="/planes" className="link small">Comprar horas o mejorar plan</Link>
          </div>
          <div className="meter" title="Horas del plan restantes"><span style={{ width: `${Math.min(100, ((status?.plan_minutes ?? 0) / planTotal) * 100)}%` }} /></div>
          {session.active && <div className="muted tiny" style={{ marginTop: 4 }}>{session.minutes} min cobrados en este directo · {session.events} eventos · {session.reactions} reacciones</div>}
        </div>

        {shown.length > 0 ? (
          <div className="plats">
            {shown.map((p) => {
              const st = platforms[p];
              return (
                <div key={p} className="plat">
                  <span className={`dot ${session.active ? DOT[st?.state ?? "off"] : ""}`} />
                  <strong>{PLATFORM_LABELS[p]}</strong>
                  <span className="muted small">{session.active ? (st?.text ?? "iniciando…") : "lista para conectar"}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="muted small">Activa al menos una plataforma en la pestaña <strong>Conexiones</strong> (abajo).</div>
        )}

        {err && <div className="err small">{err}</div>}
        {!session.active && session.lastEnd && <div className="muted tiny">Último directo: {session.lastEnd.reason} ({session.lastEnd.minutes} min)</div>}
        {voiceFromPanel && !voiceOk && <div className="warn tiny">La voz sale de esta pestaña: haz clic en cualquier parte una vez para que el navegador la permita, y no cierres la pestaña.</div>}
      </div>

      <div className="stack" style={{ alignItems: "stretch", minWidth: 260 }}>
        <button className={`btn lg ${session.active ? "danger" : "primary"}`} disabled={busy || !worker.connected} onClick={toggle}>
          {busy ? "Un momento…" : session.active ? "Detener directo" : "Iniciar directo"}
        </button>
        <div className="small">
          <div className="muted tiny">URL para OBS (fuente de navegador 1920×1080):</div>
          <div className="row" style={{ marginTop: 4 }}>
            <code className="grow" style={{ flex: 1 }}>{obsUrl.replace(overlayKey, overlayKey.slice(0, 6) + "…")}</code>
            <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(obsUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copiada" : "Copiar"}</button>
          </div>
          <button className="link tiny" style={{ marginTop: 6 }} onClick={newKey}>¿Se vio tu URL en pantalla? Crear una nueva</button>
        </div>
      </div>
    </section>
  );
}
