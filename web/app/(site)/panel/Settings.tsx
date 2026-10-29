"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG } from "@core/config.js";
import { speak } from "@/lib/speech";
import { REACTION_LABELS, type Connection, type MascotConfig } from "@/lib/types";
import Connections from "./Connections";
import MascotPicker from "./MascotPicker";
import GameSettings from "./GameSettings";
import type { GameState } from "@/lib/game-widget";
import VoicePicker from "./VoicePicker";
import Usage from "./Usage";

type Update = (fn: (c: MascotConfig) => void) => void;

const RULE_LABELS: Record<string, string> = {
  join: "Entrada de espectador", joinGroup: "Varias entradas juntas", chat: "Mención en el chat", follow: "Follow",
  like: "Likes (al llegar al umbral)", gift: "Regalo", giftBig: "Regalo grande", sub: "Suscripción / membresía",
  purchase: "Compra verificada", win: "Victoria (juego)", lose: "Derrota (juego)", scare: "Susto (juego)", command: "Comando del chat",
  idle: "Invitación cuando nadie interactúa",
};

const TABS = [
  ["mascota", "Mascota"], ["voz", "Voz"], ["limites", "Límites"], ["reglas", "Reglas y frases"],
  ["comandos", "Comandos"], ["juegos", "Juegos"], ["conexiones", "Conexiones"], ["uso", "Directos y resúmenes"],
] as const;

// Lee y escribe un valor por ruta ("behavior.maxPerMinute").
function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}
function set(obj: unknown, path: string, value: unknown) {
  const keys = path.split(".");
  const last = keys.pop()!;
  (keys.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as Record<string, unknown>)[last] = value;
}

function Field({ config, update, path, label, type = "text", ...rest }: {
  config: MascotConfig; update: Update; path: string; label: string; type?: string; min?: number; max?: number; step?: number; maxLength?: number; placeholder?: string;
}) {
  const v = get(config, path);
  if (type === "checkbox") {
    return (
      <label className="check"><input type="checkbox" checked={Boolean(v)} onChange={(e) => update((c) => set(c, path, e.target.checked))} /> {label}</label>
    );
  }
  const numeric = type === "number" || type === "range";
  return (
    <label>
      {label}{type === "range" ? `: ${v}` : ""}
      <input type={type} value={String(v ?? "")} {...rest} onChange={(e) => update((c) => set(c, path, numeric ? Number(e.target.value) : e.target.value))} />
    </label>
  );
}

