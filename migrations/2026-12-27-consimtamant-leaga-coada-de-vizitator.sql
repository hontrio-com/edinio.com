-- ═══════════════════════════════════════════════════════════════════════════
-- CONSIMTAMANTUL INCHIDE SI COADA DE CONVERSII
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE CE PE COLOANA SI NU IN `sarcina`. Retragerea trebuie sa gaseasca randurile
-- omului. Cautate in jsonb cu un `like` pe text, nu s-ar potrivi NICIODATA: jsonb
-- rescrie cu spatiu dupa doua puncte. Stergerea ar raporta 0 si ar parea ca
-- n-avea ce sterge — chiar felul de zero care a pacalit deja de trei ori aici.
alter table public.edinio_conversion_outbox
  add column if not exists vizitator text;

create index if not exists coada_conversii_dupa_vizitator
  on public.edinio_conversion_outbox (vizitator)
  where vizitator is not null and trimis_la is null and abandonat_la is null;

-- ⚠ SE PASTREAZA RETRAGEREA, nu doar absenta acordului. Cronul revendica randuri
-- cu o arenda de un minut; intre revendicare si trimitere se poate strecura o
-- retragere. Si e singurul lucru care supravietuieste stergerii cookie-ului:
-- cookie-ul e al omului si dispare cand vrea el, dovada ca a cerut oprirea e a
-- noastra.
create table if not exists public.edinio_consimtamant_retras (
  vizitator text primary key,
  retras_la timestamptz not null default now(),
  -- Fara ip, fara user agent, fara nimic despre om: aici tinem MINTE o oprire,
  -- nu construim un profil. Ar fi absurd sa strangem date ca sa nu strangem date.
  sursa text not null default 'browser'
);

alter table public.edinio_consimtamant_retras enable row level security;
revoke all on public.edinio_consimtamant_retras from anon;
revoke all on public.edinio_consimtamant_retras from authenticated;
grant all on public.edinio_consimtamant_retras to service_role;

-- ⚠ FUNCTIA SE RECREEAZA ca `setof` sa poarte si coloana noua — si de aceea
-- granturile se re-sting imediat: recrearea ii reda lui `anon` EXECUTE.
create or replace function public.edinio_revendica_conversii(limita integer)
returns setof public.edinio_conversion_outbox
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  update public.edinio_conversion_outbox o
     set next_retry_at = now() + interval '1 minute'
   where o.id in (
     select c.id
       from public.edinio_conversion_outbox c
      where c.trimis_la is null
        and c.abandonat_la is null
        and c.next_retry_at <= now()
      order by c.next_retry_at asc
      limit greatest(1, least(limita, 500))
      for update skip locked
   )
  returning o.*;
$$;

revoke all on function public.edinio_revendica_conversii(integer) from public;
revoke all on function public.edinio_revendica_conversii(integer) from anon;
revoke all on function public.edinio_revendica_conversii(integer) from authenticated;
grant execute on function public.edinio_revendica_conversii(integer) to service_role;
