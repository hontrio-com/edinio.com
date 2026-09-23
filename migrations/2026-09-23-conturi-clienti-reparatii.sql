-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 6: reparatiile dupa verificarea adversa
--                                                                (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sase sceptici au citit Etapele A si B si au gasit 72 de lucruri confirmate de
-- cel putin doi judecatori din trei. Aici sunt cele care se repara in baza.
-- Restul (rute, ecrane, texte, documente) sunt in acelasi commit, in `src/`.

-- ── 1. UN EMAIL INSEAMNA O SINGURA ADRESA ──────────────────────────────────
--
-- ⚠⚠ CEA MAI URATA DINTRE CELE GASITE. `cont_normalizeaza` facea doar
-- `lower(btrim())` pentru email, iar sirul intors ajungea neatins in `to`-ul lui
-- nodemailer. Pentru nodemailer, „a@x.ro, b@y.ro" inseamna DOI destinatari.
--
-- Masurat pe demo inainte de reparatie: `cont_cere_cod(..., 'v1@tinta.ro,
-- v2@tinta.ro, v3@tinta.ro', ...)` intorcea `ok = true` si destinatia intreaga.
-- Cele douazeci de cereri pe ora ingaduite unui IP ar fi devenit o mie de
-- emailuri pe ora, semnate cu marca si cu SMTP-ul comerciantului.
--
-- ⚠ Si `btrim` taie doar spatii, nu si randul nou: un `\n` in adresa e injectie
-- de antet pe orice drum care compune anteturi de mana.

create or replace function privat.cont_normalizeaza(p_fel text, p_valoare text)
returns text language sql immutable set search_path = '' as $fn$
  select case p_fel
    when 'telefon' then nullif(public.normalize_phone(coalesce(p_valoare, '')), '')
    when 'email' then (
      select e from (select lower(btrim(coalesce(p_valoare, ''))) as e) t
       where
         /* Exact UN arond, si nimic inainte de el care sa poata desparti o lista. */
         t.e ~ '^[^@[:space:],;<>"\\]+@[^@[:space:],;<>"\\]+\.[a-z]{2,}$'
         /* ⚠ Plafon de lungime: indexul btree refuza cheile peste ~2700 de octeti,
            iar refuzul ar fi venit ca EROARE, nu ca raspuns, adica un raspuns
            deosebit de restul, adica un oracol. */
         and length(t.e) <= 254
    )
  end;
$fn$;

/* ⚠ Si in BAZA, nu numai in functie: o a doua cale de scriere n-are cum sa-l uite. */
alter table privat.cont_cod
  drop constraint if exists cont_cod_destinatie_are_forma;
alter table privat.cont_cod
  add constraint cont_cod_destinatie_are_forma
  check (
    (fel = 'telefon' and length(destinatie) >= 9)
    or (fel = 'email' and destinatie ~ '^[^@[:space:],;<>"\\]+@[^@[:space:],;<>"\\]+\.[a-z]{2,}$' and length(destinatie) <= 254)
  );

-- ── 1b. CODUL TINE MINTE DE UNDE A FOST CERUT ──────────────────────────────
--
-- ⚠ Fara asta, plafonul de mai jos n-are pe ce sa se sprijine: un plafon cheiat
-- numai pe destinatie se intoarce impotriva omului caruia ii apartine adresa.
-- ⚠ `text`, nu `inet`: valoarea vine din antetul `x-forwarded-for`, adica de la
-- client, si poate fi orice. Pastrata ca `inet`, un antet stricat ar fi facut
-- INSERTUL sa cada, adica ar fi oprit intrarea in cont pentru o adresa gresita.

alter table privat.cont_cod add column if not exists ip text;

create index if not exists idx_cont_cod_ip
  on privat.cont_cod (business_id, ip, creat_la desc);

-- ── 2. VEDEREA REDUSA CADE INCHIS ──────────────────────────────────────────
--
-- ⚠⚠ `vedere` avea `default 'intreaga'`, adica presetarea cadea DESCHIS: o linie
-- de legatura scrisa vreodata fara coloana ar fi deschis tot. Presetarea trebuie
-- sa fie cea saraca, iar cine vrea mai mult o cere pe fata.

alter table privat.cont_comanda alter column vedere set default 'redusa';

-- ── 3. MOTIVUL INCHEIERII SPUNE ADEVARUL ───────────────────────────────────
--
-- ⚠ Sesiunea care moare de inactivitate si cea care trece de marginea absoluta
-- primeau amandoua `'epoca'`, desi epoca n-avea nicio legatura. Doua comentarii
-- il dau drept sursa de adevar pentru „de ce a cazut sesiunea asta"; asa cum era,
-- minteau.

alter table privat.cont_sesiune drop constraint if exists cont_sesiune_motiv_incheiere_check;
alter table privat.cont_sesiune
  add constraint cont_sesiune_motiv_incheiere_check
  check (motiv_incheiere in ('iesire','rotire','refolosire','epoca','expirare','inactivitate','stingere','stergere'));

-- ── 4. CHEILE STRAINE CARE LIPSEAU ─────────────────────────────────────────
--
-- ⚠ `cont_jurnal.business_id` si `cont_instiintare.business_id` aveau cheie
-- straina compusa DOAR prin `cont_id`, care e NULABIL. Cu `cont_id` nul, `match
-- simple` nu verifica nimic, deci un `business_id` inventat intra linistit.

alter table privat.cont_jurnal
  drop constraint if exists cont_jurnal_business_fk;
alter table privat.cont_jurnal
  add constraint cont_jurnal_business_fk
  foreign key (business_id) references public.businesses(id) on delete cascade;

alter table privat.cont_instiintare
  drop constraint if exists cont_instiintare_business_fk;
alter table privat.cont_instiintare
  add constraint cont_instiintare_business_fk
  foreign key (business_id) references public.businesses(id) on delete cascade;

-- ── 5. INDEXUL PENTRU LEGAREA PE EMAIL ─────────────────────────────────────
--
-- ⚠ `idx_orders_business_normphone` exista de la discounturi si serveste ramura
-- de telefon. Ramura de email n-avea niciun index, deci fiecare intrare in cont
-- facea o trecere completa peste comenzile magazinului.

create index if not exists idx_orders_business_email
  on public.orders (business_id, lower(btrim(customer_email)));

-- ── 6. CODUL: PLAFOANE CARE NU POT FI FOLOSITE IMPOTRIVA OMULUI ────────────

drop function if exists public.cont_cere_cod(uuid, text, text, text, text, uuid, integer);

create function public.cont_cere_cod(
  p_business uuid,
  p_scop text,
  p_fel text,
  p_destinatie_bruta text,
  p_cod_hash text,
  p_cont uuid default null,
  p_minute integer default 10,
  p_ip text default null
) returns table (ok boolean, motiv text, destinatie text)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_dest text;
  v_vii integer;
  v_cate integer;
  v_buget integer;
  v_azi integer;
begin
  v_dest := privat.cont_normalizeaza(p_fel, p_destinatie_bruta);
  if v_dest is null then
    return query select false, 'contact-nevalid', null::text;
    return;
  end if;

  if exists (
    select 1 from privat.cont_contact_blocat x
     where x.business_id = p_business and x.fel = p_fel and x.valoare = v_dest
       and x.expira_la > now()
  ) then
    return query select false, 'blocat', v_dest;
    return;
  end if;

  /*
    ⚠⚠ PLAFONUL PE IP STA IN BAZA, NU NUMAI IN COD.
    In TypeScript exista deja doua straturi, dar cel durabil CADE DESCHIS la orice
    eroare de baza, iar cel din memorie e per instanta serverless. Un plafon scris
    in chiar instructiunea de mai jos nu poate cadea deschis: daca baza nu
    raspunde, nu se scrie nici codul.
    ⚠ Si e pe (magazin, ip), nu doar pe ip: doua magazine nu-si impart galeata.
  */
  if p_ip is not null then
    select count(*) into v_cate
      from privat.cont_cod x
     where x.business_id = p_business and x.ip = p_ip
       and x.creat_la > now() - interval '1 hour';
    if v_cate >= 15 then
      return query select false, 'prea-multe-de-aici', v_dest;
      return;
    end if;
  end if;

  /*
    ⚠⚠ AICI ERA CEA MAI GRAVA DINTRE CELE GASITE, SI NU ERA O SCURGERE, ERA O ARMA.

    Forma dinainte facea doua lucruri care, impreuna, dadeau oricui putea ghici
    adresa unui client puterea sa-l tina afara din cont:
      1. plafonul era cheiat NUMAI pe (magazin, fel, destinatie), fara nicio
         dimensiune a celui care cere, deci patru cereri straine umpleau galeata
         VICTIMEI pentru un sfert de ora;
      2. fiecare cerere noua OMORA codul viu al victimei
         (`update ... set folosit_la = now()`), deci era de ajuns o cerere imediat
         dupa a ei ca omul sa tasteze codul primit si sa citeasca „Codul nu e bun".
    Iar doctrina „un singur raspuns" facea totul invizibil: victima primea 200 si
    textul obisnuit, si n-avea cum sa afle de ce nu-i vine emailul.

    Masurat pe demo inainte de reparatie: patru cereri straine, apoi a cincea
    intorcea 'prea-multe'; si codul victimei devenea 'gresit' dupa o singura
    cerere straina.

    ACUM: codurile vii NU se mai omoara intre ele. Sunt ingaduite cel mult TREI
    deodata pentru aceeasi destinatie, iar `cont_verifica_cod` primeste ORICARE
    dintre ele. Al patrulea nu mai scrie nimic, dar nici nu strica ce exista.
  */
  select count(*) into v_vii
    from privat.cont_cod x
   where x.business_id = p_business and x.fel = p_fel and x.destinatie = v_dest
     and x.scop = p_scop and x.folosit_la is null and x.expira_la > now();
  if v_vii >= 3 then
    return query select false, 'are-cod-viu', v_dest;
    return;
  end if;

  select count(*) into v_cate
    from privat.cont_cod x
   where x.business_id = p_business and x.fel = p_fel and x.destinatie = v_dest
     and x.creat_la > now() - interval '15 minutes';
  if v_cate >= 4 then
    return query select false, 'prea-multe', v_dest;
    return;
  end if;

  /*
    ⚠⚠ BUGETUL ZILNIC E ACUM PE AMANDOUA FELURILE. Inainte exista numai pentru
    SMS, cu comentariul „bugetul zilnic e singurul lucru care sta intre un strain
    si creditul lui" - acelasi argument se aplica emailului, care costa cota de
    trimitere a comerciantului si, mai ales, reputatia domeniului lui.
  */
  select coalesce((st.cont_client_config->>(case when p_fel = 'telefon' then 'buget_sms_zilnic' else 'buget_email_zilnic' end))::integer,
                  case when p_fel = 'telefon' then 100 else 300 end)
    into v_buget
    from privat.store_settings st where st.business_id = p_business;

  select count(*) into v_azi
    from privat.cont_cod x
   where x.business_id = p_business and x.fel = p_fel
     and x.creat_la >= privat.cont_inceputul_zilei();
  if v_azi >= coalesce(v_buget, case when p_fel = 'telefon' then 100 else 300 end) then
    return query select false, 'buget-epuizat', v_dest;
    return;
  end if;

  insert into privat.cont_cod (business_id, cont_id, scop, fel, destinatie, cod_hash, expira_la, ip)
  values (p_business, p_cont, p_scop, p_fel, v_dest, p_cod_hash,
          now() + make_interval(mins => greatest(1, least(60, p_minute))), p_ip);

  return query select true, 'trimis', v_dest;
end $fn$;

-- ── 7. VERIFICAREA PRIMESTE ORICARE DIN CODURILE VII ───────────────────────

drop function if exists public.cont_verifica_cod(uuid, text, text, text, text, uuid);

create function public.cont_verifica_cod(
  p_business uuid, p_scop text, p_fel text, p_destinatie_bruta text,
  p_cod_hash text, p_cont uuid default null
) returns table (ok boolean, motiv text, cont_id uuid)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_dest text; v_cod record; v_contact record; v_cont uuid;
  v_refolosesc boolean; v_incercari integer;
begin
  v_dest := privat.cont_normalizeaza(p_fel, p_destinatie_bruta);
  if v_dest is null then
    return query select false, 'contact-nevalid', null::uuid;
    return;
  end if;

  /*
    ⚠ Bugetul de incercari e pe DESTINATIE, nu pe cod. Altfel cineva si-ar fi
    reintregit incercarile cerand un cod nou, iar cele cinci n-ar fi insemnat
    nimic. Cinci incercari gresite inchid destinatia pana expira codurile.
  */
  select coalesce(sum(x.incercari), 0) into v_incercari
    from privat.cont_cod x
   where x.business_id = p_business and x.scop = p_scop
     and x.fel = p_fel and x.destinatie = v_dest
     and x.folosit_la is null and x.expira_la > now();
  if v_incercari >= 5 then
    return query select false, 'prea-multe-incercari', null::uuid;
    return;
  end if;

  /* ⚠ ORICARE din codurile vii, nu doar cel mai nou: de aceea nu se mai pot omori
     intre ele, si de aceea un strain nu mai poate invalida codul victimei. */
  select * into v_cod
    from privat.cont_cod x
   where x.business_id = p_business and x.scop = p_scop
     and x.fel = p_fel and x.destinatie = v_dest
     and x.folosit_la is null and x.expira_la > now()
     and x.cod_hash = p_cod_hash
   order by x.creat_la desc
   limit 1
   for update;

  if v_cod.id is null then
    /* Gresit (sau nu mai e niciun cod viu): contorul creste pe cel mai nou. */
    update privat.cont_cod c
       set incercari = c.incercari + 1
     where c.id = (
       select x.id from privat.cont_cod x
        where x.business_id = p_business and x.scop = p_scop
          and x.fel = p_fel and x.destinatie = v_dest
          and x.folosit_la is null and x.expira_la > now()
        order by x.creat_la desc limit 1
     );
    if not found then
      return query select false, 'fara-cod', null::uuid;
      return;
    end if;
    return query select false, 'gresit', null::uuid;
    return;
  end if;

  /* ⚠ Codul folosit moare, si mor si fratii lui vii: dupa o intrare reusita nu
     mai are ce cauta niciun cod deschis pentru aceeasi destinatie. */
  update privat.cont_cod c
     set folosit_la = now()
   where c.business_id = p_business and c.scop = p_scop
     and c.fel = p_fel and c.destinatie = v_dest and c.folosit_la is null;

  select * into v_contact
    from privat.cont_contact x
   where x.business_id = p_business and x.fel = p_fel and x.valoare = v_dest;

  if p_scop = 'intrare' then
    if v_contact.id is not null then
      if exists (
        select 1 from privat.cont_cumparator c
         where c.id = v_contact.cont_id and c.sters_la is not null
      ) then
        delete from privat.cont_contact where id = v_contact.id;
        v_refolosesc := false;
      else
        v_refolosesc := true;
      end if;
    else
      v_refolosesc := false;
    end if;

    if v_refolosesc then
      v_cont := v_contact.cont_id;
      update privat.cont_contact set verificat_la = coalesce(verificat_la, now())
       where id = v_contact.id;
    else
      insert into privat.cont_cumparator (business_id) values (p_business) returning id into v_cont;
      insert into privat.cont_contact (cont_id, business_id, fel, valoare_bruta, valoare, verificat_la)
      values (v_cont, p_business, p_fel, p_destinatie_bruta, v_dest, now());
    end if;

    insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
    values (p_business, v_cont, 'intrare', jsonb_build_object('fel', p_fel));

    return query select true, 'intrat', v_cont;
    return;
  end if;

  if p_cont is null or v_cod.cont_id is distinct from p_cont then
    return query select false, 'alt-cont', null::uuid;
    return;
  end if;

  if v_contact.id is not null and v_contact.cont_id <> p_cont then
    return query select false, 'contact-la-alt-cont', null::uuid;
    return;
  end if;

  if v_contact.id is null then
    insert into privat.cont_contact (cont_id, business_id, fel, valoare_bruta, valoare, verificat_la)
    values (p_cont, p_business, p_fel, p_destinatie_bruta, v_dest, now());
  else
    update privat.cont_contact set verificat_la = now(), valoare_bruta = p_destinatie_bruta
     where id = v_contact.id;
  end if;

  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'contact-adaugat', jsonb_build_object('fel', p_fel));

  return query select true, 'adaugat', p_cont;
