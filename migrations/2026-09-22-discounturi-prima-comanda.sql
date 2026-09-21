-- ═══════════════════════════════════════════════════════════════════════════
-- UN COD NUMAI PENTRU PRIMA COMANDA A UNUI OM                    (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Etapa H a redesignului sectiunii Discounturi. Ales de el dintre trei
-- candidati; ceilalti doi („de la N bucati in sus", „cumperi X primesti Y")
-- raman nefacuti, si nu din lipsa de timp — vezi `docs/redesign/DISCOUNTURI.md`.
--
-- ⚠ DATA DIN NUME E A ZILEI URMATOARE, SI E DINADINS. Fisierul rescrie
-- `claim_discount_use`, deci trebuie sa se aseze DUPA
-- `2026-09-21-discounturi-un-om-o-data.sql`, care scrie forma pe care o
-- inlocuieste. Dosarul n-are numere de ordine: in aceeasi zi ordinea o da
-- numele, iar „prima-comanda" s-ar fi asezat inaintea lui „un-om-o-data" si, pe
-- o baza refacuta din dosar, regula asta ar fi fost stearsa in tacere de
-- migratia de dinaintea ei. Proba care tine ordinea:
-- `src/lib/discounts/revendicarea-e-o-singura-instructiune.test.ts`.

-- ── 1. Steagul ────────────────────────────────────────────────────────────

alter table public.discounts
  add column if not exists doar_prima_comanda boolean not null default false;

comment on column public.discounts.doar_prima_comanda is
  'Codul merge numai daca omul nu mai are nicio comanda la magazinul asta. Implica o singura folosire per client. „Acelasi om" = discount_customer_key.';

-- ── 2. Ca intrebarea sa nu coste o parcurgere la fiecare checkout ─────────
--
-- ⚠ Fara index, „are omul asta vreo comanda?" e o parcurgere a intregii tabele
-- de comenzi, la FIECARE plasare cu un cod de bun venit — adica exact pe drumul
-- cel mai cald. Indexul e pe o expresie: `order_customer_key` e `immutable`,
-- deci se poate. Ajuta si pagina Clienti, care pune aceeasi intrebare.

create index if not exists idx_orders_business_customer_key
  on public.orders (business_id, public.order_customer_key(customer_phone, customer_email, id));

-- ── 3. Rezervarea stie ca „prima comanda" inseamna O SINGURA DATA ─────────
--
-- ⚠⚠ ALTFEL RAMANEA O CURSA. Doua comenzi trimise deodata de acelasi om, la
-- primul lui cumparat: amandoua ar vedea zero comenzi de dinainte, si amandoua
-- ar trece. „Prima comanda" e, prin chiar intelesul ei, cel mult o folosire per
-- om — deci rezervarea se face cu limita 1 chiar cand `per_customer_limit` e
-- gol, si atunci indexul unic serializeaza cele doua cereri.

create or replace function public.reserve_discount_for_customer(
  p_discount_id uuid,
  p_customer_key text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  for i in 1..5 loop
    begin
      insert into public.discount_customer_uses (discount_id, business_id, customer_key, ordinal)
      select p_discount_id, d.business_id, p_customer_key,
             1 + coalesce((
               select max(u.ordinal) from public.discount_customer_uses u
               where u.discount_id = p_discount_id
                 and u.customer_key is not distinct from p_customer_key
             ), 0)
      from public.discounts d
      where d.id = p_discount_id
        and (
          -- ⚠ Limita LUCRATOARE: cea scrisa de om, iar in lipsa ei 1 daca e cod
          -- de prima comanda. Scrisa doar ca `per_customer_limit`, un cod de bun
          -- venit fara limita explicita n-ar fi fost serializat de nimic.
          coalesce(d.per_customer_limit, case when d.doar_prima_comanda then 1 end) is null
          or p_customer_key is null
          or (
            select count(*) from public.discount_customer_uses u
            where u.discount_id = p_discount_id and u.customer_key = p_customer_key
          ) < coalesce(d.per_customer_limit, case when d.doar_prima_comanda then 1 end)
        )
      returning id into v_id;

      return v_id;

    exception
      when unique_violation then
        v_id := null;
        continue;
    end;
  end loop;

  return null;
end;
$function$;

revoke all on function public.reserve_discount_for_customer(uuid, text) from public;
revoke all on function public.reserve_discount_for_customer(uuid, text) from anon, authenticated;
grant execute on function public.reserve_discount_for_customer(uuid, text) to service_role;

-- ── 4. Revendicarea intreaba daca omul mai are comenzi ────────────────────
--
-- ⚠⚠ AICI, NU IN `validateDiscount`. Acelasi motiv ca la limita per client, si
-- inca mai ascutit: un capat public care raspunde „valid / nu e valid" dupa
-- telefonul tastat devine un oracol „numarul asta a mai cumparat de aici?".
-- Oracolul nu e in TEXT, e in bitul valid/nevalid — mesajul unic nu-l inchide.
--
-- ⚠ SE NUMARA ORICE COMANDA, si cele anulate. Comerciantul spune „pentru
-- clienti noi"; cineva care a comandat si a anulat nu mai e nou. Alegerea e
-- scrisa si pe ecran, langa comutator.
--
-- ⚠ NU se verifica la `reclaim_order_discount` (desfacerea unei anulari):
-- acolo omul ARE deja comanda — chiar pe cea readusa la viata — si intrebarea
-- n-ar mai avea raspuns bun niciodata.

create or replace function public.claim_discount_use(
  p_discount_id uuid,
  p_customer_phone text,
  p_customer_email text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key   text;
  v_lim   integer;
  v_prima boolean;
  v_biz   uuid;
  v_id    uuid;
begin
  select per_customer_limit, doar_prima_comanda, business_id
    into v_lim, v_prima, v_biz
  from public.discounts where id = p_discount_id;

  v_key := public.discount_customer_key(p_customer_phone, p_customer_email);

  /*
    ⚠⚠ FARA TELEFON SI FARA EMAIL, un cod marginit pe OM se refuza: acolo nu
    exista niciun fel de „acelasi om", deci nici limita, nici „prima comanda"
    n-ar margini nimic, si codul s-ar lua de oricate ori dintr-un singur browser.
    Masurat pe productie: ZERO comenzi din 541 n-au nici telefon, nici email.
  */
  if (v_lim is not null or v_prima) and v_key is null then
    return null;
  end if;

  /*
    ⚠ Intrebarea despre trecut se pune INAINTE de orice scriere: raspunsul ei nu
    depinde de ce facem acum, iar asa refuzul nu lasa nimic de compensat.
  */
  if v_prima and exists (
    select 1 from public.orders o
    where o.business_id = v_biz
      and public.order_customer_key(o.customer_phone, o.customer_email, o.id) = v_key
  ) then
    return null;
  end if;

  begin
    v_id := public.reserve_discount_for_customer(p_discount_id, v_key);
    if v_id is null then return null; end if;

    update public.discounts
    set uses_count = uses_count + 1, updated_at = now()
    where id = p_discount_id
      and (max_uses is null or uses_count < max_uses)
      and is_active
      and (starts_at is null or starts_at <= now())
      and (expires_at is null or expires_at >= now());

    if not found then
      raise exception 'campania refuza' using errcode = 'P0001';
    end if;

    return v_id;

  exception
    when sqlstate 'P0001' then
      return null;
  end;
end;
$function$;

revoke all on function public.claim_discount_use(uuid, text, text) from public;
revoke all on function public.claim_discount_use(uuid, text, text) from anon, authenticated;
grant execute on function public.claim_discount_use(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
