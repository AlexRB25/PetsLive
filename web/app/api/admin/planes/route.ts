import { NextResponse } from "next/server";
import { db, fail, requireAdmin } from "@/lib/server";

/** Planes y recargas, también los desactivados. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const [plans, packs] = await Promise.all([
    db().from("plans").select("*").order("sort"),
    db().from("hour_packs").select("*").order("sort"),
  ]);
  if (plans.error || packs.error) return fail("No se pudieron leer los planes.", 502);
  return NextResponse.json({ plans: plans.data, packs: packs.data });
}

const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};

/**
 * Edita un plan o una recarga: { table: "plans" | "hour_packs", id, patch }.
 * Cambiar el precio no modifica las suscripciones que ya existen en Mercado Pago.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const body = await req.json().catch(() => null);
  const table = body?.table === "hour_packs" ? "hour_packs" : body?.table === "plans" ? "plans" : null;
  const id = String(body?.id ?? "");
  const p = body?.patch ?? {};
  if (!table || !/^[a-z0-9_-]{1,32}$/.test(id)) return fail("Datos inválidos.");

  const patch: Record<string, unknown> = {};
  if (typeof p.name === "string" && p.name.trim()) patch.name = p.name.trim().slice(0, 40);
  if (typeof p.active === "boolean") patch.active = p.active;
  if (num(p.price_mxn, 0, 100000) !== undefined) patch.price_mxn = num(p.price_mxn, 0, 100000);
  if (num(p.minutes, 0, 1_000_000) !== undefined) patch.minutes = Math.round(num(p.minutes, 0, 1_000_000)!);
  if (num(p.sort, 0, 1000) !== undefined) patch.sort = Math.round(num(p.sort, 0, 1000)!);
  if (table === "plans") {
    if (num(p.max_platforms, 1, 4) !== undefined) patch.max_platforms = Math.round(num(p.max_platforms, 1, 4)!);
    if (num(p.ai_designs, 0, 1000) !== undefined) patch.ai_designs = Math.round(num(p.ai_designs, 0, 1000)!);
    if (typeof p.summaries === "boolean") patch.summaries = p.summaries;
    if (num(p.tts_chars, 0, 10_000_000) !== undefined) patch.tts_chars = Math.round(num(p.tts_chars, 0, 10_000_000)!);
    if (typeof p.description === "string") patch.description = p.description.slice(0, 200);
    if (id === "gratis") { delete patch.price_mxn; delete patch.active; }
  }
  if (!Object.keys(patch).length) return fail("No hay cambios.");

  const r = await db().from(table).update(patch).eq("id", id);
  if (r.error) return fail(r.error.message, 502);
  await db().from("admin_actions").insert({ admin_id: admin.id, user_id: null, action: `edit_${table}`, detail: { id, ...patch } });
  return NextResponse.json({ ok: true });
}
