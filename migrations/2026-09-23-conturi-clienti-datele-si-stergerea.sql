-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 8: datele contului, retururile, anularea,
--                                exportul si stergerea             (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Contactele omului ──────────────────────────────────────────────────────

create or replace function public.cont_contactele_mele(
  p_business uuid, p_cont uuid
) returns table (fel text, valoare_bruta text, valoare text, verificat boolean, creat_la timestamptz)
language sql stable security definer set search_path = '' as $fn$
  select x.fel, x.valoare_bruta, x.valoare, x.verificat_la is not null, x.creat_la
    from privat.cont_contact x
   where x.business_id = p_business and x.cont_id = p_cont
   order by x.creat_la;
$fn$;

create or replace function public.cont_sterge_contact(
  p_business uuid, p_cont uuid, p_fel text, p_valoare text
) returns table (ok boolean, motiv text)
language plpgsql security definer set search_path = '' as $fn$
declare v_dest text; v_ramase integer;
begin
  v_dest := privat.cont_normalizeaza(p_fel, p_valoare);
  if v_dest is null then
    return query select false, 'contact-nevalid';
    return;
  end if;

  /*
    ⚠⚠ ULTIMUL CONTACT VERIFICAT NU SE POATE SCOATE.
    Nu exista parola: contactele SUNT singura cale de intrare. Fara randul asta,
    omul apasa „Scoate" pe ultimul lui email si se incuie singur afara pentru
    totdeauna, fara nicio usa inapoi si fara sa fi inteles ce face. Numaratoarea
    se face EXCLUZAND chiar contactul care se sterge, in aceeasi instructiune:
    o citire de dinainte ar fi lasat loc unei a doua cereri intre ele.
  */
  select count(*) into v_ramase
    from privat.cont_contact x
   where x.business_id = p_business and x.cont_id = p_cont
     and x.verificat_la is not null
     and not (x.fel = p_fel and x.valoare = v_dest);

  if v_ramase = 0 then
    return query select false, 'ultimul-contact';
    return;
  end if;

  delete from privat.cont_contact x
   where x.business_id = p_business and x.cont_id = p_cont
     and x.fel = p_fel and x.valoare = v_dest;
  if not found then
    return query select false, 'negasit';
    return;
  end if;

  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'contact-scos', jsonb_build_object('fel', p_fel));

  return query select true, 'sters';
end $fn$;

-- ── Retururile lui ─────────────────────────────────────────────────────────

create or replace function public.cont_retururile_mele(
  p_business uuid, p_cont uuid
) returns table (
  retur_id uuid, numar_comanda text, creat_la timestamptz, stare text,
  motiv text, fel_restituire text, iban_mascat text, bucati bigint
)
language sql stable security definer set search_path = '' as $fn$
  select
    r.id, r.order_number, r.created_at, r.status,
    r.reason, r.refund_method,
    /*
      ⚠⚠ IBAN-UL SE MASCHEAZA IN SQL, NU IN COMPONENTA. O mascare facuta la
      randare se ocoleste de a doua randare, de un export, de o proba scrisa
      grabit sau de urmatorul ecran care citeste aceeasi functie. Aici, valoarea
      intreaga nu iese niciodata din baza.
    */
    case
      when nullif(btrim(coalesce(r.refund_iban, '')), '') is null then null
      else repeat('*', greatest(0, length(btrim(r.refund_iban)) - 4)) || right(btrim(r.refund_iban), 4)
    end,
    (select count(*) from jsonb_array_elements(coalesce(r.items, '[]'::jsonb)))
  from public.return_requests r
  join privat.cont_comanda l
    on l.order_id = r.order_id
   and l.business_id = r.business_id
  where r.business_id = p_business
    and l.cont_id = p_cont
  order by r.created_at desc;
$fn$;

