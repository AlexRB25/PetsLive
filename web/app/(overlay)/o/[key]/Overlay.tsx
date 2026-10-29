"use client";
// Overlay de OBS: la mascota recibe del worker qué animación hacer, con qué texto y por cuánto tiempo.
import { useEffect, useRef, useState } from "react";
import { mascotHTML, MASCOT_CSS } from "@core/mascot.js";
import { SCENE_PRESETS } from "@core/config.js";
import { VoicePlayer } from "@/lib/voice-player";
import { GAME_CSS, GameWidget, type GameState } from "@/lib/game-widget";
import { WORKER_URL } from "@/lib/supabase-browser";
import type { MascotConfig } from "@/lib/types";

const CSS = `
#scene { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 6vmin;
  background-size: cover; background-position: center; opacity: 0; transition: opacity .6s; pointer-events: none; text-align: center;
  font-family: "Nunito", "Segoe UI Rounded", "Segoe UI", system-ui, sans-serif; color: #fff; text-shadow: 0 3px 8px rgba(0,0,0,.55); }
#scene.on { opacity: 1; }
#scene h1 { margin: 0; font-size: 7vmin; font-weight: 900; line-height: 1.1; }
#scene p { margin: 0; font-size: 3.6vmin; font-weight: 700; opacity: .92; }
#stage { position: absolute; display: flex; flex-direction: column; align-items: center; font-family: "Nunito", "Segoe UI Rounded", "Segoe UI", system-ui, sans-serif; }
#stage.top { flex-direction: column-reverse; }
.bubble { position: relative; max-width: 150%; margin-bottom: 10px; padding: .55em .9em; background: #fff; color: #231a35; border: 4px solid #231a35;
  border-radius: 22px; font-size: var(--fs, 22px); font-weight: 800; line-height: 1.2; text-align: center; box-shadow: 0 6px 0 rgba(0,0,0,.18);
  opacity: 0; transform: scale(.6) translateY(10px); transition: opacity .18s, transform .25s cubic-bezier(.2,1.5,.4,1); white-space: pre-wrap; width: max-content; }
.bubble.show { opacity: 1; transform: none; }
.bubble::after { content: ""; position: absolute; left: 50%; bottom: -16px; margin-left: -12px; border: 12px solid transparent; border-top-color: #231a35; border-bottom: 0; }
#stage.top .bubble { margin: 10px 0 0; }
#stage.top .bubble::after { bottom: auto; top: -16px; border-top: 0; border-bottom: 12px solid #231a35; }
.fx { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.piece { position: absolute; top: 30%; left: 50%; width: 10px; height: 16px; border-radius: 3px; animation: confetti 1.6s ease-out forwards; }
.heart { position: absolute; bottom: 45%; left: 50%; font-size: 30px; animation: heart 1.8s ease-out forwards; }
@keyframes confetti { to { transform: translate(var(--dx), var(--dy)) rotate(var(--r)); opacity: 0; } }
@keyframes heart { 0% { transform: translate(-50%, 0) scale(.4); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(var(--dx), -220%) scale(1.1); opacity: 0; } }
${MASCOT_CSS}
${GAME_CSS}`;

interface Play { id: number; reaction: string; text: string; duration: number; resume?: boolean }

