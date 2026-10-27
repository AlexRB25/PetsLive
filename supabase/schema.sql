-- Mascota LIVE · esquema de Supabase. Se puede correr varias veces (SQL Editor → pegar → Run).
-- Cobro: plan mensual con minutos en vivo incluidos + recargas de minutos que no caducan.

create extension if not exists pgcrypto;

-- ============ catálogo ============

create table if not exists public.plans (
  id text primary key,
  name text not null,
  price_mxn numeric(10, 2) not null default 0,
  minutes integer not null default 0,          -- minutos en vivo incluidos por mes
  max_platforms integer not null default 1,    -- plataformas conectadas a la vez
  description text not null default '',
  active boolean not null default true,
  sort integer not null default 0
);

-- Precios de prueba del documento del proyecto; se editan aquí o en la tabla sin perder cambios.
insert into public.plans (id, name, price_mxn, minutes, max_platforms, description, sort) values
  ('gratis',   'Gratis',     0, 180,   1, 'Simulador ilimitado y 3 horas en vivo al mes en una plataforma.', 0),
  ('creator',  'Creator',   99, 1800,  2, '30 horas en vivo al mes, hasta 2 plataformas a la vez.', 1),
  ('pro',      'Pro',      199, 4800,  4, '80 horas en vivo al mes, todas las plataformas a la vez.', 2),
  ('business', 'Business', 399, 12000, 4, '200 horas en vivo al mes, todas las plataformas a la vez.', 3)
on conflict (id) do nothing;

create table if not exists public.hour_packs (
  id text primary key,
  name text not null,
  minutes integer not null,
  price_mxn numeric(10, 2) not null,
  active boolean not null default true,
  sort integer not null default 0
);

insert into public.hour_packs (id, name, minutes, price_mxn, sort) values
  ('h5',  '5 horas',  300,  49, 0),
  ('h15', '15 horas', 900, 129, 1),
  ('h40', '40 horas', 2400, 299, 2)
on conflict (id) do nothing;

-- ============ cobros ============

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  source text not null default 'mercadopago',
  mp_preapproval_id text unique,
  status text not null default 'pending' check (status in ('pending', 'authorized', 'paused', 'cancelled')),
  amount numeric(10, 2) not null default 0,
  currency text not null default 'MXN',
  payer_email text not null default '',
  next_payment_date timestamptz,
  paid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id);

create table if not exists public.payments (
  mp_id text primary key,                      -- "ap:<cobro de suscripción>" o "pay:<pago>"
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('suscripcion', 'paquete')),
  ref text not null,
  amount numeric(10, 2) not null default 0,
  currency text not null default 'MXN',
  minutes integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists payments_user_idx on public.payments (user_id);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_id text not null default 'gratis' references public.plans (id),
  plan_minutes integer not null default 0,     -- minutos del plan que quedan en este periodo
  period_end timestamptz not null default now(),
  extra_minutes integer not null default 0,    -- recargas; no caducan
  updated_at timestamptz not null default now()
);

-- ============ mascota y conexiones ============

create table if not exists public.mascots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  overlay_key text not null unique default encode(gen_random_bytes(18), 'hex'),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('twitch', 'youtube', 'facebook', 'tiktok')),
  enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb, -- canal, enlace, página elegida… nunca tokens
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);

-- Tokens de OAuth cifrados (AES-256-GCM con TOKENS_KEY). Sin políticas: solo el servidor los lee.
create table if not exists public.platform_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('twitch', 'facebook')),
  data text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  minutes integer not null default 0,
  platforms text[] not null default '{}',
  events integer not null default 0,
  reactions integer not null default 0,
  end_reason text
);
create index if not exists live_sessions_user_idx on public.live_sessions (user_id, started_at desc);

-- ============ seguridad (RLS) ============

alter table public.plans enable row level security;
alter table public.hour_packs enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.wallets enable row level security;
alter table public.mascots enable row level security;
alter table public.connections enable row level security;
alter table public.platform_tokens enable row level security;
alter table public.live_sessions enable row level security;

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select using (active);
drop policy if exists packs_read on public.hour_packs;
create policy packs_read on public.hour_packs for select using (active);

drop policy if exists subs_own on public.subscriptions;
create policy subs_own on public.subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists payments_own on public.payments;
create policy payments_own on public.payments for select to authenticated using (user_id = auth.uid());
drop policy if exists wallets_own on public.wallets;
create policy wallets_own on public.wallets for select to authenticated using (user_id = auth.uid());
drop policy if exists sessions_own on public.live_sessions;
create policy sessions_own on public.live_sessions for select to authenticated using (user_id = auth.uid());

