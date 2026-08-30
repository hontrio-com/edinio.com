-- ═══════════════════════════════════════════════════════════════════════════
-- ROTATIA TOKENULUI ARE UN SINGUR CASTIGATOR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (30.08.2026)
--
-- `ensureMerchantToken` se cheama din cron, din actiuni si din callback. Doua fire care gasesc
-- acelasi access token expirat pornesc AMANDOUA reimprospatarea, cu acelasi refresh token:
--
--     A si B citesc configul: acces expirat, refresh R1
--     A: OLX -> A2 + R2, scrie R2
--     B: OLX cu R1 -> refuz, fiindca R1 s-a consumat („invalid_grant")
--     B scrie `needs_reconnect = true` peste configul SANATOS al lui A ❌
--     -> comerciantul vede „reconectează contul", desi conexiunea e vie
--
-- Sau, mai rau, in ordinea cealalta: B intarzie, si scrie R1 peste R2 — iar de-atunci nimeni nu mai
-- are un refresh token bun.
--
-- ═══ COMPARAREA NU SE POATE FACE PE TOKEN ═══
--
-- ⚠ `olx_config.refresh_token` e CRIPTAT (vezi `privat.campuri_secrete`), deci ce sta in tabela nu
-- se poate compara cu ce tine firul in mana. Dar rotatia lasa si un martor necriptat:
-- `token_updated_at`, scris la fiecare reimprospatare reusita.
--
-- „Nimeni n-a rotit de cand am citit eu" se spune atunci simplu: `token_updated_at` e inca cel pe
-- care l-am vazut. Cine pierde cursa afla din `false` si RECITESTE — nu scrie peste, si nu se
-- plange ca sesiunea a murit.
--
-- ⚠ Se sprijina pe `jsonb_merge_config` pentru partea grea: `for update`, pastrarea secretelor
-- necompletate si criptarea. Aici se adauga doar conditia.

create or replace function public.olx_roteste_tokenul(
  p_business_id uuid,
  /** `token_updated_at` asa cum l-a vazut firul care cere rotatia. NULL = „nu era niciunul". */
  p_vazut timestamptz,
  p_patch jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_acum timestamptz;
begin
  /*
   * ⚠ Se incuie randul INAINTE de comparare: fara asta, doua fire ar putea citi amandoua aceeasi
   * valoare si ar trece amandoua de conditie — chiar cursa pe care o inchidem.
   */
  select (olx_config->>'token_updated_at')::timestamptz into v_acum
    from privat.store_settings
   where business_id = p_business_id
     for update;

  if not found then
    return false;
  end if;

  /* ⚠ `is distinct from` acopera si cazul „niciunul din ele nu exista inca". */
  if v_acum is distinct from p_vazut then
    return false;
  end if;

  perform public.jsonb_merge_config(p_business_id, 'olx_config', p_patch);
  return true;
end;
$$;

revoke all on function public.olx_roteste_tokenul(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.olx_roteste_tokenul(uuid, timestamptz, jsonb) to service_role;

notify pgrst, 'reload schema';
