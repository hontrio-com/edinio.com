/* ══════════════════════════════════════════════════════════════════════════
   O SCHIMBARE CARE N-A LASAT NICIO URMA NICAIERI (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE RAMANE DESCOPERIT, DUPA TOATE REPARATIILE DE AZI.

   Modificarea produsului si punerea ei in coada sunt DOUA scrieri separate:

     UPDATE products         COMMIT
     ↓
     enqueue in coada         ← daca pica AICI, produsul e schimbat si coada e goala

   `after()` leaga lucrarea de ciclul cererii si scrie orice esec in jurnal — deci nu se
   mai pierde tacut, cum se pierdea cu `void enqueue(...)`. Dar tot ramane o fereastra:
   procesul poate muri intre cele doua, sau scrierea in coada poate cadea.

   ⚠ Pe PRET si pe STOC repara reconcilierea: `masoaraDeriva` compara ce e la ei cu ce am
   trimite noi si pune diferenta inapoi in coada. Pe TITLU, DESCRIERE, IMAGINI,
   CARACTERISTICI, GPSR si CATEGORIE nu repara nimeni — nu exista o a doua sursa de adevar
   care sa vada deosebirea. Produsul ramane la ei cu datele vechi pana cand cineva il
   atinge din alt motiv.

   ⚠ Auditul extern cerea un OUTBOX TRANZACTIONAL: un rand scris in aceeasi tranzactie cu
   modificarea produsului, printr-un declansator. Ar inchide fereastra matematic, si e
   raspunsul corect pe termen lung. Dar inseamna un declansator pe `products` — masa cea
   mai fierbinte din platforma, atinsa de fiecare comanda, de fiecare import si de fiecare
   proiectie de catalog. Nu e o schimbare care se face a saptea in aceeasi seara.

   ══════════════════════════════════════════════════════════════════════════
   CE FACE FUNCTIA ASTA IN SCHIMB
   ══════════════════════════════════════════════════════════════════════════

   Raspunde la o singura intrebare, si tocmai la cea care conteaza:

     „Care produse s-au schimbat DUPA ultima trimitere catre eMAG si nu au nicio lucrare
      in coada?"

   Un produs asa n-are nicio urma nicaieri: nici in coada, nici in jurnal, nici in panou.
   E exact forma pe care outbox-ul ar preveni-o — iar aici se GASESTE, si se pune inapoi
   in coada. Nu previne fereastra; o inchide dupa aceea, singura.

   ⚠ Nu inlocuieste outbox-ul si nu se pretinde ca-l inlocuieste. Un outbox face
   pierderea imposibila; asta o face trecatoare.

   ⚠ TREI PAZE, si fiecare are motivul ei:

     `p_rabdare`     produsele atinse chiar acum nu se ating: lucrarea lor poate fi inca
                     in aer. Fara ea, fiecare salvare de produs ar fi pus DOUA randuri in
                     coada — unul de la actiune, unul de aici.
     fara lucrare    un produs care are deja ceva in coada nu se atinge, nici macar
                     ABANDONAT: acela s-a incercat de cinci ori si a esuat cu un motiv pe
                     care il vede comerciantul. Reaprins de aici, ar intra intr-o bucla
                     fara sfarsit si i-ar ascunde motivul.
     `auto_sync`     ofertele PRELUATE din contul lui nu se rescriu niciodata singure.
*/

begin;

create or replace function public.produse_nesincronizate_emag(
  p_business_id uuid,
  p_rabdare     interval default '10 minutes',
  p_limita      int      default 50
)
returns setof uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select distinct p.id
    from public.products p
    join public.emag_offers o
      on o.product_id = p.id
     and o.business_id = p.business_id
   where p.business_id = p_business_id
     /* ⚠ Numai ofertele care se sincronizeaza singure. Vezi nota de sus. */
     and o.auto_sync = true
     /*
      * ⚠ `coalesce(..., 'epoch')` ANUME: o oferta pe care n-am trimis-o NICIODATA e cel
      * mai limpede caz de „schimbare neplecata" cu putinta. Sarita fiindca marcajul e
      * gol, plasa ar fi ratat exact produsele care n-au ajuns nicaieri.
      */
     and p.updated_at > coalesce(o.last_synced_at, 'epoch'::timestamptz)
     /* ⚠ Rabdarea: ce s-a atins chiar acum poate fi inca pe drum. */
     and p.updated_at < now() - p_rabdare
     /* ⚠ Si nimic in coada — nici macar abandonat. Vezi nota de sus. */
     and not exists (
       select 1 from public.emag_sync_queue q
        where q.business_id = p_business_id and q.product_id = p.id)
   order by p.id
   limit greatest(1, least(coalesce(p_limita, 50), 500));
$function$;

/* ⚠ `create or replace` REFACE granturile implicite, iar Postgres da EXECUTE lui PUBLIC
   din oficiu. Functia e `security definer` si citeste produsele ORICUI. */
revoke all on function public.produse_nesincronizate_emag(uuid, interval, int) from public, anon, authenticated;
grant execute on function public.produse_nesincronizate_emag(uuid, interval, int) to service_role;

commit;

notify pgrst, 'reload schema';
