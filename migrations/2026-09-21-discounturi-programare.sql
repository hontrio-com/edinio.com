-- ═══════════════════════════════════════════════════════════════════════════
-- DE CAND PANA CAND TINE UN COD                                  (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Etapa E a redesignului sectiunii Discounturi: un cod se poate programa.
--
-- ⚠⚠ DOUA LUCRURI DEODATA, SI AL DOILEA E O REPARATIE.
--
--   1. `starts_at` — coloana noua. Ecranul o astepta deja: `src/lib/discounts/
--      stare.ts` are de ieri starea „programat", iar filtrul are optiunea. Pana
--      acum nu se putea aprinde niciodata, fiindca nu exista de unde.
--
--   2. Ziua scrisa de comerciant devine o ZI ROMANEASCA, nu una UTC. Formularul
--      trimitea „2026-08-31", `TimeZone` al bazei e UTC (masurat pe productie),
--      deci in coloana ajungea `2026-08-31 00:00:00+00` — ora 03:00 dimineata,
--      ora Romaniei, in CHIAR ziua aceea. Cine scria „tine pana pe 31 august"
--      pierdea 21 de ore din ultima zi, si codul murea in somn.
--
-- ⚠ AL DOILEA PUNCT MISCA BANI, deci s-a masurat inainte. In productie, la
-- 21.09.2026: 14 coduri cu totul, dintre care DOUA cu data — `VARA10` (denly,
-- oprit, expirat din iulie) si `ANCA7` (tonel-beauty, 7%, expira 14.10.2027,
-- zero utilizari). Singurul rand viu castiga 21 de ore, peste treisprezece luni.

alter table public.discounts
  add column if not exists starts_at timestamp with time zone;

comment on column public.discounts.starts_at is
  'Clipa exacta de la care codul poate fi folosit. Null = de la inceput. Scrisa din ziua romaneasca aleasa in panou, la 00:00:00 ora Romaniei — vezi src/lib/discounts/perioada.ts.';

comment on column public.discounts.expires_at is
  'Clipa exacta pana la care codul poate fi folosit, INCLUSIV. Null = fara sfarsit. Scrisa din ziua romaneasca aleasa in panou, la 23:59:59,999 ora Romaniei — vezi src/lib/discounts/perioada.ts.';

-- ── Randurile vechi, aduse la intelesul cel nou ───────────────────────────
--
-- ⚠ SE ATING DOAR RANDURILE CARE POARTA SEMNATURA SCRIERII VECHI: fix miezul
-- noptii UTC. Aia era singura forma pe care o putea produce formularul de pana
-- azi (un `input type="date"` trimis ca „YYYY-MM-DD"). Orice alta ora inseamna
-- ca a pus-o altcineva, cu alt inteles, si nu e treaba migratiei asteia.
--
-- ⚠ NU SE ATINGE `starts_at`: e coloana noua, deci e goala peste tot.

update public.discounts
set expires_at = (
      ((expires_at at time zone 'UTC')::date + interval '1 day' - interval '1 millisecond')
      at time zone 'Europe/Bucharest'
    ),
    updated_at = now()
where expires_at is not null
  and (expires_at at time zone 'UTC')::time = '00:00:00';

-- ── Revendicarea atomica afla si ea de timp ───────────────────────────────
--
-- ⚠⚠ PANA AZI, SINGURA CONDITIE ERA `max_uses`. Tot restul — pornit/oprit,
-- expirat, iar de azi si programat — se verifica numai in `validateDiscount`,
-- adica intr-o CITIRE facuta cu cateva sute de milisecunde mai devreme. Intre
-- ele incap: comerciantul care stinge codul, data care trece, campania care
-- porneste. Un cod stins in secunda aceea se revendica oricum.
--
-- ⚠⚠ SI E SINGURUL LOC CARE CHIAR REFUZA. O regula pusa doar in TypeScript e o
-- citire urmata de o scriere, adica doua tranzactii: doua comenzi deodata trec
-- amandoua. Conditia trebuie sa stea in CHIAR instructiunea care scrie, langa
-- `max_uses`, si Postgres reciteste randul incuiat inainte s-o judece.
--
-- ⚠ NU se schimba semnatura: `claim_discount_use(uuid)` ramane cum era, deci
-- granturile de pe ea raman valabile si nu ramane nicio forma veche in urma.

create or replace function public.claim_discount_use(p_discount_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_claimed integer;
begin
  update public.discounts
  set uses_count = uses_count + 1, updated_at = now()
  where id = p_discount_id
    and (max_uses is null or uses_count < max_uses)
    and is_active
    and (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at >= now());

  get diagnostics v_claimed = row_count;
  return v_claimed > 0;
end;
$function$;

-- ── Si drumul intors: o comanda readusa la viata ──────────────────────────
--
-- ⚠ `reclaim_order_discount` repeta verificarea de plafon in copie (era scrisa
-- a doua oara acolo). Lasata pe vechea regula, o comanda anulata si reactivata
-- ar fi trecut peste o programare care inca nu a inceput sau peste o data care
-- a trecut deja. Aici insa purtarea e ALTA, dinadins: comanda EXISTA deja si a
-- fost platita, deci codul nu se mai judeca dupa calendar — se judeca doar dupa
-- plafon. O campanie incheiata nu are de ce sa anuleze o comanda veche adusa
-- inapoi din anulare.
--
-- Nu se atinge, si motivul e scris aici ca sa nu para o scapare.

revoke all on function public.claim_discount_use(uuid) from public;
revoke all on function public.claim_discount_use(uuid) from anon, authenticated;
grant execute on function public.claim_discount_use(uuid) to service_role;

-- ── A DOUA USA CATRE ACELASI CONTOR, SE INCHIDE ───────────────────────────
--
-- ⚠⚠ `increment_discount_uses(uuid)` creste `uses_count` FARA nicio conditie:
-- nici plafon, nici pornit/oprit, nici date. Adica orice regula pusa in
-- `claim_discount_use` — si de azi sunt patru — e ocolita din start de cine
-- cheama functia asta.
--
-- ⚠ MASURAT INAINTE DE STERGERE, nu presupus. Zero apelanti in `src/` (apare
-- doar in `database.types.ts`, adica in tipurile generate); zero apelanti in
-- corpul oricarei alte functii din `public`; zero declansatoare. Verificat pe
-- baza demo la 21.09.2026, prin `pg_proc.prosrc` si `pg_trigger`.
--
-- Era `security definer` si executabila de `service_role`, deci nu o usa
-- teoretica: o usa deschisa, pe care nu umbla nimeni.

drop function if exists public.increment_discount_uses(uuid);

notify pgrst, 'reload schema';
