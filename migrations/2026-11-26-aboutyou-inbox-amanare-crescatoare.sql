-- ═══════════════════════════════════════════════════════════════════════════
-- ZECE INCERCARI LA UN MINUT INSEAMNA ZECE MINUTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE SE INTAMPLA (27.08.2026)
--
-- Cronul trece din minut in minut si reia evenimentele neprelucrate. Pragul de abandon e zece
-- incercari — deci zece MINUTE. O pana de un sfert de ora la About You, sau la noi, arde toate
-- cele zece incercari ale FIECARUI eveniment aflat in inbox si le trimite pe toate in scrisori
-- moarte. Chiar cazul pentru care inbox-ul fusese facut.
--
-- ⚠ SI CAUZA E COMUNA. Cand ceva pica, nu pica un eveniment: pica toate deodata, in aceeasi
-- rulare. Deci un contor fara amanare numara indisponibilitatea, nu evenimentul.
--
-- ⚠ CE SE SCHIMBA: incercarea urmatoare se AMANA, crescator. 1, 2, 4, 8… minute, pana la un ceas.
-- Zece incercari devin aproape sase ore de rabdare in loc de zece minute — iar o pana adevarata
-- are timp sa treaca.
--
-- ⚠ PRAGUL RAMANE. Un eveniment care pica de zece ori la distanta de ore nu mai e o pana: e ceva
-- ce nu se poate prelucra, si acela chiar trebuie sa se opreasca zgomotos. Ce se schimba e ce
-- inseamna „de zece ori".

alter table public.aboutyou_webhook_inbox
  add column if not exists urmatoarea_incercare timestamp with time zone;

comment on column public.aboutyou_webhook_inbox.urmatoarea_incercare is
  'Cand are voie sa fie reluat evenimentul. Creste dupa fiecare esec (1, 2, 4, 8… minute, plafon un ceas), ca o pana sa nu arda toate incercarile in cateva minute.';

-- Selectia reia cele mai vechi evenimente care si-au asteptat randul.
create index if not exists aboutyou_inbox_de_reluat_idx
  on public.aboutyou_webhook_inbox (business_id, primit_la)
  where prelucrat_la is null;

notify pgrst, 'reload schema';
