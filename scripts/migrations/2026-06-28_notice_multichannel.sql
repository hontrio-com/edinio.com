-- Multi-channel notice.ro (phase 2): outbound delivery tracking + inbound messages
-- Applied to prod 2026-06-28 via Supabase MCP.

-- 1. Outbound log gains channel + delivery tracking (DLR via webhook)
alter table public.notice_sms_log
  add column if not exists channel text not null default 'sms',
  add column if not exists provider_id text,
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz;

create index if not exists notice_sms_log_provider_id_idx
  on public.notice_sms_log(provider_id) where provider_id is not null;

-- 2. Inbound messages (SMS replies + WhatsApp inbound), filled by the webhook
create table if not exists public.notice_inbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  channel text not null default 'sms',
  from_number text,
  body text,
  order_id uuid references public.orders(id) on delete set null,
  raw jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists notice_inbox_business_idx
  on public.notice_inbox(business_id, received_at desc);

alter table public.notice_inbox enable row level security;

-- Owner manages their inbound messages; webhook writes use the service role (bypasses RLS).
drop policy if exists "Owner manages notice_inbox" on public.notice_inbox;
create policy "Owner manages notice_inbox" on public.notice_inbox
  for all using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );
