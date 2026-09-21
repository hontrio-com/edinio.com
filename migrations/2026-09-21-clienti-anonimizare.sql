-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENTI, G3: anonimizarea unui client                        (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de proprietar: „trebuie sa avem posibilitatea de stergere a
-- utilizatorului". Intrebat ce inseamna pentru cineva care ARE comenzi, a ales
-- ANONIMIZAREA: datele personale se sterg, comenzile si facturile raman.
--
-- ⚠⚠ SI ASTA E SINGURUL RASPUNS CARE STA IN PICIOARE. Documentele fiscale se
-- pastreaza zece ani; o comanda stearsa cu totul ar face sa scada retroactiv
-- venitul unei luni incheiate si ar lasa o factura emisa fara nimic in spate.
--
-- ⚠⚠ CE NU SE ATINGE, SI DE CE CONTEAZA CEL MAI MULT:
--
--   `recovery_optout` si `sms_optout` — LISTELE DE DEZABONARE.
--
-- Un om care a cerut sa nu mai primeasca mesaje si apoi cere sa fie sters: daca
-- i-am sterge si randul de dezabonare, prima campanie de a doua zi l-ar gasi din
-- nou. Adica „stergerea" ar avea ca urmare exact lucrul de care fugea. Raman.
--
-- ⚠ Nu se ating nici `courier_settlements` (decontul primit de la curier, act
-- contabil) si nici `billing_company` (persoana juridica de pe factura).

-- ── Cele doua liste, si de ce sunt pe dos una fata de alta ─────────────────
--
-- ⚠⚠ `shipping_address` se curata cu LISTA ALBA, `order_source` cu LISTA NEAGRA.
-- Pare o nepotrivire; e chiar invers:
--
--   In `shipping_address`, partea PERSONALA creste singura: fiecare curier nou
--   isi scrie cheile lui (`address`, `street`, `home_address`, `address1`,
--   `firstName`, `locker_address`, `contact`, `phone`…). O lista neagra ar fi
--   tacut in ziua in care al saptesprezecelea curier scrie `recipientStreet`.
--   Deci se pastreaza doar ce e cunoscut ca nevinovat.
--
--   In `order_source`, pe dos: partea personala e scrisa de CODUL NOSTRU si e
--   inchisa (identificatorii de urmarire), pe cand cheile de BANI se inmultesc
--   cu fiecare marketplace (`incaseaza_marketplace`, `livrare_pepita`, …). O
--   lista alba ar fi aruncat tacut bani din raport. Deci se scot doar cele
--   cunoscute ca personale.
--
-- Regula din spatele amandurora e aceeasi: partea care CRESTE fara stirea noastra
-- nu are voie sa fie cea pe care o ghicim.

create or replace function public.customer_anonymize(
  bid uuid,
  p_keys text[]
)
returns table (
  comenzi integer,
  contacte integer,
  cosuri integer,
  retururi integer,
  mesaje integer
)
language plpgsql
volatile
security invoker
set search_path to ''
as $$
declare
  v_comenzi integer := 0;
  v_contacte integer := 0;
  v_cosuri integer := 0;
  v_retururi integer := 0;
  v_mesaje integer := 0;
  v_chei text[] := coalesce(p_keys, '{}');
  v_ids uuid[];
  v_telefoane text[];
begin
  if array_length(v_chei, 1) is null then
    return query select 0, 0, 0, 0, 0;
    return;
  end if;

  /*
    ⚠ COMENZILE SE STRANG INAINTE de orice scriere. Dupa prima schimbare a
    telefonului si a emailului, cheia clientului se naste ALTA — deci a doua
    interogare dupa aceeasi cheie n-ar mai gasi nimic, si cosurile, retururile
    si SMS-urile lui ar fi ramas neatinse. Asta e capcana intregii functii.
  */
  select array_agg(o.id), array_agg(distinct public.normalize_phone(o.customer_phone))
    filter (where nullif(public.normalize_phone(o.customer_phone), '') is not null)
  into v_ids, v_telefoane
  from public.orders o
  where o.business_id = bid
    and public.order_customer_key(o.customer_phone, o.customer_email, o.id) = any(v_chei);

  /* Si telefoanele contactelor din `customers`, care pot sa nu aiba nicio comanda. */
  select array_cat(coalesce(v_telefoane, '{}'), coalesce(array_agg(distinct public.normalize_phone(c.phone))
           filter (where nullif(public.normalize_phone(c.phone), '') is not null), '{}'))
  into v_telefoane
  from public.customers c
  where c.business_id = bid and c.key = any(v_chei);

  -- ── 1. Cosurile abandonate ───────────────────────────────────────────────
  --
  -- ⚠ Inaintea comenzilor, fiindca se leaga tot pe telefon/email.
  with sterse as (
    update public.abandoned_carts c
    set customer_name = null, phone = null, email = null
    where c.business_id = bid
      and (
        public.normalize_phone(c.phone) = any(v_chei)
        or ('email:' || lower(trim(c.email))) = any(v_chei)
      )
      and coalesce(nullif(public.normalize_phone(c.phone), ''), nullif(lower(trim(c.email)), '')) is not null
    returning 1
  )
  select count(*)::integer into v_cosuri from sterse;

  -- ── 2. Jurnalul de SMS-uri ───────────────────────────────────────────────
  if array_length(v_telefoane, 1) is not null then
    with sterse as (
      update public.notice_sms_log s
      set phone = ''
      where s.business_id = bid
        and public.normalize_phone(s.phone) = any(v_telefoane)
      returning 1
    )
    select count(*)::integer into v_mesaje from sterse;
  end if;

  -- ── 3. Cererile de retur ─────────────────────────────────────────────────
  if array_length(v_ids, 1) is not null then
    with sterse as (
      update public.return_requests r
      set customer_name = 'Client șters', customer_phone = null, customer_email = null
      where r.order_id = any(v_ids)
      returning 1
    )
    select count(*)::integer into v_retururi from sterse;
  end if;

  -- ── 4. Comenzile ─────────────────────────────────────────────────────────
  --
  -- ⚠⚠ EMAILUL NOU E UN UUID, NU UN HASH AL CELUI VECHI. Un hash de numar de
  -- telefon se sparge prin incercarea tuturor celor zece cifre intr-o secunda:
  -- ar fi fost pseudonimizare, nu anonimizare. Un uuid nu duce inapoi nicaieri.
  --
  -- ⚠ Dar TREBUIE sa existe ceva acolo, si acelasi pentru toate comenzile
  -- omului. Lasate amandoua goale, cheia ar fi cazut pe `order:<id>` si fiecare
  -- comanda ar fi devenit un „client" al ei: in locul unui rand anonim ar fi
  -- aparut cinci, si numarul de clienti al magazinului ar fi crescut dupa o
  -- stergere. Domeniul `.invalid` e rezervat prin RFC 2606: nu poate exista.
  if array_length(v_ids, 1) is not null then
    with anonim as (select 'sters-' || gen_random_uuid()::text || '@anonim.invalid' as adresa),
    sterse as (
      update public.orders o
      set customer_name = 'Client șters',
          /*
            ⚠ SIR GOL, nu `null`: `orders.customer_phone` e `not null`, si baza a
            oprit prima incercare. Merge la fel de bine — `normalize_phone('')` da
            sirul gol, iar cheia clientului cade pe email, cum trebuie.
          */
          customer_phone = '',
          customer_email = (select adresa from anonim),
          /*
            ⚠ LISTA ALBA. Ramane numai judetul, fiindca pe el stau rapoartele
            (`comenzi_pe_judet`, filtrul din Clienti). Tot restul pleaca, inclusiv
            cheile pe care nu le stim inca.
          */
          shipping_address = case
            when o.shipping_address is null or jsonb_typeof(o.shipping_address) <> 'object' then o.shipping_address
            else coalesce(
              (select jsonb_object_agg(k, o.shipping_address -> k)
               from jsonb_object_keys(o.shipping_address) k
               where k in ('county', 'countyName')),
              '{}'::jsonb)
          end,
          /* Textul scris de cumparator la checkout si nota interna: amandoua pot purta un nume sau un numar. */
          notes = null,
          internal_notes = null,
          /*
            ⚠ LISTA NEAGRA. Identificatorii de urmarire sunt date personale
            (identificatori online), dar cheile de bani se inmultesc cu fiecare
            marketplace si n-au voie sa fie ghicite.
          */
          order_source = case
            when o.order_source is null or jsonb_typeof(o.order_source) <> 'object' then o.order_source
            else o.order_source - 'ga_client_id' - 'fbp' - 'fbclid' - 'gclid' - 'ttclid'
                 - 'mc_cid' - 'user_agent' - 'referrer' - 'landing' - 'msclkid' - 'ip'
          end
      where o.id = any(v_ids)
      returning 1
    )
    select count(*)::integer into v_comenzi from sterse;
  end if;

  -- ── 5. Contactul din `customers` ─────────────────────────────────────────
  --
  -- Se sterge de tot: randul acela EXISTA numai ca sa poarte datele personale.
  with sterse as (
    delete from public.customers c
    where c.business_id = bid and c.key = any(v_chei)
    returning 1
  )
  select count(*)::integer into v_contacte from sterse;

  return query select v_comenzi, v_contacte, v_cosuri, v_retururi, v_mesaje;
end
$$;

revoke all on function public.customer_anonymize(uuid, text[]) from public;
revoke all on function public.customer_anonymize(uuid, text[]) from anon;
grant execute on function public.customer_anonymize(uuid, text[]) to authenticated;

notify pgrst, 'reload schema';
