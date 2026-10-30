import { NextResponse } from "next/server";
import { mercadoPago, syncPreapproval, UUID } from "@/lib/mercadopago";
import { db, fail, requireAdmin } from "@/lib/server";

type Params = { params: Promise<{ id: string }> };

/** Ficha completa de un usuario. */
export async function GET(req: Request, { params }: Params) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!UUID.test(id)) return fail("Usuario desconocido.");

  const [auth, profile, wallet, plan, subs, payments, sessions, connections, designs, actions] = await Promise.all([
    db().auth.admin.getUserById(id),
    db().from("profiles").select("*").eq("id", id).maybeSingle(),
    db().from("wallets").select("*").eq("user_id", id).maybeSingle(),
    db().rpc("effective_plan", { p_user: id }),
    db().from("subscriptions").select("*").eq("user_id", id).order("created_at", { ascending: false }),
    db().from("payments").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    db().from("live_sessions").select("id, started_at, ended_at, minutes, platforms, events, reactions, end_reason").eq("user_id", id).order("started_at", { ascending: false }).limit(25),
    db().from("connections").select("platform, enabled, settings").eq("user_id", id),
    db().from("ai_designs").select("id, prompt, status, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    db().from("admin_actions").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (auth.error || !auth.data.user) return fail("Usuario desconocido.", 404);
  const u = auth.data.user;
  return NextResponse.json({
    user: { id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, banned_until: (u as { banned_until?: string }).banned_until ?? null },
    profile: profile.data,
    wallet: wallet.data,
    plan: plan.data,
    subscriptions: subs.data ?? [],
    payments: payments.data ?? [],
    sessions: sessions.data ?? [],
    connections: (connections.data ?? []).map((c) => ({ platform: c.platform, enabled: c.enabled, detail: c.settings?.channel || c.settings?.username || c.settings?.liveUrl || c.settings?.channel || (c.settings?.pages?.length ? `${c.settings.pages.length} página(s)` : "") })),
    designs: designs.data ?? [],
    actions: actions.data ?? [],
  });
}

const int = (v: unknown) => Math.trunc(Number(v) || 0);

/**
 * Acciones de administración sobre un usuario. Todas quedan en admin_actions.
 * { action: "minutes", plan, extra } · { action: "credits", amount, reason } · { action: "gift", plan, months } · { action: "cancel_sub", immediate, removeMinutes }
 * { action: "block", reason } · { action: "unblock" } · { action: "notes", notes } · { action: "admin", value }
 */
export async function POST(req: Request, { params }: Params) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!UUID.test(id)) return fail("Usuario desconocido.");
  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");
  let detail: Record<string, unknown> = {};

  const auth = await db().auth.admin.getUserById(id);
  if (auth.error || !auth.data.user) return fail("Usuario desconocido.", 404);
  const profile = () => db().from("profiles").upsert({ id, email: auth.data.user!.email ?? "" }, { onConflict: "id", ignoreDuplicates: true });

  switch (action) {
    case "minutes": {
      const plan = Math.max(-1_000_000, Math.min(1_000_000, int(body.plan)));
      const extra = Math.max(-1_000_000, Math.min(1_000_000, int(body.extra)));
      if (!plan && !extra) return fail("Indica cuántos minutos sumar o restar.");
      const r = await db().rpc("admin_adjust_minutes", { p_user: id, p_plan: plan, p_extra: extra });
      if (r.error) return fail(r.error.message, 502);
      detail = { plan, extra, reason: String(body.reason ?? "").slice(0, 300) };
      break;
    }
    case "credits": {
      const amount = Math.max(-1_000_000, Math.min(1_000_000, int(body.amount)));
      if (!amount) return fail("Indica cuántos créditos sumar o restar.");
      const reason = String(body.reason ?? "").slice(0, 300);
      const r = await db().rpc("move_credits", { p_user: id, p_delta: amount, p_kind: "admin", p_model: "", p_detail: reason || "Ajuste del administrador", p_ref: admin.email ?? "" });
      if (r.error) return fail(r.error.message, 502);
      detail = { amount, reason, balance: r.data };
      break;
    }
    case "gift": {
      const months = Math.max(1, Math.min(36, int(body.months)));
      const r = await db().rpc("admin_gift_subscription", { p_user: id, p_plan: String(body.plan ?? ""), p_months: months });
      if (r.error) return fail(r.error.message.includes("plan inválido") ? "Elige un plan de pago." : r.error.message, 400);
      detail = { plan: body.plan, months };
      break;
    }
    case "cancel_sub": {
      const subs = await db().from("subscriptions").select("id, source, mp_preapproval_id, status").eq("user_id", id).in("status", ["authorized", "paused", "pending"]);
      if (subs.error) return fail(subs.error.message, 502);
      if (!subs.data.length) return fail("Este usuario no tiene suscripciones activas.");
      for (const s of subs.data) {
        if (s.source === "mercadopago" && s.mp_preapproval_id) {
          const r = await mercadoPago(`/preapproval/${s.mp_preapproval_id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
          if (!r.ok) return fail("Mercado Pago no canceló la suscripción. Intenta de nuevo.", 502);
          await syncPreapproval(s.mp_preapproval_id);
        } else {
          await db().from("subscriptions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", s.id);
        }
      }
      const now = new Date().toISOString();
      // Inmediata: el plan termina ahora. Si no, conserva lo ya pagado hasta su fecha.
      if (body.immediate) await db().from("subscriptions").update({ paid_until: now, updated_at: now }).eq("user_id", id).gt("paid_until", now);
      if (body.removeMinutes) await db().rpc("admin_adjust_minutes", { p_user: id, p_plan: -1_000_000, p_extra: 0 });
      detail = { count: subs.data.length, immediate: Boolean(body.immediate), removeMinutes: Boolean(body.removeMinutes) };
      break;
    }
    case "block": {
      if (id === admin.id) return fail("No puedes suspender tu propia cuenta.");
      const reason = String(body.reason ?? "").slice(0, 300);
      await profile();
      const r = await db().from("profiles").update({ blocked: true, blocked_reason: reason }).eq("id", id);
      if (r.error) return fail(r.error.message, 502);
      // Además se le impide iniciar sesión; el worker corta su directo en menos de un minuto.
      await db().auth.admin.updateUserById(id, { ban_duration: "876000h" });
      detail = { reason };
      break;
    }
    case "unblock": {
      await profile();
      const r = await db().from("profiles").update({ blocked: false, blocked_reason: "" }).eq("id", id);
      if (r.error) return fail(r.error.message, 502);
      await db().auth.admin.updateUserById(id, { ban_duration: "none" });
      break;
    }
    case "notes": {
      await profile();
      const notes = String(body.notes ?? "").slice(0, 4000);
      const r = await db().from("profiles").update({ notes }).eq("id", id);
      if (r.error) return fail(r.error.message, 502);
      detail = { length: notes.length };
      break;
    }
    case "admin": {
      if (id === admin.id && !body.value) return fail("No puedes quitarte el acceso de admin a ti mismo.");
      await profile();
      const r = await db().from("profiles").update({ is_admin: Boolean(body.value) }).eq("id", id);
      if (r.error) return fail(r.error.message, 502);
      detail = { value: Boolean(body.value) };
      break;
    }
    default:
      return fail("Acción desconocida.");
  }

  await db().from("admin_actions").insert({ admin_id: admin.id, user_id: id, action, detail });
  return NextResponse.json({ ok: true });
}
