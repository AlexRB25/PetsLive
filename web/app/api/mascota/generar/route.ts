import { NextResponse } from "next/server";
import { DesignError, generateDesign } from "@/lib/ai-design";
import { authUser, db, dbConfigured, fail } from "@/lib/server";

export const maxDuration = 300;

/** Crea una mascota con IA a partir de una descripción. Gasta un lugar del cupo mensual del plan. */
export async function POST(req: Request) {
  if (!dbConfigured()) return fail("Falta configurar Supabase.", 503);
  if (!process.env.ANTHROPIC_API_KEY) return fail("La creación con IA todavía no está configurada.", 503);
  const user = await authUser(req);
  if (!user) return fail("Entra con tu cuenta.", 401);

  const body = await req.json().catch(() => null);
  const prompt = String(body?.prompt ?? "").replace(/\s+/g, " ").trim();
  if (prompt.length < 3) return fail("Describe tu mascota (por ejemplo: un zorro astronauta naranja con casco).");
  if (prompt.length > 300) return fail("La descripción es muy larga; usa menos de 300 caracteres.");

  const reserve = await db().rpc("reserve_ai_design", { p_user: user.id, p_prompt: prompt });
  if (reserve.error) return fail("No se pudo revisar tu cupo. Intenta de nuevo.", 502);
  if (!reserve.data) return fail("Ya usaste las mascotas con IA de tu plan este mes. Mejora tu plan o espera al próximo mes.", 402);
  const id = reserve.data as string;

  try {
    const { design, usage } = await generateDesign(prompt);
    const up = await db().from("ai_designs").update({ status: "lista", design }).eq("id", id);
    if (up.error) throw new Error(up.error.message);
    console.log("mascota IA", id, "tokens", usage.input_tokens, usage.output_tokens);
    return NextResponse.json({ id, design });
  } catch (e) {
    await db().from("ai_designs").update({ status: "fallida" }).eq("id", id);
    if (e instanceof DesignError) return fail(e.message, 422);
    console.error("Error al crear mascota con IA", e);
    return fail("No se pudo crear la mascota ahora. No se descontó de tu cupo; inténtalo de nuevo.", 502);
  }
}
