-- Sistem de design pe secțiuni pentru storefront.
--
-- Până acum aspectul unui magazin era practic nepersonalizabil: ordinea secțiunilor
-- era hardcodată în MiniStoreRenderer, iar singurele reglaje erau businesses.primary_color,
-- page_content.store_bg_color și mărimea logo-ului. Noul sistem oferă, pentru fiecare
-- secțiune (header, hero, caruseluri, footer etc.), o galerie de variante de design pe
-- care comerciantul le alege independent, plus reordonarea secțiunilor.
--
-- De ce coloane noi și nu încă o cheie în page_content: page_content este un jsonb cu
-- 40+ chei fără proprietar, descris de trei interfețe TypeScript divergente și scris
-- printr-un merge shallow care poate șterge chei necunoscute. Configurația de design
-- primește propria coloană, propria acțiune validată (Zod) și propria versionare.
--
-- Ciorna stă într-o coloană SEPARATĂ, nu în același obiect, tocmai ca storefrontul
-- public să nu selecteze niciodată octeți de ciornă — deci nu există risc de scurgere
-- de conținut nepublicat către vizitatori.
--
-- STRICT ADITIV: nu se modifică niciun tabel, coloană, policy sau funcție existentă.
-- Magazinele existente rămân cu '{}' și randează exact ca înainte: parseStoreDesign()
-- derivă la citire designul „classic" din flag-urile actuale din page_content, deci nu
-- e nevoie de nicio migrare de date.
--
-- RLS: store_settings are deja policy-uri owner-only și NU are SELECT public (vezi
-- scripts/security/01_lock_store_settings_after_deploy.sql). Storefrontul public
-- citește cu service-role. Coloanele noi moștenesc exact acest model — nimic de adăugat.

alter table public.store_settings
  -- Designul PUBLICAT. Singurul citit de paginile publice.
  add column if not exists storefront_design jsonb not null default '{}'::jsonb,
  -- Ciorna din editor. Vizibilă doar proprietarului, în /{slug}?preview=1.
  -- NULL = nu există modificări nepublicate.
  add column if not exists storefront_design_draft jsonb,
  -- Momentul ultimei publicări, pentru „Revino la versiunea publicată" și pentru
  -- afișarea stării în editor.
  add column if not exists storefront_design_pub_at timestamptz;

comment on column public.store_settings.storefront_design is
  'Design publicat al magazinului (secțiuni + variante + tokens de stil). {} = designul classic derivat din page_content.';
comment on column public.store_settings.storefront_design_draft is
  'Ciornă nepublicată din editorul de design. NULL cand nu exista modificari nepublicate.';
comment on column public.store_settings.storefront_design_pub_at is
  'Momentul ultimei publicări a designului.';
