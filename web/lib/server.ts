// Solo para rutas de API: usa la llave secreta de Supabase. Nunca importar desde componentes del cliente.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dbConfigured = () => Boolean(process.env.PB_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

let client: SupabaseClient | undefined;

/** Salta RLS: lee y escribe todas las tablas de schema.sql. */
export function db(): SupabaseClient {
  return (client ??= createClient(process.env.PB_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

export interface User {
  id: string;
  email: string;
  isAdmin: boolean;
  blocked: boolean;
}

/** Correos con acceso a /admin además de los perfiles marcados is_admin (ADMIN_EMAILS, separados por coma). */
const adminEmails = () => (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);

/** Usuario de la sesión (el cliente manda `Authorization: Bearer <access token>`). */
export async function authUser(req: Request): Promise<User | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token || !dbConfigured()) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return null;
  const email = data.user.email ?? "";
  const { data: profile } = await db().from("profiles").select("is_admin, blocked").eq("id", data.user.id).maybeSingle();
  return {
    id: data.user.id,
    email,
    isAdmin: Boolean(profile?.is_admin) || adminEmails().includes(email.toLowerCase()),
    blocked: Boolean(profile?.blocked),
  };
}

/** Usuario con sesión y sin suspender, o la respuesta de error. */
export async function activeUser(req: Request): Promise<User | NextResponse> {
  const user = await authUser(req);
  if (!user) return fail("Entra con tu cuenta.", 401);
  if (user.blocked) return fail("Tu cuenta está suspendida. Escríbenos si crees que es un error.", 403);
  return user;
}

/** Para /api/admin: el usuario si es administrador. */
export async function requireAdmin(req: Request): Promise<User | NextResponse> {
  if (!dbConfigured()) return fail("Falta configurar Supabase.", 503);
  const user = await authUser(req);
  return user?.isAdmin ? user : fail("No autorizado.", 403);
}

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export const siteUrl = (req: Request) => (process.env.SITE_URL || new URL(req.url).origin).replace(/\/+$/, "");
