-- ══════════════════════════════════════════════════════════════════════════
-- TREI REPARATII PE MIGRATIA F1, CARE E DEJA IN PRODUCTIE
-- ══════════════════════════════════════════════════════════════════════════
--
-- `2026-12-28-configuratoare.sql` e aplicata. Auditul de dupa a gasit in ea trei lucruri care nu
-- dor azi (tabelele sunt goale) si care dor sigur din prima versiune publicata. Migratia asta le
-- inchide fara sa atinga nimic altceva.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠ 1. STERGEREA UNUI UTILIZATOR DEVENEA IMPOSIBILA
-- ══════════════════════════════════════════════════════════════════════════
--
-- `configurator_versiuni_imutabile` ridica exceptie NECONDITIONAT pe `DELETE`, iar pe `UPDATE`
-- lasa sa treaca doar completarea lui `compilat` din `null`.
--
-- Actiunile referentiale ale cheilor straine sunt instructiuni `UPDATE`/`DELETE` obisnuite si
-- APRIND declansatoarele de rand. Deci `auth.admin.deleteUser(id)` esua pe DOUA cai independente:
--
--   1. `businesses.user_id -> auth.users on delete cascade`, apoi
--      `configurator_versiuni.business_id -> businesses on delete cascade`
--      => „Versiunile publicate nu se sterg."
--   2. `publicat_de -> auth.users on delete set null`
--      => un UPDATE pe care garda il refuza, fiindca `old.compilat` nu mai e null
--      => „Versiunile publicate nu se modifica."
--
-- E singurul declansator de imutabilitate din toata schema, deci tiparul n-a mai fost pus la
-- incercare pe calea de stergere. Azi nu doare (tabelul e gol in productie), dar din prima
-- versiune publicata ORICE cerere GDPR de stergere pica, si pica cu un mesaj care nu spune nimic
-- despre cauza adevarata.
--
-- ⚠ CE NU SE SLABESTE. Imutabilitatea ramane exact ce era pentru orice atingere venita din
-- aplicatie: o versiune publicata nu se sterge si nu se modifica. Se deschid DOUA usi, amandoua
-- inguste si amandoua deschise numai de baza insasi:
--
--   - stergerea CAND MAGAZINUL PARINTE NU MAI EXISTA. In Postgres, `on delete cascade` se face
--     printr-un declansator AFTER pe parinte: cand ajunge aici, randul din `businesses` e deja
--     sters in aceeasi tranzactie. Deci `not exists (...)` e adevarat DOAR intr-o cascada, si
--     fals la orice incercare directa de stergere.
--   - punerea lui `publicat_de` pe NULL, si numai a lui. Orice alta coloana schimbata odata cu
--     el cade mai departe.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠ 2. RLS VERIFICA `business_id`, DAR NU SI AL CUI E `configurator_id`
-- ══════════════════════════════════════════════════════════════════════════
--
-- Politicile erau `for all using (business_id in (magazinele mele))` — corecte pe randul propriu,
-- dar fara nicio vorba despre coloanele de TRIMITERE. Iar `2026-12-28` nu revoca nimic de la
-- `authenticated`, deci prin `alter default privileges` orice comerciant autentificat are `INSERT`
-- direct prin Data API.
--
-- Deci un comerciant putea insera in `configurator_versiuni` un rand cu PROPRIUL `business_id` si
-- `configurator_id`-ul VICTIMEI. Constrangerea `unique (configurator_id, numar)` e globala, iar
-- victima isi calculeaza numarul urmator prin clientul ei cu RLS — deci randul strain e INVIZIBIL
-- pentru ea. `max+1` se ciocneste, reincercarea se ciocneste la fel, si publicarea ei devine
-- imposibila PERMANENT. Iar randul intrus nu se putea sterge, din cauza punctului 1.
--
-- Acelasi tipar, mai bland, pe `configurator_produse`: indexul unic pe `product_id` e global, iar
-- id-urile de produs sunt publice pe vitrina.
--
-- Stratul de actiuni e strans (fiecare id primit trece prin `esteAlMagazinului`); gaura era numai
-- pe calea Data API directa. Se inchide cu `with check`, adica in baza.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠ 3. `grant ALL to anon` PE CELE PATRU TABELE F1
-- ══════════════════════════════════════════════════════════════════════════
--
-- `2026-12-28` se bizuia doar pe RLS, si scria asta pe fata. Pentru SELECT/INSERT/UPDATE/DELETE e
-- corect: `auth.uid()` e null pentru `anon`, deci politicile nu lasa niciun rand. Dar `TRUNCATE`
-- NU trece prin RLS deloc — e un privilegiu de tabel pur.
--
-- Nu cunosc o cale prin care PostgREST sa emita `TRUNCATE`, deci nu se poate numi exploatabil azi.
-- Ramane insa ca migratiile mai noi revoca si aceasta nu, adica aceeasi masa are doua feluri de
-- aparare. Se uniformizeaza.

begin;

-- ── 1. Imutabilitatea nu mai blocheaza cascadele ──────────────────────────

