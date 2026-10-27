"use client";
// Plataformas: cuáles se conectan al iniciar el directo y con qué datos.
import { useEffect, useState } from "react";
import { postJSON, supabase } from "@/lib/supabase-browser";
import { PLATFORM_LABELS, type Connection, type Platform } from "@/lib/types";

const COLORS: Record<Platform, string> = { tiktok: "#ff0050", youtube: "#ff0000", twitch: "#9146ff", facebook: "#1877f2" };
const ORDER: Platform[] = ["tiktok", "youtube", "twitch", "facebook"];

interface Props {
  connections: Connection[];
  reload: () => void;
  maxPlatforms: number;
  sessionActive: boolean;
}

export default function Connections({ connections, reload, maxPlatforms, sessionActive }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setDrafts(Object.fromEntries(connections.map((c) => [c.platform, { ...c.settings }])));
  }, [connections]);

  const byPlatform = (p: Platform) => connections.find((c) => c.platform === p);
  const enabledCount = connections.filter((c) => c.enabled).length;

  async function save(p: Platform, patch: { enabled?: boolean; settings?: Record<string, unknown> }) {
    setErr("");
    const cur = byPlatform(p);
    const uid = (await supabase().auth.getUser()).data.user?.id;
    const row = {
      user_id: uid,
      platform: p,
      enabled: patch.enabled ?? cur?.enabled ?? false,
      settings: patch.settings ?? { ...(cur?.settings ?? {}), ...(drafts[p] ?? {}) },
      updated_at: new Date().toISOString(),
    };
    const r = await supabase().from("connections").upsert(row);
    if (r.error) setErr(r.error.message);
    reload();
  }

  const draft = (p: Platform, key: string) => String(drafts[p]?.[key] ?? "");
  const setDraft = (p: Platform, key: string, value: string) => setDrafts((d) => ({ ...d, [p]: { ...(d[p] ?? {}), [key]: value } }));
  const text = (p: Platform, key: string, label: string, placeholder: string) => (
    <label className="block" style={{ margin: "8px 0 0" }}>
      {label}
      <input type="text" value={draft(p, key)} placeholder={placeholder} onChange={(e) => setDraft(p, key, e.target.value)} onBlur={() => save(p, {})} />
    </label>
  );

  async function oauth(p: "twitch" | "facebook") {
    setBusy(p);
    try {
      const { url } = await postJSON<{ url: string }>(`/api/conectar/${p}`);
      location.href = url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }

  async function disconnect(p: "twitch" | "facebook") {
    if (!confirm(`¿Desconectar tu cuenta de ${PLATFORM_LABELS[p]}?`)) return;
    try {
      await postJSON("/api/conectar/desconectar", { platform: p });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>
        Activa las plataformas donde transmites. Tu plan permite <strong>{maxPlatforms}</strong> a la vez. Al pulsar <strong>Iniciar directo</strong> se conectan las activas.
        {sessionActive && " Los cambios se aplican al próximo directo."}
      </p>
      {err && <div className="err small" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="conns">
        {ORDER.map((p) => {
          const c = byPlatform(p);
          const on = Boolean(c?.enabled);
          const s = (c?.settings ?? {}) as Record<string, unknown>;
          return (
            <div key={p} className="card conn">
              <div className="row between">
                <h3><span className="dot" style={{ background: COLORS[p] }} />{PLATFORM_LABELS[p]}{p === "tiktok" && <span className="pill tiny">experimental</span>}</h3>
                <label className="check small">
                  <input type="checkbox" checked={on} disabled={!on && enabledCount >= maxPlatforms}
                    onChange={(e) => save(p, { enabled: e.target.checked })} /> activa
                </label>
              </div>

              {p === "tiktok" && (
                <>
                  {text(p, "username", "Tu usuario de TikTok", "@tu_usuario")}
                  <div className="warn tiny" style={{ marginTop: 8 }}>
                    TikTok no tiene una API oficial para leer los directos. Esta conexión usa una herramienta no oficial: puede fallar o dejar de funcionar si TikTok cambia su servicio, y TikTok no la autoriza. Recibe entradas, comentarios, likes, follows y regalos.
                  </div>
                </>
              )}

              {p === "youtube" && (
                <>
                  {text(p, "liveUrl", "Enlace de tu directo (recomendado)", "https://youtube.com/live/…")}
                  {text(p, "channel", "o tu canal (lo buscamos solo)", "@tucanal")}
                  <p className="muted tiny">Recibe comentarios, Super Chats, Super Stickers y membresías. Los nuevos suscriptores del canal no se avisan en el chat.</p>
                </>
              )}

              {p === "twitch" && (
                <>
                  {text(p, "channel", "Canal", "tu_canal")}
                  {s.account ? (
                    <p className="small" style={{ margin: "8px 0 0" }}>Cuenta conectada: <strong>{String(s.account)}</strong> (follows activados) · <button className="link" onClick={() => disconnect("twitch")}>Desconectar</button></p>
                  ) : (
                    <div className="row" style={{ marginTop: 8 }}>
                      <button className="btn sm" disabled={busy === "twitch"} onClick={() => oauth("twitch")}>Conectar cuenta para recibir follows</button>
                    </div>
                  )}
                  <p className="muted tiny">Sin cuenta: chat, bits, suscripciones y raids. Con cuenta también follows.</p>
                </>
              )}

              {p === "facebook" && (
                <>
                  {Array.isArray(s.pages) && s.pages.length ? (
                    <>
                      <label className="block" style={{ margin: "8px 0 0" }}>
                        Página que transmite
                        <select value={String(s.pageId ?? "")} onChange={(e) => save(p, { settings: { ...s, pageId: e.target.value } })}>
                          {(s.pages as { id: string; name: string }[]).map((pg) => <option key={pg.id} value={pg.id}>{pg.name}</option>)}
                        </select>
                      </label>
                      <p className="small" style={{ margin: "8px 0 0" }}><button className="link" onClick={() => oauth("facebook")}>Actualizar páginas</button> · <button className="link" onClick={() => disconnect("facebook")}>Desconectar</button></p>
                    </>
                  ) : (
                    <div className="row" style={{ marginTop: 8 }}>
                      <button className="btn sm" disabled={busy === "facebook"} onClick={() => oauth("facebook")}>Conectar con Facebook</button>
                    </div>
                  )}
                  <p className="muted tiny">Solo directos de páginas (no de perfiles personales). Recibe comentarios y reacciones.</p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
