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
}

/** Usuario de la sesión (el cliente manda `Authorization: Bearer <access token>`). */
export async function authUser(req: Request): Promise<User | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token || !dbConfigured()) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export const siteUrl = (req: Request) => (process.env.SITE_URL || new URL(req.url).origin).replace(/\/+$/, "");
