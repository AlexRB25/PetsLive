"use client";
// Voz de la mascota: del navegador, grabaciones propias, voces de ElevenLabs de la plataforma o la cuenta
// de ElevenLabs del propio streamer (con su voz clonada).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authFetch, postJSON, supabase, WORKER_URL } from "@/lib/supabase-browser";
import type { MascotConfig } from "@/lib/types";

type Update = (fn: (c: MascotConfig) => void) => void;
interface Voice { id: string; name: string; preview: string; category: string; description: string }

const ENGINES = [
  ["navegador", "Voz del navegador", "Gratis. Usa las voces instaladas en la computadora."],
  ["grabada", "Mis grabaciones", "Tu propia voz: graba o sube audios para cada reacción."],
  ["elevenlabs", "Voces de ElevenLabs", "Voces de alta calidad que dicen nombres. Incluidas en planes de pago."],
  ["elevenlabs_propia", "Mi cuenta de ElevenLabs", "Conecta tu cuenta y usa cualquier voz tuya, incluida tu voz clonada."],
] as const;

const CLIP_GROUPS = [
  ["saludo", "Saludo (entradas, comandos)"],
  ["agradecimiento", "Agradecimiento (regalos, compras)"],
  ["celebracion", "Celebración (follows, regalos grandes, victoria)"],
  ["salto", "Salto (likes)"],
  ["sorpresa", "Sorpresa (menciones, sustos)"],
  ["baile", "Baile (comando !baila)"],
  ["tristeza", "Tristeza (derrota)"],
  ["idle", "Invitación cuando nadie interactúa"],
] as const;

const MAX_CLIPS = 5;
const MAX_SECONDS = 15;
const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/aac"];

async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data as T;
}

function usePreview() {
  const ref = useRef<HTMLAudioElement | null>(null);
  return (url: string) => {
    ref.current?.pause();
    if (!url) return;
    ref.current = new Audio(url);
    ref.current.play().catch(() => {});
  };
}

export default function VoicePicker({ config, update }: { config: MascotConfig; update: Update }) {
  const engine = config.voice.engine;
  return (
    <div className="stack" style={{ marginBottom: 16 }}>
      <div className="engines">
        {ENGINES.map(([id, title, text]) => (
          <button key={id} className={`engine-card ${engine === id ? "active" : ""}`} onClick={() => update((c) => { c.voice.engine = id; })}>
            <strong>{title}{engine === id && " ✓"}</strong>
            <span className="muted tiny">{text}</span>
          </button>
        ))}
      </div>
      {engine === "grabada" && <Clips config={config} update={update} />}
      {engine === "elevenlabs" && <PlatformVoices config={config} update={update} />}
      {engine === "elevenlabs_propia" && <OwnVoices config={config} update={update} />}
    </div>
  );
}

