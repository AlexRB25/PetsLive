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
  -- Se renueva solo si el plan no se cobra mes a mes: el gratis, o una suscripción regalada por un admin.
  if w.period_end <= now() and (v_plan = 'gratis' or exists (
    select 1 from public.subscriptions s
     where s.user_id = p_user and s.source = 'admin' and s.plan_id = v_plan and s.paid_until > now()
  )) then
    update public.wallets
       set plan_id = v_plan,
           plan_minutes = (select minutes from public.plans where id = v_plan),
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
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, '')) on conflict (id) do nothing;
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

-- Imágenes y audios grabados de mascotas: bucket público (el overlay las muestra sin sesión); cada usuario solo
-- escribe en su carpeta <user id>/. Máximo 2 MB; PNG, GIF, WebP o JPG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mascotas', 'mascotas', true, 2097152, array['image/png', 'image/gif', 'image/webp', 'image/jpeg',
        'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/aac'])
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

-- ============ resumen de directos ============

-- Estadísticas por plataforma (las escribe el worker) y resumen con IA de cada directo.
alter table public.live_sessions add column if not exists stats jsonb not null default '{}'::jsonb;
alter table public.live_sessions add column if not exists summary jsonb;

-- Qué planes incluyen el resumen con IA (las estadísticas sin IA son para todos).
alter table public.plans add column if not exists summaries boolean not null default false;
update public.plans set summaries = true where id in ('creator', 'pro', 'business') and summaries = false;

