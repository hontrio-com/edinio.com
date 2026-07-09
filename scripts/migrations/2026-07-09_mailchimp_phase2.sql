-- Mailchimp Phase 2.
--
-- Suppression list: when a contact unsubscribes or is cleaned in Mailchimp, their
-- webhook fires and we record the email here so we never re-add them (belt-and-
-- suspenders on top of `status_if_new`, and survives audience changes). Writes come
-- from the webhook via the service role; owners may read their own for visibility.
--
-- New mailchimp_config keys (jsonb, no migration needed): webhook_secret,
-- ecommerce_sync, ecommerce_store_id, auth_method.
create table if not exists public.mailchimp_suppressions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (business_id, email)
);

alter table public.mailchimp_suppressions enable row level security;

create policy "Owners read own mailchimp suppressions" on public.mailchimp_suppressions
  for select using (exists (select 1 from public.businesses b where b.id = business_id and b.user_id = auth.uid()));

create index if not exists mailchimp_suppressions_business_email_idx on public.mailchimp_suppressions (business_id, email);
