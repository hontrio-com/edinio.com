-- Urmarirea coletului de RETUR Sameday: marfa care se intoarce ajunge pe comanda - 15.09.2026
--
-- ═══ CE LIPSEA ═══
--
-- Platforma stie de mult sa EMITA retururi Sameday, si pe amandoua serviciile lor (Retur Standard
-- si Locker Retur). Dar cronul de urmarire se uita numai la `sameday_awb_number`, adica la coletul
-- care pleaca. Un retur emis nu era intrebat NICIODATA: comerciantul nu afla din Edinio ca marfa
-- s-a intors la el, desi are numarul AWB scris pe comanda si desi Sameday raspunde la fel de bine
-- pentru el ca pentru oricare altul.
--
-- ═══ ⚠ DE CE RETURUL NU MUTA COMANDA, SI NU DIN PRUDENTA ═══
--
-- Pe drumul dus, „livrat" inseamna ca s-a incheiat cu bine si comanda merge pe `delivered`. Pe
-- drumul de intors, „livrat" inseamna EXACT PE DOS: marfa a ajuns inapoi la comerciant. Ce urmeaza
-- e o hotarare de BANI (se returneaza plata? se reexpediaza? se refuza returul?), iar aia nu se ia
-- de la un transportator. De aceea aici se INREGISTREAZA si se SEMNALEAZA, si atat.
--
-- Aceeasi cumpana ca la Woot, unde cronul inregistreaza fiindca ei nu documenteaza starile. Aici
-- motivul e altul, dar concluzia e la fel: cine nu poate lua hotararea nu are voie s-o ia.
--
-- ═══ ⚠ DE CE E NEVOIE DE `incheiat_la`, SI NU AJUNGE `status_id` ═══
--
-- Semnalul catre om („marfa ta s-a intors") trebuie dat O SINGURA DATA. Fara un marcaj de
-- incheiere, cronul l-ar fi repetat la fiecare doua ore, la nesfarsit, pentru fiecare retur ajuns.
-- Iar `status_id` nu poate tine locul marcajului: hotararea de „incheiat" se ia din `delivered` si
-- `canceled` din sumarul lor, care sunt BOOLEENI, nu din id-ul starii (vezi `sameday/statusuri.ts`,
-- unde e scris de ce nu ne uitam la `expeditionStatus.statusState`).
--
-- `incheiat_la` e si conditia de iesire din coada: un retur incheiat nu mai e intrebat.
--
-- ═══ ⚠ SI DE CE NU SE FILTREAZA PE `status`-UL COMENZII ═══
--
-- Drumul dus isi margineste coada la `pending/confirmed/processing/shipped`, fiindca dupa livrare
-- n-are ce mai afla. Returul nu: el traieste taman pe comenzile INCHEIATE (`delivered`, uneori
-- `refunded`). Copiat orbeste filtrul de la fratele lui, urmarirea returului n-ar fi vazut nimic.
--
-- ═══ CE NU FACE ═══
--
-- Nimic retroactiv, si n-are nici ce: masurat pe 15.09.2026, ZERO AWB-uri de retur emise in toata
-- viata platformei. Coloanele sunt aditive si anulabile; nicio citire existenta nu se schimba.

alter table public.orders
  add column if not exists sameday_return_status_id integer,
  add column if not exists sameday_return_status_label text,
  add column if not exists sameday_return_status_checked_at timestamptz,
  add column if not exists sameday_return_incheiat_la timestamptz;

comment on column public.orders.sameday_return_status_id is
  'Ultimul id de stare Sameday pentru coletul de RETUR. Se pastreaza pentru afisare; hotararea de incheiere se ia din booleenii din sumar, nu de aici.';
comment on column public.orders.sameday_return_status_label is
  'Eticheta lor, in romana, pentru starea returului. Numarul e pentru cod, textul e pentru om.';
comment on column public.orders.sameday_return_status_checked_at is
  'Cand a fost intrebat ultima oara Sameday despre coletul de retur. Cronul ia mereu cele mai vechi, NULLS FIRST.';
comment on column public.orders.sameday_return_incheiat_la is
  'Cand s-a incheiat drumul returului (livrat inapoi la comerciant, sau anulat). ⚠ Exista ca semnalul catre om sa plece O SINGURA DATA, si ca returul incheiat sa iasa din coada.';

-- ⚠ Fara filtru pe `status`: returul traieste taman pe comenzile incheiate.
create index if not exists orders_sameday_retur_urmarire_idx
  on public.orders using btree (sameday_return_status_checked_at nulls first)
  where sameday_return_awb_number is not null
    and sameday_return_incheiat_la is null;
