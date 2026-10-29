// Reproduce la voz de cada reacción en el overlay o en el panel.
// Con la voz del navegador habla de inmediato; con grabaciones o ElevenLabs espera el audio que manda el worker
// (evento "audio") y, si no llega a tiempo o falla, usa la voz del navegador para no quedarse muda.
import { speak } from "./speech";
import type { MascotConfig } from "./types";

interface Play { id: number; text: string; resume?: boolean }
interface Audio { id: number; url?: string; fallback?: boolean }

const WAIT_MS = 4000;

export class VoicePlayer {
  private pending = new Map<number, { text: string; timer: ReturnType<typeof setTimeout> }>();
  private current: HTMLAudioElement | null = null;

  constructor(private workerUrl: string) {}

  play(p: Play, c: MascotConfig) {
    if (p.resume) return;
    if (c.voice.engine === "navegador") return speak(p.text, c.voice);
    const timer = setTimeout(() => {
      this.pending.delete(p.id);
      speak(p.text, c.voice);
    }, WAIT_MS);
    this.pending.set(p.id, { text: p.text, timer });
  }

  audio(a: Audio, c: MascotConfig) {
    const p = this.pending.get(a.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(a.id);
    if (!a.url) return speak(p.text, c.voice);
    this.stop();
    const el = new Audio(a.url.startsWith("/") ? `${this.workerUrl}${a.url}` : a.url);
    el.volume = c.voice.volume;
    this.current = el;
    el.play().catch(() => speak(p.text, c.voice));
  }

  stop() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
    this.current?.pause();
    this.current = null;
  }
}
