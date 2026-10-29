"use client";
// Overlay de OBS: la mascota recibe del worker qué animación hacer, con qué texto y por cuánto tiempo.
import { useEffect, useRef, useState } from "react";
import { mascotHTML, MASCOT_CSS } from "@core/mascot.js";
import { VoicePlayer } from "@/lib/voice-player";
import { WORKER_URL } from "@/lib/supabase-browser";
import type { MascotConfig } from "@/lib/types";

const CSS = `
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
${MASCOT_CSS}`;

interface Play { id: number; reaction: string; text: string; duration: number; resume?: boolean }

export default function Overlay({ overlayKey, preview }: { overlayKey: string; preview: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const mascot = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
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

    if (!WORKER_URL) return;
    const es = new EventSource(`${WORKER_URL}/overlay/stream?key=${encodeURIComponent(overlayKey)}${preview ? "&preview=1" : ""}`);
    let opened = false;
    es.onopen = () => { opened = true; setLost(false); };
    es.onerror = () => {
      // Una respuesta de error (404: la llave no existe) cierra el EventSource; un corte de red reintenta solo.
      if (es.readyState === EventSource.CLOSED && !opened) { setUnknown(true); return; }
      setLost(true);
    };
    es.addEventListener("config", (e) => { config = JSON.parse((e as MessageEvent).data); layout(); });
    es.addEventListener("play", (e) => config && play(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("audio", (e) => { const c = speaks(); if (c) voice.audio(JSON.parse((e as MessageEvent).data), c); });
    es.addEventListener("idle", idle);
    return () => { es.close(); clearTimeout(backTimer); clearTimeout(bubbleTimer); };
  }, [overlayKey, preview]);

  const notice = (text: string) => (
    <div style={{ position: "fixed", left: 8, bottom: 8, font: "12px system-ui", color: "#fff", background: "#b91c1cd0", padding: "4px 8px", borderRadius: 6 }}>{text}</div>
  );

  return (
    <>
      <style>{CSS}</style>
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
