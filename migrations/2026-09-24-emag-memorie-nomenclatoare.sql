/* ═══════════════════════════════════════════════════════════════════════════
   eMAG: memoria locală a nomenclatoarelor
   ═══════════════════════════════════════════════════════════════════════════

   `aduCategorii()` paginează până la 60 de pagini la 3 cereri pe secundă, iar
   `sugereazaCategoriiEmag()` o cheamă la FIECARE apăsare pe „Sugerează". Adică până
   la 20 de secunde de așteptare de fiecare dată — și, mai rău, 20 de secunde în care
   ritmul magazinului e ocupat cu ecrane în loc de coadă: aceleași 3 cereri pe secundă
   de care are nevoie o mișcare de stoc după o vânzare.

   ═══ ⚠ DE CE UN TABEL, ȘI NU `emag_config` ═══

   `patchConfig()` din cronul eMAG face read-modify-write pe ÎNTREGUL `emag_config` de
   câteva ori pe minut și pe magazin: cursorul de reconciliere, marcajul comenzilor,
   marcajul retururilor, `needs_reconnect`. Cu șase mii de categorii înăuntru, fiecare
   trecere ar citi și ar rescrie sute de kilooctei pe fiecare magazin conectat — și
   le-ar trece și prin declanșatorul de criptare al lui `privat.store_settings`.

   ⚠ Memoria în proces nu e o alternativă: rulăm serverless. Fiecare instanță caldă ar
   avea exemplarul ei și l-ar pierde la desfășurare.

   ═══ ⚠ DE CE `tara` E ÎN CHEIE ═══

   `connectEmag` schimbă `tara` PĂSTRÂND restul configurării. Categoriile românești și
   cele ungurești sunt liste diferite; fără țara în cheie, un magazin care și-a mutat
   contul ar fi primit sugestii din raftul celeilalte țări, fără nicio eroare.

   ═══ ⚠ DE CE `cheie` E `not null default ''` ═══

   Într-o cheie primară, `null` nu se compară cu nimic și rândurile s-ar dubla — exact
   gaura închisă la `emag_offers_produs_varianta_uidx` prin `coalesce`. Aici se închide
   din start, cu un implicit.
   ═══════════════════════════════════════════════════════════════════════════ */

begin;

create table if not exists public.emag_nomenclatoare (
  business_id uuid not null references public.businesses(id) on delete cascade,
  /* `ro` · `bg` · `hu`. ⚠ În cheie: sunt liste diferite. */
  tara text not null,
  /* `categorii` · `categorie` · `tva` · `timpi`. */
  fel text not null,
  /* Id-ul categoriei la `fel = 'categorie'`; șir gol în rest. */
  cheie text not null default '',

  /*
   * Contul cu care s-a adus lista.
   *
   * ⚠ COLOANĂ, NU CHEIE. `is_allowed` e per vânzător, deci o schimbare de cont
   * învechește rândul — dar rândul se REscrie, nu se dublează. Cititorul tratează un
   * cont nepotrivit ca „n-am memorie" și aduce din nou.
   */
  cont text,

  date jsonb not null,
  cate integer not null default 0,

  /*
   * ⚠ `true` = lista NU e completă.
   *
   * O listă tăiată tăcut ar însemna că potrivirea automată nu vede jumătate din raft
   * și sugerează categoria greșită cu încredere mare. Memorată ca și cum ar fi
   * întreagă, ar fi mințit o săptămână întreagă — de aceea prospețimea ei e mult mai
   * scurtă, iar ecranul spune în cifre ce s-a adus.
   */
  trunchiat boolean not null default false,

  adus_la timestamptz not null default now(),

  constraint emag_nomenclatoare_pkey primary key (business_id, tara, fel, cheie)
);

comment on table public.emag_nomenclatoare is
  'Nomenclatoarele eMAG puse deoparte, ca ecranele să nu le ceară la fiecare apăsare. '
  '⚠ NU în `emag_config`: cronul face read-modify-write pe tot obiectul acela de câteva '
  'ori pe minut și pe magazin.';
comment on column public.emag_nomenclatoare.trunchiat is
  '⚠ `true` = lista e incompletă. Prospețimea unei liste trunchiate e mult mai scurtă: '
  'o listă ciuntită înghețată o săptămână ar sugera categoria greșită cu încredere mare.';
comment on column public.emag_nomenclatoare.cont is
  'Contul cu care s-a adus. ⚠ Nu e în cheie: `is_allowed` e per vânzător, deci un cont '
  'schimbat învechește rândul — dar rândul se rescrie, nu se dublează.';

/* Curățarea la deconectare merge pe magazin. */
create index if not exists emag_nomenclatoare_business_idx
  on public.emag_nomenclatoare (business_id);

/*
 * ⚠ RLS PORNIT, CITIRE NUMAI PENTRU PROPRIETAR.
 *
 * Lista de categorii în sine nu e un secret, dar `is_allowed` spune unde are voie să
 * vândă un anume comerciant — adică o informație despre contractul lui cu eMAG. Fără
 * politică, oricine autentificat ar fi putut citi rândurile oricui.
 *
 * Scrierile rămân pe cheia de serviciu, ca la toate tabelele eMAG.
 */
alter table public.emag_nomenclatoare enable row level security;

create policy owner_select_emag_nomenclatoare on public.emag_nomenclatoare
  for select using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

commit;

notify pgrst, 'reload schema';
