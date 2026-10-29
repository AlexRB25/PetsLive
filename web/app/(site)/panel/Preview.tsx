"use client";
// Vista previa (el mismo overlay de OBS, escalado) en horizontal 16:9 o vertical 9:16 para TikTok.
// La mascota se arrastra para moverla y se cambia de tamaño con la esquina; la posición se guarda en %
// para que quede en el mismo lugar en cualquier formato.
import { useEffect, useRef, useState } from "react";
import { REACTION_LABELS, type MascotConfig } from "@/lib/types";

type Format = "horizontal" | "vertical";
type Mascot = MascotConfig["mascot"];
const SIZE: Record<Format, { w: number; h: number }> = { horizontal: { w: 1920, h: 1080 }, vertical: { w: 1080, h: 1920 } };
const KEY = "petslive.previewFormat";
const ASPECT = 1.15; // alto / ancho de la mascota dibujada

// Zonas que tapa la interfaz de TikTok LIVE en un video de 1080×1920 (aproximadas).
const TIKTOK_ZONES = [
  { x: 0, y: 0, w: 1080, h: 210, label: "Nombre, espectadores y cerrar" },
  { x: 920, y: 1050, w: 160, h: 700, label: "Botones" },
  { x: 0, y: 1230, w: 780, h: 560, label: "Comentarios y regalos" },
  { x: 0, y: 1790, w: 1080, h: 130, label: "Escribir y regalar" },
];

/** Punto bajo los pies de la mascota (en px del lienzo) según su posición guardada. */
function anchor(m: Mascot, W: number, H: number) {
  const h = m.size * ASPECT;
  if (m.position === "libre") return { cx: (m.x / 100) * W, by: (m.y / 100) * H };
  if (m.position === "centro") return { cx: W / 2, by: H / 2 + h / 2 };
  const [v, side] = m.position.split("-");
  return {
    cx: side === "izquierda" ? m.offsetX + m.size / 2 : W - m.offsetX - m.size / 2,
    by: v === "arriba" ? m.offsetY + h : H - m.offsetY,
  };
}

interface Props {
  overlayKey: string;
  call: (path: string, body: unknown) => Promise<unknown>;
  mascot: Mascot;
  onMove: (patch: Partial<Mascot>) => void;
}

export default function Preview({ overlayKey, call, mascot, onMove }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [format, setFormat] = useState<Format>("horizontal");
  const [guide, setGuide] = useState(true);
  const [scale, setScale] = useState(0.3);
  const [text, setText] = useState("");
  const [drag, setDrag] = useState<{ cx: number; by: number; size: number } | null>(null);
  const size = SIZE[format];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "vertical" || saved === "horizontal") setFormat(saved);
    } catch {}
  }, []);

  const choose = (f: Format) => {
    setFormat(f);
    try { localStorage.setItem(KEY, f); } catch {}
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / size.w));
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w]);

  const base = anchor(mascot, size.w, size.h);
  const cur = drag ?? { ...base, size: mascot.size };
  const h = cur.size * ASPECT;

  const toPatch = (p: { cx: number; by: number; size: number }) => ({
    position: "libre",
    x: Math.round((p.cx / size.w) * 1000) / 10,
    y: Math.round((p.by / size.h) * 1000) / 10,
    size: Math.round(p.size),
  });

  /** Arrastre del cuerpo (mover) o de la esquina (tamaño). */
  function start(e: React.PointerEvent, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const from = { ...cur };
    let last = from;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / scale;
      const dy = (ev.clientY - sy) / scale;
      last = mode === "move"
        ? { ...from, cx: Math.min(size.w, Math.max(0, from.cx + dx)), by: Math.min(size.h, Math.max(from.size * ASPECT * 0.4, from.by + dy)) }
        : { ...from, size: Math.min(800, Math.max(80, from.size + dx * 2)) };
      setDrag(last);
      frame.current?.contentWindow?.postMessage({ type: "petslive-move", mascot: toPatch(last) }, location.origin);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onMove(toPatch(last));
      // Se suelta el estado local cuando llega la configuración guardada.
      setTimeout(() => setDrag(null), 50);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <section className="card span-all">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Vista previa</h2>
        <div className="row" style={{ gap: 4 }}>
          <button className={`btn sm ${format === "horizontal" ? "on" : ""}`} onClick={() => choose("horizontal")}>Horizontal 16:9</button>
          <button className={`btn sm ${format === "vertical" ? "on" : ""}`} onClick={() => choose("vertical")}>Vertical 9:16 (TikTok)</button>
        </div>
      </div>
      <p className="muted tiny" style={{ margin: "4px 0 8px" }}>
        <strong>Arrastra la mascota</strong> para moverla y jala la esquina para cambiar su tamaño.{" "}
        {format === "horizontal" ? "Lienzo de 1920×1080 (YouTube, Twitch, Facebook)." : "Lienzo vertical de 1080×1920: en OBS o LIVE Studio usa la fuente a 1080×1920."}
      </p>
      <div className={`preview ${format}`} ref={box} style={{ aspectRatio: `${size.w} / ${size.h}` }}>
        <iframe ref={frame} src={`/o/${overlayKey}?preview`} title="Vista previa del overlay" style={{ width: size.w, height: size.h, transform: `scale(${scale})` }} />
        {format === "vertical" && guide && (
          <div className="tt-guide" style={{ width: size.w, height: size.h, transform: `scale(${scale})` }} aria-hidden>
            {TIKTOK_ZONES.map((z) => (
              <div key={z.label} className="tt-zone" style={{ left: z.x, top: z.y, width: z.w, height: z.h }}><span>{z.label}</span></div>
            ))}
          </div>
        )}
        <div
          className={`mascot-handle ${drag ? "dragging" : ""}`}
          style={{ left: (cur.cx - cur.size / 2) * scale, top: (cur.by - h) * scale, width: cur.size * scale, height: h * scale }}
          onPointerDown={(e) => start(e, "move")}
          title="Arrastra para mover"
        >
          <span className="resize-grip" onPointerDown={(e) => start(e, "resize")} title="Jala para cambiar el tamaño" />
        </div>
      </div>
      {format === "vertical" && (
        <label className="check tiny" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />
          Mostrar dónde tapa la interfaz de TikTok (aprox.).
        </label>
      )}
      <h3>Probar reacciones</h3>
      <div className="btns">
        {Object.entries(REACTION_LABELS).map(([r, label]) => (
          <button key={r} className="btn sm" onClick={() => call("/panel/test", { reaction: r, text }).catch(() => {})}>{label}</button>
        ))}
      </div>
      <input type="text" maxLength={140} placeholder="Texto opcional para la prueba" value={text} onChange={(e) => setText(e.target.value)} style={{ marginTop: 8 }} />
    </section>
  );
}
