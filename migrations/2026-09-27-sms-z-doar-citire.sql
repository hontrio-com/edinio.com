-- ═══════════════════════════════════════════════════════════════════════════
-- SMS: dezabonatii, jurnalul si campaniile, DOAR DE CITIT pentru comerciant
--                                                                  (27.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Gasit la auditul SMS Marketing: politicile erau `FOR ALL`, deci comerciantul
-- putea, cu propria sesiune, direct prin PostgREST:
--   * STERGE lista de dezabonati (`sms_optout`) si trimite din nou reclame
--     oamenilor care au cerut sa nu mai primeasca;
--   * FALSIFICA jurnalul (`notice_sms_log`): livrari, costuri;
--   * scrie campanii (`sms_campaigns`) pe langa gardele din cod.
-- Toate scrierile trec acum prin server (client de serviciu, dupa verificarea
-- proprietarului): trimiterea, webhook-urile, cronurile, recuperarea cosurilor.
--
-- ⚠ ORDINEA: DUPA cod. Codul de dinainte scria jurnalul si dezabonarile din
-- recuperarea cosurilor cu clientul comerciantului (`abandoned-cart.actions.ts`),
-- iar cel nou le scrie cu clientul de serviciu. Pusa inainte, urma acelor SMS-uri
-- s-ar fi pierdut intre migratie si push.
--
-- `sms_templates` ramane `FOR ALL`: sunt textele lui, fara efect asupra altcuiva.

drop policy if exists "Owner manages sms_optout" on public.sms_optout;
drop policy if exists "Owner reads sms_optout" on public.sms_optout;
create policy "Owner reads sms_optout" on public.sms_optout
  for select using (business_id in (select businesses.id from public.businesses where businesses.user_id = auth.uid()));

drop policy if exists "Owner manages notice_sms_log" on public.notice_sms_log;
drop policy if exists "Owner reads notice_sms_log" on public.notice_sms_log;
create policy "Owner reads notice_sms_log" on public.notice_sms_log
  for select using (business_id in (select businesses.id from public.businesses where businesses.user_id = auth.uid()));

drop policy if exists "Owner manages sms_campaigns" on public.sms_campaigns;
drop policy if exists "Owner reads sms_campaigns" on public.sms_campaigns;
create policy "Owner reads sms_campaigns" on public.sms_campaigns
  for select using (business_id in (select businesses.id from public.businesses where businesses.user_id = auth.uid()));

notify pgrst, 'reload schema';
