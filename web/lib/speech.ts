// Voz local del navegador (sin costo). Elige una voz del idioma configurado si existe.
import type { MascotConfig } from "./types";

export function speak(text: string, v: MascotConfig["voice"]) {
  if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = v.lang;
  u.rate = v.rate;
  u.pitch = v.pitch;
  u.volume = v.volume;
  const base = v.lang.split("-")[0];
  const voices = speechSynthesis.getVoices();
  u.voice = voices.find((x) => x.lang === v.lang) || voices.find((x) => x.lang.startsWith(base)) || null;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
