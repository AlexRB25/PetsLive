"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeConfig } from "@core/config.js";
import Header from "@/components/Header";
import LoginGate from "@/components/LoginGate";
import { useSession } from "@/components/Auth";
import { supabase, WORKER_URL } from "@/lib/supabase-browser";
import type { AccountStatus, Connection, MascotConfig } from "@/lib/types";
import { useWorker } from "./useWorker";
import LiveCard from "./LiveCard";
import Preview from "./Preview";
import Simulator from "./Simulator";
import QueueLog from "./QueueLog";
import Settings from "./Settings";

export default function Panel() {
  const { session, ready } = useSession();
  const [config, setConfig] = useState<MascotConfig | null>(null);
  const configRef = useRef<MascotConfig | null>(null);
  const [overlayKey, setOverlayKey] = useState("");
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [saved, setSaved] = useState("");
  const [notice, setNotice] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const worker = useWorker(Boolean(session && overlayKey), configRef);

  const loadStatus = useCallback(async () => {
    const r = await supabase().rpc("my_status");
    if (!r.error) setStatus(r.data as AccountStatus);
  }, []);

  const loadConnections = useCallback(async () => {
    const r = await supabase().from("connections").select("platform, enabled, settings");
    if (!r.error) setConnections(r.data as Connection[]);
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const m = await supabase().rpc("ensure_mascot");
      if (m.error) return setLoadErr(`No se pudo cargar tu mascota: ${m.error.message}`);
      const c = sanitizeConfig(m.data.config) as MascotConfig;
      setConfig(c);
      configRef.current = c;
      setOverlayKey(m.data.overlay_key);
      loadStatus();
      loadConnections();
    })();
    const q = new URLSearchParams(location.search).get("conexion");
    if (q) { setNotice(q); history.replaceState(null, "", "/panel"); }
  }, [session, loadStatus, loadConnections]);

  // Los minutos cambian mientras hay directo: se refrescan al cambiar la sesión.
  useEffect(() => { if (session) loadStatus(); }, [worker.session.active, worker.session.minutes, session, loadStatus]);

  /** Cambia la configuración y la guarda (con espera) en Supabase; luego avisa al worker. */
  const update = useCallback((fn: (c: MascotConfig) => void) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      configRef.current = next;
      clearTimeout(saveTimer.current);
      setSaved("Guardando…");
      saveTimer.current = setTimeout(async () => {
        const uid = (await supabase().auth.getUser()).data.user?.id;
        const r = await supabase().from("mascots").update({ config: next, updated_at: new Date().toISOString() }).eq("user_id", uid!);
        if (r.error) return setSaved(`Error al guardar: ${r.error.message}`);
        setSaved("Guardado");
        worker.call("/panel/control", { action: "reload" }).catch(() => {});
      }, 600);
      return next;
    });
  }, [worker]);

  const resetConfig = useCallback((c: MascotConfig) => update((draft) => Object.assign(draft, structuredClone(c))), [update]);

  if (ready && !session) {
    return (
      <>
        <Header />
        <LoginGate title="Tu panel de mascota" text="Crea tu cuenta gratis para personalizar tu mascota, probarla con el simulador y conectarla a tus directos." />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="wrap" style={{ paddingBottom: 40 }}>
        {notice && <div className="okbox" style={{ marginBottom: 12 }}>{notice} <button className="link" onClick={() => setNotice("")}>Cerrar</button></div>}
        {loadErr && <div className="err" style={{ marginBottom: 12 }}>{loadErr}</div>}
        {worker.error && <div className="err" style={{ marginBottom: 12 }}>{worker.error}</div>}
        {!config ? (
          <p className="muted">Cargando tu mascota…</p>
        ) : (
          <>
            <LiveCard
              worker={worker}
              status={status}
              connections={connections}
              overlayKey={overlayKey}
              onNewKey={setOverlayKey}
              voiceFromPanel={config.voice.output === "panel" && !config.behavior.silent}
            />
            <div className="panel-grid">
              <Preview overlayKey={overlayKey} call={worker.call} mascot={config.mascot} onMove={(patch) => update((c) => Object.assign(c.mascot, patch))} />
              <Simulator mascotName={config.mascot.name} call={worker.call} />
              <QueueLog state={worker.state} log={worker.log} call={worker.call} maxPerMinute={config.behavior.maxPerMinute} />
            </div>
            <Settings
              config={config}
              update={update}
              resetConfig={resetConfig}
              saved={saved}
              connections={connections}
              reloadConnections={loadConnections}
              maxPlatforms={status?.plan.max_platforms ?? 1}
              sessionActive={worker.session.active}
              game={worker.game}
              call={worker.call}
            />
          </>
        )}
        {!WORKER_URL && <p className="muted small">Configura PB_WORKER_URL para conectar el panel.</p>}
      </main>
    </>
  );
}
