// Voces de ElevenLabs: genera el audio de una frase y lo guarda en memoria para servirlo en /audio/<id>.mp3.
// Las frases repetidas (invitaciones, "¡GANAMOS!") salen de la caché y no se vuelven a pagar.
import { createHash } from 'node:crypto';

const API = 'https://api.elevenlabs.io/v1';
const MODEL = () => process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';
const MAX_ITEMS = 500;

const byId = new Map(); // id → Buffer (en orden de uso, para descartar los más viejos)
const byKey = new Map(); // voz|texto → id

const keyOf = (voice, text) => `${voice}|${text}`;

export function cachedAudio(voice, text) {
  const id = byKey.get(keyOf(voice, text));
  return id && byId.has(id) ? id : null;
}

export function getAudio(id) {
  const buf = byId.get(id);
  if (!buf) return null;
  byId.delete(id);
  byId.set(id, buf); // recién usado
  return buf;
}

function store(voice, text, buf) {
  const id = createHash('sha256').update(keyOf(voice, text)).digest('hex').slice(0, 32);
  byId.set(id, buf);
  byKey.set(keyOf(voice, text), id);
  while (byId.size > MAX_ITEMS) {
    const oldest = byId.keys().next().value;
    byId.delete(oldest);
    for (const [k, v] of byKey) if (v === oldest) byKey.delete(k);
  }
  return id;
}

/** Genera el audio (mp3) con ElevenLabs y devuelve su id en la caché. Lanza Error si falla. */
export async function synthesize(apiKey, voice, text) {
  const hit = cachedAudio(voice, text);
  if (hit) return hit;
  const res = await fetch(`${API}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL() }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return store(voice, text, Buffer.from(await res.arrayBuffer()));
}
