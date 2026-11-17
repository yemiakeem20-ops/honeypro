-- Run this SQL in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.honeypro_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  phone text not null,
  whatsapp_number text,
  email text,
  state text not null,
  city text not null,
  address text not null,
  delivery_note text,
  quantity integer not null check (quantity between 1 and 5),
  unit_price numeric(12,2) not null,
  total_amount numeric(12,2) not null,
  currency text not null default 'NGN',
  consent boolean not null default false,
  source text not null default 'website',
  status text not null default 'new'
);

-- Admin access list: only authenticated users whose auth UUID is listed here can read orders.
create table if not exists public.honeypro_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.honeypro_orders enable row level security;
alter table public.honeypro_admins enable row level security;

drop policy if exists "Admins can read HoneyPro orders" on public.honeypro_orders;
create policy "Admins can read HoneyPro orders"
on public.honeypro_orders for select to authenticated
using (exists (select 1 from public.honeypro_admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can update HoneyPro orders" on public.honeypro_orders;
create policy "Admins can update HoneyPro orders"
on public.honeypro_orders for update to authenticated
using (exists (select 1 from public.honeypro_admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.honeypro_admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can read their admin record" on public.honeypro_admins;
create policy "Admins can read their admin record"
on public.honeypro_admins for select to authenticated
using (user_id = auth.uid());

-- Orders are inserted only by the Netlify server function using the service-role key.
-- Do not add a public insert policy. Never expose the service-role key in frontend files.

-- After creating your admin user under Supabase > Authentication > Users,
-- copy that user's UUID and run:
-- insert into public.honeypro_admins (user_id) values ('PASTE-AUTH-USER-UUID-HERE');

-- Explicit API privileges: only signed-in users receive SELECT access,
-- and RLS policies above restrict that access to approved administrators.
revoke all on table public.honeypro_orders from anon, authenticated;
revoke all on table public.honeypro_admins from anon, authenticated;
grant select on table public.honeypro_orders to authenticated;
grant select on table public.honeypro_admins to authenticated;
