-- Adaugă coloana role la profiles
alter table public.profiles
  add column if not exists role text not null default 'student'
  check (role in ('student', 'admin'));

-- Setează un utilizator ca admin (înlocuiește cu emailul tău și rulează manual):
-- update public.profiles set role = 'admin' where email = 'tu@emailul.tau';

-- Politică RLS: adminii pot vedea toate profilurile
create policy "Admins can view all profiles" on public.profiles
  for select using (
    auth.uid() in (
      select id from public.profiles where role = 'admin'
    )
  );

-- Politică RLS: adminii pot gestiona cursurile
create policy "Admins can manage courses" on public.courses
  for all using (
    auth.uid() in (
      select id from public.profiles where role = 'admin'
    )
  );

-- Adminii pot gestiona lecțiile
create policy "Admins can manage lessons" on public.lessons
  for all using (
    auth.uid() in (
      select id from public.profiles where role = 'admin'
    )
  );

-- Adminii pot vedea toate achizițiile
create policy "Admins can view all purchases" on public.purchases
  for select using (
    auth.uid() in (
      select id from public.profiles where role = 'admin'
    )
  );

-- Adminii pot gestiona bundle-urile
create policy "Admins can manage bundles" on public.bundles
  for all using (
    auth.uid() in (
      select id from public.profiles where role = 'admin'
    )
  );

create policy "Admins can manage bundle_courses" on public.bundle_courses
  for all using (
    auth.uid() in (
      select id from public.profiles where role = 'admin'
    )
  );
