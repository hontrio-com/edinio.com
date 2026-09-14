-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERELE `*_murdar` NU MAI SCRIU PENTRU UN MAGAZIN CARE TOCMAI A DISPARUT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE ERA STRICAT, SI CAT DE DEPARTE AJUNGEA
--
-- `delete from auth.users` duce in cascada la `businesses`, iar de acolo la
-- `categories`, `catalog_produs` si `products`. Cele trei functii de mai jos sunt
-- AFTER INSERT OR DELETE OR UPDATE pe tabelele acelea, si pe DELETE faceau
--
--     insert into catalog_rezumat_murdar (business_id, marcat_la)
--     values (coalesce(new.business_id, old.business_id), now())
--
-- adica scriau un rand pentru un magazin care in aceeasi comanda tocmai
-- disparuse. Cheia straina spre `businesses` e imediata, nu amanata, deci iesea
-- 23503 si stergerea CADEA.
--
-- Urmarea: stergerea de cont pica pentru ORICE cont care are macar o categorie.
-- Si nu cadea la inceput, ci la mijloc: in `deleteAccount` abonamentul Stripe se
-- anuleaza INAINTE (auth.actions.ts:657-672), iar caderea vine abia la
-- `admin.auth.admin.deleteUser` (:681). Deci comerciantul ramanea FARA ABONAMENT
-- si CU CONTUL VIU, si primea un mesaj generic care il invita sa mai apese o data.
-- Butonul din admin (`/api/admin/users/[id]/delete`) cadea la fel, cu 500.
--
-- ⚠ GARDA, SI DE CE E ATAT DE MICA
--
-- `values (...)` devine `select b.id, now() from businesses b where b.id = ...`.
-- Logica ramane neatinsa, inclusiv `on conflict (business_id) do update`. Cand
-- magazinul exista, `select` da un rand si totul se petrece ca inainte; cand nu
-- mai exista, da zero randuri si nu se insereaza nimic. Costul in plus e o
-- singura cautare pe cheia primara a lui `businesses`.
--
-- ⚠ Asta conteaza fiindca functiile astea NU sunt pe un drum rar. Ele se aprind
-- la FIECARE atingere de categorie, de produs sau de rand de catalog, in TOATE
-- magazinele vii. O garda scrisa prost n-ar fi stricat stergerea de cont, ci ar
-- fi inghetat tacut numaratorile si fatetele din vitrinele tuturor clientilor.
--
-- ⚠ CE S-A DOVEDIT INAINTE DE A SE APLICA (proba cu anulare, pe baza vie)
--
-- Un bloc care isi facea doua magazine de unica folosinta si se incheia cu
-- `raise exception`, deci se anula intreg, si DDL-ul odata cu el:
--
--   1. cade azi        : A CAZUT cu 23503 pe catalog_rezumat_murdar_business_id_fkey
--   2. trece cu garda  : A TRECUT
--   3. inca marcheaza  : 1 rand pentru magazinul nou, deci marcarea NU s-a stins
--   4. rezumat, altele : 0 -> 0
--   5. cuvinte, toate  : 0 -> 0
--
-- ⚠ Punctele 4 si 5 au iesit egale, dar egale LA ZERO: amandoua tabelele erau
-- goale in clipa probei, deci comparatia aceea n-a dovedit nimic despre alte
-- magazine. E scris aici ca sa nu se citeasca mai mult decat s-a masurat.
-- Miezul, adica 1, 2 si 3, s-a dovedit.
--
-- ⚠ DE CE NUMAI TREI FUNCTII, DESI PE DRUM SUNT PATRU
--
-- `trg_catalog_proiectie` nu primeste garda fiindca ea nu INSEREAZA in nimic cu
-- cheie straina spre `businesses`: doar STERGE din `catalog_produs` si din
-- `catalog_murdar`, iar `catalog_murdar` trimite spre `products`, nu spre
-- `businesses` (baseline:7852). Stergerile ei aprind insa celelalte doua
-- triggere, care acum sunt pazite.
--
-- Corpurile de dinainte stau verbatim in istoricul lui `000-schema-baseline.sql`,
-- deci intoarcerea e o simpla reaplicare a lor.

create or replace function public.trg_catalog_rezumat_murdar()
 returns trigger language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $fn$
begin
  insert into public.catalog_rezumat_murdar (business_id, marcat_la)
  select b.id, now() from public.businesses b
   where b.id = coalesce(new.business_id, old.business_id)
  on conflict (business_id) do update set marcat_la = now();
  return coalesce(new, old);
end;
$fn$;

create or replace function public.trg_categorii_rezumat_murdar()
 returns trigger language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $fn$
begin
  insert into public.catalog_rezumat_murdar (business_id, marcat_la)
  select b.id, now() from public.businesses b
   where b.id = coalesce(new.business_id, old.business_id)
  on conflict (business_id) do update set marcat_la = now();
  return coalesce(new, old);
end;
$fn$;

create or replace function public.trg_catalog_cuvinte_murdar()
 returns trigger language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $fn$
begin
  if tg_op = 'UPDATE' and new.cauta_norm is not distinct from old.cauta_norm then
    return new;
  end if;
  insert into public.catalog_cuvinte_murdar (business_id, marcat_la)
  select b.id, now() from public.businesses b
   where b.id = coalesce(new.business_id, old.business_id)
  on conflict (business_id) do update set marcat_la = now();
  return coalesce(new, old);
end;
$fn$;
