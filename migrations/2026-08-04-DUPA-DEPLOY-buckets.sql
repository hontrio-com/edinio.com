-- ============================================================================
-- Bucketurile Supabase Storage — Tier C din security-hardening-2026-06-22.sql,
-- ramas neaplicat de atunci.
--
-- RESTRICTIVA (DROP POLICY). De aplicat DUPA deploy, ca orice migratie care ia
-- drepturi — vezi incidentul din 04.08.2026.
--
-- CONTEXT MASURAT (04.08.2026): bucketurile sunt aproape goale, fiindca imaginile
-- au migrat pe Cloudflare R2. products 14 obiecte, course-videos 7, logos 2,
-- covers 1, support-attachments 1. Deci riscul de a rupe ceva e mic — dar tot
-- trebuie verificat dupa aplicare, fiindca „aproape gol" nu inseamna „nefolosit".
--
-- CE E IN NEREGULA ACUM:
--
-- 1. `business_images_owner_delete` are conditia `auth.uid() IS NOT NULL`, adica
--    ORICE cont autentificat poate sterge ORICE fisier din `business-images` —
--    inclusiv ale altui comerciant. Nu e o scapare de sintaxa: politica chiar nu
--    verifica proprietarul. Aceeasi problema la `business_images_owner_upload`,
--    unde numele spune „owner" dar conditia nu il verifica.
--
-- 2. `auth_read_support_attachments` lasa orice cont autentificat sa citeasca
--    atasamentele de suport ale TUTUROR — bonuri, capturi de ecran, documente
--    trimise la reclamatii.
--
-- 3. Politicile de SELECT pe bucketurile publice permit LISTAREA continutului.
--    Un bucket public serveste fisierele dupa URL si FARA politica de SELECT;
--    politica nu e necesara pentru afisare, doar pentru enumerare. Fara ea,
--    fisierele raman accesibile dupa link, dar nu se mai pot inventaria.
--
-- VERIFICAT INAINTE (grep pe tot src/): aplicatia nu apeleaza NICAIERI
-- `.storage.from(...).list()` sau `.download()`, si nu mai foloseste aceste
-- bucketuri prin nume — incarcarile merg pe R2. Deci pierderea dreptului de
-- listare nu rupe niciun ecran.
-- ============================================================================

begin;

-- 1. Stergerea si incarcarea in `business-images`: doar in propriul dosar.
--    Cheia obiectelor incepe cu id-ul utilizatorului, la fel ca in politica
--    "Owners can delete own uploads" care exista deja si e scrisa corect.
drop policy if exists "business_images_owner_delete" on storage.objects;
drop policy if exists "business_images_owner_upload" on storage.objects;

create policy "business_images_delete_propriu" on storage.objects
  for delete to authenticated
  using (bucket_id = 'business-images' AND (storage.foldername(name))[1] = auth.uid()::text);

create policy "business_images_upload_propriu" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'business-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2. Atasamentele de suport: fiecare le vede pe ale lui. Personalul de suport
--    citeste prin service role (panoul de admin), deci nu e afectat.
drop policy if exists "auth_read_support_attachments" on storage.objects;

create policy "support_attachments_citire_proprie" on storage.objects
  for select to authenticated
  using (bucket_id = 'support-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Fara enumerare pe bucketurile publice. Fisierele raman accesibile dupa URL.
drop policy if exists "Public read access for images" on storage.objects;   -- images
drop policy if exists "business_images_public_read" on storage.objects;     -- business-images
drop policy if exists "Anyone can view public images" on storage.objects;   -- logos/covers/gallery/products/avatars

-- 4. Limite de dimensiune si tip pe bucketurile care n-aveau niciuna. Fara ele,
--    orice cont logat putea incarca fisiere de orice marime si orice tip —
--    inclusiv HTML sau SVG, servite apoi de pe domeniul Supabase.
update storage.buckets
   set file_size_limit = 10485760,  -- 10 MB
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
 where id in ('images','business-images','logos','covers','gallery','products','avatars');

commit;

-- ============================================================================
-- VERIFICARE DUPA APLICARE:
--
--   -- 1. Nicio politica nu mai are conditia „doar sa fii logat":
--   SELECT policyname, cmd, qual, with_check FROM pg_policies
--   WHERE schemaname='storage'
--     AND (qual LIKE '%auth.uid() IS NOT NULL%' OR with_check LIKE '%auth.uid() IS NOT NULL%');
--   -- Asteptat: zero randuri.
--
--   -- 2. Bucketurile au limite:
--   SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id;
--   -- Asteptat: cele 7 bucketuri de imagini au 10485760 si lista de tipuri.
--
-- SI, MANUAL: deschide un magazin public si verifica logo-ul si o imagine de
-- produs. Ele se servesc dupa URL, deci trebuie sa apara neschimbate.
-- ============================================================================
