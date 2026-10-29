"use client";
// Conexión en vivo del panel con el worker: pide un ticket de un solo uso y abre el SSE.
import { useCallback, useEffect, useRef, useState } from "react";
import { postJSON, WORKER_URL } from "@/lib/supabase-browser";
import { VoicePlayer } from "@/lib/voice-player";
import type { GameState } from "@/lib/game-widget";
import type { EngineState, LogEntry, MascotConfig, PlatformStatus, SessionInfo } from "@/lib/types";

export function useWorker(enabled: boolean, configRef: React.RefObject<MascotConfig | null>) {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<EngineState | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [platforms, setPlatforms] = useState<PlatformStatus>({});
  const [session, setSession] = useState<SessionInfo>({ active: false });
  const [clients, setClients] = useState({ overlay: 0, preview: 0, panel: 0 });
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState("");
  const stop = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!WORKER_URL) { setError("Falta PB_WORKER_URL: la web no sabe dónde está el worker."); return; }
    stop.current = false;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const open = async () => {
      try {
        const { ticket } = await postJSON<{ ticket: string }>(`${WORKER_URL}/panel/ticket`);
        if (stop.current) return;
        es = new EventSource(`${WORKER_URL}/panel/stream?ticket=${ticket}`);
        es.onopen = () => { setConnected(true); setError(""); };
        es.onerror = () => {
          // El ticket es de un solo uso: hay que pedir otro en vez de dejar que reintente solo.
          es?.close();
          setConnected(false);
          if (!stop.current) retry = setTimeout(open, 3000);
        };
        const on = <T,>(name: string, fn: (d: T) => void) => es!.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data)));
        on<EngineState>("state", setState);
        on<LogEntry>("log", (e) => setLog((l) => [e, ...l].slice(0, 200)));
        on<LogEntry[]>("history", (h) => setLog([...h].reverse()));
        on<PlatformStatus>("platforms", setPlatforms);
        on<SessionInfo>("session", setSession);
        on<typeof clients>("clients", setClients);
        on<GameState>("game", setGame);
        // La voz sale de esta pestaña si así se eligió en la pestaña Voz.
        const voice = new VoicePlayer(WORKER_URL);
        const speaks = () => { const c = configRef.current; return c && c.voice.output === "panel" && !c.behavior.silent ? c : null; };
        on<{ id: number; text: string; resume?: boolean }>("play", (p) => { const c = speaks(); if (c) voice.play(p, c); });
        on<{ id: number; url?: string; fallback?: boolean }>("audio", (a) => { const c = speaks(); if (c) voice.audio(a, c); });
      } catch (e) {
        setConnected(false);
        setError(`No se pudo conectar con el servidor de la mascota: ${(e as Error).message}`);
        if (!stop.current) retry = setTimeout(open, 5000);
      }
    };
    open();
    return () => { stop.current = true; clearTimeout(retry); es?.close(); };
  }, [enabled, configRef]);

  const call = useCallback((path: string, body: unknown) => postJSON(`${WORKER_URL}${path}`, body), []);

  return { connected, state, log, platforms, session, clients, game, error, call };
}
