import Overlay from "./Overlay";

export default async function OverlayPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { key } = await params;
  const { preview } = await searchParams;
  return <Overlay overlayKey={key} preview={preview !== undefined} />;
}