function VoiceList({ voices, selected, onPick }: { voices: Voice[]; selected: string; onPick: (id: string) => void }) {
  const preview = usePreview();
  return (
    <div className="voices">
      {voices.map((v) => (
        <div key={v.id} className={`voice ${selected === v.id ? "active" : ""}`}>
          <div style={{ minWidth: 0 }}>
            <strong className="small">{v.name}</strong>{v.category === "cloned" && <span className="pill tiny" style={{ marginLeft: 6 }}>clonada</span>}
            <div className="muted tiny">{v.description}</div>
          </div>
          <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
            {v.preview && <button className="btn sm ghost" title="Escuchar" onClick={() => preview(v.preview)}>▶</button>}
            <button className={`btn sm ${selected === v.id ? "on" : ""}`} onClick={() => onPick(v.id)}>{selected === v.id ? "Elegida" : "Usar"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PlatformVoices({ config, update }: { config: MascotConfig; update: Update }) {
  const [data, setData] = useState<{ configured: boolean; voices: Voice[]; quota: { limit: number; used: number } } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { getJSON<typeof data>("/api/voces").then(setData).catch((e) => setErr(e.message)); }, []);

  if (err) return <div className="err small">{err}</div>;
  if (!data) return <p className="muted small">Cargando voces…</p>;
  if (!data.configured) return <div className="warn small">Las voces de ElevenLabs todavía no están configuradas en la plataforma.</div>;
  const left = Math.max(0, data.quota.limit - data.quota.used);
  return (
    <div className="stack">
      {data.quota.limit === 0 ? (
        <div className="warn small">Tu plan no incluye voces de ElevenLabs. <Link href="/planes" className="link">Ver planes</Link> — o conecta tu propia cuenta de ElevenLabs.</div>
      ) : (
        <div className="small">
          <strong>{left.toLocaleString("es-MX")}</strong> <span className="muted">de {data.quota.limit.toLocaleString("es-MX")} caracteres disponibles este mes. Las frases que se repiten no se cobran dos veces. Si se acaban, se usa la voz del navegador.</span>
          <div className="meter" style={{ marginTop: 6 }}><span style={{ width: `${Math.min(100, (left / data.quota.limit) * 100)}%` }} /></div>
        </div>
      )}
      <VoiceList voices={data.voices} selected={config.voice.elevenVoice} onPick={(id) => update((c) => { c.voice.elevenVoice = id; })} />
    </div>
  );
}

function OwnVoices({ config, update }: { config: MascotConfig; update: Update }) {
  const [data, setData] = useState<{ connected: boolean; voices: Voice[]; error?: string } | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reloadWorker = () => postJSON(`${WORKER_URL}/panel/control`, { action: "reload" }).catch(() => {});
  useEffect(() => { getJSON<typeof data>("/api/voces/propia").then(setData).catch((e) => setErr(e.message)); }, []);

  async function connect() {
    setBusy(true); setErr("");
    try {
      setData(await postJSON("/api/voces/propia", { apiKey: key }));
      setKey("");
      reloadWorker();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("¿Quitar tu cuenta de ElevenLabs?")) return;
    setData(await getJSON("/api/voces/propia", { method: "DELETE" }));
    update((c) => { c.voice.ownVoice = ""; });
    reloadWorker();
  }

  if (!data) return err ? <div className="err small">{err}</div> : <p className="muted small">Cargando…</p>;
  if (!data.connected) {
    return (
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>
          En elevenlabs.io → <strong>Developers → API Keys</strong> crea una llave con permiso de <strong>Text to Speech</strong> y <strong>Voices (lectura)</strong> y pégala aquí.
          Se guarda cifrada y lo que hable la mascota se descuenta de tu cuenta de ElevenLabs. Para usar tu voz, clónala primero en ElevenLabs (solo tu voz o una con permiso de su dueño).
        </p>
        <div className="row">
          <input className="grow" type="password" placeholder="sk_…" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
          <button className="btn primary sm" disabled={busy || key.trim().length < 20} onClick={connect}>{busy ? "Revisando…" : "Conectar"}</button>
        </div>
        {err && <div className="err small">{err}</div>}
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="row between small">
        <span className="pill ok"><i />Cuenta de ElevenLabs conectada</span>
        <button className="link small" onClick={disconnect}>Desconectar</button>
      </div>
      {data.error && <div className="warn small">{data.error}</div>}
      {data.voices.length === 0 ? <p className="muted small">Tu cuenta no tiene voces todavía.</p> : (
        <VoiceList voices={[...data.voices].sort((a, b) => Number(b.category === "cloned") - Number(a.category === "cloned"))} selected={config.voice.ownVoice} onPick={(id) => update((c) => { c.voice.ownVoice = id; })} />
      )}
    </div>
  );
}

function Clips({ config, update }: { config: MascotConfig; update: Update }) {
  const clips = config.voice.clips as Record<string, string[]>;
  const [recording, setRecording] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const preview = usePreview();

  const save = useCallback(async (group: string, blob: Blob) => {
    setErr("");
    const type = blob.type.split(";")[0] || "audio/webm";
    if (!AUDIO_TYPES.includes(type)) return setErr("Usa un audio MP3, M4A, WAV, OGG o WebM.");
    if (blob.size > 2 * 1024 * 1024) return setErr("El audio pesa más de 2 MB; hazlo más corto.");
    setBusy(group);
    try {
      const uid = (await supabase().auth.getUser()).data.user?.id;
      const ext = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav" }[type] ?? "webm";
      const path = `${uid}/voz-${group}-${Date.now()}.${ext}`;
      const up = await supabase().storage.from("mascotas").upload(path, blob, { contentType: type, cacheControl: "31536000" });
      if (up.error) throw new Error(up.error.message);
      const url = supabase().storage.from("mascotas").getPublicUrl(path).data.publicUrl;
      update((c) => {
        const all = c.voice.clips as Record<string, string[]>;
        all[group] = [...(all[group] ?? []), url].slice(-MAX_CLIPS);
      });
    } catch (e) {
      setErr(`No se pudo guardar el audio: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [update]);

  async function record(group: string) {
    if (recording) return recorder.current?.stop();
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        save(group, new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      };
      recorder.current = rec;
      rec.start();
      setRecording(group);
      setTimeout(() => rec.state === "recording" && rec.stop(), MAX_SECONDS * 1000);
    } catch {
      setErr("No se pudo usar el micrófono. Revisa el permiso del navegador.");
    }
  }

  function remove(group: string, url: string) {
    update((c) => {
      const all = c.voice.clips as Record<string, string[]>;
      all[group] = (all[group] ?? []).filter((u) => u !== url);
    });
    const marker = "/storage/v1/object/public/mascotas/";
    const i = url.indexOf(marker);
    if (i >= 0) supabase().storage.from("mascotas").remove([decodeURIComponent(url.slice(i + marker.length))]).catch(() => {});
  }

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        Graba frases cortas (hasta {MAX_SECONDS} s) o sube audios para cada tipo de reacción; puedes tener hasta {MAX_CLIPS} por grupo y se turnan.
        Las grabaciones no dicen nombres; el nombre sale en el globo de texto. Si un grupo no tiene audios, se usa la voz del navegador.
      </p>
      {err && <div className="err small">{err}</div>}
      <div className="clip-groups">
        {CLIP_GROUPS.map(([group, label]) => {
          const list = clips[group] ?? [];
          return (
            <div key={group} className="clip-group">
              <strong className="small">{label}</strong>
              <div className="row" style={{ gap: 4 }}>
                {list.map((url, i) => (
                  <span key={url} className="clip">
                    <button className="btn sm ghost" title="Escuchar" onClick={() => preview(url)}>▶ {i + 1}</button>
                    <button className="link tiny" title="Quitar" onClick={() => remove(group, url)}>✕</button>
                  </span>
                ))}
                {list.length === 0 && <span className="muted tiny">Sin audios</span>}
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button className={`btn sm ${recording === group ? "danger" : ""}`} disabled={list.length >= MAX_CLIPS || busy === group || (recording !== null && recording !== group)} onClick={() => record(group)}>
                  {recording === group ? "■ Detener" : "● Grabar"}
                </button>
                <label className={`btn sm ${list.length >= MAX_CLIPS || busy ? "disabled" : ""}`}>
                  {busy === group ? "Subiendo…" : "Subir"}
                  <input type="file" accept={AUDIO_TYPES.join(",")} hidden disabled={list.length >= MAX_CLIPS || !!busy}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) save(group, f); }} />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
