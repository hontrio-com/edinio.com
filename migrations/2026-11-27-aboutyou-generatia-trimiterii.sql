-- ═══════════════════════════════════════════════════════════════════════════
-- UN LOT „NECUNOSCUT" BLOCA PRODUSUL PENTRU TOTDEAUNA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CUM (27.08.2026, seara)
--
-- Dimineata am adaugat `intentie` si `necunoscut` la verificarea fratilor, ca un produs cu peste
-- 100 de variante sa nu se publice cu o transa lipsa. Corect - dar a deschis un fund de sac:
--
--     transa A → cerere trimisa → 5xx / retea cazuta → randul ramane `necunoscut`
--     `caUnRezultat` o socoteste reluabila (un produs retrimis da acelasi produs)
--     coada reia → transa A2 → `completed` ✅
--     dar randul `necunoscut` al lui A RAMANE, si n-are `batchRequestId`
--     → nu poate fi sondat NICIODATA
--     → verificarea fratilor il gaseste mereu
--     → produsul nu se mai publica NICIODATA
--
-- `alarmaIntentiiDeschise` il raporta, dar raportarea nu e rezolvare.
--
-- ⚠ SI MAI E CEVA, mai subtil: nu exista nicio GENERATIE a trimiterii. Un lot vechi, plecat cu
-- produsul rosu, se poate aseza la ei DUPA unul nou plecat cu produsul albastru - iar la ei ramane
-- rosu. `generation` din coada apara coada locala; nu poate opri o cerere externa deja plecata.
-- La stoc si pret asta il rezolva `valid_at`; la payload-ul de produs n-aveam nimic.
--
-- ⚠ CE ADUCE GENERATIA:
--
--   * fratii se numara DOAR in generatia curenta. Un `necunoscut` dintr-o generatie depasita nu
--     mai blocheaza nimic - fiindca ce a trimis el a fost oricum inlocuit de ce am trimis dupa.
--   * un lot care se aseaza intr-o generatie veche nu mai publica si nu mai scrie starea: ce
--     spune el despre produs e despre o versiune care nu mai exista.
--   * loturile ramase deschise din generatii vechi se inchid ca `depasit`, deci alarma tace.
--
-- ⚠ SE CRESTE INTR-UN RPC, nu prin citeste-si-scrie: doi lucratori care trimit acelasi produs in
-- aceeasi clipa ar citi amandoi aceeasi valoare si ar crede amandoi ca-s generatia curenta.

alter table public.aboutyou_listings
  add column if not exists generatie integer not null default 0;

alter table public.aboutyou_batches
  add column if not exists generatie integer;

comment on column public.aboutyou_listings.generatie is
  'A cata oara s-a trimis produsul. Creste la fiecare trimitere; loturile poarta generatia in care au plecat.';
comment on column public.aboutyou_batches.generatie is
  'Generatia listarii in care a plecat lotul. Numai loturile generatiei CURENTE blocheaza publicarea.';

create index if not exists aboutyou_batches_generatie_idx
  on public.aboutyou_batches (business_id, kind, generatie)
  where generatie is not null;

-- Creste generatia si o intoarce. Atomic: doi lucratori nu pot primi acelasi numar.
create or replace function public.aboutyou_generatie_noua(p_listing_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_gen integer;
begin
  update public.aboutyou_listings
     set generatie = generatie + 1, updated_at = now()
   where id = p_listing_id
  returning generatie into v_gen;
  return v_gen;  -- null cand listarea nu exista: apelantul hotaraste
end;
$function$;

revoke all on function public.aboutyou_generatie_noua(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
