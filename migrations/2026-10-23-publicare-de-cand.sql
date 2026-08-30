-- ══════════════════════════════════════════════════════════════════════════
-- PLASA DE PUBLICARE NU MAI PRINDE PRODUSE FACUTE INAINTE DE COMUTATOR (25.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- `emag_produse_noi_nepublicate` intreaba, de ieri: „produs activ, facut in ultimele ore,
-- fara nicio oferta eMAG?". Cronul adauga: „si numai la magazinele cu `auto_publish` aprins
-- ACUM". Cele doua conditii impreuna las-a o gaura:
--
--   10:00  comerciantul face un produs. `auto_publish` e STINS. El nu vrea sa-l publice.
--   11:00  aprinde comutatorul, gandindu-se la produsele de MAINE.
--   11:03  plasa vede un produs facut acum o ora, fara oferta, intr-un magazin cu
--          `auto_publish` aprins — si il publica.
--
-- Produsul pleaca la eMAG fara ca nimeni sa fi cerut asta. E chiar incidentul din 24.08,
-- micsorat la 24 de ore: „plasa repara ce s-a stricat, nu porneste ce n-a fost cerut".
--
-- ═══ ⚠ CE LIPSEA: „DE CAND" ═══
--
-- Fereastra de ore spune cat de departe se uita plasa inapoi. Nu spune de cand e voie sa se
-- uite. Aia e o intrebare despre INTENTIA OMULUI, si raspunsul nu se poate ghici din produse.
--
-- Se scrie o singura data, la trecerea comutatorului din stins in aprins:
-- `emag_config.auto_publish_since`. Plasa cere de acum AMANDOUA:
--
--     p.created_at > now() - fereastra        cat de departe ne uitam
--     p.created_at > auto_publish_since       de cand avem voie
--
-- ⚠ NULL INSEAMNA NU. Fara `auto_publish_since`, functia nu intoarce nimic — nici cronul
-- n-o mai cheama. Regula casei: „nu se stie" nu se citeste ca „da", cu atat mai putin cand
-- raspunsul gresit trimite marfa la vanzare in numele comerciantului.
--
-- ⚠ DE CE NU UN DECLANSATOR PE `products`, cum cerea auditul. El ar fi scris intentia la
-- fiecare inserare de produs, din orice cale — corect, si ar fi raspuns obiectiei ca „o cale
-- uitata muta defectul". Dar ar fi pus o scriere in plus pe drumul cel mai fierbinte din
-- aplicatie (importurile scriu produse in loturi de sute) pentru o informatie care e
-- ACEEASI pentru toate produsele unui magazin la un moment dat. O data pe magazin, la
-- apasarea comutatorului, spune exact acelasi lucru si nu costa nimic.

-- ── 1) Cine are comutatorul aprins ACUM primeste un „de cand" = acum ──────────
--
-- ⚠ ACUM, nu `created_at`-ul magazinului. Retroactiv ar fi insemnat exact publicarea pe care
-- migratia asta o opreste: catalogul de pana azi devenea deodata „cerut".
--
-- ⚠ Se scrie in `privat.store_settings`, nu prin vederea publica: acolo declansatoarele
-- `instead of` cripteaza campurile din `campuri_secrete`, iar parola eMAG e deja criptata in
-- rand. Trecuta a doua oara prin criptare, ar fi devenit necitibila si magazinul ar fi
-- primit 401 de la eMAG.
update privat.store_settings
   set emag_config = jsonb_set(
         emag_config, '{auto_publish_since}', to_jsonb(now()), true)
 where emag_config->>'auto_publish' = 'true'
   and emag_config->>'auto_publish_since' is null;

-- ── 2) Functia cere si „de cand" ──────────────────────────────────────────────
--
-- ⚠ Semnatura se schimba, deci vechea forma se sterge ANUME. Lasata, ar fi ramas o a doua
-- functie cu acelasi nume si trei argumente — chemabila, si fara paza noua.
drop function if exists public.emag_produse_noi_nepublicate(uuid, int, int);

create or replace function public.emag_produse_noi_nepublicate(
  p_business_id uuid,
  p_ore int default 24,
  p_limita int default 50,
  p_de_cand timestamptz default null
)
returns table (id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p.id, p.created_at
    from public.products p
   -- ⚠ FARA „DE CAND", NIMIC. Marca se scrie la trecerea stins -> aprins a comutatorului
   -- „Publica automat". Lipsa ei nu se citeste ca „da": ar publica marfa in numele omului.
   where p_de_cand is not null
     and p.business_id = p_business_id
     and p.is_active
     -- ⚠ FEREASTRA E TOT ROSTUL: fara ea, un catalog vechi ar intra in publicare la prima
     -- aprindere a comutatorului. Pe 24.08.2026 o plasa care nu deosebea „n-a plecat
     -- niciodata" de „s-a pierdut o schimbare" a publicat singura 116 oferte.
     and p.created_at > now() - make_interval(hours => greatest(1, least(coalesce(p_ore, 24), 72)))
     -- ⚠ SI A DOUA TAIETURA: un produs facut INAINTE de aprindere n-a fost cerut de nimeni.
     and p.created_at > p_de_cand
     and not exists (
       select 1 from public.emag_offers e
        where e.business_id = p.business_id and e.product_id = p.id
     )
   order by p.created_at asc
   limit greatest(1, least(coalesce(p_limita, 50), 200));
$$;

comment on function public.emag_produse_noi_nepublicate(uuid, int, int, timestamptz) is
  'Produse NOI (fereastra de ore SI dupa aprinderea comutatorului) fara nicio oferta eMAG. Fara p_de_cand nu intoarce nimic.';

-- ⚠ `security definer` peste produsele oricui: fara revoke, EXECUTE ramane la PUBLIC dupa
-- fiecare `create or replace`, si o cheie anonima ar citi catalogul altui magazin.
revoke execute on function public.emag_produse_noi_nepublicate(uuid, int, int, timestamptz) from public, anon, authenticated;
grant execute on function public.emag_produse_noi_nepublicate(uuid, int, int, timestamptz) to service_role;

notify pgrst, 'reload schema';
