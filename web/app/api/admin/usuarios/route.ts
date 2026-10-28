import { NextResponse } from "next/server";
import { db, fail, requireAdmin } from "@/lib/server";

const PAGE = 50;

/** Lista de usuarios con búsqueda por correo o id. ?q=…&page=0 */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const page = Math.max(0, Number(url.searchParams.get("page")) || 0);
  const r = await db().rpc("admin_users", { p_search: q, p_limit: PAGE, p_offset: page * PAGE });
  if (r.error) return fail(`No se pudo leer la lista: ${r.error.message}`, 502);
  return NextResponse.json({ ...r.data, page, pageSize: PAGE });
}
