-- ═══════════════════════════════════════════════════════════════════════════
-- REBRANDING: VERDELE IMPLICIT AL MAGAZINELOR NOI (20.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Marca a trecut de la #1AB554 la #07c527. In cod, schimbarea e peste tot;
-- aici ramane un singur lucru, si e in baza: culoarea cu care PORNESTE un
-- magazin nou.
--
-- ⚠ NU SE ATINGE NICIUN MAGAZIN EXISTENT, si asta e o hotarare, nu o scapare.
-- `primary_color` e culoarea COMERCIANTULUI, nu a noastra. Un `update` peste
-- randurile care mai au #1AB554 ar fi repictat, intr-o noapte, vitrinele a
-- zeci de magazine care nu ne-au cerut nimic - unele cu sigla si cu materiale
-- tiparite pe verdele ala. Cine vrea verdele nou il alege din Editeaza
-- magazinul.
--
-- ⚠ VITRINELE ISI ALEG SINGURE CULOAREA TEXTULUI de pe butoane, deci
-- schimbarea e sigura: `contrastOn()` din `storefront/design/css-vars.ts`
-- compara cele doua rapoarte si pune text inchis pe verdele nou (7,62:1, chiar
-- mai bine decat cei 6,57:1 pe care ii dadea verdele vechi). Un verde deschis
-- ca implicit NU lasa butoane cu scris alb nelizibil.

alter table public.businesses
  alter column primary_color set default '#07c527'::text;

comment on column public.businesses.primary_color is
  'Culoarea magazinului, aleasa de comerciant. Implicitul e verdele marcii Edinio (#07c527 din 20.09.2026, inainte #1AB554). Magazinele existente nu se ating la schimbarea marcii.';
