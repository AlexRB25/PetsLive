import { NextResponse } from "next/server";
import { platformVoices } from "@/lib/elevenlabs";
import { activeUser, db, fail } from "@/lib/server";

/** Voces de ElevenLabs de la plataforma y el cupo de caracteres del usuario este mes. */
export async function GET(req: Request) {
  const user = await activeUser(req);
  if (user instanceof NextResponse) return user;

  const plan = await db().rpc("effective_plan", { p_user: user.id });
  const [limit, usage] = await Promise.all([
    db().from("plans").select("tts_chars").eq("id", plan.data ?? "gratis").maybeSingle(),
    db().from("tts_usage").select("chars").eq("user_id", user.id).eq("month", new Date().toISOString().slice(0, 7) + "-01").maybeSingle(),
  ]);
  try {
    const voices = await platformVoices();
    return NextResponse.json({
      configured: Boolean(process.env.ELEVENLABS_API_KEY),
      voices,
      quota: { limit: limit.data?.tts_chars ?? 0, used: usage.data?.chars ?? 0 },
    });
  } catch (e) {
    return fail(`No se pudieron leer las voces: ${(e as Error).message}`, 502);
  }
}
