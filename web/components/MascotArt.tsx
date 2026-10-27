"use client";
// La mascota como ilustración (portada, catálogo, miniaturas): un estado animado fijo, sin conexión al worker.
import { DEFAULT_CONFIG } from "@core/config.js";
import { MASCOT_CSS, mascotHTML } from "@core/mascot.js";
import type { MascotConfig } from "@/lib/types";

export default function MascotArt({ state = "baile", mascot, css = true }: { state?: string; mascot?: Partial<MascotConfig["mascot"]>; css?: boolean }) {
  const m = { ...DEFAULT_CONFIG.mascot, accessory: "corona", ...mascot };
  return (
    <>
      {css && <style>{MASCOT_CSS}</style>}
      <div className={`mascot st-${state}`} dangerouslySetInnerHTML={{ __html: mascotHTML(m) }} />
    </>
  );
}
