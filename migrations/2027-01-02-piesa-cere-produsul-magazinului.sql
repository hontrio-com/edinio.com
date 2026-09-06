-- ══════════════════════════════════════════════════════════════════════════
-- PIESA NU POATE ARATA CATRE PRODUSUL ALTUI MAGAZIN (F5, corectiv)
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE LIPSEA, SI DE CE E TOCMAI GAURA PE CARE MIGRATIA DE IERI A INCHIS-O IN ALTA PARTE
--
-- `2027-01-01` a pus `with check` pe `configurator_produse`, cerand ca `product_id` sa fie un
-- produs AL ACELUIASI magazin. `configurator_componente` are exact aceeasi coloana, cu exact
-- aceeasi cheie straina — si a ramas fara. Politica ei e `for all` numai cu `using`, iar Postgres
-- foloseste atunci `using` si drept `with check`: se verifica DOAR `business_id`, care e al meu
-- oricum, fiindca eu il scriu.
--
-- ⚠ CHEIA STRAINA NU APARA NIMIC AICI. Ea se verifica cu drepturile proprietarului constrangerii,
-- deci OCOLESTE RLS-ul de pe `products`. Iar id-urile de produs sunt publice pe vitrina: se
-- citesc din formularul de comanda al oricarui magazin.
--
-- Deci, fara randurile de mai jos, comerciantul A putea face o piesa care arata catre produsul
-- comerciantului B. Piesa se inghiata la publicare cu `produsId` cu tot, iar fiecare comanda de pe
-- magazinul lui A ar fi scazut stocul lui B: `revendica_stoc_complet` cauta `where id = pid`, fara
-- `business_id`. Nu supravanzare — blocarea vanzarii altcuiva, de la distanta, si fara nicio urma
-- dupa anulare.
--
-- ⚠ ASTA E A DOUA INCUIETOARE, NU PRIMA. `produsulEAlMeu()` din `configurator.actions.ts` verifica
-- deja pe amandoua drumurile de scriere, si o proba o pazeste. Dar actiunile nu sunt singurul drum
-- care poate ajunge vreodata la tabel: panoul scrie prin clientul utilizatorului, deci prin Data
-- API, iar acolo `from("configurator_componente").insert(...)` merge de-a dreptul.
--
-- ⚠ `product_id is null` TRECE, dinadins: piesa fara produs e cazul obisnuit pentru manopera si
-- consumabile — costa, dar nu se tine pe stoc. Vezi comentariul coloanei.

begin;

drop policy if exists owner_all_configurator_componente on public.configurator_componente;
create policy owner_all_configurator_componente on public.configurator_componente
  for all
  using (business_id in (select id from public.businesses where user_id = (select auth.uid())))
  with check (
    business_id in (select id from public.businesses where user_id = (select auth.uid()))
    and (
      product_id is null
      or exists (
        select 1 from public.products p
        where p.id = product_id and p.business_id = configurator_componente.business_id
      )
    )
  );

-- ── Granturile, uniformizate cu restul familiei ───────────────────────────
--
-- ⚠ `configurator_componente` a ramas singura masa a configuratorului careia nu i s-a facut
-- revocarea dinaintea granturilor, deci `authenticated` a pastrat de la `alter default privileges`
-- si `REFERENCES` (masurat in productie dupa aplicare). Nu e o gaura mare — o cheie straina catre
-- masa noastra nu citeste nimic — dar e o diferenta tacuta intre cinci mese care ar trebui sa
-- arate la fel, iar `src/lib/rls-tabele.test.ts` citeste tocmai perechea grant + RLS din baseline.
--
-- ⚠ Cele PATRU drepturi de rand raman: panoul scrie prin clientul utilizatorului, deci prin RLS.

revoke all on table public.configurator_componente from anon;
revoke all on table public.configurator_componente from authenticated;

grant select, insert, update, delete on table public.configurator_componente to authenticated;
grant all on table public.configurator_componente to service_role;

commit;

notify pgrst, 'reload schema';
