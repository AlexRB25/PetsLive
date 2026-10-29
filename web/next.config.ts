import path from "node:path";
import type { NextConfig } from "next";

// El motor y la mascota viven en ../core y se comparten con el worker.
const root = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
  // Las variables visibles en el navegador se llaman PB_* en lugar de NEXT_PUBLIC_*,
  // así que Next.js solo incluye las que se listan aquí.
  env: {
    PB_SUPABASE_URL: process.env.PB_SUPABASE_URL ?? "",
    PB_SUPABASE_PUBLISHABLE_KEY: process.env.PB_SUPABASE_PUBLISHABLE_KEY ?? "",
    PB_WORKER_URL: process.env.PB_WORKER_URL ?? "",
    // Versión publicada: el overlay se recarga solo cuando hay una nueva (ver /api/version).
    PB_BUILD: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
};

export default nextConfig;
