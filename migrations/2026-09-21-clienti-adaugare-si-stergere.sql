-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENTI, G1 + G4: adaugarea de mana si stergerea unui contact (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Doua operatii mici, si amandoua stau in baza, nu in cod. Motivul e acelasi
-- pentru amandoua, si nu e comoditate:
--
-- ⚠⚠ CHEIA CLIENTULUI SE NASTE IN BAZA. `customers.key` e o coloana GENERATA
-- (telefon normalizat → `email:<adresa>`), si tot in baza traieste
-- `order_customer_key`, care face acelasi lucru pentru comenzi. Ca sa stiu din
-- TypeScript daca omul asta exista deja sau daca are comenzi, ar fi trebuit sa
-- rescriu `normalize_phone` in JavaScript — a treia copie a aceleiasi reguli,
-- intr-un al doilea limbaj, pe drumul pe care se HOTARASTE daca stergem pe
-- cineva. Asa, nu exista nicio copie.
--
-- ⚠⚠ SI PENTRU CA PAZA STERGERII TREBUIE SA FIE IN CHIAR INSTRUCTIUNEA CARE
-- STERGE. Citit intai („are comenzi?") si sters apoi, intre cele doua incape o
-- comanda noua — chiar comanda omului pe care tocmai il stergem, in secunda in
-- care o plaseaza. `delete ... where not exists` nu lasa loc intre.

-- ── G1. Adaugarea de mana ──────────────────────────────────────────────────
--
-- Pentru comenzi telefonice, magazin fizic, lead-uri. `source = 'manual'`, ca
-- sa se poata deosebi mai tarziu de cei veniti din import sau din checkout.
--
-- Intoarce o STARE, nu doar randul: cele trei feluri in care poate iesi altfel
-- decat bine au nevoie fiecare de alt mesaj pe ecran.
--
--   'adaugat'       a intrat, si e un contact nou;
--   'fara-contact'  n-are nici telefon, nici email, deci n-are cheie;
--   'exista'        mai e un rand cu aceeasi cheie in magazinul asta;
--   'are-comenzi'   nu e un rand in `customers`, dar cheia asta are deja
--                   comenzi — adica omul e DEJA in lista de clienti.
--
-- ⚠ Ultimele doua nu sunt acelasi lucru, si asta conteaza pe ecran. La 'exista'
-- comerciantul se uita la un dublet pe care il poate sterge; la 'are-comenzi'
-- se uita la un cumparator adevarat, care nu se sterge niciodata. Puse sub
-- acelasi mesaj („clientul exista deja"), al doilea l-ar trimite sa caute un
-- rand care nu e nicaieri.

create or replace function public.customer_add_manual(
  bid uuid,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_address text default null,
  p_city text default null,
  p_county text default null,
  p_postcode text default null
)
returns table (stare text, cheie text)
language plpgsql
volatile
security invoker
set search_path to ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_key   text;
begin
  /* Aceeasi cascada ca `customers.key`, ca sa stiu cheia INAINTE de scriere. */
  v_key := coalesce(
    nullif(public.normalize_phone(v_phone), ''),
    case when v_email is not null then 'email:' || v_email else null end
  );

  if v_key is null then
    return query select 'fara-contact'::text, null::text;
    return;
  end if;

  if exists (select 1 from public.customers c
             where c.business_id = bid and c.key = v_key) then
    return query select 'exista'::text, v_key;
    return;
  end if;

  if exists (select 1 from public.orders o
             where o.business_id = bid
               and public.order_customer_key(o.customer_phone, o.customer_email, o.id) = v_key) then
    return query select 'are-comenzi'::text, v_key;
    return;
  end if;

  insert into public.customers
    (business_id, name, email, phone, address, city, county, postcode, source)
  values
    (bid, coalesce(nullif(btrim(p_name), ''), 'Client'), v_email, v_phone,
     nullif(btrim(coalesce(p_address, '')), ''),
     nullif(btrim(coalesce(p_city, '')), ''),
     nullif(btrim(coalesce(p_county, '')), ''),
     nullif(btrim(coalesce(p_postcode, '')), ''),
     'manual');

  return query select 'adaugat'::text, v_key;
end
$$;

revoke all on function public.customer_add_manual(uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.customer_add_manual(uuid, text, text, text, text, text, text, text) from anon;
grant execute on function public.customer_add_manual(uuid, text, text, text, text, text, text, text) to authenticated;

-- ── G4. Stergerea unui contact importat ────────────────────────────────────
--
-- ⚠⚠ NU SE STERGE NICIODATA UN CUMPARATOR. Un om cu comenzi are in spate
-- facturi, AWB-uri si bani incasati; sters, ar ramane comenzi fara nume, iar
-- facturile lui ar arata catre nimeni. Se sterge NUMAI un contact care n-a
-- comandat niciodata — adica exact ce a intrat dintr-un import sau de mana.
--
-- ⚠ Si stergerea nici macar nu l-ar scoate din lista: lista se face din comenzi
-- UNITE cu contactele, deci un cumparator ar aparea mai departe, fara datele
-- din `customers`. Adica singurul lucru pe care l-ar face stergerea ar fi sa-i
-- piarda adresa si codul postal.
--
-- Intoarce cate randuri au plecat: 0 inseamna „n-a fost sters", si apelantul
-- trebuie sa spuna de ce, nu sa taca.

create or replace function public.customer_delete_contact(
  bid uuid,
  p_key text
)
returns integer
language plpgsql
volatile
security invoker
set search_path to ''
as $$
declare
  v_cate integer;
begin
  delete from public.customers c
  where c.business_id = bid
    and c.key = p_key
    /*
      ⚠ PAZA E AICI, IN CHIAR STERGEREA. Citita separat, intre „are comenzi?" si
      `delete` ar fi incaput chiar comanda omului, plasata in secunda aceea.
    */
    and not exists (
      select 1 from public.orders o
      where o.business_id = bid
        and public.order_customer_key(o.customer_phone, o.customer_email, o.id) = c.key
    );

  get diagnostics v_cate = row_count;
  return v_cate;
end
$$;

revoke all on function public.customer_delete_contact(uuid, text) from public;
revoke all on function public.customer_delete_contact(uuid, text) from anon;
grant execute on function public.customer_delete_contact(uuid, text) to authenticated;

notify pgrst, 'reload schema';
