-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 2: setarea pe magazin             (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- H2: comerciantul aprinde functia din Setari. Stinsa implicit.
--
-- ⚠⚠ TREI PASI, NU UNUL. O coloana adaugata singura in `privat.store_settings`
-- se pierde de doua ori:
--   1. fara `reconstruieste_store_settings()` nu se vede prin vederea publica,
--      deci niciun cod nu o poate citi;
--   2. fara `reconstruieste_store_settings_upd()` declansatorul INSTEAD OF
--      rescrie randul INTREG cu lista VECHE de coloane, deci valoarea coloanei
--      noi se pierde TACIT la fiecare salvare a oricarei ALTE setari.
-- Al doilea e cel urat: nu da nicio eroare si se vede abia cand cineva se plange
-- ca „s-a stins singur".

alter table privat.store_settings
  add column if not exists cont_client_config jsonb default '{}'::jsonb not null;

comment on column privat.store_settings.cont_client_config is
  'Conturile de cumparator ale magazinului. `enabled` (implicit fals, H2), `buget_sms_zilnic` (cate coduri pe SMS pe zi, implicit 100). ⚠ Functia nu se poate aprinde fara domeniu propriu sanatos: conturile nu se servesc pe originea comuna www.edinio.com, unde toate vitrinele impart o origine si fiecare comerciant isi incarca pixelii lui.';

select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

/*
  ⚠ Migratia isi dovedeste singura ca vederea chiar poarta coloana. Fara blocul
  asta, un `reconstruieste_*` care ar esua tacut ar lasa o coloana invizibila, iar
  defectul s-ar vedea abia cand ecranul spune „salvat" si nu salveaza nimic.
*/
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_settings'
      and column_name = 'cont_client_config'
  ) then
    raise exception 'cont_client_config nu se vede prin vederea public.store_settings';
  end if;
end $$;

notify pgrst, 'reload schema';
