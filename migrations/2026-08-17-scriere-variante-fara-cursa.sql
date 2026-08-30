-- Feedul de stocuri nu mai poate sterge o vanzare.
--
-- ═══ CURSA ═══
--
-- `stock-feed/applier.ts` face SELECT `page_sections` → patch in JavaScript →
-- UPDATE, pentru cate opt produse in paralel. Un `decrement_variant_stock_batch`
-- aterizat intre citire si scriere e SUPRASCRIS: clientul a cumparat, stocul a
-- scazut, iar feedul scrie inapoi valoarea de dinainte de vanzare. Nu da nicio
-- eroare si nu lasa nicio urma — se vede abia cand marfa nu mai e in depozit.
--
-- Nu are nevoie de scara ca sa se intample: feedul ruleaza orar, iar fereastra e
-- toata durata unui dus-intors HTTP.
--
-- ═══ DE CE COMPARE-AND-SWAP SI NU O FUNCTIE CARE FACE TOT ═══
--
-- Solutia evidenta ar fi fost mutarea intregii operatii in SQL, sub `for update`.
-- Dar patch-ul nu e trivial: `patchVariants` potriveste variantele dupa id SAU
-- dupa SKU, raporteaza care lipsesc, pastreaza tipul sir-vs-numar al stocului si
-- atinge si pretul. Rescris in SQL, ar fi devenit a DOUA formulare a acelorasi
-- reguli — exact tiparul care diverge tacut, si pe care proiectul asta il refuza
-- peste tot (proiectorul CHEAMA functiile TS, nu le rescrie).
--
-- Deci patch-ul ramane in TypeScript, iar cursa se inchide cu o comparatie: se
-- scrie DOAR daca `page_sections` e inca exact ce s-a citit. Lacatul tine intre
-- citirea de control si scriere, care sunt in aceeasi instructiune, deci nimeni
-- nu se mai poate strecura. Daca s-a schimbat, apelantul RECITESTE si reface
-- patch-ul peste valoarea noua — deci vanzarea nu se pierde, se pastreaza si ea
-- si actualizarea din feed.

create or replace function public.scrie_variante_daca_neschimbat(
  p_business  uuid,
  p_product   uuid,
  p_asteptat  jsonb,
  p_nou       jsonb
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_curent jsonb;
begin
  /*
   * `for update` reciteste versiunea comisa cea mai noua si o incuie pana la
   * finalul tranzactiei. Fara el, comparatia de mai jos ar putea citi o valoare
   * veche si ar declara „neschimbat" chiar peste o vanzare tocmai incheiata.
   */
  select page_sections into v_curent
    from products
   where id = p_product and business_id = p_business
     for update;

  if not found then return 'lipsa'; end if;

  /*
   * `is distinct from` pe TOT `page_sections`, nu doar pe variante.
   *
   * Mai strict decat strictul necesar, si deliberat: singurii care scriu aici in
   * ritm sunt chiar scaderile de stoc pe varianta, deci o reluare inseamna aproape
   * intotdeauna ca ceva real s-a schimbat. O comparatie mai fina ar fi cerut sa
   * stim exact ce campuri conteaza — adica inca o copie a regulilor.
   */
  if v_curent is distinct from p_asteptat then return 'schimbat'; end if;

  update products set page_sections = p_nou
   where id = p_product and business_id = p_business;

  return 'scris';
end;
$$;

-- Numai `service_role`, ca toate scrierile de stoc: functia primeste `page_sections`
-- intreg, deci la indemana lui `anon` ar fi fost o rescriere libera a oricarui produs.
revoke all on function public.scrie_variante_daca_neschimbat(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.scrie_variante_daca_neschimbat(uuid, uuid, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
