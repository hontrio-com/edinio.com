-- Media Library: a central, per-business catalog of every image/video uploaded to
-- the store. Until now uploads went straight to R2 (src/lib/r2.ts) with no record,
-- so the same file got re-uploaded repeatedly, there were no SEO metadata, and R2
-- deletion was scattered (deleteOrphanImages, tryDelete, deleteImage) — a source
-- of broken images. This table becomes the single inventory + the single R2
-- deletion authority. Rows are upserted on every upload and can be backfilled
-- (idempotently) from existing content. See plan: Biblioteca Media.

create table if not exists public.media_library (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,                 -- canonical public R2 URL
  r2_key text not null,              -- r2KeyFromUrl(url); for deletion + dedup
  type text not null default 'image',-- 'image' | 'video'
  mime_type text,
  file_name text,                    -- original filename (search/display)
  size_bytes bigint,
  width integer,
  height integer,
  duration_seconds numeric,
  folder text,                       -- origin bucket/source: products|logos|covers|gallery|pages
  alt_text text,                     -- SEO
  title text,                        -- SEO / display
  caption text,                      -- "Text asociat"
  description text,                  -- SEO
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per file per store. Backfill + register use this as the upsert target,
-- so re-running them never creates duplicates.
create unique index if not exists media_library_business_key_uidx
  on public.media_library (business_id, r2_key);

create index if not exists media_library_business_created_idx
  on public.media_library (business_id, created_at desc);
create index if not exists media_library_business_type_idx
  on public.media_library (business_id, type);

alter table public.media_library enable row level security;

-- Owner manages their own media. Server actions run as the logged-in user, so the
-- business_id must belong to them (same pattern as abandoned_carts/categories).
drop policy if exists "owner_all_media_library" on public.media_library;
create policy "owner_all_media_library" on public.media_library
  for all
  using (business_id in (select id from public.businesses where user_id = auth.uid()))
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));

-- NOTE: media_library is OWNER-ONLY (no public/anon SELECT). Public storefront pages
-- that need alt_text/title for SEO fetch it server-side via the service role
-- (createAdminClient), which bypasses RLS — so anon cannot enumerate media metadata.
-- (A public SELECT policy existed briefly on 2026-06-20 and was dropped the same day,
-- see migration 2026-06-20_media_library_drop_public_select.sql. SELECT was also
-- REVOKED from the anon role for defense in depth — see
-- 2026-06-20_media_library_revoke_anon.sql.)
