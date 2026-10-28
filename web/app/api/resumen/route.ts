import { NextResponse } from "next/server";
import { summarize, SummaryError } from "@/lib/live-summary";
import { UUID } from "@/lib/mercadopago";
import { activeUser, db, dbConfigured, fail } from "@/lib/server";

export const maxDuration = 300;

/**
 * Resumen con IA de un directo. Se genera una sola vez, la primera vez que el usuario lo pide;
 * después se borran los comentarios guardados y queda solo el resumen.
 */
export async function POST(req: Request) {
  if (!dbConfigured()) return fail("Falta configurar Supabase.", 503);
  const user = await activeUser(req);
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => null);
  const id = String(body?.session_id ?? "");
  if (!UUID.test(id)) return fail("Directo desconocido.");

  const ses = await db().from("live_sessions").select("id, summary, stats, minutes, ended_at").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (ses.error) return fail("No se pudo leer el directo.", 502);
  if (!ses.data) return fail("Directo desconocido.", 404);
  if (ses.data.summary) return NextResponse.json({ summary: ses.data.summary });
  if (!ses.data.ended_at) return fail("El resumen estará listo cuando termine el directo.");

  const plan = await db().rpc("effective_plan", { p_user: user.id });
  const allowed = plan.error ? null : await db().from("plans").select("summaries").eq("id", plan.data).single();
  if (!allowed?.data?.summaries) return fail("El resumen con IA está incluido en los planes Creator, Pro y Business.", 402);
  if (!process.env.ANTHROPIC_API_KEY) return fail("El resumen con IA todavía no está configurado.", 503);

  const comments = await db().from("session_comments").select("platform, text").eq("session_id", id).order("id").limit(5000);
  if (comments.error) return fail("No se pudieron leer los comentarios.", 502);
  if (comments.data.length < 5) {
    return fail("Este directo tuvo muy pocos comentarios guardados para hacer un resumen (o ya pasaron 30 días, o tenías desactivado guardarlos).", 422);
  }

  try {
    const { summary, usage } = await summarize(comments.data, ses.data.stats, ses.data.minutes);
    const saved = { ...summary, comments: comments.data.length, generated_at: new Date().toISOString() };
    const up = await db().from("live_sessions").update({ summary: saved }).eq("id", id);
    if (up.error) throw new Error(up.error.message);
    await db().from("session_comments").delete().eq("session_id", id);
    console.log("resumen", id, "comentarios", comments.data.length, "tokens", usage.input_tokens, usage.output_tokens);
    return NextResponse.json({ summary: saved });
  } catch (e) {
    if (e instanceof SummaryError) return fail(e.message, 422);
    console.error("Error al resumir directo", e);
    return fail("No se pudo hacer el resumen ahora. Inténtalo de nuevo en un momento.", 502);
  }
}
