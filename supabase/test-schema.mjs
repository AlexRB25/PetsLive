// Prueba schema.sql en PGlite (Postgres en Node) simulando auth y los roles de Supabase.
// Uso: en una carpeta aparte, npm i @electric-sql/pglite; luego node test-schema.mjs ruta/a/schema.sql

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
const db = new PGlite({ extensions: { pgcrypto } });
const schema = readFileSync(process.argv[2], 'utf8');
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users (id uuid primary key, email text);
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
