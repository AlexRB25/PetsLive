import { NextResponse } from "next/server";
import { CURRENCY, mercadoPago, paymentsConfigured } from "@/lib/mercadopago";
import { activeUser, db, dbConfigured, fail, siteUrl } from "@/lib/server";

/** Compra de créditos de IA (pago único con Checkout Pro). Los créditos no caducan. */
export async function POST(req: Request) {
  if (!dbConfigured() || !paymentsConfigured()) return fail("Los pagos todavía no están configurados.", 503);
  const user = await activeUser(req);
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => null);
  const pack = await db().from("credit_packs").select("id, name, price_mxn").eq("id", String(body?.pack ?? "")).eq("active", true).maybeSingle();
  if (pack.error) return fail("No se pudo leer el paquete.", 502);
  if (!pack.data) return fail("Ese paquete no existe.");

  const site = siteUrl(req);
  const back = `${site}/panel?creditos=1`;
  const res = await mercadoPago("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      items: [{ id: pack.data.id, title: `Mascota LIVE · ${pack.data.name} de IA`, quantity: 1, unit_price: Number(pack.data.price_mxn), currency_id: CURRENCY }],
      external_reference: `credits:${user.id}:${pack.data.id}`,
      payer: { email: user.email },
      back_urls: { success: back, pending: back, failure: back },
      auto_return: "approved",
      notification_url: `${site}/api/mercadopago/webhook`,
    }),
  });
  const pref = await res.json().catch(() => null);
  if (!res.ok || !pref?.init_point) {
    console.error("Mercado Pago no creó la preferencia", res.status, pref);
    return fail(`Mercado Pago no aceptó la compra${pref?.message ? `: ${pref.message}` : "."}`, 502);
  }
  return NextResponse.json({ url: pref.init_point });
}