create or replace function public.configurator_versiuni_imutabile()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'DELETE' then
    /*
     * ⚠ Cascada de la magazinul sters trece. Vezi antetul: `on delete cascade` sterge copiii
     * printr-un declansator AFTER pe parinte, deci cand ajungem aici randul din `businesses` e
     * deja plecat. La o stergere DIRECTA el exista, si exceptia se ridica mai departe.
     */
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then
      return old;
    end if;
    raise exception 'Versiunile publicate nu se sterg. Arhiveaza configuratorul.';
  end if;

  -- Completarea lui `compilat`, ca pana acum.
  if old.compilat is null and new.compilat is not null
     and new.id = old.id
     and new.business_id = old.business_id
     and new.configurator_id = old.configurator_id
     and new.numar = old.numar
     and new.definitie = old.definitie
     and new.reguli = old.reguli
     and new.pretuire = old.pretuire
     and new.publicat_la = old.publicat_la then
    return new;
  end if;

  /*
   * ⚠ `publicat_de -> null`, si NUMAI el. Vine din `on delete set null` cand se sterge
   * utilizatorul care a publicat. Orice alta coloana schimbata odata cu el cade mai departe:
   * comparatia de mai jos le enumera pe toate.
   */
  if old.publicat_de is not null and new.publicat_de is null
     and new.id = old.id
     and new.business_id = old.business_id
     and new.configurator_id = old.configurator_id
     and new.numar = old.numar
     and new.definitie = old.definitie
     and new.reguli = old.reguli
     and new.pretuire = old.pretuire
     and new.compilat is not distinct from old.compilat
     and new.publicat_la = old.publicat_la then
    return new;
  end if;

  raise exception 'Versiunile publicate nu se modifica. Publica o versiune noua.';
end;
$function$;

revoke all on function public.configurator_versiuni_imutabile() from public;
revoke all on function public.configurator_versiuni_imutabile() from anon, authenticated;

-- ── 2. Politicile cer si ca TRIMITERILE sa fie ale aceluiasi magazin ──────

drop policy if exists owner_all_configurator_versiuni on public.configurator_versiuni;
create policy owner_all_configurator_versiuni on public.configurator_versiuni
  for all
  using (business_id in (select id from public.businesses where user_id = (select auth.uid())))
  with check (
    business_id in (select id from public.businesses where user_id = (select auth.uid()))
    and exists (
      select 1 from public.configuratoare c
      where c.id = configurator_id and c.business_id = configurator_versiuni.business_id
    )
  );

drop policy if exists owner_all_configurator_produse on public.configurator_produse;
create policy owner_all_configurator_produse on public.configurator_produse
  for all
  using (business_id in (select id from public.businesses where user_id = (select auth.uid())))
  with check (
    business_id in (select id from public.businesses where user_id = (select auth.uid()))
    and exists (
      select 1 from public.configuratoare c
      where c.id = configurator_id and c.business_id = configurator_produse.business_id
    )
    and exists (
      select 1 from public.products p
      where p.id = product_id and p.business_id = configurator_produse.business_id
    )
  );

drop policy if exists owner_all_configurator_categorii on public.configurator_categorii;
create policy owner_all_configurator_categorii on public.configurator_categorii
  for all
  using (business_id in (select id from public.businesses where user_id = (select auth.uid())))
  with check (
    business_id in (select id from public.businesses where user_id = (select auth.uid()))
    and exists (
      select 1 from public.configuratoare c
      where c.id = configurator_id and c.business_id = configurator_categorii.business_id
    )
  );

/*
 * `configuratoare` n-are coloane de trimitere catre alt magazin: `versiune_activa_id` arata catre
 * o versiune, iar aceea are deja `with check` pe configuratorul ei. Se rescrie totusi cu `with
 * check` explicit, ca sa nu ramana singura politica din familie fara el — un cititor viitor n-ar
 * avea de unde sti daca lipsa e o hotarare sau o uitare.
 */
drop policy if exists owner_all_configuratoare on public.configuratoare;
create policy owner_all_configuratoare on public.configuratoare
  for all
  using (business_id in (select id from public.businesses where user_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where user_id = (select auth.uid())));

-- ── 3. Granturile, uniformizate cu migratiile mai noi ─────────────────────

revoke all on table public.configuratoare from anon;
revoke all on table public.configurator_versiuni from anon;
revoke all on table public.configurator_produse from anon;
revoke all on table public.configurator_categorii from anon;

/*
 * ⚠ `authenticated` PASTREAZA cele patru drepturi de rand: panoul scrie prin clientul
 * utilizatorului, deci prin RLS. Ce se revoca e restul (`TRUNCATE`, `REFERENCES`, `TRIGGER`),
 * care nu trec prin RLS si pe care nu le foloseste nimeni.
 */
revoke all on table public.configuratoare from authenticated;
revoke all on table public.configurator_versiuni from authenticated;
revoke all on table public.configurator_produse from authenticated;
revoke all on table public.configurator_categorii from authenticated;

grant select, insert, update, delete on table public.configuratoare to authenticated;
grant select, insert, update, delete on table public.configurator_versiuni to authenticated;
grant select, insert, update, delete on table public.configurator_produse to authenticated;
grant select, insert, update, delete on table public.configurator_categorii to authenticated;

grant all on table public.configuratoare to service_role;
grant all on table public.configurator_versiuni to service_role;
grant all on table public.configurator_produse to service_role;
grant all on table public.configurator_categorii to service_role;

commit;

notify pgrst, 'reload schema';
