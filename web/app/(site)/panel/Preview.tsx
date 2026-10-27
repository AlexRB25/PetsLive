"use client";
// Vista previa (el mismo overlay de OBS, escalado) y botones para probar cada reacción.
import { useEffect, useRef, useState } from "react";
import { REACTION_LABELS } from "@/lib/types";

export default function Preview({ overlayKey, call }: { overlayKey: string; call: (path: string, body: unknown) => Promise<unknown> }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [text, setText] = useState("");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1920));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section className="card span-all">
      <h2>Vista previa <span className="muted tiny">(como se verá en OBS a 1920×1080)</span></h2>
      <div className="preview" ref={box}>
        <iframe src={`/o/${overlayKey}?preview`} title="Vista previa del overlay" style={{ transform: `scale(${scale})` }} />
      </div>
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
