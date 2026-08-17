-- About You: contor SEPARAT pentru eșecurile de transport la interogarea loturilor.
--
-- `aboutyou_batches.attempts` era folosit de DOUA bucle cu praguri diferite:
--
--   * „lotul nu s-a așezat încă"  -> se abandonează la 120 de treceri (două ore,
--     fiindcă cronul rulează din minut în minut);
--   * „interogarea a eșuat"      -> se închide ca `failed` la 6.
--
-- Cum contorul era unul singur, un lot care aștepta LEGITIM șase minute ajungea la
-- `attempts = 6`, iar primul 429, 5xx sau timeout pe `/results/products` îl trecea
-- direct pe `failed`. Selecția de poll exclude `failed`, deci lotul nu mai era
-- interogat niciodată, iar listarea rămânea pe „pending" la infinit: nu ajungea
-- niciodată `draft`, deci „Publică toate" o sărea, iar comerciantul vedea „în curs"
-- pentru totdeauna. `/results/products` are 200 de cereri pe minut și e chemat de
-- zeci de ori per magazin per minut, deci pragul se atingea ușor.
--
-- Se livrează ÎMPREUNĂ cu codul din src/lib/aboutyou/sync.ts care citește coloana.

alter table public.aboutyou_batches
  add column if not exists poll_errors integer not null default 0;

comment on column public.aboutyou_batches.poll_errors is
  'Eșecuri de transport la interogarea rezultatelor lotului (429/5xx/rețea). Separat de `attempts`, care numără trecerile în care lotul încă nu se așezase.';

-- PostgREST își ține schema în cache. Fără reîncărcare, coloana nouă nu există
-- pentru el: `select`-ul care o cere primește 400 până la următoarea repornire.
notify pgrst, 'reload schema';
