// ElevenLabs desde el servidor: listar voces de una cuenta (la de la plataforma o la del streamer).

export interface Voice { id: string; name: string; preview: string; category: string; description: string }

export class ElevenLabsError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function listVoices(apiKey: string): Promise<Voice[]> {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": apiKey }, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (res.status === 401) throw new ElevenLabsError("La llave de ElevenLabs no es válida o no tiene permiso para leer voces.", 401);
  if (!res.ok) throw new ElevenLabsError(`ElevenLabs respondió ${res.status}.`, 502);
  const body = await res.json();
  return (body?.voices ?? []).map((v: Record<string, unknown>) => {
    const labels = (v.labels ?? {}) as Record<string, string>;
    return {
      id: String(v.voice_id),
      name: String(v.name ?? "Voz"),
      preview: String(v.preview_url ?? ""),
      category: String(v.category ?? ""),
      description: [labels.gender, labels.age, labels.accent, labels.description ?? labels.use_case].filter(Boolean).join(" · "),
    };
  });
}

let platformCache: { at: number; voices: Voice[] } | null = null;

/** Voces de la cuenta de la plataforma (ELEVENLABS_API_KEY), guardadas 1 hora. */
export async function platformVoices(): Promise<Voice[]> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return [];
  if (platformCache && Date.now() - platformCache.at < 3600000) return platformCache.voices;
  const voices = await listVoices(key);
  platformCache = { at: Date.now(), voices };
  return voices;
}
