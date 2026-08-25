-- ══════════════════════════════════════════════════════════════════════════
-- O OFERTA LEGATA STRAMB SCRIE PRETUL ALTUI PRODUS (26.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Masurat pe contul unui comerciant real, in seara asta:
--
--   oferta lui 2   la eMAG „Masa de Cafea Dkd Home Decor"  la noi „DOOGIE VITA X 10 kg"
--   oferta lui 7   la eMAG „Tastatura Smart TV"            la noi „LOYALIS PREMIUM CAINI"
--   oferta lui 10  la eMAG „Laminator A4 Esperanza"        la noi „LOYALIS PREMIUM CAINI"
--   oferta lui 433 la eMAG „Vas wc Mondial"                la noi „Calibra Dog Life"
--
-- Toate cu `auto_sync = true` si cu `last_synced_at` din aceeasi seara. Adica ii scriam
-- preturi de hrana pentru caini peste listarile lui de mobila, electronice si obiecte
-- sanitare — 55,99 lei pe o masa de cafea, 203,99 pe o tastatura. La fiecare trecere a
-- cronului, si fara ca ceva sa dea eroare.
--
-- ⚠ CAUZA: id-urile ofertelor din contul LUI nu sunt ale noastre. La import, randurile s-au
-- legat dupa `emag_id`, iar acel id la ei inseamna azi alt produs decat cand s-a facut
-- legatura — sau n-a insemnat niciodata ce credeam. Reconcilierea scrie `nume_emag` de la ei
-- dupa acelasi id, deci randul ajunge o corcitura: numele LOR peste produsul NOSTRU.
--
-- ⚠ SI DE-AIA REGULA E DOAR PENTRU OFERTELE PRELUATE. La cele publicate de noi
-- (`creat_de_edinio`), legatura e corecta prin constructie: noi am creat oferta PENTRU acel
-- produs si ei ne-au dat id-ul inapoi. Acolo un nume diferit inseamna cu totul altceva —
-- oferta sta pe alta fisa de produs de-a lor — si NU se opreste trimiterea, fiindca pretul
-- pe care il scriem chiar e al produsului nostru.
--
-- Masurat: din 41 de oferte cu nume fara niciun cuvant comun, 31 erau preluate (legaturi
-- gresite) si 10 publicate de noi (doar denumite altfel in romaneste la ei — „Recompense
-- pentru pisici, din Vita uscata" pentru „Carnilove Cat Freeze Dried Beef").
--
-- ⚠ CUVINTE DE CEL PUTIN TREI LITERE, si amandoua listele nevide. Cu pragul la patru,
-- „DOG&DOG PUP, 20 kg" iesea nepotrivit fata de el insusi: toate cuvintele lui sunt mai
-- scurte, deci ambele liste erau goale, iar doua multimi goale nu se intersecteaza niciodata.

create or replace function public.emag_oferte_legate_stramb(
  p_business_id uuid,
  p_limita int default 200
)
returns table (id uuid, emag_id bigint, nume_emag text, nume_produs text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with n as (
    select o.id, o.emag_id, o.nume_emag, p.name as nume_produs,
           array(select w from unnest(string_to_array(
                   lower(regexp_replace(coalesce(o.nume_emag,''), '[^a-z0-9]+', ' ', 'gi')), ' ')) w
                  where length(w) >= 3) as a,
           array(select w from unnest(string_to_array(
                   lower(regexp_replace(coalesce(p.name,''), '[^a-z0-9]+', ' ', 'gi')), ' ')) w
                  where length(w) >= 3) as b
      from public.emag_offers o
      join public.products p on p.id = o.product_id
     where o.business_id = p_business_id
       -- ⚠ NUMAI ofertele preluate: la cele publicate de noi legatura e corecta prin
       -- constructie, si un nume diferit inseamna alta problema.
       and o.creat_de_edinio = false
       -- Se raporteaza doar cele care CHIAR ar pleca; restul nu fac rau.
       and o.auto_sync = true
       and coalesce(o.nume_emag, '') <> ''
       and coalesce(p.name, '') <> ''
  )
  select n.id, n.emag_id, n.nume_emag, n.nume_produs
    from n
   where cardinality(n.a) > 0 and cardinality(n.b) > 0 and not (n.a && n.b)
   order by n.emag_id
   limit greatest(1, least(coalesce(p_limita, 200), 1000));
$$;

comment on function public.emag_oferte_legate_stramb(uuid, int) is
  'Oferte PRELUATE la care numele de la eMAG nu are niciun cuvant comun cu produsul legat. Trimiterea catre ele scrie pretul altui produs.';

-- ⚠ `security definer` peste ofertele oricui: fara revoke, EXECUTE ramane la PUBLIC dupa
-- fiecare `create or replace`.
revoke execute on function public.emag_oferte_legate_stramb(uuid, int) from public, anon, authenticated;
grant execute on function public.emag_oferte_legate_stramb(uuid, int) to service_role;

notify pgrst, 'reload schema';
