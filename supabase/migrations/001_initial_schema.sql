-- Users profile (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  preferred_language text default 'ro' check (preferred_language in ('ro', 'en')),
  stripe_customer_id text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Courses
create table public.courses (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  title_ro text not null,
  title_en text not null,
  description_ro text,
  description_en text,
  price_ron integer not null,        -- in bani (250 RON = 25000)
  price_eur integer not null,        -- in cents (50 EUR = 5000)
  stripe_price_id_ron text,
  stripe_price_id_eur text,
  thumbnail_url text,
  promo_video_url text,
  is_published boolean default false,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- Lessons
create table public.lessons (
  id uuid default gen_random_uuid() primary key,
  course_id uuid references public.courses(id) on delete cascade,
  title_ro text not null,
  title_en text not null,
  description_ro text,
  description_en text,
  bunny_video_id text,               -- Bunny.net video ID
  duration_seconds integer,
  sort_order integer not null,
  is_preview boolean default false,  -- Free preview lesson
  created_at timestamptz default now()
);

-- Purchases
create table public.purchases (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id),
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  amount_paid integer not null,      -- in smallest currency unit
  currency text not null default 'ron',
  status text not null default 'pending' check (status in ('pending', 'completed', 'refunded')),
  purchased_at timestamptz default now()
);

-- Lesson progress
create table public.lesson_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  completed boolean default false,
  progress_seconds integer default 0,
  last_watched_at timestamptz default now(),
  unique(user_id, lesson_id)
);

-- Bundles (many courses in one purchase)
create table public.bundles (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  title_ro text not null,
  title_en text not null,
  price_ron integer not null,
  price_eur integer not null,
  stripe_price_id_ron text,
  stripe_price_id_eur text,
  is_published boolean default false
);

create table public.bundle_courses (
  bundle_id uuid references public.bundles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  primary key (bundle_id, course_id)
);

-- Bundle purchases
create table public.bundle_purchases (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  bundle_id uuid references public.bundles(id),
  stripe_session_id text unique,
  amount_paid integer not null,
  currency text not null default 'ron',
  status text not null default 'pending',
  purchased_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.purchases enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.bundles enable row level security;
alter table public.bundle_courses enable row level security;
alter table public.bundle_purchases enable row level security;

-- Profiles: users see only their own
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Courses: published courses are public
create policy "Anyone can view published courses" on public.courses
  for select using (is_published = true);

-- Lessons: preview lessons are public; others require purchase
create policy "Preview lessons are public" on public.lessons
  for select using (is_preview = true);

create policy "Purchased lessons are accessible" on public.lessons
  for select using (
    is_preview = true
    or exists (
      select 1 from public.purchases p
      where p.user_id = auth.uid()
        and p.course_id = lessons.course_id
        and p.status = 'completed'
    )
    or exists (
      select 1 from public.bundle_purchases bp
      join public.bundle_courses bc on bc.bundle_id = bp.bundle_id
      where bp.user_id = auth.uid()
        and bc.course_id = lessons.course_id
        and bp.status = 'completed'
    )
  );

-- Purchases: users see only their own
create policy "Users can view own purchases" on public.purchases
  for select using (auth.uid() = user_id);

-- Lesson progress: users manage their own
create policy "Users manage own progress" on public.lesson_progress
  for all using (auth.uid() = user_id);

-- Bundles: published are public
create policy "Anyone can view published bundles" on public.bundles
  for select using (is_published = true);
create policy "Anyone can view bundle courses" on public.bundle_courses
  for select using (true);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Updated_at trigger
create or replace function public.handle_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger handle_updated_at before update on public.profiles
  for each row execute procedure public.handle_updated_at();
