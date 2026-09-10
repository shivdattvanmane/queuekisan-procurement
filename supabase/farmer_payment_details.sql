create table if not exists public.farmer_payment_details (
  farmer_id text primary key references public.farmers(id) on delete cascade,
  account_holder text not null default '',
  bank_name text not null default '',
  account_number text not null default '',
  ifsc_code text not null default '',
  upi_id text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.farmer_payment_details enable row level security;

create policy "Public app can read farmer payment details"
on public.farmer_payment_details
for select
using (true);

create policy "Public app can insert farmer payment details"
on public.farmer_payment_details
for insert
with check (true);

create policy "Public app can update farmer payment details"
on public.farmer_payment_details
for update
using (true)
with check (true);
