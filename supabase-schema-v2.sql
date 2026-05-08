-- Run this in Supabase SQL Editor — additive migration, safe to run on existing schema

-- ── Products ──────────────────────────────────────────────────────────────────
create table if not exists products (
  id               text primary key,
  name             text not null,
  description      text,
  price_each_cents int,          -- null = price shared at confirmation
  deal_qty         int,          -- 3  (for "3 for $X")
  deal_price_cents int,          -- 1000 (for "$10")
  category         text not null default 'other',
  active           boolean not null default true,
  sort_order       int not null default 0
);

-- ── Locations ─────────────────────────────────────────────────────────────────
create table if not exists locations (
  id         text primary key,
  name       text not null,
  address    text,
  notes      text,
  active     boolean not null default true,
  sort_order int not null default 0
);

-- ── Recurring schedule templates ──────────────────────────────────────────────
create table if not exists schedule_templates (
  id            uuid primary key default gen_random_uuid(),
  location_id   text not null references locations(id) on delete cascade,
  day_of_week   int  not null check (day_of_week between 0 and 6), -- 0=Sun … 6=Sat
  window_start  time not null,
  window_end    time not null,
  valid_from    date,           -- null = starts immediately
  valid_until   date,           -- null = indefinite
  active        boolean not null default true,
  note          text,
  created_at    timestamptz not null default now()
);

-- ── Pickup slots (generated from templates or created manually) ───────────────
create table if not exists pickup_slots (
  id             uuid primary key default gen_random_uuid(),
  location_id    text not null references locations(id) on delete cascade,
  slot_date      date not null,
  window_start   time not null,
  window_end     time not null,
  generated_from uuid references schedule_templates(id) on delete set null,
  cancelled      boolean not null default false,
  note           text,
  created_at     timestamptz not null default now()
);

-- ── Per-product capacity per slot ─────────────────────────────────────────────
create table if not exists slot_products (
  slot_id        uuid not null references pickup_slots(id) on delete cascade,
  product_id     text not null references products(id) on delete cascade,
  total_capacity int,           -- null = made to order / unlimited
  booked         int not null default 0,
  primary key (slot_id, product_id)
);

-- ── Order line items ──────────────────────────────────────────────────────────
create table if not exists order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  product_id       text not null references products(id),
  quantity         int not null check (quantity > 0),
  unit_price_cents int,         -- null = TBD
  total_price_cents int         -- null = TBD
);

-- ── Extend existing orders table ──────────────────────────────────────────────
alter table orders
  add column if not exists slot_id          uuid references pickup_slots(id) on delete set null,
  add column if not exists total_price_cents int;

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_pickup_slots_date     on pickup_slots(slot_date);
create index if not exists idx_pickup_slots_loc_date on pickup_slots(location_id, slot_date);
create index if not exists idx_slot_products_slot    on slot_products(slot_id);
create index if not exists idx_order_items_order     on order_items(order_id);

-- ── Disable RLS on new tables ─────────────────────────────────────────────────
alter table products           disable row level security;
alter table locations          disable row level security;
alter table schedule_templates disable row level security;
alter table pickup_slots       disable row level security;
alter table slot_products      disable row level security;
alter table order_items        disable row level security;

-- ── Seed: products ────────────────────────────────────────────────────────────
insert into products (id, name, description, price_each_cents, deal_qty, deal_price_cents, category, sort_order)
values
  ('sourdough', 'Sourdough Loaf',
   'Slow-fermented, hand-shaped. Baked fresh every Tuesday night.',
   null, null, null, 'bread', 0),
  ('cookies', 'NYC-Style Cookies',
   'Large bakery-style cookies. Crispy edge, chewy center. Inspired by Jacques Torres.',
   400, 3, 1000, 'cookies', 1)
on conflict (id) do update set
  price_each_cents = excluded.price_each_cents,
  deal_qty         = excluded.deal_qty,
  deal_price_cents = excluded.deal_price_cents,
  description      = excluded.description;

-- ── Seed: locations ───────────────────────────────────────────────────────────
insert into locations (id, name, address, notes, sort_order)
values
  ('home',          'Home Pickup',               'Austin, TX (address at confirmation)',
   'Available after each Tuesday bake. Flexible timing — just coordinate by email.',            0),
  ('rabadis',       'Rabadi''s BJJ',             'Austin, TX',
   'Monday & Wednesday evenings.',                                                              1),
  ('miguels',       'Miguel''s Gym',             'Austin, TX',
   'Saturday midday.',                                                                          2),
  ('acc_highlands', 'ACC Highlands Campus',      'Austin, TX',
   'Tuesday & Thursday around 3 PM.',                                                           3),
  ('ut_pickle',     'UT Pickle Research Campus', 'Austin, TX',
   'Weekdays during the workday.',                                                              4)
on conflict (id) do nothing;