drop policy if exists mascots_read on public.mascots;
create policy mascots_read on public.mascots for select to authenticated using (user_id = auth.uid());
drop policy if exists mascots_update on public.mascots;
create policy mascots_update on public.mascots for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- El usuario solo cambia la configuración; la llave del overlay se cambia con regenerate_overlay_key().
revoke insert, update, delete on public.mascots from anon, authenticated;
grant update (config, updated_at) on public.mascots to authenticated;

drop policy if exists connections_own on public.connections;
create policy connections_own on public.connections for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.platform_tokens from anon, authenticated;
revoke insert, update, delete on public.wallets, public.payments, public.subscriptions, public.live_sessions from anon, authenticated;

-- ============ funciones ============

-- Plan vigente: la suscripción pagada más larga; si no hay, Gratis.
create or replace function public.effective_plan(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.plan_id from public.subscriptions s
      where s.user_id = p_user and s.paid_until > now()
      order by s.paid_until desc limit 1),
    'gratis');
$$;

-- Crea el monedero si falta y renueva los minutos gratis cada mes.
-- Los planes pagados se renuevan al llegar el cobro (grant_payment); si el cobro se atrasa,
-- el usuario sigue usando lo que le quede del periodo y sus recargas.
create or replace function public.refresh_wallet(p_user uuid)
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets;
  v_plan text := public.effective_plan(p_user);
begin
  insert into public.wallets (user_id, plan_id, plan_minutes, period_end)
  values (p_user, 'gratis', (select minutes from public.plans where id = 'gratis'), now() + interval '1 month')
  on conflict (user_id) do nothing;

  select * into w from public.wallets where user_id = p_user for update;
  if w.period_end <= now() and v_plan = 'gratis' then
    update public.wallets
       set plan_id = 'gratis',
           plan_minutes = (select minutes from public.plans where id = 'gratis'),
           period_end = now() + interval '1 month',
           updated_at = now()
     where user_id = p_user
    returning * into w;
  end if;
  return w;
end;
$$;

