import { NextResponse } from "next/server";
import { CURRENCY, mercadoPago, paymentsConfigured } from "@/lib/mercadopago";
import { activeUser, db, dbConfigured, fail, siteUrl } from "@/lib/server";

/** Recarga de horas en vivo (pago único con Checkout Pro). Las horas extra no caducan. */
export async function POST(req: Request) {
  if (!dbConfigured() || !paymentsConfigured()) return fail("Los pagos todavía no están configurados.", 503);
  const user = await activeUser(req);
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => null);
  const pack = await db().from("hour_packs").select("id, name, price_mxn").eq("id", String(body?.pack ?? "")).eq("active", true).maybeSingle();
  if (pack.error) return fail("No se pudo leer la recarga.", 502);
  if (!pack.data) return fail("Esa recarga no existe.");

  const site = siteUrl(req);
  const res = await mercadoPago("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      items: [{ id: pack.data.id, title: `Mascota LIVE · ${pack.data.name} en vivo`, quantity: 1, unit_price: Number(pack.data.price_mxn), currency_id: CURRENCY }],
      external_reference: `pack:${user.id}:${pack.data.id}`,
      payer: { email: user.email },
      back_urls: { success: `${site}/planes`, pending: `${site}/planes`, failure: `${site}/planes` },
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
