import { NextResponse } from "next/server";
import { encryptJSON } from "@core/tokens.js";
import { readState } from "@/lib/oauth";
import { db, siteUrl } from "@/lib/server";

async function graph(path: string, params: Record<string, string>) {
  const r = await fetch(`https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || "v23.0"}/${path}?${new URLSearchParams(params)}`);
  return { ok: r.ok, body: await r.json().catch(() => null) };
}

/**
 * Facebook regresa aquí: código → token de usuario de larga duración → tokens de sus páginas
 * (no caducan mientras el permiso siga vigente). Se guardan cifrados; el panel solo ve los nombres.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = siteUrl(req);
  const back = (msg: string) => NextResponse.redirect(`${site}/panel?conexion=${encodeURIComponent(msg)}`);
  const userId = readState(url.searchParams.get("state"), "facebook");
  if (!userId) return back("La conexión con Facebook caducó; inténtalo de nuevo.");
  const code = url.searchParams.get("code");
  if (!code) return back("Cancelaste la conexión con Facebook.");

  const app = { client_id: process.env.FB_APP_ID!, client_secret: process.env.FB_APP_SECRET! };
  const short = await graph("oauth/access_token", { ...app, redirect_uri: `${site}/api/conectar/facebook/callback`, code });
  if (!short.ok || !short.body?.access_token) return back("Facebook no aceptó la conexión.");
  const long = await graph("oauth/access_token", { ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.body.access_token });
  const userToken = long.body?.access_token || short.body.access_token;

  const acc = await graph("me/accounts", { fields: "id,name,access_token", limit: "100", access_token: userToken });
  const list: { id: string; name: string; access_token: string }[] = acc.body?.data ?? [];
  if (!acc.ok || !list.length) return back("Tu cuenta de Facebook no administra ninguna página. Los directos solo se leen desde páginas.");

  const pages = Object.fromEntries(list.map((p) => [p.id, { name: p.name, token: p.access_token }]));
  const now = new Date().toISOString();
  const saved = await db().from("platform_tokens").upsert({ user_id: userId, platform: "facebook", data: encryptJSON({ pages }), updated_at: now });
  const prev = await db().from("connections").select("settings").eq("user_id", userId).eq("platform", "facebook").maybeSingle();
  const prevPage = prev.data?.settings?.pageId;
  const conn = await db().from("connections").upsert({
    user_id: userId,
    platform: "facebook",
    enabled: true,
    settings: { pageId: prevPage && pages[prevPage] ? prevPage : list[0].id, pages: list.map((p) => ({ id: p.id, name: p.name })) },
    updated_at: now,
  });
  if (saved.error || conn.error) return back("No se pudo guardar la conexión; inténtalo de nuevo.");
  return back(`Facebook conectado: ${list.length} página${list.length > 1 ? "s" : ""}`);
}
