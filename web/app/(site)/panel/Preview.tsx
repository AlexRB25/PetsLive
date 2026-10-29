"use client";
// Vista previa (el mismo overlay de OBS, escalado) en horizontal 16:9 o vertical 9:16 para TikTok,
// y botones para probar cada reacción.
import { useEffect, useRef, useState } from "react";
import { REACTION_LABELS } from "@/lib/types";

type Format = "horizontal" | "vertical";
const SIZE: Record<Format, { w: number; h: number }> = { horizontal: { w: 1920, h: 1080 }, vertical: { w: 1080, h: 1920 } };
const KEY = "petslive.previewFormat";

// Zonas que tapa la interfaz de TikTok LIVE en un video de 1080×1920 (aproximadas).
const TIKTOK_ZONES = [
  { x: 0, y: 0, w: 1080, h: 210, label: "Nombre, espectadores y cerrar" },
  { x: 920, y: 1050, w: 160, h: 700, label: "Botones" },
  { x: 0, y: 1230, w: 780, h: 560, label: "Comentarios y regalos" },
  { x: 0, y: 1790, w: 1080, h: 130, label: "Escribir y regalar" },
];

export default function Preview({ overlayKey, call }: { overlayKey: string; call: (path: string, body: unknown) => Promise<unknown> }) {
  const box = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<Format>("horizontal");
  const [guide, setGuide] = useState(true);
  const [scale, setScale] = useState(0.3);
  const [text, setText] = useState("");
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
        {format === "horizontal"
          ? "Como se verá en OBS a 1920×1080 (YouTube, Twitch, Facebook)."
          : "Como se verá en un directo vertical de 1080×1920. En OBS usa la fuente de navegador a 1080×1920."}
      </p>
      <div className={`preview ${format}`} ref={box} style={{ aspectRatio: `${size.w} / ${size.h}` }}>
        <iframe src={`/o/${overlayKey}?preview`} title="Vista previa del overlay" style={{ width: size.w, height: size.h, transform: `scale(${scale})` }} />
        {format === "vertical" && guide && (
          <div className="tt-guide" style={{ width: size.w, height: size.h, transform: `scale(${scale})` }} aria-hidden>
            {TIKTOK_ZONES.map((z) => (
              <div key={z.label} className="tt-zone" style={{ left: z.x, top: z.y, width: z.w, height: z.h }}><span>{z.label}</span></div>
            ))}
          </div>
        )}
      </div>
      {format === "vertical" && (
        <label className="check tiny" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />
          Mostrar dónde tapa la interfaz de TikTok (aprox.). Acomoda la mascota fuera de esas zonas desde la pestaña Mascota.
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
