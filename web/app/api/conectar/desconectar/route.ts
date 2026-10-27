import { NextResponse } from "next/server";
import { authUser, db, fail } from "@/lib/server";

/** Borra los tokens guardados de Twitch o Facebook. */
export async function POST(req: Request) {
  const user = await authUser(req);
  if (!user) return fail("Entra con tu cuenta.", 401);
  const body = await req.json().catch(() => null);
  const platform = String(body?.platform ?? "");
  if (platform !== "twitch" && platform !== "facebook") return fail("Plataforma desconocida.");
  const del = await db().from("platform_tokens").delete().eq("user_id", user.id).eq("platform", platform);
  if (del.error) return fail("No se pudo desconectar.", 502);
  if (platform === "facebook") {
    await db().from("connections").update({ enabled: false, settings: {} }).eq("user_id", user.id).eq("platform", "facebook");
  } else {
    // El chat de Twitch sigue funcionando sin cuenta; solo se pierden los follows.
    const prev = await db().from("connections").select("settings").eq("user_id", user.id).eq("platform", "twitch").maybeSingle();
    await db().from("connections").update({ settings: { channel: prev.data?.settings?.channel ?? "" } }).eq("user_id", user.id).eq("platform", "twitch");
  }
  return NextResponse.json({ ok: true });
}
