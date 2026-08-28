-- ═══════════════════════════════════════════════════════════════════════════
-- SEMNUL APROBARII NU SE IA DINTR-O SCRIERE OPTIMISTA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (29.08.2026, dupa-amiaza) — UN DEFECT AL DECLANSATORULUI DE IERI
--
-- Ieri am scos regula imutabilitatii din „starea de acum" si am pus-o pe un semn persistent,
-- `aprobat_odata`, aprins dintr-un declansator. Numai ca declansatorul se uita la `status`, iar
-- `status` NU e mereu adevarul lor: `setRemoteStatus` il scrie OPTIMIST, de indata ce ei accepta
-- cererea, cu mult inaintea verdictului.
--
--     produsul n-a fost aprobat niciodata; o trimitere pica -> `status = 'error'`
--     se cere retragerea -> `tintaRetragere('error')` da `inactive` (fiindca `error` nu e in lista)
--     cererea e ACCEPTATA -> scriem local `status = 'inactive'`
--     declansatorul vede `inactive` -> aprinde `aprobat_odata` ❌
--     lotul se aseaza: ei RESPING, produsul nu fusese aprobat -> scriem inapoi `error`
--     dar semnul e ireversibil dinadins
--     -> categoria si marimile raman blocate pe veci, pe un produs NEAPROBAT
--
-- Adica tocmai paza de ieri devine o minciuna permanenta. Si e cel mai urat fel de defect: unul
-- care se aprinde singur, tacut, si nu se mai poate stinge.
--
-- ═══ DOUA LEACURI, FIINDCA SUNT DOUA GRESELI ═══
--
-- ⚠ 1. `inactive` IESE DIN LISTA DECLANSATORULUI. Din toate starile care dovedeau aprobarea, ea e
-- SINGURA pe care o scriem si noi, optimist (`setRemoteStatus`: `published -> pending`,
-- `draft -> draft`, `inactive -> inactive` — celelalte au un nume de asteptare, ea nu). Deci e
-- singura despre care declansatorul nu poate sti cine a scris-o.
--
-- ⚠ 2. IAR ADEVARUL LOR IL SCRIE CINE IL CITESTE. `reconcileStatuses` aduce starea chiar de la
-- ei; acolo `inactive` chiar dovedeste aprobarea, si de-acolo se aprinde semnul, pe nume. Un
-- singur loc, si chiar cel care are dreptul.
--
-- ═══ SI RANDURILE VECHI ═══
--
-- Un produs aprobat care era pe `error` chiar in clipa migratiei de ieri a pornit cu semnul stins.
-- ⚠ DAR NU E NEVOIE DE GHICIT: `stare_dinainte` tine minte unde ajunsese produsul inaintea
-- trimiterii care l-a stricat. E o dovada, nu o presupunere.

begin;

create or replace function public.aboutyou_marcheaza_aprobarea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  /*
   * ⚠ NUMAI IN SUS. Un produs care a fost aprobat si azi e `error` a fost aprobat si ieri, si va
   * fi fost aprobat si maine. Semnul nu se stinge nici din reconciliere, nici din vreo scriere de
   * stare.
   *
   * ⚠ SI `inactive` NU E AICI, dinadins. E singura stare din cele care dovedeau aprobarea pe care
   * o scriem SI NOI, optimist, inainte de verdictul lor — deci singura despre care declansatorul
   * n-are cum sa stie cine a scris-o. Adevarul lor despre `inactive` il aduce `reconcileStatuses`,
   * si tot el aprinde semnul, pe nume. Vezi nota de sus.
   */
  /*
   * ⚠ SI NU SE POATE STINGE NICI DIN AFARA. Pana acum „nu se stinge niciodata" era o observatie —
   * era adevarata doar fiindca niciun cod nu scria `false`. Masurat: o scriere directa chiar il
   * stingea. Acum e o REGULA: valoarea veche se pastreaza, oricine ar scrie peste ea.
   *
   * ⚠ De-aia declansatorul e pe UPDATE intreg, nu doar `OF status`: o scriere care atinge numai
   * `aprobat_odata` nu l-ar fi pornit, deci tocmai calea de stins ar fi ramas deschisa.
   */
  if tg_op = 'UPDATE' then
    new.aprobat_odata := coalesce(old.aprobat_odata, false) or coalesce(new.aprobat_odata, false);
  end if;

  if new.status in ('active', 'published', 'pending_active', 'problem') then
    new.aprobat_odata := true;
  end if;
  return new;
end;
$$;

revoke all on function public.aboutyou_marcheaza_aprobarea() from public, anon, authenticated;

/*
 * ⚠ SI RANDURILE CARE ERAU PE `error` LA MIGRATIA DE IERI. `stare_dinainte` tine minte unde
 * ajunsese produsul inaintea trimiterii care l-a stricat — deci aici nu se ghiceste, se citeste.
 */
drop trigger if exists trg_aboutyou_marcheaza_aprobarea on public.aboutyou_listings;
create trigger trg_aboutyou_marcheaza_aprobarea
  before insert or update on public.aboutyou_listings
  for each row execute function public.aboutyou_marcheaza_aprobarea();

update public.aboutyou_listings
   set aprobat_odata = true
 where aprobat_odata = false
   and stare_dinainte in ('active', 'published', 'pending_active', 'inactive', 'problem');

commit;

notify pgrst, 'reload schema';
