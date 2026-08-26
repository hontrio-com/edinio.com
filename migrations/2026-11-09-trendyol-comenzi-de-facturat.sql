-- ═══════════════════════════════════════════════════════════════════════════
-- Comenzile Trendyol care au factura si n-au trimis-o inca
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ FISIERUL A FOST SCRIS DUPA CE FUNCTIA ERA DEJA IN PRODUCTIE (26.08.2026). S-a aplicat
-- direct, si abia baseline-ul a prins-o. Se scrie acum ca istoricul sa fie intreg: cine
-- reconstruieste baza de la zero din `migrations/` trebuie sa ajunga la aceeasi forma.
--
-- ═══ ⚠ DE CE FILTRUL E AICI, IN POSTGRES, SI NU LA NOI ═══
--
-- Pasul de facturare lua o fereastra de zece comenzi. O comanda FARA factura intorcea
-- `fara_factura` si NU se marca nicaieri — deci ramanea in bazin pe veci si ocupa un loc.
--
-- Un magazin cu peste zece pachete active: comanda de luni primeste factura marti, dar cele
-- zece pachete de marti (toate fara factura) umplu fereastra. Factura de luni nu mai ajungea
-- NICIODATA la Trendyol, si nu se scria nicio eroare — pasul raporta ca a mers.
--
-- Filtrat aici, fereastra rotativa intoarce numai comenzi care CHIAR au ce trimite.
--
-- ⚠ SI MONEDA SE FILTREAZA TOT AICI. `orders.total` e citit peste tot ca lei; sub
-- Cross-Country, o comanda greceasca vine in EUR. Facturata ca lei, iese un document fiscal
-- gresit — care nu se retrage, se STORNEAZA — si care, urcat la Trendyol, nu mai poate fi
-- corectat deloc: 409 la a doua trimitere si niciun capat de corectie.
--
-- ⚠ `coalesce(..., 'RON')` fiindca `order_source` nu poarta moneda pe comenzile scrise INAINTE
-- de reparatia din 26.08. Ele sunt romanesti, toate: Cross-Country nu era pornit la niciun
-- magazin. O comanda straina veche ar fi fost facturata gresit oricum, si nu de aici.

CREATE OR REPLACE FUNCTION public.trendyol_comenzi_de_facturat(
  p_business_id uuid, p_limita integer DEFAULT 10, p_de_la integer DEFAULT 0
)
RETURNS TABLE(order_id uuid, shipment_package_id text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  select t.order_id, t.shipment_package_id
    from public.trendyol_orders t
    join public.orders o on o.id = t.order_id and o.business_id = t.business_id
   where t.business_id = p_business_id
     and t.order_id is not null
     and t.invoice_uploaded_at is null
     -- Numai cele care CHIAR au factura emisa. Fara filtrul asta, comenzile fara factura
     -- ocupau fereastra la nesfarsit si o factura emisa mai tarziu nu mai ajungea niciodata.
     and (
       (o.smartbill_invoice_number is not null and o.smartbill_invoice_url is not null)
       or (o.oblio_invoice_number is not null and o.oblio_invoice_link is not null)
       or (o.fgo_invoice_number is not null and o.fgo_invoice_link is not null)
     )
     -- Nu se factureaza in lei o comanda care n-a fost in lei.
     and coalesce(o.order_source->>'currency', 'RON') = 'RON'
   -- ⚠ Ordonare STABILA, ca fereastra rotativa sa aiba ce roti. Pe `updated_at` felia s-ar fi
   -- rearanjat intre doua treceri, si aceleasi comenzi ar fi iesit mereu.
   order by t.order_id
   offset greatest(0, p_de_la)
   limit greatest(1, least(coalesce(p_limita, 10), 100));
$function$;

revoke execute on function public.trendyol_comenzi_de_facturat(uuid, integer, integer) from public;
grant execute on function public.trendyol_comenzi_de_facturat(uuid, integer, integer) to service_role;

notify pgrst, 'reload schema';