comment on function public.cont_retururile_mele(uuid, uuid) is
  'Retururile cumparatorului, legate prin comanda. ⚠ `return_requests.order_id` e NULABIL si `on delete set null`: un retur a carui comanda a fost STEARSA de comerciant nu mai apare aici, desi cererea lui traieste in panou si poarta IBAN-ul. E o gaura veche a schemei, nu una adusa de conturi, si e scrisa in plan la datorii.';

-- ── Anularea unei comenzi `pending` (H5) ───────────────────────────────────

create or replace function public.cont_anuleaza_comanda(
  p_business uuid, p_cont uuid, p_order uuid
) returns table (ok boolean, motiv text)
language plpgsql security definer set search_path = '' as $fn$
declare v_stare text; v_mp boolean; v_rez jsonb;
begin
  /* ⚠ Si comanda sa fie a lui, SI vederea sa fie intreaga: una legata doar pe
     numarul ei nu are voie sa fie anulata de cine a ghicit numarul. */
  if not exists (
    select 1 from privat.cont_comanda l
     where l.business_id = p_business and l.cont_id = p_cont
       and l.order_id = p_order and l.vedere = 'intreaga'
  ) then
    return query select false, 'negasita';
    return;
  end if;

  select o.status, coalesce(o.order_source ? 'marketplace', false)
    into v_stare, v_mp
    from public.orders o where o.id = p_order and o.business_id = p_business;

  if v_stare is null then
    return query select false, 'negasita';
    return;
  end if;
  /* ⚠ La marketplace ciclul comenzii e tinut de ei; noi n-avem ce anula. */
  if v_mp then
    return query select false, 'marketplace';
    return;
  end if;
  if v_stare <> 'pending' then
    return query select false, 'prea-tarziu';
    return;
  end if;

  /*
    ⚠⚠ TRECE PRIN `aplica_tranzitia_comenzii`, NICIODATA printr-un `update` pe
    `status`. Acolo stau eliberarea stocului, desfacerea cuponului si cele doua
    declansatoare de email marketing de pe `status`. Un `update` direct ar fi
    lasat stocul blocat si cuponul consumat, tacut, iar comerciantul ar fi
    descoperit-o abia cand un produs „nu mai e pe stoc" fara sa fie vandut.
    ⚠ Si `p_business_id` se da anume: functia verifica ea insasi ca e comanda
    magazinului, la ea in instructiune.
  */
  v_rez := public.aplica_tranzitia_comenzii(p_order, 'cancelled', null, p_business, true);
  if coalesce((v_rez->>'gasit')::boolean, false) = false then
    return query select false, 'negasita';
    return;
  end if;

  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'anulare-comanda', jsonb_build_object('comanda', p_order));

  return query select true, 'anulata';
end $fn$;

-- ── Exportul (art. 15) ─────────────────────────────────────────────────────
--
-- ⚠⚠ CONTINE SI RETURURILE, SI JURNALUL. Prima scriere a planului le lasa afara,
-- adica tocmai cele doua lucruri pe care le pastram despre om si pe care el nu
-- le vede nicaieri altundeva: motivul returului, scris de mana lui, si faptele
-- cu IP. Un export care lasa afara exact ce nu se vede e mai rau decat niciunul.

create or replace function public.cont_export(
  p_business uuid, p_cont uuid
) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'cont', (select jsonb_build_object('nume', c.nume, 'creat_la', c.creat_la)
               from privat.cont_cumparator c where c.id = p_cont and c.business_id = p_business),
    'contacte', (select coalesce(jsonb_agg(jsonb_build_object(
        'fel', x.fel, 'valoare', x.valoare_bruta, 'verificat_la', x.verificat_la, 'creat_la', x.creat_la)), '[]'::jsonb)
      from privat.cont_contact x where x.business_id = p_business and x.cont_id = p_cont),
    'comenzi', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      from public.cont_comenzile_mele(p_business, p_cont, 100, 0) m),
    'retururi', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from public.cont_retururile_mele(p_business, p_cont) r),
    'preferinte', (select to_jsonb(p) from public.cont_preferinte(p_business, p_cont) p),
    'jurnal', (select coalesce(jsonb_agg(jsonb_build_object(
        'fapta', j.fapta, 'detalii', j.detalii, 'ip', j.ip, 'creat_la', j.creat_la) order by j.creat_la), '[]'::jsonb)
      from privat.cont_jurnal j where j.business_id = p_business and j.cont_id = p_cont)
  );
