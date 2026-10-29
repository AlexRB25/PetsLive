// Dibujo del juego "¡Llévame a la cima!" en el overlay: montaña, mini mascota que escala, marcador,
// cómo se gana o pierde altura, y "+10 Ana" / "−20 Rosa" flotando con cada cambio.
import { mascotHTML } from "@core/mascot.js";
import type { MascotConfig } from "./types";

export interface GameState {
  enabled: boolean; title: string; goal: number; side: "izquierda" | "derecha"; top: number; height: number;
  progress: number; wins: number; won: boolean;
  legend: { event: string; match: string; points: number; per: number }[];
  delta?: number; by?: string; gift?: string;
}

export const GAME_CSS = `
.game { position: absolute; width: 340px; display: none; flex-direction: column; align-items: center; gap: 10px;
  font-family: "Nunito", "Segoe UI Rounded", "Segoe UI", system-ui, sans-serif; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,.6); }
.game.on { display: flex; }
.game.izquierda { left: 24px; } .game.derecha { right: 24px; }
.g-title { font-size: 30px; font-weight: 900; text-align: center; line-height: 1.1; padding: 8px 14px; border-radius: 16px;
  background: rgba(20, 16, 36, .72); border: 3px solid rgba(255,255,255,.25); }
.g-mountain { position: relative; width: 340px; flex: 1; margin-top: 46px; }
.g-rock { position: absolute; inset: 0; clip-path: polygon(50% 0, 60% 14%, 66% 10%, 100% 100%, 0 100%, 34% 12%, 42% 6%);
  background: linear-gradient(180deg, #8ea2c8 0%, #5b6d96 45%, #3a4566 100%); }
.g-snow { position: absolute; left: 0; right: 0; top: 0; height: 26%; clip-path: polygon(50% 0, 60% 52%, 66% 38%, 74% 100%, 62% 80%, 50% 96%, 38% 80%, 26% 100%, 34% 46%, 42% 22%);
  background: linear-gradient(180deg, #fff, #dde6f7); }
.g-path { position: absolute; left: 50%; top: 6%; bottom: 0; border-left: 5px dashed rgba(255,255,255,.55); transform: translateX(-50%); }
.g-fill { position: absolute; left: 50%; bottom: 0; width: 10px; border-radius: 6px; transform: translateX(-50%);
  background: linear-gradient(0deg, #22c55e, #facc15); transition: height .6s cubic-bezier(.2,1.2,.4,1); box-shadow: 0 0 12px rgba(250,204,21,.7); }
.g-flag { position: absolute; left: 50%; top: -44px; transform: translateX(-10%); width: 48px; height: 48px; }
.g-climber { position: absolute; left: 50%; width: 104px; transform: translate(-50%, 50%); transition: bottom .6s cubic-bezier(.2,1.2,.4,1); }
.g-climber.hit { animation: g-shake .45s linear; }
.g-count { font-size: 34px; font-weight: 900; padding: 4px 16px; border-radius: 14px; background: rgba(20, 16, 36, .72); }
.g-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
.g-chip { font-size: 18px; font-weight: 800; padding: 3px 10px; border-radius: 999px; background: rgba(20, 16, 36, .72); }
.g-chip.up { color: #86efac; } .g-chip.down { color: #fca5a5; }
.g-float { position: absolute; left: 50%; font-size: 30px; font-weight: 900; white-space: nowrap; pointer-events: none;
  animation: g-float 1.6s ease-out forwards; }
.g-float.up { color: #4ade80; } .g-float.down { color: #f87171; }
.game.won .g-title { animation: g-pulse .6s ease-in-out infinite alternate; background: rgba(250, 204, 21, .9); color: #231a35; text-shadow: none; }
@keyframes g-float { from { transform: translate(-50%, 0); opacity: 1; } to { transform: translate(-50%, -120px); opacity: 0; } }
@keyframes g-shake { 0%, 100% { margin-left: 0; } 25% { margin-left: -14px; } 75% { margin-left: 14px; } }
@keyframes g-pulse { to { transform: scale(1.08); } }
`;

const FLAG = `<svg class="g-flag" viewBox="0 0 48 48"><rect x="8" y="4" width="4" height="42" rx="2" fill="#e5e7eb"/><path d="M12 6 L42 13 L12 22 Z" fill="#f43f5e"/></svg>`;

