-- ═══════════════════════════════════════════════════════════════════════════
-- O LISTA GOALA DE FRATI NU INSEAMNA CA N-AU EXISTAT NICIODATA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (28.08.2026, tarziu)
--
-- `operatiaSAIncheiat` a inchis, runda trecuta, confirmarea dupa prima transa — dar numara doar
-- randurile care APUCA sa existe. Iar `[].every(...)` e `true`:
--
--     250 de variante -> trei transe
--     transa 1: randul scris, cererea plecata ✅
--     procesul moare
--     transele 2 si 3 n-au niciun rand
--     mai tarziu transa 1 se aseaza -> frati: [] -> „operatia s-a incheiat" ❌
--
-- Se scrie `catalog_confirmat_la`, semnul din cutia de iesire se stinge, si se poate merge chiar
-- mai departe spre publicare — cu o suta de variante din doua sute cincizeci la ei.
--
-- La stoc si pret la fel: plafonul e o mie de articole pe cerere, iar pretul se numara pe SKU × tara
-- (400 de variante × 3 tari = 1200), deci doua transe sunt cazul obisnuit, nu unul rar.
--
-- ⚠ NU E NEVOIE DE UN TABEL-PARINTE. Numarul de transe se stie INAINTE de prima cerere — e o
-- impartire — si se scrie pe fiecare rand de lot, prin acelasi drum care scrie deja intentia
-- inaintea cererii. Confirmarea cere atunci doua lucruri: sa fie TOTI (`randuri = transe`) si toti
-- `completed`. Un tabel in plus ar fi adaugat o a doua scriere care poate lipsi ea insasi.

alter table public.aboutyou_batches
  add column if not exists transe integer;

comment on column public.aboutyou_batches.transe is
  'Cate loturi are, in total, operatia logica din care face parte acesta. Se stie inainte de prima cerere. Confirmarea cere sa existe toate si toate incheiate: o lista goala de frati nu inseamna ca n-au existat niciodata.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SI GENERATIA STARII SE CRESTE ATOMIC, CA SI CEA A CONTINUTULUI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA: continutul avea de mult `aboutyou_generatie_noua`, un RPC care creste atomic. Starea
-- se scria citit-apoi-scris din aplicatie:
--
--     A citeste generatia 5, B citeste generatia 5
--     A vrea `published` -> scrie 6
--     B vrea `inactive`  -> scrie 6
--
-- Doua loturi externe cu ACEEASI generatie: niciunul nu e „depasit" fata de celalalt, deci paza pe
-- generatie nu vede nimic, iar la ei castiga cine termina ultimul — nu cine a cerut ultimul.

create or replace function public.aboutyou_status_generatie_noua(p_listing_id uuid, p_status text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gen integer;
begin
  update public.aboutyou_listings
     set status_generatie = status_generatie + 1,
         status_dorit = p_status
   where id = p_listing_id
  returning status_generatie into v_gen;
  return v_gen;
end;
$$;

revoke execute on function public.aboutyou_status_generatie_noua(uuid, text) from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- SI O LISTARE ELIMINATA LASA O PIATRA DE MORMANT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA: eliminarea cerea `inactive`/`draft` la ei si stergea randul la noi, fara sa treaca
-- prin generatia starii. Deci:
--
--     10:00 „Publica"  -> lotul pleaca, e inca in lucru la ei
--     10:01 „Elimina"  -> `inactive` se incheie primul, randul local se sterge
--     10:05 `published` cel vechi se aseaza -> la ei produsul E DIN NOU ACTIV ❌
--
-- Iar la noi nu mai exista nici listare, nici `status_dorit`, nici generatie: nimic care sa mai
-- ceara `inactive`. Produsul ramane vandabil, si nimeni nu mai afla.
--
-- ⚠ PIATRA DE MORMANT E IEFTINA SI TINE MINTE EXACT CE TREBUIE: cheia de stil si generatia la care
-- s-a cerut scoaterea. Un lot de stare cu generatie mai mica, asezat dupa, se recunoaste ca depasit
-- chiar si fara listare — si atunci se cere din nou `inactive`, pe cheie.

create table if not exists public.aboutyou_listari_scoase (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  style_key text not null,
  product_id uuid,
  -- Generatia starii la clipa scoaterii. Un lot de stare sub ea e depasit, oricat de tarziu vine.
  status_generatie integer default 0 not null,
  scos_la timestamp with time zone default now() not null,
  -- Cate reasertari de `inactive` s-au facut de-atunci: o bucla fara capat n-ar fi o plasa.
  reasertari integer default 0 not null,
  unique (business_id, style_key)
);

comment on table public.aboutyou_listari_scoase is
  'Listarile About You eliminate. Tine cheia de stil si generatia starii, ca un lot de `published` mai vechi asezat dupa eliminare sa poata fi recunoscut si stins, chiar daca randul de listare nu mai exista.';

create index if not exists aboutyou_listari_scoase_cautare_idx
  on public.aboutyou_listari_scoase (business_id, style_key);

alter table public.aboutyou_listari_scoase enable row level security;

drop policy if exists owner_select_aboutyou_listari_scoase on public.aboutyou_listari_scoase;
create policy owner_select_aboutyou_listari_scoase on public.aboutyou_listari_scoase
  for select using (
    business_id in (
      select businesses.id from public.businesses
       where businesses.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';