$fn$;

-- ── Stergerea contului ─────────────────────────────────────────────────────

create or replace function public.cont_sterge(
  p_business uuid, p_cont uuid
) returns table (ok boolean, comenzi_ramase bigint)
language plpgsql security definer set search_path = '' as $fn$
declare v_comenzi bigint;
begin
  select count(*) into v_comenzi
    from privat.cont_comanda l where l.business_id = p_business and l.cont_id = p_cont;

  /*
    ⚠⚠ CE NU SE ATINGE AICI, SI DE CE:
      - COMENZILE. Nu se sterg si nu se anonimizeaza: venitul lunilor incheiate
        ar scadea retroactiv, iar facturile ar ramane fara nimic in spate.
        Stergerea CONTULUI si stergerea DATELOR din comenzi sunt doua lucruri
        deosebite; a doua e `customer_anonymize`, si o porneste comerciantul.
      - DEZABONAREA. `recovery_optout` si `sms_optout` raman intacte. Omul care
        cere stergerea e de multe ori chiar cel care ceruse sa nu mai primeasca
        mesaje; sters si randul acela, prima campanie de maine l-ar fi gasit din
        nou. Exista deja o proba a casei care apara chiar regula asta.
    ⚠ Contactele SE sterg, si de aceea omul poate deschide alt cont maine cu
      acelasi email. Contactul propriu nu intra niciodata in `cont_contact_blocat`.
  */
  delete from privat.cont_contact x where x.business_id = p_business and x.cont_id = p_cont;
  delete from privat.cont_comanda l where l.business_id = p_business and l.cont_id = p_cont;
  delete from privat.cont_cod c where c.business_id = p_business and c.cont_id = p_cont;

  update privat.cont_cumparator c
     set sters_la = now(), nume = '', epoca_sesiunii = epoca_sesiunii + 1
   where c.id = p_cont and c.business_id = p_business;

  insert into privat.cont_jurnal (business_id, cont_id, fapta)
  values (p_business, p_cont, 'cont-sters');

  return query select true, v_comenzi;
end $fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DREPTURILE
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.cont_contactele_mele(uuid, uuid)            from public, anon, authenticated;
revoke all on function public.cont_sterge_contact(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.cont_retururile_mele(uuid, uuid)            from public, anon, authenticated;
revoke all on function public.cont_anuleaza_comanda(uuid, uuid, uuid)     from public, anon, authenticated;
revoke all on function public.cont_export(uuid, uuid)                     from public, anon, authenticated;
revoke all on function public.cont_sterge(uuid, uuid)                     from public, anon, authenticated;

grant execute on function public.cont_contactele_mele(uuid, uuid)            to service_role;
grant execute on function public.cont_sterge_contact(uuid, uuid, text, text) to service_role;
grant execute on function public.cont_retururile_mele(uuid, uuid)            to service_role;
grant execute on function public.cont_anuleaza_comanda(uuid, uuid, uuid)     to service_role;
grant execute on function public.cont_export(uuid, uuid)                     to service_role;
grant execute on function public.cont_sterge(uuid, uuid)                     to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_contactele_mele(uuid, uuid)',
    'public.cont_sterge_contact(uuid, uuid, text, text)',
    'public.cont_retururile_mele(uuid, uuid)',
    'public.cont_anuleaza_comanda(uuid, uuid, uuid)',
    'public.cont_export(uuid, uuid)',
    'public.cont_sterge(uuid, uuid)'
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
