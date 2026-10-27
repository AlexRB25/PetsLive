"use client";
// Cómo se crea la mascota: personaje del catálogo, imágenes propias o diseño con IA.
import { useCallback, useEffect, useState } from "react";
import { CATALOG, MASCOT_CSS } from "@core/mascot.js";
import MascotArt from "@/components/MascotArt";
import { postJSON, supabase } from "@/lib/supabase-browser";
import type { Design, MascotConfig } from "@/lib/types";

type Update = (fn: (c: MascotConfig) => void) => void;
type Kind = "catalogo" | "imagen" | "ia";
interface AiDesign { id: string; prompt: string; status: string; design: Design | null; created_at: string }

const SLOTS = [
  ["base", "Normal (obligatoria)"],
  ["feliz", "Feliz"],
  ["triste", "Triste"],
  ["sorpresa", "Sorprendida"],
] as const;

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/gif", "image/webp", "image/jpeg"];
const catalogNames = new Set(Object.values(CATALOG).map((d) => d.name));

export default function MascotPicker({ config, update }: { config: MascotConfig; update: Update }) {
  const m = config.mascot;
  const [tab, setTab] = useState<Kind>(m.kind as Kind);
  const [err, setErr] = useState("");

  // Si el nombre era el del personaje anterior, se cambia por el nuevo; si lo eligió el usuario, se respeta.
  const nameFor = (fallback: string) => (catalogNames.has(m.name) || m.name === m.design?.name ? fallback : m.name);

  const pickSpecies = (id: string) => {
    const d = CATALOG[id as keyof typeof CATALOG];
    update((c) => {
      c.mascot.kind = "catalogo";
      c.mascot.species = id;
      c.mascot.body = d.colors.body;
      c.mascot.accent = d.colors.accent;
      c.mascot.name = nameFor(d.name);
    });
  };

  return (
    <div className="stack" style={{ marginBottom: 18 }}>
      <style>{MASCOT_CSS}</style>
      <div className="row">
        <strong className="small">Tu mascota:</strong>
        {(["catalogo", "imagen", "ia"] as const).map((k) => (
          <button key={k} className={`btn sm ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
            {k === "catalogo" ? "Elegir personaje" : k === "imagen" ? "Subir mi imagen" : "Crear con IA"}
            {m.kind === k && " ✓"}
          </button>
        ))}
      </div>
      {err && <div className="err small">{err}</div>}

      {tab === "catalogo" && (
        <div className="species">
          {Object.entries(CATALOG).map(([id, d]) => {
            const active = m.kind === "catalogo" && m.species === id;
            return (
              <button key={id} className={`species-card ${active ? "active" : ""}`} onClick={() => pickSpecies(id)} title={`Usar a ${d.name}`}>
                <MascotArt css={false} state={active ? "saludo" : "reposo"} mascot={{ kind: "catalogo", species: id, body: d.colors.body, accent: d.colors.accent, eyes: m.eyes, accessory: "ninguno", name: d.name }} />
                <span>{d.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {tab === "imagen" && <ImageUpload config={config} update={update} setErr={setErr} />}
      {tab === "ia" && <AiCreator config={config} update={update} setErr={setErr} nameFor={nameFor} />}
    </div>
  );
}

function ImageUpload({ config, update, setErr }: { config: MascotConfig; update: Update; setErr: (s: string) => void }) {
  const imgs = config.mascot.images;
  const [busy, setBusy] = useState("");

  async function upload(slot: string, file: File) {
    setErr("");
    if (!TYPES.includes(file.type)) return setErr("Usa una imagen PNG, GIF, WebP o JPG.");
    if (file.size > MAX_BYTES) return setErr("La imagen pesa más de 2 MB. Redúcela e inténtalo de nuevo.");
    setBusy(slot);
    try {
      const uid = (await supabase().auth.getUser()).data.user?.id;
      const ext = file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${uid}/${slot}-${Date.now()}.${ext}`;
      const up = await supabase().storage.from("mascotas").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (up.error) throw new Error(up.error.message);
      const url = supabase().storage.from("mascotas").getPublicUrl(path).data.publicUrl;
      const old = imgs[slot as keyof typeof imgs];
      update((c) => {
        (c.mascot.images as Record<string, string>)[slot] = url;
        if (slot === "base") c.mascot.kind = "imagen";
      });
      removeFile(old);
    } catch (e) {
      setErr(`No se pudo subir la imagen: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  // Borra del almacenamiento una imagen propia que ya no se usa.
  function removeFile(url: string) {
    const marker = "/storage/v1/object/public/mascotas/";
    const i = url ? url.indexOf(marker) : -1;
    if (i >= 0) supabase().storage.from("mascotas").remove([decodeURIComponent(url.slice(i + marker.length))]).catch(() => {});
  }

  function clear(slot: string) {
    const old = imgs[slot as keyof typeof imgs];
    update((c) => {
      (c.mascot.images as Record<string, string>)[slot] = "";
      if (slot === "base" && c.mascot.kind === "imagen") c.mascot.kind = "catalogo";
    });
    removeFile(old);
  }

  return (
    <>
      <p className="muted small" style={{ margin: 0 }}>
        Sube tu personaje como imagen <strong>PNG con fondo transparente</strong>, cuadrada y de hasta 2 MB (también GIF animado o WebP).
        La mascota salta, baila y se mueve con la imagen. Si subes versiones feliz, triste y sorprendida, las usa en cada reacción; si no, usa la normal.
      </p>
      <div className="slots">
        {SLOTS.map(([slot, label]) => {
          const url = imgs[slot];
          return (
            <div key={slot} className="slot">
              <div className="slot-img">{url ? <img src={url} alt={label} /> : <span className="muted tiny">Sin imagen</span>}</div>
              <span className="small">{label}</span>
              <label className={`btn sm ${busy === slot ? "on" : ""}`}>
                {busy === slot ? "Subiendo…" : url ? "Cambiar" : "Subir"}
                <input type="file" accept={TYPES.join(",")} hidden disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(slot, f); }} />
              </label>
              {url && <button className="link tiny" onClick={() => clear(slot)}>Quitar</button>}
            </div>
          );
        })}
      </div>
      {imgs.base && config.mascot.kind !== "imagen" && (
        <button className="btn sm primary" onClick={() => update((c) => { c.mascot.kind = "imagen"; })}>Usar mis imágenes</button>
      )}
      <p className="muted tiny" style={{ margin: 0 }}>Solo sube imágenes que sean tuyas o que tengas derecho a usar.</p>
    </>
  );
}

function AiCreator({ config, update, setErr, nameFor }: { config: MascotConfig; update: Update; setErr: (s: string) => void; nameFor: (f: string) => string }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<AiDesign[]>([]);
  const [quota, setQuota] = useState<{ limit: number; used: number } | null>(null);

  const load = useCallback(async () => {
    const [d, q] = await Promise.all([
      supabase().from("ai_designs").select("*").eq("status", "lista").order("created_at", { ascending: false }).limit(24),
      supabase().rpc("my_ai_quota"),
    ]);
    if (!d.error) setList(d.data as AiDesign[]);
    if (!q.error) setQuota(q.data as { limit: number; used: number });
  }, []);

  useEffect(() => { load(); }, [load]);

  const use = (design: Design) => update((c) => {
    c.mascot.kind = "ia";
    c.mascot.design = design;
    if (design.colors.body) c.mascot.body = design.colors.body;
    if (design.colors.accent) c.mascot.accent = design.colors.accent;
    c.mascot.name = nameFor(design.name);
  });

  async function create() {
    setErr("");
    setBusy(true);
    try {
      const r = await postJSON<{ design: Design }>("/api/mascota/generar", { prompt });
      use(r.design);
      setPrompt("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      load();
    }
  }

  const left = quota ? Math.max(0, quota.limit - quota.used) : null;

  return (
    <>
      <p className="muted small" style={{ margin: 0 }}>
        Describe tu mascota y la IA la dibuja con el mismo estilo y las mismas animaciones que el catálogo. Después puedes cambiarle colores y accesorio.
      </p>
      <textarea rows={2} maxLength={300} placeholder="Ej.: un zorro astronauta naranja con casco y cola esponjosa" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="row">
        <button className="btn primary" disabled={busy || prompt.trim().length < 3 || left === 0} onClick={create}>
          {busy ? "Dibujando tu mascota… (hasta 1 min)" : "Crear mascota"}
        </button>
        {quota && <span className="muted small">{left} de {quota.limit} disponibles este mes</span>}
      </div>
      {left === 0 && <div className="warn small">Ya usaste las mascotas con IA de tu plan este mes. Puedes seguir usando las que ya creaste, o mejorar tu plan.</div>}
      {list.length > 0 && (
        <>
          <h3>Tus mascotas creadas</h3>
          <div className="species">
            {list.map((a) => a.design && (
              <button key={a.id} className={`species-card ${config.mascot.kind === "ia" && config.mascot.design?.name === a.design.name ? "active" : ""}`} onClick={() => use(a.design!)} title={a.prompt}>
                <MascotArt css={false} state="reposo" mascot={{ kind: "ia", design: a.design, body: a.design.colors.body ?? config.mascot.body, accent: a.design.colors.accent ?? config.mascot.accent, eyes: config.mascot.eyes, accessory: "ninguno", name: a.design.name }} />
                <span>{a.design.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
