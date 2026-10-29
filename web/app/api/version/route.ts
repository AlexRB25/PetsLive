// Versión publicada de la web; el overlay la compara con la suya para recargarse solo.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ build: process.env.PB_BUILD }, { headers: { "Cache-Control": "no-store" } });
}
