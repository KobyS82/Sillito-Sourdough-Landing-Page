-- Run this entire file in the Supabase SQL Editor (supabase.com → your project → SQL Editor)

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  first_name text not null,
  last_name text not null,
  phone text,
  sms_opt_in boolean not null default false,
  email_opt_in boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists weeks (
  id text primary key,             -- YYYY-MM-DD, e.g. "2026-05-03"
  label text not null,             -- "Week of May 3"
  available int not null default 4,
  total_capacity int not null default 4,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  week_id text references weeks(id) on delete set null,
  loaves int not null check (loaves > 0 and loaves <= 20),
  notes text,
  status text not null default 'pending'
    check (status in ('pending','confirmed','cancelled','completed')),
  payment_method text
    check (payment_method in ('cash','venmo',null)),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','paid')),
  pickup_details text,
  created_at timestamptz not null default now()
);

create table if not exists recurring_preferences (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid unique not null references customers(id) on delete cascade,
  loaves int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  requested_loaves int not null default 1,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_customer  on orders(customer_id);
create index if not exists idx_orders_week      on orders(week_id);
create index if not exists idx_orders_status    on orders(status);
create index if not exists idx_orders_created   on orders(created_at desc);
create index if not exists idx_customers_email  on customers(email);
create index if not exists idx_waitlist_notified on waitlist(notified);

-- Disable RLS — our API layer handles auth via ADMIN_PASSWORD env var
alter table customers            disable row level security;
alter table weeks                disable row level security;
alter table orders               disable row level security;
alter table recurring_preferences disable row level security;
alter table waitlist             disable row level security;
