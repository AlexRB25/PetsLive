import { NextResponse } from "next/server";
import { signState } from "@/lib/oauth";
import { authUser, fail, siteUrl } from "@/lib/server";

/** Inicia la conexión de la cuenta de Twitch (para recibir follows). Responde con la URL de autorización. */
export async function POST(req: Request) {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET || !process.env.TOKENS_KEY) return fail("Twitch todavía no está configurado en el servidor.", 503);
  const user = await authUser(req);
  if (!user) return fail("Entra con tu cuenta.", 401);
  const q = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    redirect_uri: `${siteUrl(req)}/api/conectar/twitch/callback`,
    response_type: "code",
    scope: "moderator:read:followers",
    state: signState(user.id, "twitch"),
    force_verify: "true",
  });
  return NextResponse.json({ url: `https://id.twitch.tv/oauth2/authorize?${q}` });
}
