-- ══════════════════════════════════════════════════════════════════════════
-- „LIVRAT" SE AFLA DE LA CURIER, NU DIN STATUSUL COMENZII (25.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Comerciantul VetDepo a spus-o primul: comanda EMAG-500822531 arata LIVRAT, desi coletul
-- inca mergea spre client. Masurat: eMAG chiar trimite `status: 4` pe ea.
--
-- ⚠ DAR 4 INSEAMNA „FINALIZATA" LA EI, NU „LIVRATA". Enumul lor, scris si in codul nostru:
-- 0 anulata · 1 noua · 2 in procesare · 3 pregatita · 4 finalizata · 5 returnata. E ciclul
-- de viata al comenzii IN CONTUL LOR, nu drumul coletului. La fel, 3 „pregatita" inseamna
-- gata de predare, nu plecata.
--
-- Noi traduceam 4 -> `delivered` si 3 -> `shipped`, deci amandoua spuneau mai mult decat
-- s-a intamplat. Iar un magazin care alege „factura la livrare" ar fi facturat prea devreme.
--
-- ═══ CE SE SCHIMBA ═══
--
--   eMAG 3 „pregatita"  -> `processing`   (nimic n-a plecat inca)
--   eMAG 4 „finalizata" -> `shipped`      (a plecat; livrarea nu se stie de aici)
--   AWB-ul lor, cand ajunge -> `delivered`
--
-- ⚠ FARA A TREIA LINIE, REPARATIA AR FI FOST O JUMATATE: comenzile eMAG n-ar mai fi ajuns
-- NICIODATA in „Livrat", si comerciantul ar fi ramas cu o informatie mai putina decat avea.
--
-- ⚠ `/awb/read` PRIMESTE DOAR `emag_id`, dupa chiar schema lor — nu are filtru pe comanda.
-- De-aia id-ul se scrie la emitere, si de-aia urmarirea se poate face abia acum.
--
-- ⚠ RASPUNSUL LOR SE PASTREAZA INTREG (`raspuns_urmarire`). Raspunsul lui `/awb/read` NU e
-- in schema lor, exact ca cel de la oferte — unde `ownership` a venit `boolean` acolo unde
-- documentatia scrie 1/2. Prima livrare adevarata ne da dovada din care se ascute cititorul,
-- in loc de a doua presupunere.

alter table public.emag_awb add column if not exists verificat_la timestamptz;
alter table public.emag_awb add column if not exists livrat_la timestamptz;
alter table public.emag_awb add column if not exists raspuns_urmarire jsonb;

comment on column public.emag_awb.livrat_la is
  'Cand a confirmat curierul lor livrarea. Ne-nul opreste urmarirea pentru AWB-ul asta.';
comment on column public.emag_awb.raspuns_urmarire is
  'Raspunsul brut de la /awb/read. Se pastreaza fiindca forma lui nu e in schema lor.';

-- ⚠ Index partial: se urmaresc doar AWB-urile nelivrate, care sunt putine. Unul pe toata
-- tabela ar fi purtat degeaba fiecare colet livrat vreodata.
create index if not exists emag_awb_de_urmarit_idx
  on public.emag_awb (business_id, verificat_la nulls first)
  where livrat_la is null;

-- ── Cine se mai intreaba ──────────────────────────────────────────────────────
create or replace function public.emag_awburi_de_urmarit(
  p_business_id uuid,
  p_limita int default 10
)
returns table (id uuid, emag_id bigint, order_id uuid)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select a.id, a.emag_id, a.order_id
    from public.emag_awb a
    join public.orders o on o.id = a.order_id
   where a.business_id = p_business_id
     and a.emag_id is not null
     and a.livrat_la is null
     -- ⚠ NUMAI AWB-UL DE TUR. `awb_type: 2` e ridicarea de la client: livrarea LUI inseamna
     -- ca marfa s-a intors la magazin, nu ca a ajuns la cumparator. Confundate, o comanda
     -- returnata ar fi fost marcata „livrata" chiar de returul ei.
     and coalesce(a.status->>'awb_type', '1') <> '2'
     -- ⚠ Comenzile terminate nu se mai intreaba: nici cele anulate, nici cele returnate,
     -- nici cele deja livrate.
     and o.status in ('pending', 'confirmed', 'processing', 'shipped')
     -- ⚠ SI NU LA NESFARSIT. Un AWB de acum trei luni care n-a ajuns „livrat" nu mai ajunge:
     -- fara taietura, fiecare colet pierdut ar fi ars cate o cerere din cele 3 pe secunda
     -- ale magazinului, in fiecare zi, pentru totdeauna.
     and a.created_at > now() - interval '60 days'
   order by a.verificat_la asc nulls first, a.created_at asc
   limit greatest(1, least(coalesce(p_limita, 10), 50));
$$;

comment on function public.emag_awburi_de_urmarit(uuid, int) is
  'AWB-urile de tur nelivrate ale unui magazin, cele mai demult verificate intai.';

-- ⚠ `security definer` peste AWB-urile oricui: fara revoke, EXECUTE ramane la PUBLIC dupa
-- fiecare `create or replace`, si o cheie anonima ar citi coletele altui magazin.
revoke execute on function public.emag_awburi_de_urmarit(uuid, int) from public, anon, authenticated;
grant execute on function public.emag_awburi_de_urmarit(uuid, int) to service_role;

notify pgrst, 'reload schema';
