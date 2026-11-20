-- Culoarea principala a magazinului e un hex de sase cifre - 20.11.2026. Aplicata in productie pe 20.11.2026,
-- inainte de deploy; verificat dupa: constrangerea e validata, 180 de magazine din 180 o respecta.
--
-- Se poate aplica INAINTE sau DUPA deploy: niciun cod nu depinde de ea, iar tot ce scrie aplicatia in coloana e deja
-- `#rrggbb` (alegerea de culoare din editor, culoarea temei, inscrierea).
--
-- ═══ DE CE ═══
--
-- `businesses.primary_color` era `text` fara nicio constrangere, iar proprietarul isi poate scrie randul si direct, pe
-- langa panou (are UPDATE pe coloana). Vitrina pune culoarea intr-un `style` (variabilele `--st-*`, fundaluri, culori de
-- text). La randarea pe server React scapa ghilimelele dintr-o valoare de stil, dar NU si `;`, deci un
-- `#fff;position:fixed;inset:0;background:url(//altundeva)` adauga proprietati intregi pe elementul acela.
--
-- Auditul temelor (19.11.2026, punctul 26.9) a pus poarta la CITIRE: `culoareMagazin` in toate cele 26 de citiri ale
-- vitrinei. Asta e poarta de la SCRIERE, a doua plasa: o citire noua care uita poarta nu mai are ce valoare rea sa
-- gaseasca. Hotararea proprietarului, 20.11.2026.
--
-- ═══ DE CE EXACT FORMA ASTA ═══
--
-- Masurat in productie pe 20.11.2026: 180 de magazine din 180 au `#` urmat de sase cifre hexa (149 cu litere mari),
-- niciunul alta forma. Aplicatia scrie doar forma asta: `culoareValida` la inscriere, `CULOARE_RE` in ciorna
-- editorului, culorile temelor. Deci constrangerea nu respinge nimic din ce exista sau din ce scrie aplicatia.
-- ⚠ Regula e aceeasi cu `CULOARE_MAGAZIN_RE` din `src/lib/storefront/culoare-magazin.ts`; proba
-- `culoare-magazin.test.ts` cade daca una din ele se schimba fara cealalta.
--
-- `not valid` + `validate`: adaugarea nu tine tabela blocata cat se citesc randurile, iar validarea ia doar un zavor
-- care lasa scrierile sa treaca. Pe 180 de randuri e o precautie, nu o nevoie.
--
-- Intoarcerea: `alter table public.businesses drop constraint businesses_primary_color_hex;`

alter table public.businesses
  add constraint businesses_primary_color_hex check (primary_color ~ '^#[0-9A-Fa-f]{6}$') not valid;

alter table public.businesses validate constraint businesses_primary_color_hex;
