// Mascota creada con IA: Claude diseña el personaje como formas simples por partes (JSON con esquema),
// no como SVG libre. Así se puede validar (nada de scripts ni enlaces) y anima igual que el catálogo.
import Anthropic from "@anthropic-ai/sdk";
import { CATALOG, COLOR_TOKENS, PARTS, SHAPES, TOP_ANIMS, validateDesign } from "@core/mascot.js";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "topAnim", "headTop", "faceY", "colors", "shapes"],
  properties: {
    name: { type: "string", description: "Nombre corto en español para el personaje" },
    topAnim: { type: "string", enum: TOP_ANIMS },
    headTop: { type: "number", description: "y de la parte de arriba de la cabeza (donde se apoya un sombrero)" },
    faceY: { type: "number", description: "Desplazamiento vertical de la cara, entre -40 y 40" },
    colors: {
      type: "object",
      additionalProperties: false,
      required: ["body", "accent", "extra1", "extra2"],
      properties: {
        body: { type: "string", description: "Color principal #rrggbb" },
        accent: { type: "string", description: "Color de acento #rrggbb" },
        extra1: { type: "string", description: "Color de detalle #rrggbb" },
        extra2: { type: "string", description: "Otro color de detalle #rrggbb" },
      },
    },
    shapes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["part", "kind", "nums", "fill", "stroke", "strokeWidth", "d"],
        properties: {
          part: { type: "string", enum: PARTS },
          kind: { type: "string", enum: SHAPES },
          nums: { type: "array", items: { type: "number" } },
          fill: { type: "string", enum: COLOR_TOKENS },
          stroke: { type: "string", enum: COLOR_TOKENS },
          strokeWidth: { type: "number" },
          d: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM = `Diseñas mascotas 2D tiernas y originales para transmisiones en vivo. Respondes con un diseño en JSON que se dibuja en un lienzo SVG de 200 × 230 (x hacia la derecha, y hacia abajo). El suelo está en y≈215.

Cómo se dibuja:
- Partes, de atrás hacia adelante: back (cola, alas, capa), top (orejas, cuernos, antena, flama, pelo), footL, footR, armL, armR, body, belly (panza, hocico), [la cara], front (bigotes, detalles encima). "L" es el lado izquierdo de la imagen (x pequeña).
- La cara la dibuja el sistema, no tú: ojos en (78,108) y (122,108) de unos 14 de radio, boca en (100,140), cachetes en (66,132) y (134,132). faceY la mueve en vertical. El body (y belly) debe cubrir por completo x 55–145 e y 85–160 (después de sumar faceY) para que la cara quede sobre el cuerpo. No dibujes ojos, boca ni nariz; no tapes la cara con formas de front.
- Los brazos se animan girando: armL cuelga al lado izquierdo del cuerpo y gira desde la parte de arriba hacia el cuerpo (80 % de su ancho, 15 % de su alto); armR es su espejo (x → 200 − x). Cada brazo en su parte, como una sola forma alargada vertical (por ejemplo elipse rx≈14 ry≈24 con centro cerca de x 38 y 162, y≈140).
- Los pies van abajo (y≈205), footL y footR en espejo.
- headTop es la y de la parte de arriba de la cabeza sin contar orejas ni antenas (ahí se pone un sombrero o corona). topAnim: "flicker" para flamas o pelo, "wiggle" para orejas o antenas, "none" si no hay top.

Formas (nums según el tipo; d solo para path, "" en los demás):
- ellipse: [cx, cy, rx, ry] · circle: [cx, cy, r] · rect: [x, y, ancho, alto, radio_esquina] · polygon: [x1, y1, x2, y2, …] · path: nums [] y d con comandos SVG (M L C Q A Z…) solo con números.
- fill y stroke son nombres de la paleta: body, bodyDark (borde), bodyLight (panza), accent, accentLight, eyes, white, extra1, extra2, none. Pon los colores reales en "colors" (#rrggbb). Contornos: stroke bodyDark, strokeWidth 4–5.

Estilo: formas redondeadas y gruesas, pocas piezas (entre 8 y 35), silueta clara y reconocible a tamaño pequeño, colores alegres con buen contraste. Debe ser un personaje original: si piden un personaje, marca o logo famoso, crea una criatura original inspirada en la idea general, sin copiarlo. El nombre, corto y en español.`;

const EXAMPLES = `Ejemplos de diseños válidos (gato y robot del catálogo):
${JSON.stringify(CATALOG.gato)}
${JSON.stringify(CATALOG.robot)}`;

let client: Anthropic | undefined;

export class DesignError extends Error {}

/** Pide el diseño a Claude y lo valida. Lanza DesignError con un mensaje para el usuario. */
export async function generateDesign(prompt: string) {
  client ??= new Anthropic();
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `${EXAMPLES}\n\nCrea esta mascota: ${prompt}` }],
  });
  if (res.stop_reason === "refusal") throw new DesignError("No podemos crear esa mascota. Prueba con otra descripción.");
  if (res.stop_reason === "max_tokens") throw new DesignError("El diseño salió demasiado largo. Prueba con una descripción más simple.");
  const text = res.content.find((b) => b.type === "text");
  let raw: unknown;
  try {
    raw = JSON.parse(text && "text" in text ? text.text : "");
  } catch {
    throw new DesignError("La IA no devolvió un diseño válido. Inténtalo de nuevo.");
  }
  const design = validateDesign(raw);
  if (!design || design.shapes.length < 3) throw new DesignError("El diseño no salió bien. Inténtalo de nuevo con más detalles.");
  return { design, usage: res.usage };
}