const LABEL: Record<string, string> = { follow: "Follow", sub: "Suscripción", join: "Entrada", gift: "Regalo" };

function legendText(r: GameState["legend"][number]) {
  const pts = `${r.points > 0 ? "+" : "−"}${Math.abs(r.points)}`;
  const first = r.match.split(",")[0]?.trim() ?? "";
  if (r.event === "like") return `${r.per} likes ${pts}`;
  if (r.event === "chat") return `Escribe ${first} ${pts}`;
  if (r.event === "gift" && first) return `${first[0].toUpperCase()}${first.slice(1)} ${pts}`;
  return `${r.per > 1 ? `${r.per} ` : ""}${LABEL[r.event] ?? r.event} ${pts}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class GameWidget {
  private root: HTMLDivElement;
  private climber: HTMLDivElement;
  private fill: HTMLDivElement;
  private count: HTMLDivElement;
  private title: HTMLDivElement;
  private legend: HTMLDivElement;
  private mountain: HTMLDivElement;
  private look = "";
  private poseTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(parent: HTMLElement, private onWin: () => void) {
    this.root = document.createElement("div");
    this.root.className = "game";
    this.root.innerHTML = `<div class="g-title"></div>
      <div class="g-mountain"><div class="g-rock"></div><div class="g-snow"></div><div class="g-path"></div><div class="g-fill"></div>${FLAG}<div class="g-climber"><div class="mascot st-reposo"></div></div></div>
      <div class="g-count"></div><div class="g-legend"></div>`;
    parent.appendChild(this.root);
    const q = (s: string) => this.root.querySelector(s) as HTMLDivElement;
    this.title = q(".g-title");
    this.mountain = q(".g-mountain");
    this.fill = q(".g-fill");
    this.climber = q(".g-climber");
    this.count = q(".g-count");
    this.legend = q(".g-legend");
  }

  private pose(state: string, ms: number) {
    const m = this.climber.firstElementChild as HTMLDivElement;
    m.className = "mascot";
    void m.offsetWidth;
    m.className = `mascot st-${state}`;
    clearTimeout(this.poseTimer);
    if (ms) this.poseTimer = setTimeout(() => { m.className = "mascot st-reposo"; }, ms);
  }

  update(s: GameState, mascot: MascotConfig["mascot"]) {
    this.root.classList.toggle("on", s.enabled);
    if (!s.enabled) return;
    this.root.className = `game on ${s.side}${s.won ? " won" : ""}`;
    this.root.style.top = `${s.top}%`;
    this.root.style.height = `${s.height}px`;

    // Mini mascota con la misma apariencia que la grande (sin accesorio para que quepa).
    const look = JSON.stringify([mascot.kind, mascot.species, mascot.design, mascot.images, mascot.body, mascot.accent, mascot.eyes]);
    if (look !== this.look) {
      (this.climber.firstElementChild as HTMLDivElement).innerHTML = mascotHTML({ ...mascot, accessory: "ninguno" });
      this.look = look;
    }

    this.title.textContent = s.won ? "¡CIMA!" : s.title;
    const pct = Math.min(100, (s.progress / s.goal) * 100);
    this.fill.style.height = `${pct * 0.9}%`;
    this.climber.style.bottom = `${pct * 0.9}%`;
    this.count.textContent = `${s.progress} / ${s.goal}`;
    this.legend.innerHTML = s.legend.slice(0, 6).map((r) => `<span class="g-chip ${r.points > 0 ? "up" : "down"}">${esc(legendText(r))}</span>`).join("");

    if (s.delta) {
      const f = document.createElement("div");
      f.className = `g-float ${s.delta > 0 ? "up" : "down"}`;
      f.style.bottom = `${pct * 0.9 + 8}%`;
      f.textContent = `${s.delta > 0 ? "+" : "−"}${Math.abs(s.delta)}${s.by ? ` ${s.by}` : ""}`;
      this.mountain.appendChild(f);
      setTimeout(() => f.remove(), 1700);
      if (s.delta < 0) {
        this.climber.classList.remove("hit");
        void this.climber.offsetWidth;
        this.climber.classList.add("hit");
        this.pose("sorpresa", 1200);
      } else {
        this.pose("salto", 900);
      }
    }
    if (s.won && s.delta) {
      this.pose("celebracion", 0);
      this.onWin();
    } else if (!s.won && !s.delta && this.look) {
      this.pose("reposo", 0);
    }
  }
}
