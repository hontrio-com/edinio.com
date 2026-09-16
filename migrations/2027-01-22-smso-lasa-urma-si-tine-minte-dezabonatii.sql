-- ═══════════════════════════════════════════════════════════════════════════
-- SMSO: sa lase urma, si sa tina minte pe cine nu mai are voie sa sune
-- 17.09.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠⚠ DE CE. Platforma are DOI furnizori de SMS. notice.ro scrie fiecare incercare in
-- `notice_sms_log`, cu `provider_id`, si are webhook de raport de livrare care completeaza
-- `delivery_status` si `delivered_at`. SMSO nu scria NIMIC, nicaieri: `responseToken` (echivalentul
-- lui `provider_id`, si singura cheie cu care se poate interoga `/status`) era aruncat in toate cele
-- sase cai reale de trimitere.
--
-- Deci raportam „trimis" fiindca API-ul ACCEPTASE mesajul, niciodata fiindca AJUNSESE.
--
-- Masurat inainte: 3 magazine cu SMSO pornit, 55 de SMS-uri in 2 campanii (24.08 - 10.09).

-- ── 1. Cine a trimis mesajul ────────────────────────────────────────────────
--
-- ⚠ Tabelul se REFOLOSESTE, nu se dubleaza: forma lui e deja exact ce trebuie, iar un singur loc
-- pentru „ce SMS-uri am trimis" e mai bun pentru comerciant decat doua tabele care se despart.
--
-- ⚠ Dar fara coloana asta randurile celor doi furnizori ar fi de nedeosebit, iar cele DOUA
-- webhook-uri de livrare se potrivesc amandoua dupa `provider_id`. Implicitul `notice` e adevarat
-- pentru tot ce exista azi in tabel: pana acum numai notice.ro scria acolo.
alter table public.notice_sms_log
  add column if not exists provider text not null default 'notice';

comment on column public.notice_sms_log.provider is
  'Furnizorul care a trimis mesajul: notice | smso. Webhook-urile de livrare se potrivesc pe (business_id, provider, provider_id).';

-- Cautarea webhook-ului de livrare: magazin + furnizor + id-ul lor.
create index if not exists notice_sms_log_livrare_idx
  on public.notice_sms_log (business_id, provider, provider_id);

-- ── 2. Pe cine nu mai avem voie sa sunam ────────────────────────────────────
--
-- ⚠⚠ SMSO intoarce `405` cand numarul e DEZABONAT. Pana azi codul acela era numarat ca un esec
-- oarecare si uitat, deci aceeasi persoana primea si campania urmatoare. Nu e o chestiune de
-- eleganta, e una de conformitate.
--
-- ⚠ `recovery_optout` exista deja, dar are DOAR `email`. Nu se putea folosi pentru telefoane.
create table if not exists public.sms_optout (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- Numarul, NORMALIZAT (fara prefix de tara, fara zero initial), ca sa se potriveasca oricum ar fi
  -- fost scris in checkout. Vezi `normalizeNoticePhone`.
  phone text not null,
  -- De unde stim: `smso_405` (ei ne-au spus), `raspuns_stop` (a raspuns STOP), `manual`.
  sursa text not null,
  creat_la timestamptz not null default now(),
  -- ⚠ Dezabonarea e pe MAGAZIN, nu pe platforma: fiecare comerciant isi are lista lui de clienti.
  unique (business_id, phone)
);

comment on table public.sms_optout is
  'Numere care nu mai primesc SMS de MARKETING de la un magazin. Mesajele tranzactionale (starea comenzii) NU se opresc de aici: ele nu sunt marketing.';

create index if not exists sms_optout_cautare_idx on public.sms_optout (business_id, phone);

alter table public.sms_optout enable row level security;

-- Aceeasi forma ca politica de pe `notice_sms_log`: proprietarul magazinului isi vede lista.
create policy "Owner manages sms_optout" on public.sms_optout
  as permissive for all to public
  using (business_id in (select businesses.id from businesses where businesses.user_id = auth.uid()))
  with check (business_id in (select businesses.id from businesses where businesses.user_id = auth.uid()));
