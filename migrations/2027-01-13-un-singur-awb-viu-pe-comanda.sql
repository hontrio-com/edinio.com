-- ═══════════════════════════════════════════════════════════════════════════
-- UN SINGUR AWB VIU PE COMANDA, INDIFERENT DE CURIER            (14.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CLASA DE DEFECT: time-of-check / time-of-use.
--
--     poarta citeste comanda: "nu are niciun AWB"        (SELECT simplu)
--               ↓
--     se rezerva in registru, pe cheia `awb:<furnizor>:<orderId>`
--               ↓
--     apel EXTERN la curier, de cateva secunde
--               ↓
--     se scrie numarul pe comanda
--
-- `poartaAwbPropriu` (src/lib/orders/poarta-awb.ts) citeste toate cele 17 coloane
-- de AWB, deci acopera cazul SECVENTIAL: cine emite la Cargus si apoi incearca la
-- DPD e refuzat. Dar citirea e un `select` fara tranzactie si fara lacat, iar intre
-- ea si scrierea coloanei sta un apel extern. Doua cereri PARALELE catre doi
-- furnizori diferiti vad amandoua o comanda curata.
--
-- ⚠ SI REGISTRUL NU LE OPRESTE, desi el chiar e atomic. Cheia lui e
-- `${fel}:${furnizor}:${discriminant}` (src/lib/operatii/registru.ts:158-164), deci
-- Cargus si DPD produc SIRURI DIFERITE: `awb:cargus:<id>` si `awb:dpd:<id>`. Indexul
-- unic `operatii_externe_cheie_activa_idx` e pe `(business_id, cheie)` si n-are
-- coloana `furnizor`, dar furnizorul e strecurat in CHEIE, deci indexul tot pe
-- furnizor imparte. Nu exista azi nimic unic pe comanda, intre furnizori.
--
-- Urmarea: doua AWB-uri reale, platite amandoua, pe aceeasi comanda.
--
-- ⚠ DE CE NU SE SCOATE FURNIZORUL DIN CHEIE, desi pare reparatia de un rand
--
-- Atunci Cargus si DPD ar imparti aceeasi cheie, a doua rezervare ar intoarce
-- `motiv: 'reusit'`, `cuRegistru` ar raspunde `fel: "deja"`, iar actiunea DPD ar
-- scrie AWB-UL CARGUS in coloana `dpd_awb_number` si ar raporta succes. Din
-- defectul vizibil de azi ar iesi unul TACIT. Scrie asta si src/lib/orders/
-- awb-propriu.ts:26-28. Cheia NU se atinge.
--
-- CE FACE MIGRATIA: adauga un al doilea arbitru atomic, langa cel pe cheie: un
-- index unic pe COMANDA, pentru operatiile de AWB. Insertul din
-- `rezerva_operatie_externa` foloseste `on conflict do nothing` FARA tinta, deci
-- indexul nou e luat in seama fara nicio schimbare la insert.
--
-- ⚠ SI DE CE TREBUIE SI RAMURA DIN FUNCTIE, nu doar indexul
--
-- Fara ea, al doilea curier ar cadea pana la `motiv: 'cursa'`, adica mesajul
-- „Operatia tocmai s-a incheiat pe alt drum. Reincarca pagina." E neadevarat si nu-i
-- spune omului nimic de facut. Ramura noua intoarce `alt_curier`, cu numele
-- furnizorului care tine comanda si cu AWB-ul lui.
--
-- ⚠ RETURUL E EXCLUS DINADINS, SI FARA ASTA MIGRATIA AR RUPE O FUNCTIE BUNA
--
-- AWB-ul de retur Sameday se inregistreaza tot cu `fel: 'awb'`
-- (src/lib/actions/sameday.actions.ts:443), deosebit doar prin prefixul `retur:` din
-- cheie, si asta e o alegere scrisa acolo: un fel nou ar fi cerut migratie pe
-- `operatii_externe_fel_check`, o constrangere impartita de toti furnizorii.
-- Randul AWB-ului de tur ramane `reusit` cat traieste comanda, deci un index care
-- n-ar sari peste `retur:%` ar refuza FIECARE AWB de retur. Predicatul le exclude,
-- si le exclude si cautarea din functie.
--
-- ⚠ PRETUL, PE FATA (hotarare a proprietarului, 14.09.2026)
--
-- `in_curs` nu expira singur, dinadins (vezi 2026-08-20-registru-operatii-externe).
-- Azi un proces care moare intre rezervare si incheiere blocheaza DOAR curierul lui,
-- iar comerciantul poate alege altul. De acum blocheaza comanda la TOTI. Supapa
-- exista (`operatiiAtarnate` plus `deblocheazaOperatie`), dar `PRAG_ATARNATA_MS` e
-- de trei minute, deci in primele trei minute randul nu se vede in panou. Trei
-- minute de asteptare, in schimbul unui al doilea transport platit.
--
-- ⚠ `esuat` RAMANE IN AFARA PREDICATULUI, si asta nu e o scapare
--
-- Un curier care a refuzat coletul la validare lasa randul `esuat`. Daca cineva
-- „face curat" si scrie `stare <> 'anulat'`, atunci o singura respingere ar inchide
-- comanda la toti cei saptesprezece curieri, pentru totdeauna. Cele trei stari
-- blocante sunt aceleasi ca in `operatii_externe_cheie_activa_idx`.
--
-- ⚠ MASURAT PE PRODUCTIE INAINTE DE APLICARE (14.09.2026)
--
--   * ZERO comenzi au doua operatii AWB active la furnizori diferiti, deci indexul
--     unic se creeaza fara nicio curatenie prealabila;
--   * 178 de operatii AWB in total, la `dpd` si `woot`. Tabelul e mic, deci indexul
--     se creeaza instantaneu si NU e nevoie de `concurrently`, care oricum nu poate
--     rula intr-o tranzactie.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Arbitrul atomic: o singura operatie AWB VIE pe comanda ────────────────

create unique index if not exists operatii_externe_awb_viu_pe_comanda_idx
  on public.operatii_externe (order_id)
  where fel = 'awb'
    and order_id is not null
    and cheie not like 'retur:%'
    and stare in ('in_curs', 'reusit', 'necunoscut');

-- ── 2. Si motivul adevarat, in loc de „cursa" ────────────────────────────────

CREATE OR REPLACE FUNCTION public.rezerva_operatie_externa(p_business_id uuid, p_order_id uuid, p_fel text, p_furnizor text, p_cheie text, p_tinta text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_biz    uuid;
  v_numar  text;
  v_id     uuid;
  v_ex     public.operatii_externe%rowtype;
  v_tinta  text := nullif(btrim(coalesce(p_tinta, '')), '');
  v_nul constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if coalesce(btrim(p_cheie), '') = '' then
    return jsonb_build_object('rezervat', false, 'motiv', 'fara cheie');
  end if;

  if p_business_id is null and p_order_id is not null then
    return jsonb_build_object('rezervat', false, 'motiv', 'comanda fara magazin');
  end if;

  if p_order_id is not null then
    select o.business_id, o.order_number into v_biz, v_numar
      from public.orders o
     where o.id = p_order_id;

    if not found then
      return jsonb_build_object('rezervat', false, 'motiv', 'comanda negasita');
    end if;
    if v_biz is distinct from p_business_id then
      return jsonb_build_object('rezervat', false, 'motiv', 'alt magazin');
    end if;
  end if;

  insert into public.operatii_externe
    (business_id, order_id, order_number, fel, furnizor, cheie, incercari, tinta_idempotenta)
  values
    (p_business_id, p_order_id, v_numar, p_fel, p_furnizor, p_cheie, 1, v_tinta)
  on conflict do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('rezervat', true, 'id', v_id);
  end if;

  update public.operatii_externe o
     set incercari     = o.incercari + 1,
         actualizat_la = now()
   where coalesce(o.business_id, v_nul) = coalesce(p_business_id, v_nul)
     and o.cheie = p_cheie
     and o.stare in ('in_curs', 'reusit', 'necunoscut')
  returning o.* into v_ex;

  if found then
    return jsonb_build_object(
      'rezervat',          false,
      'motiv',             v_ex.stare,
      'id',                v_ex.id,
      'referinta_externa', v_ex.referinta_externa,
      'detalii',           v_ex.detalii,
      'incercari',         v_ex.incercari,
      'ultima_eroare',     v_ex.ultima_eroare,
      'creat_la',          v_ex.creat_la
    );
  end if;

  -- ⚠ ALT CURIER TINE DEJA COMANDA ASTA.
  --
  -- Se ajunge aici cand insertul a fost respins de `operatii_externe_awb_viu_pe_comanda_idx`
  -- iar cheia noastra nu exista: adica randul blocant e al ALTUI furnizor. Acelasi
  -- furnizor ar fi fost prins mai sus, pe cheie, fiindca `cheieOperatie` e determinista.
  --
  -- ⚠ Ramura e ingradita la `fel = 'awb'` si sare peste cheile de retur, ca sa nu
  -- schimbe nimic pentru facturi, plati, ridicari sau pentru AWB-ul de retur.
  if p_fel = 'awb' and p_order_id is not null and p_cheie not like 'retur:%' then
    select * into v_ex
      from public.operatii_externe o
     where o.order_id = p_order_id
       and o.fel = 'awb'
       and o.cheie not like 'retur:%'
       and o.stare in ('in_curs', 'reusit', 'necunoscut')
     limit 1;

    if found then
      return jsonb_build_object(
        'rezervat',          false,
        'motiv',             'alt_curier',
        'id',                v_ex.id,
        'stare',             v_ex.stare,
        'furnizor',          v_ex.furnizor,
        'referinta_externa', v_ex.referinta_externa,
        'creat_la',          v_ex.creat_la,
        'ultima_eroare',     v_ex.ultima_eroare
      );
    end if;
  end if;

  if v_tinta is not null then
    select * into v_ex
      from public.operatii_externe o
     where coalesce(o.business_id, v_nul) = coalesce(p_business_id, v_nul)
       and o.furnizor = p_furnizor
       and o.fel = p_fel
       and o.tinta_idempotenta = v_tinta
       and o.stare in ('in_curs', 'necunoscut')
     limit 1;

    if found then
      return jsonb_build_object(
        'rezervat',      false,
        'motiv',         'alta_intentie',
        'id',            v_ex.id,
        'stare',         v_ex.stare,
        'creat_la',      v_ex.creat_la,
        'ultima_eroare', v_ex.ultima_eroare
      );
    end if;
  end if;

  return jsonb_build_object('rezervat', false, 'motiv', 'cursa');
end;
$function$
;
