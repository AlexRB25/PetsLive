import { NextResponse } from "next/server";
import { decryptJSON, encryptJSON } from "@core/tokens.js";
import { ElevenLabsError, listVoices } from "@/lib/elevenlabs";
import { activeUser, db, fail } from "@/lib/server";

/** La cuenta de ElevenLabs del propio streamer: conectarla (POST), ver sus voces (GET) o quitarla (DELETE). */

async function savedKey(userId: string): Promise<string | null> {
  const r = await db().from("platform_tokens").select("data").eq("user_id", userId).eq("platform", "elevenlabs").maybeSingle();
  if (!r.data?.data) return null;
  try {
    return decryptJSON(r.data.data).apiKey ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const user = await activeUser(req);
  if (user instanceof NextResponse) return user;
  const key = await savedKey(user.id);
  if (!key) return NextResponse.json({ connected: false, voices: [] });
  try {
    return NextResponse.json({ connected: true, voices: await listVoices(key) });
  } catch (e) {
    const err = e as ElevenLabsError;
    return NextResponse.json({ connected: true, voices: [], error: err.message });
  }
}

export async function POST(req: Request) {
  const user = await activeUser(req);
  if (user instanceof NextResponse) return user;
  if (!process.env.TOKENS_KEY) return fail("Falta TOKENS_KEY en el servidor.", 503);
  const body = await req.json().catch(() => null);
  const apiKey = String(body?.apiKey ?? "").trim();
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(apiKey)) return fail("Pega tu API key de ElevenLabs (empieza con sk_).");
  let voices;
  try {
    voices = await listVoices(apiKey);
  } catch (e) {
    const err = e as ElevenLabsError;
    return fail(err.message, err.status === 401 ? 400 : 502);
  }
  const r = await db().from("platform_tokens").upsert({ user_id: user.id, platform: "elevenlabs", data: encryptJSON({ apiKey }), updated_at: new Date().toISOString() });
  if (r.error) return fail("No se pudo guardar la llave.", 502);
  return NextResponse.json({ connected: true, voices });
}

export async function DELETE(req: Request) {
  const user = await activeUser(req);
  if (user instanceof NextResponse) return user;
  const r = await db().from("platform_tokens").delete().eq("user_id", user.id).eq("platform", "elevenlabs");
  if (r.error) return fail("No se pudo quitar la llave.", 502);
  return NextResponse.json({ connected: false, voices: [] });
}
