import { NextResponse } from "next/server";
import { db, fail, requireAdmin } from "@/lib/server";

/** Métricas del negocio para /admin. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const r = await db().rpc("admin_metrics");
  if (r.error) return fail(`No se pudieron leer las métricas: ${r.error.message}`, 502);
  return NextResponse.json(r.data);
}
