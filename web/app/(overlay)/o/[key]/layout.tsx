import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mascota · Overlay", robots: { index: false } };

// Layout propio sin estilos del sitio: fondo transparente para la fuente de navegador de OBS.
export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: "transparent", overflow: "hidden" }}>{children}</body>
    </html>
  );
}
