"use client";
// Fondo detrás de la mascota, para directos donde solo sale ella; la mascota y el juego quedan encima.
import { useState } from "react";
import { SCENE_PRESETS } from "@core/config.js";
import { supabase } from "@/lib/supabase-browser";
import type { MascotConfig } from "@/lib/types";

type Update = (fn: (c: MascotConfig) => void) => void;

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/gif", "image/webp", "image/jpeg"];

const PRESET_LABELS: Record<string, string> = {
  atardecer: "Atardecer", noche: "Noche", espacio: "Espacio", bosque: "Bosque", oceano: "Océano", caramelo: "Caramelo",
};

export default function SceneSettings({ config, update }: { config: MascotConfig; update: Update }) {
  const sc = config.scene;
  const set = (fn: (s: MascotConfig["scene"]) => void) => update((c) => fn(c.scene));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function upload(file: File) {
    setErr("");
    if (!TYPES.includes(file.type)) return setErr("Usa una imagen PNG, GIF, WebP o JPG.");
    if (file.size > MAX_BYTES) return setErr("La imagen pesa más de 2 MB. Redúcela e inténtalo de nuevo.");
    setBusy(true);
    try {
      const uid = (await supabase().auth.getUser()).data.user?.id;
      const ext = file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${uid}/fondo-${Date.now()}.${ext}`;
      const up = await supabase().storage.from("mascotas").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (up.error) throw new Error(up.error.message);
      const url = supabase().storage.from("mascotas").getPublicUrl(path).data.publicUrl;
      const old = sc.image;
      set((s) => { s.image = url; s.kind = "imagen"; });
      const marker = "/storage/v1/object/public/mascotas/";
      const i = old ? old.indexOf(marker) : -1;
      if (i >= 0) supabase().storage.from("mascotas").remove([decodeURIComponent(old.slice(i + marker.length))]).catch(() => {});
    } catch (e) {
      setErr(`No se pudo subir la imagen: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        Un fondo detrás de la mascota para directos donde solo sale ella, sin cámara ni juego atrás. La mascota y el juego quedan encima
        y siguen reaccionando. El título y el texto son opcionales. Lo puedes prender y apagar rápido desde la tarjeta de arriba.
      </p>
      <div className="form">
        <label>Cuándo se muestra
          <select value={sc.mode} onChange={(e) => set((s) => { s.mode = e.target.value as typeof s.mode; })}>
            <option value="apagado">Apagado</option>
            <option value="encendido">Encendido</option>
            <option value="sin-directo">Solo mientras el directo no esté iniciado en el panel</option>
          </select>
        </label>
        <label>Título <input type="text" maxLength={60} value={sc.title} placeholder="Opcional, por ejemplo: El directo de Bolt" onChange={(e) => set((s) => { s.title = e.target.value; })} /></label>
        <label>Texto debajo <input type="text" maxLength={100} value={sc.subtitle} placeholder="Opcional, por ejemplo: Escribe Bolt y te saludo" onChange={(e) => set((s) => { s.subtitle = e.target.value; })} /></label>
        <label>Tipo de fondo
          <select value={sc.kind} onChange={(e) => set((s) => { s.kind = e.target.value as typeof s.kind; })}>
            <option value="preset">Degradado</option>
            <option value="color">Color sólido</option>
            <option value="imagen" disabled={!sc.image}>Mi imagen</option>
          </select>
        </label>
        {sc.kind === "color" && <label>Color <input type="color" value={sc.color} onChange={(e) => set((s) => { s.color = e.target.value; })} /></label>}
      </div>

      {sc.kind === "preset" && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {Object.entries(SCENE_PRESETS).map(([id, bg]) => (
            <button key={id} className="btn sm" aria-pressed={sc.preset === id} onClick={() => set((s) => { s.preset = id; })}
              style={{ width: 96, height: 64, background: bg, color: "#fff", textShadow: "0 1px 3px #000", outline: sc.preset === id ? "3px solid var(--accent, #7c3aed)" : "none" }}>
              {PRESET_LABELS[id] ?? id}
            </button>
          ))}
        </div>
      )}

      <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {sc.image && <img src={sc.image} alt="Tu fondo" style={{ height: 72, borderRadius: 8 }} />}
        <label className="btn sm">
          {busy ? "Subiendo…" : sc.image ? "Cambiar mi imagen" : "Subir mi imagen"}
          <input type="file" accept={TYPES.join(",")} hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        </label>
        <span className="muted tiny">PNG, JPG, WebP o GIF animado, hasta 2 MB. Ideal 1080×1920 (vertical) o 1920×1080.</span>
      </div>
      {err && <div className="err small">{err}</div>}
    </div>
  );
}
