"use client";
import { authFetch, postJSON } from "@/lib/supabase-browser";

export async function getJSON<T>(url: string): Promise<T> {
  const res = await authFetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data as T;
}

export { postJSON };

export const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const dateTime = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—");
