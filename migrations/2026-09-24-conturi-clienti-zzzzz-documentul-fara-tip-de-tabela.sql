-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 18: documentul comenzii fara tip de tabela in
-- semnatura                                                    (24.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ `zzzzz-`: vine dupa 54, si in ordinea numelor.
--
-- Prinsa de `baza-se-poate-reface.test.ts` abia dupa regenerarea schemei de
-- referinta: `privat.cont_documentul_comenzii(o public.orders)` numea TABELA
-- `orders` ca tip de argument. La refacerea bazei din `000-schema-baseline.sql`,
-- sectiunea FUNCTII se aplica INAINTEA tabelelor, deci crearea ei cadea si
-- oprea toata restaurarea.
--
-- Parametrul devine `anyelement`: cei patru apelanti (`cont_comanda_mea`,
-- `cont_comenzile_mele`, `cont_facturile_mele`, `cont_rezumat`) dau mai departe
-- tot randul comenzii, `privat.cont_documentul_comenzii(o)`, si NU se ating.
-- Corpul e copiat INTOCMAI din migratia 48 (`...-comanda-completa.sql`).
-- Probat pe demo: acelasi rezultat pe toate comenzile, inainte si dupa.
--
-- ⚠ Ordinea: intai varianta noua (supraincarcare, alt tip), apoi se scoate cea
-- veche. Apelantii sunt functii SQL, fara dependente inregistrate, deci la
-- urmatorul apel gasesc singura varianta ramasa.

create function privat.cont_documentul_comenzii(o anyelement)
returns jsonb
language sql stable set search_path = '' as $fn$
  select case
    when nullif(btrim(coalesce(o.smartbill_invoice_number, '')), '') is not null
     and not privat.cont_e_document_de_test(o.smartbill_invoice_url) then
      jsonb_build_object(
        'casa', 'smartbill',
        'serie', o.smartbill_invoice_series,
        'numar', o.smartbill_invoice_number,
        'stornata', nullif(btrim(coalesce(o.smartbill_storno_number, '')), '') is not null,
        'storno_serie', o.smartbill_storno_series,
        'storno_numar', o.smartbill_storno_number,
        /* SmartBill da PDF-ul stornarii prin acelasi /invoice/pdf, cu seria ei. */
        'storno_descarcabil', nullif(btrim(coalesce(o.smartbill_storno_number, '')), '') is not null,
        'emisa_la', (
          select (min(x.creat_la) at time zone 'UTC')::date
            from public.operatii_externe x
           where x.business_id = o.business_id and x.order_id = o.id
             and x.fel = 'factura' and x.furnizor = 'smartbill' and x.stare = 'reusit'
             and x.referinta_externa = o.smartbill_invoice_number
        )
      )
    when nullif(btrim(coalesce(o.oblio_invoice_number, '')), '') is not null
     and not privat.cont_e_document_de_test(o.oblio_invoice_link) then
      jsonb_build_object(
        'casa', 'oblio',
        'serie', o.oblio_invoice_series,
        'numar', o.oblio_invoice_number,
        'stornata', nullif(btrim(coalesce(o.oblio_storno_number, '')), '') is not null,
        'storno_serie', o.oblio_storno_series,
        'storno_numar', o.oblio_storno_number,
        /* Oblio da stornarea ca document cu link propriu; fara link, nu se poate aduce. */
        'storno_descarcabil', nullif(btrim(coalesce(o.oblio_storno_number, '')), '') is not null
                              and nullif(btrim(coalesce(o.oblio_storno_link, '')), '') is not null
                              and not privat.cont_e_document_de_test(o.oblio_storno_link),
        'emisa_la', (
          select (min(x.creat_la) at time zone 'UTC')::date
            from public.operatii_externe x
           where x.business_id = o.business_id and x.order_id = o.id
             and x.fel = 'factura' and x.furnizor = 'oblio' and x.stare = 'reusit'
             and x.referinta_externa = o.oblio_invoice_number
        )
      )
    when nullif(btrim(coalesce(o.fgo_invoice_number, '')), '') is not null
     and not privat.cont_e_document_de_test(o.fgo_invoice_link) then
      jsonb_build_object(
        'casa', 'fgo',
        'serie', o.fgo_invoice_series,
        'numar', o.fgo_invoice_number,
        'stornata', nullif(btrim(coalesce(o.fgo_storno_number, '')), '') is not null,
        'storno_serie', o.fgo_storno_series,
        'storno_numar', o.fgo_storno_number,
        /* fGO nu pastreaza niciun link pentru stornare. */
        'storno_descarcabil', false,
        'emisa_la', null
      )
    else null
  end;
$fn$;

drop function if exists privat.cont_documentul_comenzii(public.orders);

revoke all on function privat.cont_documentul_comenzii(anyelement) from public, anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'privat.cont_documentul_comenzii(anyelement)', 'EXECUTE')
     or has_function_privilege('authenticated', 'privat.cont_documentul_comenzii(anyelement)', 'EXECUTE') then
    raise exception 'anon sau authenticated pot chema cont_documentul_comenzii';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'privat' and p.proname = 'cont_documentul_comenzii'
                and pg_get_function_identity_arguments(p.oid) <> 'o anyelement') then
    raise exception 'a ramas varianta veche a lui cont_documentul_comenzii';
  end if;
end $$;

notify pgrst, 'reload schema';
