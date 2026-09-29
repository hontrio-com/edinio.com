-- Curiera: AWB-ul transportatorului partener (de ex. DPD), langa AWB-ul Curiera - 29.09.2026.
--
-- Cerut de el, pentru un magazin care lucreaza cu DPD prin Curiera: comerciantul vrea sa vada
-- in panou si AWB-ul Curiera, si pe cel DPD. Curiera (platforma CourierManager) preda coletul
-- mai departe unui „franchisor", iar `get_info` intoarce `franchisor_type` („DPD") si
-- `franchisor_no` (AWB-ul DPD). Masurat pe primul AWB real: DPD l-a preluat in aceeasi secunda.
--
-- ⚠ SE APLICA INAINTE DE DEPLOY: emiterea, dezlegarea si cronul de urmarire scriu coloanele, iar
-- PostgREST respinge INTREAGA scriere cand o coloana lipseste (42703).
--
-- Fara default si fara check: null = „nu stim inca" (sau expedierea nu are partener), iar numele
-- partenerului e text liber, al contului Curiera.

alter table public.orders
  add column if not exists curiera_partener text,
  add column if not exists curiera_partener_awb text;

comment on column public.orders.curiera_partener is
  'Transportatorul care duce efectiv coletul Curiera (`franchisor_type`, ex. „DPD”). Null = '
  'necunoscut inca sau fara partener. Se goleste la dezlegarea AWB-ului.';
comment on column public.orders.curiera_partener_awb is
  'AWB-ul la transportatorul partener (`franchisor_no` din `get_info`), ex. AWB-ul DPD. Vine la '
  'emitere; lipsa lui o completeaza cronul de urmarire in primele zile. Se goleste la dezlegare.';

do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'orders'
         and column_name in ('curiera_partener', 'curiera_partener_awb')) <> 2 then
    raise exception 'coloanele partenerului Curiera lipsesc de pe orders';
  end if;
end $$;

notify pgrst, 'reload schema';