-- Comentarios del directo, solo para hacer el resumen: se borran al generarlo o a los 30 días.
-- Sin políticas: solo el servidor los lee y escribe.
create table if not exists public.session_comments (
  id bigserial primary key,
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists session_comments_session_idx on public.session_comments (session_id);
create index if not exists session_comments_created_idx on public.session_comments (created_at);
alter table public.session_comments enable row level security;
revoke all on public.session_comments from anon, authenticated;

-- ============ administración ============

-- Perfil de cada cuenta: correo (copia de auth.users), admin y suspensión.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  is_admin boolean not null default false,
  blocked boolean not null default false,
  blocked_reason text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
-- Cuentas que ya existían antes de esta tabla.
insert into public.profiles (id, email, created_at)
select u.id, coalesce(u.email, ''), coalesce(u.created_at, now()) from auth.users u
on conflict (id) do nothing;

alter table public.profiles enable row level security;
drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles for select to authenticated using (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;

-- Todo lo que hace un admin queda registrado.
create table if not exists public.admin_actions (
  id bigserial primary key,
  admin_id uuid references auth.users (id) on delete set null,
  user_id uuid references auth.users (id) on delete cascade,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_user_idx on public.admin_actions (user_id, created_at desc);
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;

-- Suma o resta minutos (del plan o extra) sin bajar de cero.
create or replace function public.admin_adjust_minutes(p_user uuid, p_plan integer, p_extra integer)
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets;
begin
  perform public.refresh_wallet(p_user);
  update public.wallets
     set plan_minutes = greatest(0, plan_minutes + coalesce(p_plan, 0)),
         extra_minutes = greatest(0, extra_minutes + coalesce(p_extra, 0)),
         updated_at = now()
   where user_id = p_user
  returning * into w;
  return w;
end;
$$;

-- Regala un plan por N meses (sin cobro). Sus horas se renuevan cada mes mientras dure.
create or replace function public.admin_gift_subscription(p_user uuid, p_plan text, p_months integer)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.subscriptions;
  v_minutes integer;
begin
  select minutes into v_minutes from public.plans where id = p_plan;
  if v_minutes is null or p_plan = 'gratis' then
    raise exception 'plan inválido';
  end if;
  perform public.refresh_wallet(p_user);
  update public.subscriptions set status = 'cancelled', paid_until = now(), updated_at = now()
   where user_id = p_user and source = 'admin' and status <> 'cancelled';
  insert into public.subscriptions (user_id, plan_id, source, status, amount, paid_until)
  values (p_user, p_plan, 'admin', 'authorized', 0, now() + make_interval(months => greatest(1, least(p_months, 36))))
  returning * into s;
  update public.wallets
     set plan_id = p_plan, plan_minutes = v_minutes, period_end = now() + interval '1 month', updated_at = now()
   where user_id = p_user;
  return s;
end;
$$;

-- Lista de usuarios con su plan, saldo y uso.
create or replace function public.admin_users(p_search text, p_limit integer, p_offset integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.id, p.email, p.created_at, p.blocked, p.is_admin, u.last_sign_in_at
      from public.profiles p
      left join auth.users u on u.id = p.id
     where coalesce(p_search, '') = '' or p.email ilike '%' || p_search || '%' or p.id::text = p_search
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((
      select jsonb_agg(r order by r.created_at desc) from (
        select b.id, b.email, b.created_at, b.last_sign_in_at, b.blocked, b.is_admin,
               public.effective_plan(b.id) as plan,
               w.plan_minutes, w.extra_minutes,
               (select s.status || ':' || s.source from public.subscriptions s where s.user_id = b.id order by s.created_at desc limit 1) as last_sub,
               (select coalesce(sum(ls.minutes), 0) from public.live_sessions ls where ls.user_id = b.id) as live_minutes,
               (select max(ls.started_at) from public.live_sessions ls where ls.user_id = b.id) as last_live,
               (select coalesce(sum(pa.amount), 0) from public.payments pa where pa.user_id = b.id) as paid
          from base b
          left join public.wallets w on w.user_id = b.id
         order by b.created_at desc
         limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)
      ) r), '[]'::jsonb)
  );
$$;

-- Métricas generales del negocio.
create or replace function public.admin_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'users_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'blocked', (select count(*) from public.profiles where blocked),
    'subs_by_plan', coalesce((
      select jsonb_agg(x) from (
        select s.plan_id, s.source, count(distinct s.user_id) as users
          from public.subscriptions s
         where s.paid_until > now() and s.status in ('authorized', 'paused', 'cancelled')
         group by s.plan_id, s.source order by s.plan_id
      ) x), '[]'::jsonb),
    'mrr', (select coalesce(sum(amount), 0) from public.subscriptions where status = 'authorized' and source = 'mercadopago'),
    'revenue_30d', (select coalesce(sum(amount), 0) from public.payments where created_at > now() - interval '30 days'),
    'revenue_month', (select coalesce(sum(amount), 0) from public.payments where created_at >= date_trunc('month', now())),
    'live_now', (select count(*) from public.live_sessions where ended_at is null),
    'live_minutes_30d', (select coalesce(sum(minutes), 0) from public.live_sessions where started_at > now() - interval '30 days'),
    'sessions_30d', (select count(*) from public.live_sessions where started_at > now() - interval '30 days'),
    'streamers_30d', (select count(distinct user_id) from public.live_sessions where started_at > now() - interval '30 days' and minutes > 0),
    'ai_designs_month', (select count(*) from public.ai_designs where status = 'lista' and created_at >= date_trunc('month', now())),
    'summaries_month', (select count(*) from public.live_sessions where summary is not null and (summary->>'generated_at')::timestamptz >= date_trunc('month', now())),
    'platforms_30d', coalesce((
      select jsonb_object_agg(p, n) from (
        select unnest(platforms) as p, count(*) as n from public.live_sessions
         where started_at > now() - interval '30 days' group by 1
      ) x), '{}'::jsonb),
    'daily', coalesce((
      select jsonb_agg(d order by d.day) from (
        select g.day::date as day,
               (select count(*) from public.profiles p where p.created_at::date = g.day::date) as signups,
               (select coalesce(sum(minutes), 0) from public.live_sessions ls where ls.started_at::date = g.day::date) as live_minutes,
               (select coalesce(sum(amount), 0) from public.payments pa where pa.created_at::date = g.day::date) as revenue
          from generate_series(current_date - 29, current_date, interval '1 day') g(day)
      ) d), '[]'::jsonb)
  );
$$;

revoke execute on function public.admin_adjust_minutes(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_gift_subscription(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.admin_users(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_metrics() from public, anon, authenticated;
grant execute on function public.admin_adjust_minutes(uuid, integer, integer) to service_role;
grant execute on function public.admin_gift_subscription(uuid, text, integer) to service_role;
grant execute on function public.admin_users(text, integer, integer) to service_role;
grant execute on function public.admin_metrics() to service_role;

-- ============ voces ============

-- La llave de ElevenLabs del propio usuario se guarda cifrada junto a los tokens de Twitch y Facebook.
alter table public.platform_tokens drop constraint if exists platform_tokens_platform_check;
alter table public.platform_tokens add constraint platform_tokens_platform_check
  check (platform in ('twitch', 'facebook', 'elevenlabs'));

-- Caracteres al mes de voces de ElevenLabs de la plataforma (las pagas tú). Propuesta inicial.
alter table public.plans add column if not exists tts_chars integer not null default 0;
update public.plans set tts_chars = 15000  where id = 'creator'  and tts_chars = 0;
update public.plans set tts_chars = 40000  where id = 'pro'      and tts_chars = 0;
update public.plans set tts_chars = 100000 where id = 'business' and tts_chars = 0;

create table if not exists public.tts_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  chars integer not null default 0,
  primary key (user_id, month)
);
alter table public.tts_usage enable row level security;
drop policy if exists tts_usage_own on public.tts_usage;
create policy tts_usage_own on public.tts_usage for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.tts_usage from anon, authenticated;

-- Descuenta caracteres del cupo del mes. false si no alcanza (y entonces no descuenta).
create or replace function public.consume_tts(p_user uuid, p_chars integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_month date := date_trunc('month', now())::date;
  v_used integer;
begin
  select tts_chars into v_limit from public.plans where id = public.effective_plan(p_user);
  insert into public.tts_usage (user_id, month) values (p_user, v_month) on conflict do nothing;
  select chars into v_used from public.tts_usage where user_id = p_user and month = v_month for update;
  if v_used + p_chars > coalesce(v_limit, 0) then
    return false;
  end if;
  update public.tts_usage set chars = chars + p_chars where user_id = p_user and month = v_month;
  return true;
end;
$$;

create or replace function public.my_tts_quota()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'limit', (select tts_chars from public.plans where id = public.effective_plan(auth.uid())),
    'used', coalesce((select chars from public.tts_usage where user_id = auth.uid() and month = date_trunc('month', now())::date), 0)
  );
$$;

revoke execute on function public.consume_tts(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_tts(uuid, integer) to service_role;
revoke execute on function public.my_tts_quota() from public, anon;
grant execute on function public.my_tts_quota() to authenticated;

-- ============ créditos de IA (conversación) ============

-- Paquetes de créditos (pago único, no caducan). Cada respuesta de la IA cuesta según el modelo elegido
-- (ver AI_MODELS en core/config.js). Propuesta inicial de precios.
create table if not exists public.credit_packs (
  id text primary key,
  name text not null,
  credits integer not null,
  price_mxn numeric(10, 2) not null,
  active boolean not null default true,
  sort integer not null default 0
);

insert into public.credit_packs (id, name, credits, price_mxn, sort) values
  ('c300',  '300 créditos',   300,  49, 0),
  ('c1000', '1,000 créditos', 1000, 129, 1),
  ('c3000', '3,000 créditos', 3000, 299, 2)
on conflict (id) do nothing;

alter table public.credit_packs enable row level security;
drop policy if exists credit_packs_read on public.credit_packs;
create policy credit_packs_read on public.credit_packs for select using (active);

alter table public.wallets add column if not exists credits integer not null default 0;

alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('suscripcion', 'paquete', 'creditos'));
alter table public.payments add column if not exists credits integer not null default 0;

-- Historial de cada movimiento de créditos: compras, respuestas de la IA, reembolsos y ajustes del admin.
create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null,
  balance integer not null,
  kind text not null check (kind in ('compra', 'uso', 'reembolso', 'admin')),
  model text not null default '',
  detail text not null default '',
  ref text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
alter table public.credit_ledger enable row level security;
drop policy if exists credit_ledger_own on public.credit_ledger;
create policy credit_ledger_own on public.credit_ledger for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.credit_ledger from anon, authenticated;

-- Mueve créditos y lo anota en el historial. Si es un cargo y no alcanza, devuelve -1 y no cambia nada.
create or replace function public.move_credits(
  p_user uuid, p_delta integer, p_kind text, p_model text, p_detail text, p_ref text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  perform public.refresh_wallet(p_user);
  select credits into v_balance from public.wallets where user_id = p_user for update;
  if p_delta < 0 and p_kind <> 'admin' and v_balance + p_delta < 0 then
    return -1;
  end if;
  v_balance := greatest(0, v_balance + p_delta);
  update public.wallets set credits = v_balance, updated_at = now() where user_id = p_user;
  insert into public.credit_ledger (user_id, delta, balance, kind, model, detail, ref)
  values (p_user, p_delta, v_balance, p_kind, coalesce(p_model, ''), left(coalesce(p_detail, ''), 200), coalesce(p_ref, ''));
  return v_balance;
end;
$$;

-- Registra la compra de un paquete una sola vez (por id de pago de Mercado Pago) y da sus créditos.
create or replace function public.grant_credit_payment(
  p_mp_id text, p_user uuid, p_pack text, p_amount numeric, p_currency text, p_credits integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted boolean;
begin
  insert into public.payments (mp_id, user_id, kind, ref, amount, currency, minutes, credits)
  values (p_mp_id, p_user, 'creditos', p_pack, p_amount, p_currency, 0, p_credits)
  on conflict (mp_id) do nothing
  returning true into inserted;
  if not coalesce(inserted, false) then
    return false;
  end if;
  perform public.move_credits(p_user, p_credits, 'compra', '', (select name from public.credit_packs where id = p_pack), p_mp_id);
  return true;
end;
$$;

revoke execute on function public.move_credits(uuid, integer, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.grant_credit_payment(text, uuid, text, numeric, text, integer) from public, anon, authenticated;
grant execute on function public.move_credits(uuid, integer, text, text, text, text) to service_role;
grant execute on function public.grant_credit_payment(text, uuid, text, numeric, text, integer) to service_role;
