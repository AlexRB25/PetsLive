import { NextResponse } from "next/server";
import { authUser } from "@/lib/server";

/** ¿La sesión actual es de un administrador? (para mostrar el enlace a /admin). */
export async function GET(req: Request) {
  const user = await authUser(req);
  return NextResponse.json({ admin: Boolean(user?.isAdmin) });
}