function Select({ config, update, path, label, options }: { config: MascotConfig; update: Update; path: string; label: string; options: [string, string][] }) {
  return (
    <label>
      {label}
      <select value={String(get(config, path))} onChange={(e) => update((c) => set(c, path, e.target.value))}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

interface Props {
  config: MascotConfig;
  update: Update;
  resetConfig: (c: MascotConfig) => void;
  saved: string;
  connections: Connection[];
  reloadConnections: () => void;
  maxPlatforms: number;
  sessionActive: boolean;
  game: GameState | null;
  call: (path: string, body: unknown) => Promise<unknown>;
}

export default function Settings({ config, update, resetConfig, saved, connections, reloadConnections, maxPlatforms, sessionActive, game, call }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("mascota");
  const box = useRef<HTMLElement>(null);

  // Otros lugares del panel pueden abrir una pestaña (por ejemplo, "ir a Conexiones").
  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent).detail;
      if (TABS.some(([t]) => t === id)) {
        setTab(id);
        box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("petslive-tab", open);
    return () => window.removeEventListener("petslive-tab", open);
  }, []);
  const p = { config, update };

  return (
    <section ref={box} className="card" style={{ marginTop: 14 }}>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
        <span className="muted tiny" style={{ marginLeft: "auto", alignSelf: "center" }}>{saved}</span>
      </div>

      {tab === "mascota" && <MascotPicker config={config} update={update} />}
      {tab === "mascota" && (
        <div className="form">
          <Field {...p} path="mascot.name" label="Nombre" maxLength={24} />
          <Field {...p} path="mascot.body" label="Color del cuerpo" type="color" />
          <Field {...p} path="mascot.accent" label="Color de acento" type="color" />
          <Field {...p} path="mascot.eyes" label="Color de ojos" type="color" />
          <Select {...p} path="mascot.accessory" label="Accesorio" options={[["ninguno", "Ninguno"], ["gorra", "Gorra"], ["moño", "Moño"], ["corona", "Corona"]]} />
          <Field {...p} path="mascot.size" label="Tamaño (px)" type="range" min={80} max={800} step={10} />
          <Select {...p} path="mascot.position" label="Posición" options={[["abajo-derecha", "Abajo a la derecha"], ["abajo-izquierda", "Abajo a la izquierda"], ["arriba-derecha", "Arriba a la derecha"], ["arriba-izquierda", "Arriba a la izquierda"], ["centro", "Centro"], ["libre", "Libre (arrástrala en la vista previa)"]]} />
          <Field {...p} path="mascot.offsetX" label="Margen horizontal (px)" type="number" min={0} max={1000} />
          <Field {...p} path="mascot.offsetY" label="Margen vertical (px)" type="number" min={0} max={1000} />
        </div>
      )}

      {tab === "voz" && (
        <>
          <VoicePicker config={config} update={update} />
          <div className="form">
            <Select {...p} path="voice.output" label="¿Por dónde sale la voz?" options={[["overlay", "Desde el overlay (OBS) — recomendado"], ["panel", "Desde esta pestaña del panel"], ["off", "Sin voz"]]} />
            <Field {...p} path="voice.volume" label="Volumen" type="range" min={0} max={1} step={0.05} />
            <Field {...p} path="behavior.silent" label="Modo silencioso (sin voz ni globo)" type="checkbox" />
          </div>
          <p className="muted small">Desde el overlay: en OBS marca <strong>“Controlar audio a través de OBS”</strong> en la fuente de navegador y la voz saldrá en el directo. Desde el panel: deja esta pestaña abierta y captura el audio del escritorio.</p>
          <h3>Voz del navegador {config.voice.engine !== "navegador" && <span className="muted" style={{ textTransform: "none", letterSpacing: 0 }}>(se usa de respaldo)</span>}</h3>
          <div className="form">
            <Field {...p} path="voice.lang" label="Idioma" maxLength={12} placeholder="es-MX" />
            <Field {...p} path="voice.rate" label="Velocidad" type="range" min={0.5} max={2} step={0.05} />
            <Field {...p} path="voice.pitch" label="Tono" type="range" min={0} max={2} step={0.05} />
          </div>
          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => speak(`¡Hola! Soy ${config.mascot.name}.`, config.voice)}>Escuchar ejemplo</button>
        </>
      )}

      {tab === "limites" && (
        <>
          <div className="form">
            <Field {...p} path="behavior.paused" label="Mascota en pausa" type="checkbox" />
            <Field {...p} path="behavior.maxPerMinute" label="Máximo de reacciones por minuto" type="number" min={1} max={120} />
            <Field {...p} path="behavior.minGapMs" label="Pausa entre reacciones (ms)" type="number" min={0} max={10000} step={100} />
            <Field {...p} path="behavior.maxQueue" label="Tamaño máximo de la cola" type="number" min={1} max={50} />
            <Field {...p} path="behavior.maxWaitMs" label="Espera máxima en cola (ms)" type="number" min={2000} max={120000} step={1000} />
            <Field {...p} path="behavior.allowInterrupt" label="Lo importante interrumpe a lo menor" type="checkbox" />
            <Field {...p} path="behavior.interruptPriority" label="Prioridad que interrumpe (1–5)" type="number" min={1} max={5} />
            <Field {...p} path="behavior.userCooldownMs" label="Enfriamiento por usuario (ms)" type="number" min={0} step={1000} />
            <Field {...p} path="behavior.dedupWindowMs" label="Ventana de duplicados (ms)" type="number" min={0} step={1000} />
            <Field {...p} path="behavior.likeThreshold" label="Reaccionar cada N likes" type="number" min={1} />
            <Field {...p} path="behavior.likeWindowMs" label="Ventana de likes (ms)" type="number" min={1000} step={1000} />
            <Field {...p} path="behavior.joinBatchMs" label="Agrupar entradas durante (ms)" type="number" min={0} max={30000} step={500} />
            <Field {...p} path="behavior.giftMergeMs" label="Sumar combos de regalos (ms)" type="number" min={0} max={60000} step={500} />
            <Field {...p} path="behavior.bigGiftAmount" label="Regalo grande desde (valor)" type="number" min={1} />
            <Field {...p} path="behavior.commandCooldownMs" label="Enfriamiento de comandos (ms)" type="number" min={0} step={1000} />
            <Field {...p} path="behavior.idleAfterMs" label="Invitar a interactuar tras (ms sin actividad)" type="number" min={10000} step={5000} />
            <Field {...p} path="behavior.idleEveryMs" label="Repetir la invitación cada (ms)" type="number" min={15000} step={5000} />
            <Field {...p} path="behavior.schedule.enabled" label="Solo reaccionar en horario" type="checkbox" />
            <Field {...p} path="behavior.schedule.start" label="Desde" type="time" />
            <Field {...p} path="behavior.schedule.end" label="Hasta" type="time" />
            <Field {...p} path="behavior.fallbackName" label="Nombre genérico" maxLength={24} />
            <Field {...p} path="summary.saveComments" label="Guardar comentarios para el resumen del directo" type="checkbox" />
          </div>
          <p className="muted tiny">“Valor” de un regalo: diamantes en TikTok, bits en Twitch, monto en YouTube. El horario usa la hora del servidor.</p>
          <label className="block">
            Palabras bloqueadas en nombres (una por línea; si un nombre las contiene se usa el nombre genérico)
            <textarea rows={4} value={config.behavior.blockedWords.join("\n")}
              onChange={(e) => update((c) => { c.behavior.blockedWords = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean); })} />
          </label>
          <button className="btn sm ghost" onClick={() => confirm("¿Restaurar toda la configuración por defecto?") && resetConfig(DEFAULT_CONFIG as MascotConfig)}>Restaurar valores por defecto</button>
        </>
      )}

      {tab === "reglas" && (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Variables: <code>{"{user}"}</code> nombre, <code>{"{names}"}</code> lista de entradas, <code>{"{count}"}</code> likes, <code>{"{gift}"}</code> regalo, <code>{"{mascota}"}</code>.
            Una frase por línea; nunca repite la misma dos veces seguidas. Prioridad 5 es la más alta.
          </p>
          <div className="rules">
            {Object.entries(config.rules).map(([key, rule]) => {
              const r = rule as { enabled: boolean; priority: number; phrases: string[]; reaction?: string; onlyMentions?: boolean };
              const edit = (fn: (x: typeof r) => void) => update((c) => fn((c.rules as Record<string, typeof r>)[key]));
              return (
                <div key={key} className="rule">
                  <div className="row between">
                    <strong className="small">{RULE_LABELS[key] ?? key}</strong>
                    <label className="check tiny"><input type="checkbox" checked={r.enabled} onChange={(e) => edit((x) => { x.enabled = e.target.checked; })} /> activa</label>
                  </div>
                  <div className="opts">
                    {"reaction" in r ? (
                      <label>Reacción{" "}
                        <select value={r.reaction} onChange={(e) => edit((x) => { x.reaction = e.target.value; })}>
                          {Object.entries(REACTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </label>
                    ) : <span>Reacción: la del comando</span>}
                    <label>Prioridad{" "}
                      <select value={r.priority} onChange={(e) => edit((x) => { x.priority = Number(e.target.value); })}>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
                      </select>
                    </label>
                    {"onlyMentions" in r && (
                      <label className="check tiny"><input type="checkbox" checked={r.onlyMentions} onChange={(e) => edit((x) => { x.onlyMentions = e.target.checked; })} /> solo si la mencionan</label>
                    )}
                  </div>
                  <textarea rows={3} value={r.phrases.join("\n")} onChange={(e) => edit((x) => { x.phrases = e.target.value.split("\n"); })}
                    onBlur={() => edit((x) => { x.phrases = x.phrases.map((s) => s.trim()).filter(Boolean); })} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "comandos" && (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>Comandos del chat que hacen bailar, saltar o festejar a la mascota. Comparten un enfriamiento para evitar spam.</p>
          {Object.entries(config.commands).map(([cmd, reaction], i) => (
            <div key={i} className="cmd">
              <input type="text" maxLength={24} value={cmd} onChange={(e) => update((c) => {
                const entries = Object.entries(c.commands);
                entries[i] = [e.target.value.toLowerCase().replace(/\s/g, ""), reaction];
                c.commands = Object.fromEntries(entries);
              })} />
              <select value={reaction} onChange={(e) => update((c) => { (c.commands as Record<string, string>)[cmd] = e.target.value; })}>
                {Object.entries(REACTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button className="btn sm ghost" title="Quitar" onClick={() => update((c) => { delete (c.commands as Record<string, string>)[cmd]; })}>✕</button>
            </div>
          ))}
          <button className="btn sm" onClick={() => update((c) => { (c.commands as Record<string, string>)[`!nuevo${Object.keys(c.commands).length + 1}`] = "baile"; })}>Añadir comando</button>
          <p className="muted tiny">Cada comando empieza con “!” y no lleva espacios.</p>
        </>
      )}

      {tab === "conexiones" && <Connections connections={connections} reload={reloadConnections} maxPlatforms={maxPlatforms} sessionActive={sessionActive} />}
      {tab === "juegos" && <GameSettings config={config} update={update} state={game} call={call} />}
      {tab === "uso" && <Usage />}
    </section>
  );
}
