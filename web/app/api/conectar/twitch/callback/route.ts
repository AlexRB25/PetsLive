import { NextResponse } from "next/server";
import { encryptJSON } from "@core/tokens.js";
import { readState } from "@/lib/oauth";
import { db, siteUrl } from "@/lib/server";

/** Twitch regresa aquí: se cambia el código por tokens, se cifran y se guarda el canal. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = siteUrl(req);
  const back = (msg: string) => NextResponse.redirect(`${site}/panel?conexion=${encodeURIComponent(msg)}`);
  const userId = readState(url.searchParams.get("state"), "twitch");
  if (!userId) return back("La conexión con Twitch caducó; inténtalo de nuevo.");
  const code = url.searchParams.get("code");
  if (!code) return back("Cancelaste la conexión con Twitch.");

  const tok = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID!,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${site}/api/conectar/twitch/callback`,
    }),
  });
  const t = await tok.json().catch(() => null);
  if (!tok.ok || !t?.access_token) return back("Twitch no aceptó la conexión.");

  const me = await fetch("https://api.twitch.tv/helix/users", {
    headers: { "Client-Id": process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${t.access_token}` },
  });
  const u = (await me.json().catch(() => null))?.data?.[0];
  if (!me.ok || !u) return back("No se pudo leer tu cuenta de Twitch.");

  const data = encryptJSON({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Date.now() + (t.expires_in || 3600) * 1000,
    user_id: u.id,
    login: u.login,
  });
  const now = new Date().toISOString();
  const saved = await db().from("platform_tokens").upsert({ user_id: userId, platform: "twitch", data, updated_at: now });
  const conn = await db().from("connections").upsert({ user_id: userId, platform: "twitch", enabled: true, settings: { channel: u.login, account: u.display_name }, updated_at: now });
  if (saved.error || conn.error) return back("No se pudo guardar la conexión; inténtalo de nuevo.");
  return back(`Twitch conectado: ${u.display_name}`);
}
