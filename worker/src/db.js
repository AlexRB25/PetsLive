// Supabase con la llave secreta (salta RLS). Solo en el worker.
import { createClient } from '@supabase/supabase-js';

let client;

export function db() {
  return (client ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

const tokenCache = new Map(); // access token → { id, until }

/** Usuario dueño de un access token de Supabase (se guarda 60 s para no consultar en cada clic). */
export async function userFromToken(token) {
  if (!token) return null;
  const hit = tokenCache.get(token);
  if (hit && hit.until > Date.now()) return hit.id;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return null;
  if (tokenCache.size > 5000) tokenCache.clear();
  tokenCache.set(token, { id: data.user.id, until: Date.now() + 60000 });
  return data.user.id;
}
