// Prueba schema.sql en PGlite (Postgres en Node) simulando auth y los roles de Supabase.
// Uso: en una carpeta aparte, npm i @electric-sql/pglite; luego node test-schema.mjs ruta/a/schema.sql

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
const db = new PGlite({ extensions: { pgcrypto } });
const schema = readFileSync(process.argv[2], 'utf8');
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create schema storage; grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`);
await db.exec(schema);
await db.exec(schema); // idempotente
const ok = (c, m) => { if (!c) { console.log('FALLA:', m); process.exitCode = 1; } else console.log('ok:', m); };
const U = '11111111-1111-1111-1111-111111111111', V = '22222222-2222-2222-2222-222222222222';
await db.query(`insert into auth.users values ($1,'a@a.com'),($2,'b@b.com')`, [U, V]);
let r = await db.query(`select * from wallets where user_id=$1`, [U]);
ok(r.rows[0]?.plan_minutes === 180, 'monedero gratis al crear cuenta');
ok((await db.query(`select overlay_key from mascots where user_id=$1`, [U])).rows[0].overlay_key.length === 36, 'mascota con llave');
ok((await db.query(`select consume_minutes($1, 100) as r`, [U])).rows[0].r === 80, 'consume del plan');
ok((await db.query(`select grant_payment('pay:1',$1,'paquete','h5',49,'MXN',300) as r`, [U])).rows[0].r === true, 'recarga');
ok((await db.query(`select grant_payment('pay:1',$1,'paquete','h5',49,'MXN',300) as r`, [U])).rows[0].r === false, 'recarga duplicada ignorada');
ok((await db.query(`select consume_minutes($1, 100) as r`, [U])).rows[0].r === 280, 'plan y luego recarga');
r = await db.query(`select plan_minutes, extra_minutes from wallets where user_id=$1`, [U]);
ok(r.rows[0].plan_minutes === 0 && r.rows[0].extra_minutes === 280, 'saldo correcto');
ok((await db.query(`select consume_minutes($1, 999) as r`, [U])).rows[0].r === -1, 'sin saldo no descuenta');
await db.query(`insert into subscriptions (user_id, plan_id, mp_preapproval_id, status, paid_until) values ($1,'pro','pre1','authorized', now() + interval '30 days')`, [U]);
await db.query(`select grant_payment('ap:9',$1,'suscripcion','pro',199,'MXN',4800)`, [U]);
r = await db.query(`select plan_id, plan_minutes, extra_minutes from wallets where user_id=$1`, [U]);
ok(r.rows[0].plan_id === 'pro' && r.rows[0].plan_minutes === 4800 && r.rows[0].extra_minutes === 280, 'suscripción da minutos y conserva recargas');
// periodo gratis vencido se renueva
await db.query(`update wallets set period_end = now() - interval '1 day', plan_minutes = 3 where user_id=$1`, [V]);
ok((await db.query(`select consume_minutes($1, 1) as r`, [V])).rows[0].r === 179, 'renueva el gratis al vencer');
// plan pagado con cobro atrasado: no reinicia
await db.query(`update wallets set period_end = now() - interval '1 day', plan_minutes = 10 where user_id=$1`, [U]);
ok((await db.query(`select consume_minutes($1, 1) as r`, [U])).rows[0].r === 289, 'cobro atrasado: sigue con lo que queda');

// como usuario autenticado
const as = async (uid, sql, params = []) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub', '${uid}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec(`reset role;`); }
};
const tryAs = async (uid, sql, params) => { try { await as(uid, sql, params); return 'ok'; } catch (e) { return e.message; } };
r = await as(U, `select my_status() as s`);
ok(r.rows[0].s.plan.id === 'pro' && r.rows[0].s.subscription.status === 'authorized', 'my_status');
ok((await as(V, `select * from wallets`)).rows.length === 1, 'solo ve su monedero');
ok((await as(V, `select * from mascots`)).rows.every((m) => m.user_id === V), 'solo ve su mascota');
ok((await tryAs(V, `select consume_minutes($1, -500)`, [V])) !== 'ok', 'no puede llamar consume_minutes');
ok((await tryAs(V, `select grant_payment('x',$1,'paquete','h5',0,'MXN',99999)`, [V])) !== 'ok', 'no puede regalarse minutos');
ok((await tryAs(V, `update wallets set extra_minutes = 99999 where user_id=$1`, [V])) !== 'ok', 'no puede editar su monedero');
ok((await tryAs(V, `update mascots set overlay_key = 'x' where user_id=$1`, [V])) !== 'ok', 'no puede poner la llave a mano');
ok((await tryAs(V, `update mascots set config = '{"a":1}' where user_id=$1`, [V])) === 'ok', 'sí edita su configuración');
ok((await tryAs(V, `select * from platform_tokens`)) !== 'ok', 'no lee tokens');
await as(V, `insert into connections (user_id, platform, enabled, settings) values ($1,'tiktok',true,'{"username":"x"}')`, [V]);
ok((await tryAs(V, `insert into connections (user_id, platform) values ($1,'twitch')`, [U])) !== 'ok', 'no crea conexiones de otro');
ok((await as(U, `select * from connections`)).rows.length === 0, 'no ve conexiones de otro');
const k1 = (await as(V, `select overlay_key from mascots`)).rows[0].overlay_key;
const k2 = (await as(V, `select regenerate_overlay_key() as k`)).rows[0].k;
ok(k1 !== k2 && k2.length === 36, 'regenera la llave');
ok((await as(V, `select * from plans`)).rows.length === 4, 'planes visibles');
await db.exec(`set role anon;`);
ok((await db.query(`select * from hour_packs`)).rows.length === 3, 'paquetes visibles sin sesión');
await db.exec(`reset role;`);

// cupo de mascotas con IA
const V2 = '33333333-3333-3333-3333-333333333333';
await db.query(`insert into auth.users values ($1,'c@c.com')`, [V2]);
const r1 = (await db.query(`select reserve_ai_design($1, 'gato pirata') as id`, [V2])).rows[0].id;
ok(r1, 'gratis: 1 mascota con IA');
ok((await db.query(`select reserve_ai_design($1, 'otro') as id`, [V2])).rows[0].id === null, 'gratis: la segunda se niega');
await db.query(`update ai_designs set status = 'fallida' where id = $1`, [r1]);
ok((await db.query(`select reserve_ai_design($1, 'reintento') as id`, [V2])).rows[0].id, 'un intento fallido no cuenta');
ok((await db.query(`select reserve_ai_design($1, 'pro') as id`, [U])).rows[0].id, 'pro tiene cupo');
ok((await tryAs(V2, `select reserve_ai_design($1, 'x')`, [V2])) !== 'ok', 'no puede apartar cupo directo');
r = await as(V2, `select my_ai_quota() as q`);
ok(r.rows[0].q.limit === 1 && r.rows[0].q.used === 1, 'my_ai_quota');
ok((await tryAs(V2, `insert into ai_designs (user_id, prompt, status) values ($1,'x','lista')`, [V2])) !== 'ok', 'no inserta diseños a mano');
// imágenes: cada quien en su carpeta
ok((await tryAs(V2, `insert into storage.objects (bucket_id, name) values ('mascotas', $1)`, [V2 + '/base.png'])) === 'ok', 'sube a su carpeta');
ok((await tryAs(V2, `insert into storage.objects (bucket_id, name) values ('mascotas', $1)`, [U + '/base.png'])) !== 'ok', 'no sube a carpeta ajena');
ok((await db.query(`select public from storage.buckets where id = 'mascotas'`)).rows[0].public === true, 'bucket público');
// resumen de directos
const sid = (await db.query(`insert into live_sessions (user_id) values ($1) returning id`, [V2])).rows[0].id;
await db.query(`insert into session_comments (session_id, user_id, platform, text) values ($1,$2,'tiktok','hola')`, [sid, V2]);
ok((await tryAs(V2, `select * from session_comments`)) !== 'ok', 'el usuario no lee comentarios guardados');
ok((await as(V2, `select stats, summary from live_sessions where id = $1`, [sid])).rows[0].stats !== undefined, 've estadísticas de su directo');
ok((await tryAs(V2, `update live_sessions set summary = '{}' where id = $1`, [sid])) !== 'ok', 'no edita su resumen');
ok((await db.query(`select summaries from plans where id = 'gratis'`)).rows[0].summaries === false && (await db.query(`select summaries from plans where id = 'pro'`)).rows[0].summaries === true, 'resumen IA solo en planes de pago');

// administración
ok((await db.query(`select count(*)::int as n from profiles`)).rows[0].n === 3, 'perfiles para cuentas nuevas y existentes');
ok((await tryAs(V2, `update profiles set is_admin = true where id = $1`, [V2])) !== 'ok', 'nadie se hace admin solo');
ok((await as(V2, `select * from profiles`)).rows.length === 1, 'solo ve su perfil');
for (const fn of [`admin_metrics()`, `admin_users('', 10, 0)`, `admin_adjust_minutes('${V2}', 0, 999)`, `admin_gift_subscription('${V2}', 'pro', 1)`]) {
  ok((await tryAs(V2, `select ${fn}`)) !== 'ok', `usuario no puede ${fn.split('(')[0]}`);
}
const w0 = (await db.query(`select plan_minutes, extra_minutes from wallets where user_id = $1`, [V2])).rows[0];
await db.query(`select admin_adjust_minutes($1, -99999, 120)`, [V2]);
const w1 = (await db.query(`select plan_minutes, extra_minutes from wallets where user_id = $1`, [V2])).rows[0];
ok(w1.plan_minutes === 0 && w1.extra_minutes === w0.extra_minutes + 120, 'ajuste de minutos sin bajar de cero');
await db.query(`select admin_gift_subscription($1, 'creator', 3)`, [V2]);
ok((await db.query(`select effective_plan($1) as p`, [V2])).rows[0].p === 'creator', 'plan regalado vigente');
ok((await db.query(`select plan_minutes from wallets where user_id = $1`, [V2])).rows[0].plan_minutes === 1800, 'plan regalado da sus horas');
await db.query(`update wallets set period_end = now() - interval '1 day', plan_minutes = 5 where user_id = $1`, [V2]);
ok((await db.query(`select consume_minutes($1, 0) as r`, [V2])).rows[0].r === 1800 + w0.extra_minutes + 120, 'plan regalado se renueva cada mes');
await db.query(`select admin_gift_subscription($1, 'pro', 1)`, [V2]);
ok((await db.query(`select count(*)::int as n from subscriptions where user_id = $1 and source = 'admin' and status = 'authorized'`, [V2])).rows[0].n === 1, 'un solo regalo activo');
let failed = false;
try { await db.query(`select admin_gift_subscription($1, 'gratis', 1)`, [V2]); } catch { failed = true; }
ok(failed, 'no regala el plan gratis');
const list = (await db.query(`select admin_users('c@c', 10, 0) as r`)).rows[0].r;
ok(list.total === 1 && list.rows[0].plan === 'pro', 'lista de usuarios con búsqueda');
const m = (await db.query(`select admin_metrics() as m`)).rows[0].m;
ok(m.users_total === 3 && m.daily.length === 30 && m.subs_by_plan.length >= 1, 'métricas');

// voces
ok((await db.query(`select consume_tts($1, 10) as r`, [V])).rows[0].r === false, 'gratis no tiene caracteres de ElevenLabs');
await db.query(`select admin_gift_subscription($1, 'creator', 1)`, [V]);
ok((await db.query(`select consume_tts($1, 14000) as r`, [V])).rows[0].r === true, 'creator gasta caracteres');
ok((await db.query(`select consume_tts($1, 2000) as r`, [V])).rows[0].r === false, 'no se pasa del cupo');
ok((await db.query(`select consume_tts($1, 1000) as r`, [V])).rows[0].r === true, 'usa lo que queda exacto');
r = await as(V, `select my_tts_quota() as q`);
ok(r.rows[0].q.limit === 15000 && r.rows[0].q.used === 15000, 'my_tts_quota');
ok((await tryAs(V, `select consume_tts($1, -99999)`, [V])) !== 'ok', 'usuario no puede tocar su cupo de voz');
await db.query(`insert into platform_tokens (user_id, platform, data) values ($1, 'elevenlabs', 'v1.x')`, [V]);
ok((await db.query(`select count(*)::int as n from platform_tokens where platform = 'elevenlabs'`)).rows[0].n === 1, 'guarda llave de ElevenLabs');
ok((await db.query(`select 'audio/webm' = any(allowed_mime_types) as a from storage.buckets where id = 'mascotas'`)).rows[0].a === true, 'bucket acepta audios');

// créditos de IA
ok((await db.query(`select grant_credit_payment('pay:c1',$1,'c300',49,'MXN',300) as r`, [V])).rows[0].r === true, 'compra de créditos');
ok((await db.query(`select grant_credit_payment('pay:c1',$1,'c300',49,'MXN',300) as r`, [V])).rows[0].r === false, 'compra de créditos duplicada ignorada');
ok((await db.query(`select move_credits($1, -4, 'uso', 'premium', 'Respuesta a Ana', '') as b`, [V])).rows[0].b === 296, 'descuenta una respuesta');
ok((await db.query(`select move_credits($1, -1000, 'uso', 'premium', 'x', '') as b`, [V])).rows[0].b === -1, 'no descuenta si no alcanza');
ok((await db.query(`select move_credits($1, 4, 'reembolso', 'premium', 'falló', '') as b`, [V])).rows[0].b === 300, 'reembolso');
ok((await db.query(`select move_credits($1, -1000, 'admin', '', 'ajuste', '') as b`, [V])).rows[0].b === 0, 'ajuste del admin no baja de cero');
r = await as(V, `select kind, delta, balance from credit_ledger order by id`);
ok(r.rows.length === 4 && r.rows[0].kind === 'compra' && r.rows[1].delta === -4 && r.rows[3].balance === 0, 'historial de créditos');
ok((await as(U, `select count(*)::int as n from credit_ledger`)).rows[0].n === 0, 'no ve el historial de otros');
ok((await tryAs(V, `select move_credits($1, 99999, 'compra', '', '', '')`, [V])) !== 'ok', 'usuario no puede darse créditos');
ok((await tryAs(V, `update wallets set credits = 99999`)) !== 'ok' || (await db.query(`select credits from wallets where user_id = $1`, [V])).rows[0].credits === 0, 'usuario no cambia su saldo');
ok((await as(V, `select count(*)::int as n from credit_packs`)).rows[0].n === 3, 'paquetes de créditos visibles');
