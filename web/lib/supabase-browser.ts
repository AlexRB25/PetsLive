"use client";
// Cliente del navegador: sesión y tablas propias del usuario (protegidas por RLS).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.PB_SUPABASE_URL;
const key = process.env.PB_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);
export const WORKER_URL = (process.env.PB_WORKER_URL || "").replace(/\/+$/, "");

let client: SupabaseClient | undefined;

export function supabase(): SupabaseClient {
  return (client ??= createClient(url || "https://sin-configurar.supabase.co", key || "sin-configurar"));
}

/** fetch con el token de la sesión para las rutas que piden usuario (web o worker). */
export async function authFetch(input: string, init: RequestInit = {}) {
  const { data } = await supabase().auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers });
}

/** POST JSON a una ruta y devuelve el cuerpo; lanza Error con el mensaje del servidor. */
export async function postJSON<T = Record<string, unknown>>(input: string, body: unknown = {}): Promise<T> {
  const res = await authFetch(input, { method: "POST", body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data as T;
}

export function authErrorMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    case "user_already_exists":
    case "email_exists":
      return "Ya existe una cuenta con ese correo.";
    case "weak_password":
      return "La contraseña es demasiado débil. Usa al menos 8 caracteres.";
    case "email_not_confirmed":
      return "Confirma tu correo con el enlace que te enviamos antes de entrar.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Demasiados intentos. Espera un momento y vuelve a probar.";
    case "email_address_invalid":
    case "validation_failed":
      return "Revisa el correo y la contraseña.";
    default:
      if (/fetch|network/i.test(error.message)) return "No se pudo conectar con el servidor. Revisa tu conexión.";
      return `Algo salió mal: ${error.message}`;
  }
}
