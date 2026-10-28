"use client";
// Resumen de un directo: estadísticas por plataforma (siempre) y análisis del chat con IA (planes de pago).
import { useState } from "react";
import Link from "next/link";
import { postJSON } from "@/lib/supabase-browser";
import { PLATFORM_LABELS, type Platform } from "@/lib/types";

interface PlatformStats {
  comments: number; chatters: number; joins: number; likes: number; follows: number; subs: number; gifts: number; giftValue: number;
  topChatters: { name: string; count: number }[]; topGifters: { name: string; count: number }[];
}

export interface Summary {
  overview: string;
  mood: { label: string; note: string };
  topics: { title: string; detail: string; mentions: number }[];
  requests: { request: string; mentions: number; idea: string }[];
  questions: { question: string; mentions: number }[];
  highlights: string[];
  platformNotes: { platform: Platform; note: string }[];
  nextStream: string[];
  comments?: number;
}

const MOOD: Record<string, string> = { positivo: "😄 Positivo", neutral: "😐 Neutral", mixto: "🤔 Mixto", negativo: "😟 Negativo" };
const n = (v: number) => v.toLocaleString("es-MX");

export default function SessionSummary({ id, stats, initial, ended }: { id: string; stats: Record<string, PlatformStats>; initial: Summary | null; ended: boolean }) {
  const [summary, setSummary] = useState<Summary | null>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [upgrade, setUpgrade] = useState(false);

  async function generate() {
    setBusy(true);
    setErr("");
    try {
      const r = await postJSON<{ summary: Summary }>("/api/resumen", { session_id: id });
      setSummary(r.summary);
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      setUpgrade(/planes Creator/.test(msg));
    } finally {
      setBusy(false);
    }
  }

  const plats = Object.entries(stats || {}) as [Platform, PlatformStats][];

  return (
    <div className="card stack summary">
      {plats.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>Este directo no tiene estadísticas guardadas.</p>
      ) : (
        <div className="scroll-x">
          <table className="list">
            <thead>
              <tr><th>Plataforma</th><th>Comentarios</th><th>Personas</th><th>Entradas</th><th>Likes</th><th>Follows</th><th>Suscr.</th><th>Regalos</th><th>Valor</th></tr>
            </thead>
            <tbody>
              {plats.map(([p, s]) => (
                <tr key={p}>
                  <td><strong>{PLATFORM_LABELS[p] ?? p}</strong></td>
                  <td>{n(s.comments)}</td><td>{n(s.chatters)}</td><td>{n(s.joins)}</td><td>{n(s.likes)}</td>
                  <td>{n(s.follows)}</td><td>{n(s.subs)}</td><td>{n(s.gifts)}</td><td>{n(s.giftValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {plats.some(([, s]) => s.topChatters?.length || s.topGifters?.length) && (
        <div className="summary-grid">
          {plats.map(([p, s]) => (
            <div key={p} className="small">
              <strong>{PLATFORM_LABELS[p] ?? p}</strong>
              {s.topGifters?.length > 0 && <div className="muted">Más regalos: {s.topGifters.map((g) => `${g.name} (${n(g.count)})`).join(", ")}</div>}
              {s.topChatters?.length > 0 && <div className="muted">Más comentarios: {s.topChatters.map((g) => `${g.name} (${g.count})`).join(", ")}</div>}
            </div>
          ))}
        </div>
      )}
      <p className="muted tiny" style={{ margin: 0 }}>“Valor”: diamantes en TikTok, bits en Twitch y monto de Super Chats en YouTube.</p>

      {summary ? (
        <div className="stack" style={{ gap: 12 }}>
          <div className="row between">
            <h3 style={{ margin: 0 }}>Resumen del chat con IA</h3>
            <span className="pill">{MOOD[summary.mood?.label] ?? summary.mood?.label}</span>
          </div>
          <p style={{ margin: 0 }}>{summary.overview}</p>
          {summary.mood?.note && <p className="muted small" style={{ margin: 0 }}>{summary.mood.note}</p>}

          <div className="summary-grid">
            {summary.requests.length > 0 && (
              <section>
                <h3>Lo que más te pidieron</h3>
                <ol className="small">
                  {summary.requests.map((r, i) => <li key={i}><strong>{r.request}</strong> <span className="muted">(~{r.mentions})</span><br /><span className="muted">💡 {r.idea}</span></li>)}
                </ol>
              </section>
            )}
            {summary.topics.length > 0 && (
              <section>
                <h3>Lo más comentado</h3>
                <ol className="small">
                  {summary.topics.map((t, i) => <li key={i}><strong>{t.title}</strong> <span className="muted">(~{t.mentions})</span><br /><span className="muted">{t.detail}</span></li>)}
                </ol>
              </section>
            )}
            {summary.questions.length > 0 && (
              <section>
                <h3>Preguntas que se repitieron</h3>
                <ul className="small">{summary.questions.map((q, i) => <li key={i}>{q.question} <span className="muted">(~{q.mentions})</span></li>)}</ul>
              </section>
            )}
            {summary.highlights.length > 0 && (
              <section>
                <h3>Momentos destacados</h3>
                <ul className="small">{summary.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
              </section>
            )}
          </div>
          {summary.platformNotes.length > 0 && (
            <div className="small">{summary.platformNotes.map((p, i) => <div key={i}><strong>{PLATFORM_LABELS[p.platform] ?? p.platform}:</strong> {p.note}</div>)}</div>
          )}
          {summary.nextStream.length > 0 && (
            <div className="okbox small">
              <strong>Para tu próximo directo</strong>
              <ul style={{ margin: "6px 0 0" }}>{summary.nextStream.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          <p className="muted tiny" style={{ margin: 0 }}>Hecho con IA a partir de {summary.comments ?? "los"} comentarios; las cantidades son aproximadas. Los comentarios ya se borraron.</p>
        </div>
      ) : ended ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row">
            <button className="btn primary sm" disabled={busy} onClick={generate}>{busy ? "Leyendo el chat… (hasta 1 min)" : "Resumir el chat con IA"}</button>
            <span className="muted tiny">Qué te pidieron, lo más comentado, preguntas e ideas para el próximo directo.</span>
          </div>
          {err && <div className={upgrade ? "warn small" : "err small"}>{err} {upgrade && <Link href="/planes" className="link">Ver planes</Link>}</div>}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>El resumen del chat estará disponible cuando termine el directo.</p>
      )}
    </div>
  );
}
