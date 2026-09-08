-- Starea etichetei Pepita, scrisa pe randul de evidenta — 09.09.2026
--
-- ═══ CE REPARA ═══
--
-- Cand Pepita trimite `package_label` iar depozitul nostru cade, `pastreazaEticheta` inghite
-- caderea si merge mai departe. Asta e bine: o comanda nu se pierde pentru un PDF. Dar pana azi
-- singura urma ramanea o linie in `error_logs`, unde nu se uita nimeni.
--
-- Consecinta: din panou, „nu exista eticheta" arata IDENTIC in doua situatii care cer lucruri
-- opuse de la comerciant:
--
--   * Pepita n-a trimis nicio eticheta (livrare cu curierul lui — nu are ce face);
--   * Pepita a trimis-o, iar noi n-am putut s-o pastram (are ce face: „Resend order" din
--     panoul lor aduce sarcina inapoi, si o reincercam).
--
-- ⚠ SI DE CE NU SE PASTREAZA BASE64-UL BRUT „pentru siguranta": el are date personale si e de
-- ordinul megaoctetilor pe comanda. Nu se tine intr-o coloana; se tine SEMNUL ca a existat.

alter table public.pepita_comenzi
  add column if not exists eticheta_stare text,
  add column if not exists eticheta_la timestamp with time zone;

-- ⚠ Constrangerea se pune separat si idempotent: `add column if not exists` nu re-adauga
-- constrangerea daca migratia se ruleaza a doua oara pe o baza care are deja coloana.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pepita_comenzi'::regclass and conname = 'pepita_comenzi_eticheta_stare_check'
  ) then
    alter table public.pepita_comenzi
      add constraint pepita_comenzi_eticheta_stare_check
      check (eticheta_stare is null or eticheta_stare in ('lipsa', 'salvata', 'nevalida', 'depozit-cazut'));
  end if;
end $$;

comment on column public.pepita_comenzi.eticheta_stare is
  'Ce s-a intamplat cu `package_label`: lipsa (n-au trimis), salvata, nevalida (au trimis ceva ce nu e PDF), depozit-cazut (au trimis-o, noi n-am putut s-o pastram — „Resend order" o aduce inapoi). NULL = comanda de dinainte de 09.09.2026.';

comment on column public.pepita_comenzi.eticheta_la is
  'Cand s-a hotarat starea de mai sus. Pe „depozit-cazut" e chiar clipa in care s-a pierdut.';

-- Panoul cauta tocmai randurile care cer o miscare de la comerciant.
create index if not exists pepita_comenzi_eticheta_pierduta_idx
  on public.pepita_comenzi (business_id, eticheta_la desc)
  where eticheta_stare in ('depozit-cazut', 'nevalida');
