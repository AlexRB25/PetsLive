// Resumen de un directo con IA a partir de sus comentarios (sin nombres de usuario).
import Anthropic from "@anthropic-ai/sdk";

const PLATFORMS = ["tiktok", "youtube", "twitch", "facebook"];
const MAX_LINES = 2500;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "mood", "topics", "requests", "questions", "highlights", "platformNotes", "nextStream"],
  properties: {
    overview: { type: "string", description: "2 o 3 frases sobre cómo fue el directo según el chat" },
    mood: {
      type: "object",
      additionalProperties: false,
      required: ["label", "note"],
      properties: { label: { type: "string", enum: ["positivo", "neutral", "mixto", "negativo"] }, note: { type: "string" } },
    },
    topics: {
      type: "array",
      description: "Lo más comentado, de más a menos",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "mentions"],
        properties: { title: { type: "string" }, detail: { type: "string" }, mentions: { type: "integer" } },
      },
    },
    requests: {
      type: "array",
      description: "Lo que la audiencia pidió (contenido, juegos, retos, productos…), de más a menos pedido",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["request", "mentions", "idea"],
        properties: { request: { type: "string" }, mentions: { type: "integer" }, idea: { type: "string", description: "Cómo podría aprovecharlo el streamer" } },
      },
    },
    questions: {
      type: "array",
      description: "Preguntas que se repitieron",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "mentions"],
        properties: { question: { type: "string" }, mentions: { type: "integer" } },
      },
    },
    highlights: { type: "array", items: { type: "string" }, description: "Momentos que generaron más reacción" },
    platformNotes: {
      type: "array",
      description: "Diferencias entre plataformas, solo si hubo más de una",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["platform", "note"],
        properties: { platform: { type: "string", enum: PLATFORMS }, note: { type: "string" } },
      },
    },
    nextStream: { type: "array", items: { type: "string" }, description: "Sugerencias concretas para el próximo directo" },
  },
} as const;

const SYSTEM = `Analizas el chat de una transmisión en vivo para el streamer y le das un resumen útil en español.

Recibes las estadísticas del directo por plataforma y los comentarios en orden, uno por línea, con su plataforma entre corchetes. "×N" significa que ese mismo comentario se repitió N veces.

Reglas:
- Sé concreto y accionable: qué pidieron, qué gustó, qué preguntaron, qué hacer la próxima vez.
- "mentions" son cuentas aproximadas a partir de los comentarios; no inventes cifras mayores a lo que ves.
- No incluyas nombres de usuario, datos personales ni insultos; parafrasea en vez de citar textos ofensivos.
- Si hay pocos comentarios o casi todo es saludo o spam, dilo con honestidad y deja listas cortas o vacías.
- Ignora los comandos de la mascota (por ejemplo "!baila") salvo para notar que se usaron mucho.
- Hasta 6 elementos por lista.`;

export interface Comment { platform: string; text: string }

/** Junta comentarios repetidos (×N) y recorta a un máximo de líneas conservando los repetidos. */
export function compactComments(comments: Comment[]) {
  const map = new Map<string, { platform: string; text: string; count: number; first: number }>();
  comments.forEach((c, i) => {
    const key = `${c.platform}|${c.text.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const hit = map.get(key);
    if (hit) hit.count++;
    else map.set(key, { platform: c.platform, text: c.text.replace(/\s+/g, " ").trim(), count: 1, first: i });
  });
  let lines = [...map.values()];
  if (lines.length > MAX_LINES) {
    const repeated = lines.filter((l) => l.count > 1);
    const singles = lines.filter((l) => l.count === 1);
    const room = Math.max(0, MAX_LINES - repeated.length);
    const step = singles.length / Math.max(1, room);
    const sample = room ? Array.from({ length: room }, (_, k) => singles[Math.floor(k * step)]) : [];
    lines = [...repeated.slice(0, MAX_LINES), ...sample].sort((a, b) => a.first - b.first);
  }
  return { text: lines.map((l) => `[${l.platform}] ${l.text}${l.count > 1 ? ` ×${l.count}` : ""}`).join("\n"), unique: map.size };
}

export class SummaryError extends Error {}

let client: Anthropic | undefined;

export async function summarize(comments: Comment[], stats: unknown, minutes: number) {
  client ??= new Anthropic();
  const { text, unique } = compactComments(comments);
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `Duración cobrada: ${minutes} min. Comentarios: ${comments.length} (${unique} distintos).\nEstadísticas por plataforma: ${JSON.stringify(stats)}\n\nComentarios:\n${text}`,
    }],
  });
  if (res.stop_reason === "refusal") throw new SummaryError("No se pudo resumir este directo.");
  if (res.stop_reason === "max_tokens") throw new SummaryError("El resumen salió demasiado largo. Inténtalo de nuevo.");
  const block = res.content.find((b) => b.type === "text");
  try {
    return { summary: JSON.parse(block && "text" in block ? block.text : ""), usage: res.usage };
  } catch {
    throw new SummaryError("La IA no devolvió un resumen válido. Inténtalo de nuevo.");
  }
}
