/* ══════════════════════════════════════════════════════════════════════════
   PLASA PRINDE SCHIMBARI PIERDUTE, NU PUBLICA CATALOAGE (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE A FACUT, LA PRIMA RULARE IN PRODUCTIE.

   `produse_nesincronizate_emag` a fost scrisa cu:

     p.updated_at > coalesce(o.last_synced_at, 'epoch'::timestamptz)

   iar nota de langa `coalesce` spunea ca o oferta netrimisa NICIODATA e „cel mai limpede
   caz de schimbare neplecata". Suna bine si e gresit.

   Pe contul VetDepo, masurat la o ora dupa ce a intrat: **3.658 de oferte cu
   `last_synced_at` gol**, adica tot catalogul nepublicat al comerciantului. Fiecare
   trecere de zece minute lua 50 si le PUBLICA pe eMAG — fara ca nimeni sa fi apasat
   nimic. In prima ora, 116 oferte publicate din senin.

   ⚠ N-A STRICAT NIMIC: cererile s-au intors 200, iar eMAG le-a legat de fisele lui
   („automatically associated"). Dar publicarea unui catalog pe un marketplace e hotararea
   COMERCIANTULUI. O plasa de siguranta n-are voie s-o ia in locul lui, oricat de bine ar
   iesi.

   ══════════════════════════════════════════════════════════════════════════
   DEOSEBIREA, SCRISA CA SA NU SE PIARDA
   ══════════════════════════════════════════════════════════════════════════

     ofertă TRIMISA candva, iar produsul s-a schimbat dupa    → schimbare PIERDUTA.
                                                                Asta repara plasa.
     ofertă netrimisa niciodata                               → produs NEPUBLICAT.
                                                                Asta se cere: din butonul
                                                                „Publică", din `auto_publish`
                                                                la produs nou, sau din import.

   Codul face deja deosebirea asta in alta parte, si chiar cu doua functii separate:
   `enqueueEmagSyncMany` (numai ce exista deja la ei) fata de `publicaPeEmagMany`
   (`publicaSiFaraOferta: true`, chemata doar de pe drumurile care spun „publică").
   Plasa o incalca. Acum n-o mai incalca.

   ⚠ Ce se pierde: un produs a carui PRIMA publicare s-a pierdut pe drum nu mai e prins de
   plasa. E in regula — acela se vede in panou ca nepublicat, si are butonul lui. Plasa
   apara ce a fost odata bun si s-a stricat, nu ce n-a inceput niciodata.
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
     and o.auto_sync = true
     /*
      * ⚠ NUMAI OFERTELE TRIMISE CANDVA. Aici era greseala: cu `coalesce(…, 'epoch')`,
      * fiecare oferta nepublicata parea o schimbare pierduta, iar plasa publica de una
      * singura catalogul comerciantului. Publicarea se CERE, nu se deduce.
      */
     and o.last_synced_at is not null
     and p.updated_at > o.last_synced_at
     /* ⚠ Rabdarea: ce s-a atins chiar acum poate fi inca pe drum. */
     and p.updated_at < now() - p_rabdare
     /* ⚠ Si nimic in coada — nici macar abandonat. Un element abandonat s-a incercat de
        cinci ori si are un motiv pe care il vede comerciantul; reaprins de aici, ar intra
        intr-o bucla fara sfarsit si i-ar ascunde motivul. */
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
