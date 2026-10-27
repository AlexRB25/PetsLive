import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mascota LIVE · Tu mascota animada para transmisiones",
  description: "Una mascota que saluda, agradece regalos y reacciona en vivo en TikTok, YouTube, Twitch y Facebook.",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
