import Overlay from "./Overlay";

// ?fondo=verde (o azul, magenta) pinta un fondo sólido para quitarlo con chroma key en programas
// que no aceptan transparencia, como al capturar una ventana del navegador.
const FONDOS: Record<string, string> = { verde: "#00b140", azul: "#0047bb", magenta: "#ff00ff" };

export default async function OverlayPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ preview?: string; fondo?: string }> }) {
  const { key } = await params;
  const { preview, fondo } = await searchParams;
  return <Overlay overlayKey={key} preview={preview !== undefined} background={FONDOS[fondo ?? ""]} />;
}