export default function Overlay({ overlayKey, preview, background }: { overlayKey: string; preview: boolean; background?: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const mascot = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const gameRoot = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const [lost, setLost] = useState(false);
  const [unknown, setUnknown] = useState(false);

  useEffect(() => {
    let config: MascotConfig | null = null;
    const voice = new VoicePlayer(WORKER_URL);
    const speaks = () => (!preview && config && config.voice.output === "overlay" && !config.behavior.silent ? config : null);
    let look = "";
    let backTimer: ReturnType<typeof setTimeout> | undefined;
    let bubbleTimer: ReturnType<typeof setTimeout> | undefined;

    const setState = (name: string) => {
      const el = mascot.current!;
      el.className = "mascot";
      void el.offsetWidth; // reinicia las animaciones CSS
      el.className = `mascot st-${name}`;
    };

    const layout = () => {
      const m = config!.mascot;
      const st = stage.current!;
      const key = JSON.stringify([m.kind, m.species, m.design, m.images, m.body, m.accent, m.eyes, m.accessory, m.name]);
      if (key !== look) {
        const cls = mascot.current!.className;
        mascot.current!.innerHTML = mascotHTML(m);
        mascot.current!.className = cls;
        look = key;
      }
      st.style.width = `${m.size}px`;
      st.style.setProperty("--fs", `${Math.max(14, Math.round(m.size / 11))}px`);
      for (const k of ["left", "right", "top", "bottom"] as const) st.style[k] = "";
      st.style.transform = "";
      const [v, h] = m.position.split("-");
      st.classList.toggle("top", v === "arriba");
      if (m.position === "libre") {
        // (x, y) es el punto bajo los pies: el globo crece hacia arriba sin mover a la mascota.
        st.style.left = `${m.x}%`;
        st.style.bottom = `${100 - m.y}%`;
        st.style.transform = "translateX(-50%)";
        return;
      }
      if (m.position === "centro") {
        st.style.left = "50%";
        st.style.top = "50%";
        st.style.transform = "translate(-50%, -50%)";
        return;
      }
      st.style[v === "arriba" ? "top" : "bottom"] = `${m.offsetY}px`;
      st.style[h === "izquierda" ? "left" : "right"] = `${m.offsetX}px`;
    };

    const burst = (kind: "confetti" | "hearts") => {
      const colors = ["#f43f5e", "#facc15", "#22c55e", "#3b82f6", "#a855f7", "#fb923c"];
      const n = kind === "confetti" ? 36 : 8;
      for (let i = 0; i < n; i++) {
        const el = document.createElement("div");
        if (kind === "confetti") {
          el.className = "piece";
          el.style.background = colors[i % colors.length];
          el.style.setProperty("--dx", `${(Math.random() - 0.5) * 420}px`);
          el.style.setProperty("--dy", `${(Math.random() - 0.7) * 380}px`);
          el.style.setProperty("--r", `${Math.random() * 720}deg`);
          el.style.animationDelay = `${Math.random() * 0.3}s`;
        } else {
          el.className = "heart";
          el.textContent = "❤";
          el.style.color = colors[i % 2];
          el.style.setProperty("--dx", `${(Math.random() - 0.5) * 200}px`);
          el.style.animationDelay = `${i * 0.18}s`;
        }
        fx.current!.appendChild(el);
        setTimeout(() => el.remove(), 2600);
      }
    };

    const idle = () => {
      clearTimeout(backTimer);
      bubble.current!.classList.remove("show");
      if (!mascot.current!.classList.contains("st-reposo")) setState("reposo");
    };

    const play = (p: Play) => {
      clearTimeout(backTimer);
      clearTimeout(bubbleTimer);
      setState(p.reaction);
      if (!p.resume && p.reaction === "celebracion") burst("confetti");
      if (!p.resume && p.reaction === "agradecimiento") burst("hearts");
      const b = bubble.current!;
      if (p.text) {
        b.textContent = p.text;
        b.classList.add("show");
        bubbleTimer = setTimeout(() => b.classList.remove("show"), p.duration);
      } else {
        b.classList.remove("show");
      }
      const c = speaks();
      if (c) voice.play(p, c);
      backTimer = setTimeout(idle, p.duration);
    };

    // Fondo (pantalla de espera): encendido, o solo mientras el directo no está iniciado.
    let live = false;
    const paintScene = () => {
      const sc = config!.scene;
      const el = scene.current!;
      el.style.background = sc.kind === "imagen" && sc.image
        ? `center / cover no-repeat url("${sc.image}")`
        : sc.kind === "color" ? sc.color : SCENE_PRESETS[sc.preset as keyof typeof SCENE_PRESETS];
      (el.firstElementChild as HTMLElement).textContent = sc.title;
      (el.lastElementChild as HTMLElement).textContent = sc.subtitle;
      el.classList.toggle("on", sc.mode === "encendido" || (sc.mode === "sin-directo" && !live));
    };

    // Juego "¡Llévame a la cima!": al ganar, confeti también en la montaña.
    const game = new GameWidget(gameRoot.current!, () => burst("confetti"));
    let gameState: GameState | null = null;

    if (!WORKER_URL) return;
    const es = new EventSource(`${WORKER_URL}/overlay/stream?key=${encodeURIComponent(overlayKey)}${preview ? "&preview=1" : ""}`);
    let opened = false;
    es.onopen = () => { opened = true; setLost(false); };
    es.onerror = () => {
      // Una respuesta de error (404: la llave no existe) cierra el EventSource; un corte de red reintenta solo.
      if (es.readyState === EventSource.CLOSED && !opened) { setUnknown(true); return; }
      setLost(true);
    };
    es.addEventListener("config", (e) => {
      config = JSON.parse((e as MessageEvent).data);
      layout();
      paintScene();
      if (gameState) game.update({ ...gameState, delta: 0 }, config!.mascot);
    });
    es.addEventListener("game", (e) => {
      gameState = JSON.parse((e as MessageEvent).data);
      if (config) game.update(gameState!, config.mascot);
    });
    es.addEventListener("play", (e) => config && play(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("audio", (e) => { const c = speaks(); if (c) voice.audio(JSON.parse((e as MessageEvent).data), c); });
    es.addEventListener("idle", idle);
    es.addEventListener("live", (e) => { live = JSON.parse((e as MessageEvent).data).active; if (config) paintScene(); });
    // Recarga pedida desde el panel (para tomar cambios sin tocar OBS / LIVE Studio).
    es.addEventListener("refresh", () => location.reload());

    // Al publicar una versión nueva de la web, el overlay se recarga solo cuando la mascota está quieta.
    const build = process.env.PB_BUILD;
    const versionTimer = build && build !== "dev" ? setInterval(async () => {
      try {
        const v = await (await fetch("/api/version", { cache: "no-store" })).json();
        if (v.build && v.build !== build && !bubble.current!.classList.contains("show")) location.reload();
      } catch { /* sin red: se intenta en la siguiente vuelta */ }
    }, 180000) : undefined;
    // En la vista previa del panel, la mascota se mueve al instante mientras se arrastra.
    const onMessage = (e: MessageEvent) => {
      if (!preview || e.origin !== location.origin || e.data?.type !== "petslive-move" || !config) return;
      config = { ...config, mascot: { ...config.mascot, ...e.data.mascot } };
      layout();
    };
    window.addEventListener("message", onMessage);
    return () => { es.close(); clearInterval(versionTimer); clearTimeout(backTimer); clearTimeout(bubbleTimer); window.removeEventListener("message", onMessage); };
  }, [overlayKey, preview]);

  const notice = (text: string) => (
    <div style={{ position: "fixed", left: 8, bottom: 8, font: "12px system-ui", color: "#fff", background: "#b91c1cd0", padding: "4px 8px", borderRadius: 6 }}>{text}</div>
  );

  return (
    <>
      <style>{CSS}</style>
      {background && <style>{`html, body { background: ${background} !important; }`}</style>}
      <div id="scene" ref={scene}><h1 /><p /></div>
      <div ref={gameRoot} />
      <div id="stage" ref={stage}>
        <div className="bubble" ref={bubble} />
        <div className="mascot st-reposo" ref={mascot} />
        <div className="fx" ref={fx} />
      </div>
      {!preview && !WORKER_URL && notice("Falta PB_WORKER_URL en la web.")}
      {!preview && unknown && notice("Este enlace de overlay no existe o se cambió. Copia el nuevo desde tu panel.")}
      {!preview && lost && !unknown && notice("Sin conexión con el servidor de la mascota…")}
    </>
  );
}