end $fn$;

-- ── 8. CITIREA UNEI COMENZI: POARTA `vedere` ACOPERA TOT ───────────────────
--
-- ⚠⚠ Sase campuri treceau pe langa poarta: `metoda_plata`, `subtotal`,
-- `transport`, `reducere`, `taxa_ramburs` si NUMELE CURIERULUI. Ultimul statea
-- CHIAR intre doua randuri imbracate in `case when vedere = 'intreaga'`, adica
-- exact tiparul pe care comentariul de deasupra il numea periculos.
-- Masurat pe demo, cu `vedere='redusa'`: `livrare`, `firma`, `factura` si `awb`
-- veneau nule, dar `curier=ecolet`, `metoda=cash_on_delivery`, `subtotal=318.00`.
--
-- Regula scrisa in temelie spune: vederea redusa e numar, data, linii, total,
-- stare. Acum chiar atat e.

drop function if exists public.cont_comanda_mea(uuid, uuid, uuid);

create function public.cont_comanda_mea(
  p_business uuid, p_cont uuid, p_order uuid
) returns table (
  order_id uuid, numar text, creata_la timestamptz, stare text, incasata boolean,
  metoda_plata text, subtotal numeric, transport numeric, reducere numeric,
  taxa_ramburs numeric, total numeric, linii jsonb, livrare jsonb,
  firma jsonb, factura jsonb, curier text, awb text, urmarire text, vedere text
)
language sql stable security definer set search_path = '' as $fn$
  select
    o.id, o.order_number, o.created_at, o.status,
    public.comanda_incasata(o.status, o.payment_status, o.payment_method),
    case when l.vedere = 'intreaga' then o.payment_method else null end,
    case when l.vedere = 'intreaga' then o.subtotal else null end,
    case when l.vedere = 'intreaga' then o.shipping_cost else null end,
    case when l.vedere = 'intreaga' then o.discount_amount else null end,
    case when l.vedere = 'intreaga' then o.cod_fee_amount else null end,
    o.total,
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nume', li->>'name', 'cantitate', li->>'quantity',
        'pret', li->>'price', 'produs_id', li->>'product_id'
      ) order by ord), '[]'::jsonb)
      from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality as t(li, ord)
    ),
    case when l.vedere = 'intreaga' then jsonb_build_object(
      'nume', o.customer_name, 'telefon', o.customer_phone, 'email', o.customer_email,
      'adresa', o.shipping_address->>'address',
      'adresa_acasa', o.shipping_address->>'home_address',
      'oras', o.shipping_address->>'city', 'judet', o.shipping_address->>'county',
      'cod_postal', o.shipping_address->>'postcode',
      'fel_livrare', o.shipping_address->>'delivery_type',
      'punct', o.shipping_address->>'locker_name'
    ) else null::jsonb end,
    case when l.vedere = 'intreaga' then jsonb_build_object(
      'denumire', o.billing_company->>'company_name',
      'cui', o.billing_company->>'cui',
      'reg_com', o.billing_company->>'reg_com'
    ) else null::jsonb end,
    case when l.vedere = 'intreaga' then (
      case
        when o.smartbill_invoice_number is not null then jsonb_build_object('casa','smartbill','serie',o.smartbill_invoice_series,'numar',o.smartbill_invoice_number)
        when o.oblio_invoice_number is not null    then jsonb_build_object('casa','oblio','serie',o.oblio_invoice_series,'numar',o.oblio_invoice_number)
        when o.fgo_invoice_number is not null      then jsonb_build_object('casa','fgo','serie',o.fgo_invoice_series,'numar',o.fgo_invoice_number)
        else null
      end
    ) else null::jsonb end,
    case when l.vedere = 'intreaga' then awb.curier else null end,
    case when l.vedere = 'intreaga' then awb.awb else null end,
    case when l.vedere = 'intreaga' then awb.url else null end,
    l.vedere
  from privat.cont_comanda l
  join public.orders o on o.id = l.order_id and o.business_id = l.business_id
  left join lateral (
    select v.curier, v.awb, v.url
      from (values
        ('cargus', o.cargus_awb_number, null::text),
        ('colete', o.colete_awb_number, null::text),
        ('dhl', o.dhl_awb_number, o.dhl_tracking_url),
        ('dpd', o.dpd_awb_number, case when o.dpd_awb_number is not null then 'https://tracking.dpd.ro/?shipmentNumber=' || o.dpd_awb_number else null end),
        ('ecolet', o.ecolet_awb_number, null::text),
        ('fancourier', o.fan_courier_awb_number, null::text),
        ('fedex', o.fedex_awb_number, o.fedex_tracking_url),
        ('gls', o.gls_awb_number, null::text),
        ('innoship', o.innoship_awb_number, o.innoship_track_url),
        ('packeta', o.packeta_packet_id, null::text),
        ('pallex', o.pallex_awb_number, null::text),
        ('posta', o.posta_awb_number, null::text),
        ('sameday', o.sameday_awb_number, null::text),
        ('shipo', o.shipo_awb_number, o.shipo_tracking_url),
        ('smartship', o.smartship_awb_number, o.smartship_tracking_url),
        ('ups', o.ups_awb_number, o.ups_tracking_url),
        ('woot', o.woot_awb_number, null::text)
      ) as v(curier, awb, url)
     where v.awb is not null
     limit 1
  ) awb on true
  where l.business_id = p_business and l.cont_id = p_cont and l.order_id = p_order;
