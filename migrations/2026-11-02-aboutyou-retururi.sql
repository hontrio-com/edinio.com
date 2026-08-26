-- ══════════════════════════════════════════════════════════════════════════
-- ABOUT YOU: RETURUL NU MAI REPUNE MARFA PE RAFT SINGUR (26.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- A treia si ultima integrare cu aceeasi scapare. La eMAG s-a taiat pe 25.08, la Trendyol pe
-- 26.08; aici a ramas fiindca taiata fara inlocuitor, marfa intoarsa n-ar mai fi ajuns
-- NICIODATA inapoi in stoc — si aia e o paguba mai mare decat cea de care ne aparam.
--
-- ⚠ CE FACEA: `aboutyou/orders.ts` chema `tranzitieComandaMarketplace` fara `elibereazaStoc`,
-- iar implicitul din baza e `true`. Deci statusul „returned" de la ei punea AUTOMAT toata
-- comanda inapoi pe raft. Marfa intoarsa vine insa desfacuta, zgariata, incompleta, sau pur si
-- simplu alta — iar stocul umflat se vinde, si se vinde ce nu exista.
--
-- ⚠ DOUA APASARI, NU UNA. „Returul e acceptat" inseamna ca banii se intorc. „Am primit marfa si
-- e buna" inseamna ca produsul se pune la loc. Sunt lucruri diferite, la momente diferite.
--
-- ⚠ SI DE-AIA E O TABELA, nu un camp in `items`. Repunerea trebuie sa fie idempotenta PE LINIE
-- si sa se poata bloca; un jsonb citit-modificat-scris are chiar cursa pe care o reparam.

create table if not exists public.aboutyou_retururi (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  aboutyou_order_number text not null,
  order_id uuid references public.orders(id) on delete set null,
  sku text not null,
  product_id uuid references public.products(id) on delete set null,
  -- ⚠ Pe TITLU, nu pe indice: indicii se muta cand comerciantul rearanjeaza combinatiile.
  variant_title text,
  nume_produs text,
  quantity integer not null default 1,
  repus_in_stoc_la timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- O linie de comanda se intoarce o singura data.
  unique (business_id, aboutyou_order_number, sku)
);

create index if not exists aboutyou_retururi_de_rezolvat_idx
  on public.aboutyou_retururi (business_id, created_at desc)
  where repus_in_stoc_la is null;

alter table public.aboutyou_retururi enable row level security;

-- Citeste numai proprietarul; scrierile raman la service-role, ca la surorile ei.
create policy owner_select_aboutyou_retururi on public.aboutyou_retururi
  for select using (business_id in (
    select id from public.businesses where user_id = (select auth.uid())));

/*
 * Repunerea in stoc a unei linii, o SINGURA data.
 *
 * ⚠ `for update` E TOT ROSTUL FUNCTIEI, exact ca la `trendyol_repune_stoc_retur`. Doua apasari
 * repezi ar citi amandoua un marcaj gol si ar aduna amandoua.
 */
create or replace function public.aboutyou_repune_stoc_retur(
  p_business_id uuid,
  p_retur_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_r public.aboutyou_retururi%rowtype;
begin
  select * into v_r
    from public.aboutyou_retururi
   where id = p_retur_id and business_id = p_business_id
   for update;

  if not found then
    return jsonb_build_object('stare', 'lipsa', 'pus', 0);
  end if;

  -- Nu e o eroare: e chiar raspunsul corect la a doua apasare.
  if v_r.repus_in_stoc_la is not null then
    return jsonb_build_object('stare', 'deja', 'pus', 0);
  end if;

  if v_r.product_id is null then
    return jsonb_build_object('stare', 'fara-produs', 'pus', 0);
  end if;

  -- ⚠ FUNCTIA CASEI, nu o adunare scrisa aici: e chiar cea prin care se intoarce stocul la
  -- anulari, si stie amandoua felurile — produsul intreg si combinatia.
  if coalesce(v_r.variant_title, '') <> '' then
    perform public.elibereaza_stoc_complet(
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'product_id', v_r.product_id, 'variant_title', v_r.variant_title, 'quantity', v_r.quantity)));
  else
    perform public.elibereaza_stoc_complet(
      jsonb_build_array(jsonb_build_object('product_id', v_r.product_id, 'quantity', v_r.quantity)),
      '[]'::jsonb);
  end if;

  update public.aboutyou_retururi
     set repus_in_stoc_la = now(), updated_at = now()
   where id = v_r.id;

  return jsonb_build_object('stare', 'pus', 'pus', v_r.quantity);
end;
$$;

comment on function public.aboutyou_repune_stoc_retur(uuid, uuid) is
  'Repune in stoc o linie returnata de la About You, o singura data. Randul se ia for update.';

-- ⚠ `security definer` peste stocul oricui: fara revoke, EXECUTE ramane la PUBLIC dupa fiecare
-- `create or replace`. Actiunea de server isi verifica magazinul inainte s-o cheme.
revoke execute on function public.aboutyou_repune_stoc_retur(uuid, uuid) from public, anon, authenticated;
grant execute on function public.aboutyou_repune_stoc_retur(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