-- Registra un cobro aprobado una sola vez y da sus minutos.
create or replace function public.grant_payment(
  p_mp_id text, p_user uuid, p_kind text, p_ref text, p_amount numeric, p_currency text, p_minutes integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted boolean;
begin
  insert into public.payments (mp_id, user_id, kind, ref, amount, currency, minutes)
  values (p_mp_id, p_user, p_kind, p_ref, p_amount, p_currency, p_minutes)
  on conflict (mp_id) do nothing
  returning true into inserted;
  if not coalesce(inserted, false) then
    return false;
  end if;

  perform public.refresh_wallet(p_user);
  if p_kind = 'suscripcion' then
    update public.wallets
       set plan_id = p_ref, plan_minutes = p_minutes, period_end = now() + interval '1 month', updated_at = now()
     where user_id = p_user;
  else
    update public.wallets
       set extra_minutes = extra_minutes + p_minutes, updated_at = now()
     where user_id = p_user;
  end if;
  return true;
end;
$$;

-- Descuenta minutos en vivo: primero los del plan, luego las recargas.
-- Devuelve los minutos que quedan, o -1 si no alcanzaba (y entonces no descuenta nada).
create or replace function public.consume_minutes(p_user uuid, p_minutes integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets;
  from_plan integer;
begin
  w := public.refresh_wallet(p_user);
  if w.plan_minutes + w.extra_minutes < p_minutes then
    return -1;
  end if;
  from_plan := least(w.plan_minutes, p_minutes);
  update public.wallets
     set plan_minutes = plan_minutes - from_plan,
         extra_minutes = extra_minutes - (p_minutes - from_plan),
         updated_at = now()
   where user_id = p_user
  returning * into w;
  return w.plan_minutes + w.extra_minutes;
end;
$$;

-- Estado de la cuenta para el panel.
create or replace function public.my_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  w public.wallets;
  p public.plans;
  s public.subscriptions;
begin
  if uid is null then
    raise exception 'sin sesión';
  end if;
  w := public.refresh_wallet(uid);
  select * into p from public.plans where id = public.effective_plan(uid);
  select * into s from public.subscriptions
   where user_id = uid and status in ('authorized', 'paused', 'pending')
   order by created_at desc limit 1;
  return jsonb_build_object(
    'plan', to_jsonb(p),
    'plan_minutes', w.plan_minutes,
    'extra_minutes', w.extra_minutes,
    'period_end', w.period_end,
    'subscription', case when s.id is null then null else jsonb_build_object(
      'plan_id', s.plan_id, 'status', s.status, 'next_payment_date', s.next_payment_date, 'paid_until', s.paid_until) end
  );
end;
$$;

-- Crea la mascota del usuario si no existe y la devuelve.
create or replace function public.ensure_mascot()
returns public.mascots
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.mascots;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  insert into public.mascots (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into m from public.mascots where user_id = auth.uid();
  return m;
end;
$$;

-- Nueva URL de overlay (si la anterior se filtró en pantalla).
create or replace function public.regenerate_overlay_key()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := encode(gen_random_bytes(18), 'hex');
begin
  update public.mascots set overlay_key = k, updated_at = now() where user_id = auth.uid();
  return k;
end;
$$;

-- Al crear una cuenta: monedero con el plan gratis y mascota.
create or replace function public.on_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_wallet(new.id);
  insert into public.mascots (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists mascota_live_new_user on auth.users;
create trigger mascota_live_new_user after insert on auth.users
  for each row execute function public.on_new_user();

revoke execute on function public.effective_plan(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_wallet(uuid) from public, anon, authenticated;
revoke execute on function public.grant_payment(text, uuid, text, text, numeric, text, integer) from public, anon, authenticated;
revoke execute on function public.consume_minutes(uuid, integer) from public, anon, authenticated;
revoke execute on function public.on_new_user() from public, anon, authenticated;
grant execute on function public.effective_plan(uuid) to service_role;
grant execute on function public.refresh_wallet(uuid) to service_role;
grant execute on function public.grant_payment(text, uuid, text, text, numeric, text, integer) to service_role;
grant execute on function public.consume_minutes(uuid, integer) to service_role;
revoke execute on function public.my_status() from public, anon;
revoke execute on function public.ensure_mascot() from public, anon;
revoke execute on function public.regenerate_overlay_key() from public, anon;
grant execute on function public.my_status() to authenticated;
grant execute on function public.ensure_mascot() to authenticated;
grant execute on function public.regenerate_overlay_key() to authenticated;

-- ============ mascotas: diseños con IA e imágenes propias ============

-- Cuántas mascotas puede crear con IA cada plan al mes (cada una cuesta una llamada a Claude).
alter table public.plans add column if not exists ai_designs integer not null default 0;
-- Valores iniciales (propuesta); solo se ponen si la columna sigue en 0.
update public.plans set ai_designs = 1  where id = 'gratis'   and ai_designs = 0;
update public.plans set ai_designs = 5  where id = 'creator'  and ai_designs = 0;
update public.plans set ai_designs = 20 where id = 'pro'      and ai_designs = 0;
update public.plans set ai_designs = 50 where id = 'business' and ai_designs = 0;

create table if not exists public.ai_designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt text not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'lista', 'fallida')),
  design jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_designs_user_idx on public.ai_designs (user_id, created_at desc);
alter table public.ai_designs enable row level security;
drop policy if exists ai_designs_own on public.ai_designs;
create policy ai_designs_own on public.ai_designs for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.ai_designs from anon, authenticated;

-- Aparta un lugar del cupo mensual antes de llamar a la IA (evita que varias peticiones a la vez
-- se pasen del límite). Devuelve el id apartado o null si ya no quedan. Los intentos fallidos no cuentan.
create or replace function public.reserve_ai_design(p_user uuid, p_prompt text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_used integer;
  v_id uuid;
begin
  perform public.refresh_wallet(p_user);
  perform 1 from public.wallets where user_id = p_user for update; -- serializa por usuario
  select ai_designs into v_limit from public.plans where id = public.effective_plan(p_user);
  select count(*) into v_used from public.ai_designs
   where user_id = p_user and status <> 'fallida' and created_at >= date_trunc('month', now());
  if v_used >= coalesce(v_limit, 0) then
    return null;
  end if;
  insert into public.ai_designs (user_id, prompt) values (p_user, left(p_prompt, 500)) returning id into v_id;
  return v_id;
end;
$$;

-- Cupo de IA del usuario para el panel.
create or replace function public.my_ai_quota()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'limit', (select ai_designs from public.plans where id = public.effective_plan(auth.uid())),
    'used', (select count(*) from public.ai_designs
              where user_id = auth.uid() and status <> 'fallida' and created_at >= date_trunc('month', now()))
  );
$$;

revoke execute on function public.reserve_ai_design(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_design(uuid, text) to service_role;
revoke execute on function public.my_ai_quota() from public, anon;
grant execute on function public.my_ai_quota() to authenticated;

-- Imágenes de mascotas: bucket público (el overlay las muestra sin sesión); cada usuario solo
-- escribe en su carpeta <user id>/. Máximo 2 MB; PNG, GIF, WebP o JPG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mascotas', 'mascotas', true, 2097152, array['image/png', 'image/gif', 'image/webp', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists mascotas_insert on storage.objects;
create policy mascotas_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'mascotas' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists mascotas_update on storage.objects;
create policy mascotas_update on storage.objects for update to authenticated
  using (bucket_id = 'mascotas' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists mascotas_delete on storage.objects;
create policy mascotas_delete on storage.objects for delete to authenticated
  using (bucket_id = 'mascotas' and (storage.foldername(name))[1] = auth.uid()::text);