$fn$;

-- ── 9. COMUTATORUL INSEAMNA ACELASI LUCRU IN AMANDOUA LIMBILE ──────────────
--
-- ⚠ SQL-ul citea `coalesce(cfg->>'enabled','false') = 'true'`, deci sirul „true"
-- aprindea; TypeScript cere `=== true`, deci sirul nu aprindea. O setare scrisa
-- vreodata ca text ar fi tinut sesiunile vii in baza si le-ar fi aratat stinse
-- pe ecran. Acum amandoua cer BOOLEANUL adevarat.

create or replace function public.cont_sesiune_verifica(
  p_business uuid, p_jeton_hash text
) returns table (cont_id uuid, nume text, trebuie_rotit boolean)
language plpgsql security definer set search_path = '' as $fn$
declare
  r record; s record; c record; pornit boolean;
begin
  select * into r from privat.cont_reguli_sesiune();
  select * into s from privat.cont_sesiune x
   where x.business_id = p_business and x.jeton_hash = p_jeton_hash;
  if s.id is null then return; end if;

  if s.incheiata_la is not null then
    if s.motiv_incheiere = 'rotire' and s.incheiata_la > now() - r.gratie_rotire then
      return;
    end if;
    if s.motiv_incheiere = 'rotire' then
      update privat.cont_cumparator
         set epoca_sesiunii = epoca_sesiunii + 1
       where id = s.cont_id and business_id = s.business_id;
      /* ⚠ Randul refolosit se MARCHEAZA. Inainte ramanea pe `'rotire'`, deci a
         doua prezentare a aceluiasi jeton ridica epoca din nou, la nesfarsit, si
         jurnalul nu spunea niciodata care rand a fost cel furat. */
      update privat.cont_sesiune
         set motiv_incheiere = 'refolosire'
       where id = s.id;
      insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
      values (s.business_id, s.cont_id, 'jeton-refolosit', jsonb_build_object('sesiune', s.id));
    end if;
    return;
  end if;

  /* ⚠ Doua motive deosebite, fiindca sunt doua lucruri deosebite. */
  if s.expira_la <= now() then
    update privat.cont_sesiune set incheiata_la = now(), motiv_incheiere = 'expirare' where id = s.id;
    return;
  end if;
  if s.inactiva_dupa <= now() then
    update privat.cont_sesiune set incheiata_la = now(), motiv_incheiere = 'inactivitate' where id = s.id;
    return;
  end if;

  select * into c from privat.cont_cumparator x
   where x.id = s.cont_id and x.business_id = s.business_id;

  if c.id is null or c.sters_la is not null or c.epoca_sesiunii <> s.epoca then
    update privat.cont_sesiune
       set incheiata_la = now(),
           motiv_incheiere = case when c.sters_la is not null then 'stergere' else 'epoca' end
     where id = s.id;
    return;
  end if;

  /* ⚠ `= 'true'::jsonb`, adica BOOLEANUL, nu sirul. */
  select (st.cont_client_config->'enabled') = 'true'::jsonb into pornit
    from privat.store_settings st where st.business_id = p_business;
  if pornit is not true then return; end if;

  update privat.cont_sesiune
     set inactiva_dupa = least(now() + r.inactivitate, s.expira_la)
   where id = s.id;

  return query select c.id, c.nume, (s.creata_la < now() - r.rotire_dupa);
