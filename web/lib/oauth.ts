// Parámetro "state" de OAuth firmado: dice qué usuario conectó la cuenta y caduca en 10 minutos.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const secret = () => Buffer.from(process.env.TOKENS_KEY || "", "base64");

export function signState(userId: string, platform: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, p: platform, e: Date.now() + 10 * 60000, n: randomBytes(8).toString("hex") })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readState(state: string | null, platform: string): string | null {
  const [payload, sig] = String(state ?? "").split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(createHmac("sha256", secret()).update(payload).digest("base64url"));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return d.p === platform && d.e > Date.now() && typeof d.u === "string" ? d.u : null;
  } catch {
    return null;
  }
}
