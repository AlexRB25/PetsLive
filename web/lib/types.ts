import type { DEFAULT_CONFIG } from "@core/config.js";
import type { validateDesign } from "@core/mascot.js";

export type Design = NonNullable<ReturnType<typeof validateDesign>>;

type Defaults = typeof DEFAULT_CONFIG;
export type MascotConfig = Omit<Defaults, "commands" | "mascot"> & {
  commands: Record<string, string>;
  mascot: Omit<Defaults["mascot"], "design" | "kind" | "species"> & { kind: string; species: string; design: Design | null };
};

export type Platform = "twitch" | "youtube" | "facebook" | "tiktok";

export interface Connection {
  platform: Platform;
  enabled: boolean;
  settings: Record<string, unknown>;
}

export interface Plan {
  id: string;
  name: string;
  price_mxn: number;
  minutes: number;
  max_platforms: number;
  ai_designs: number;
  summaries: boolean;
  tts_chars: number;
  description: string;
  sort: number;
}

export interface HourPack {
  id: string;
  name: string;
  minutes: number;
  price_mxn: number;
  sort: number;
}

export interface AccountStatus {
  plan: Plan;
  plan_minutes: number;
  extra_minutes: number;
  period_end: string;
  subscription: { plan_id: string; status: string; next_payment_date: string | null; paid_until: string | null } | null;
}

export interface LogEntry {
  ts: number;
  kind: string;
  source?: string;
  user?: string;
  action: string;
  detail?: string;
}

export interface EngineState {
  current: { reaction: string; label: string; priority: number; remaining: number } | null;
  queue: { id: number; reaction: string; label: string; priority: number }[];
  playsLastMinute: number;
  likes: number;
  inSchedule: boolean;
}

export interface SessionInfo {
  active: boolean;
  startedAt?: number;
  minutes?: number;
  remaining?: number;
  platforms?: Platform[];
  events?: number;
  reactions?: number;
  lastEnd?: { reason: string; at: number; minutes: number } | null;
}

export type PlatformStatus = Partial<Record<Platform, { state: string; text: string }>>;

export const REACTION_LABELS: Record<string, string> = {
  saludo: "Saludo",
  salto: "Salto",
  baile: "Baile",
  sorpresa: "Sorpresa",
  celebracion: "Celebración",
  tristeza: "Tristeza cómica",
  agradecimiento: "Agradecimiento",
};

export const PLATFORM_LABELS: Record<Platform, string> = { twitch: "Twitch", youtube: "YouTube", facebook: "Facebook", tiktok: "TikTok" };

export const hours = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
};

export const mxn = (n: number) => `$${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN`;