end $fn$;

-- ── 10. CURATENIA, cronul pentru care existau deja indexurile ──────────────
--
-- ⚠ Cele patru indexuri `*_curatenie` fusesera facute pentru un cron care nu
-- exista. Un index fara cititor e o promisiune goala; iar retentia promisa in
-- sablonul de confidentialitate al fiecarui magazin („date tehnice: maxim 12
-- luni") nu se tine singura.

create or replace function public.cont_curatenie()
returns table (sesiuni integer, coduri integer, jurnal integer, blocate integer, instiintari integer)
language plpgsql security definer set search_path = '' as $fn$
declare a integer; b integer; c integer; d integer; e integer;
begin
  delete from privat.cont_sesiune where incheiata_la is not null and incheiata_la < now() - interval '30 days';
  get diagnostics a = row_count;
  delete from privat.cont_cod where expira_la < now() - interval '1 day';
  get diagnostics b = row_count;
  delete from privat.cont_jurnal where creat_la < now() - interval '12 months';
  get diagnostics c = row_count;
  delete from privat.cont_contact_blocat where expira_la < now();
  get diagnostics d = row_count;
  delete from privat.cont_instiintare where trimisa_la is not null and trimisa_la < now() - interval '30 days';
  get diagnostics e = row_count;
  return query select a, b, c, d, e;
end $fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DREPTURILE, refacute dupa fiecare `drop` si `create or replace`
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function privat.cont_normalizeaza(text, text) from public, anon, authenticated;
revoke all on function public.cont_cere_cod(uuid, text, text, text, text, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.cont_verifica_cod(uuid, text, text, text, text, uuid)            from public, anon, authenticated;
revoke all on function public.cont_comanda_mea(uuid, uuid, uuid)                               from public, anon, authenticated;
revoke all on function public.cont_sesiune_verifica(uuid, text)                                from public, anon, authenticated;
revoke all on function public.cont_curatenie()                                                 from public, anon, authenticated;

grant execute on function public.cont_cere_cod(uuid, text, text, text, text, uuid, integer, text) to service_role;
grant execute on function public.cont_verifica_cod(uuid, text, text, text, text, uuid)            to service_role;
grant execute on function public.cont_comanda_mea(uuid, uuid, uuid)                               to service_role;
grant execute on function public.cont_sesiune_verifica(uuid, text)                                to service_role;
grant execute on function public.cont_curatenie()                                                 to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_cere_cod(uuid, text, text, text, text, uuid, integer, text)',
    'public.cont_verifica_cod(uuid, text, text, text, text, uuid)',
    'public.cont_comanda_mea(uuid, uuid, uuid)',
    'public.cont_sesiune_verifica(uuid, text)',
    'public.cont_curatenie()'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'anon sau authenticated poate chema %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'service_role NU poate chema %', f;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
