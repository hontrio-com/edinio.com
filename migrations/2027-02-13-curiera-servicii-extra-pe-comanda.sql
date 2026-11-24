-- ═══════════════════════════════════════════════════════════════════════════
-- CURIERA: SERVICIILE EXTRA ALE COLETULUI, TINUTE PE COMANDA       (23.11.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de un magazin (JHBijuterii): in exportul .xlsx al comenzilor, o coloana
-- „Colet cu verificare”. Verificarea e serviciul extra „443 Deschidere colet la
-- livrare”, bifat in fereastra de AWB si trimis la Curiera ca `service_443`, dar
-- nepastrat nicaieri: dupa emitere, nici comanda, nici exportul nu mai stiau cu
-- ce servicii a plecat coletul.
--
-- Coloana tine id-urile serviciilor extra TRIMISE la emitere (de ex. `{443}`).
--   NULL      = necunoscut: comanda fara AWB Curiera, sau AWB emis inainte de
--               coloana asta (exportul lasa celula goala, nu scrie „Nu”);
--   `{}`      = AWB emis fara niciun serviciu extra;
--   `{443}`   = cu deschidere la livrare.
-- Se goleste odata cu numarul, la anularea sau dezlegarea AWB-ului.
--
-- ⚠ Se aplica INAINTEA codului: emiterea scrie coloana in aceeasi instructiune cu
-- numarul de AWB, iar o coloana lipsa ar fi facut scrierea sa cada dupa ce coletul
-- exista deja la Curiera.
--
-- `orders` are SELECT la nivel de tabela pentru `authenticated`, deci coloana noua
-- se citeste fara alt grant; randurile le tine RLS, ca pana acum.

alter table public.orders add column if not exists curiera_servicii_extra text[];

comment on column public.orders.curiera_servicii_extra is
  'Id-urile serviciilor extra Curiera trimise la emiterea AWB-ului (443 = deschidere colet la livrare). NULL = necunoscut.';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'orders'
       and column_name = 'curiera_servicii_extra' and data_type = 'ARRAY'
  ) then
    raise exception 'coloana orders.curiera_servicii_extra nu exista';
  end if;
end $$;

notify pgrst, 'reload schema';
