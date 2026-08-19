"use client";

import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { Marquee, marqueeDuration } from "@/components/storefront/sections/_shared/Marquee";

/**
 * Bara de anunt cu text derulant, varianta classic.
 *
 * Textul se repeta de opt ori ca banda sa para continua indiferent cat de scurt
 * e mesajul. Bara e `sticky top-0`, iar header-ul se aseaza sub ea (`top-9`)
 * cand exista — vezi `hasAnnouncementBar` din context.
 */
/**
 * Ce scrie in bara cand comerciantul a aprins-o din editorul de design fara sa fi
 * trecut vreodata prin „Editeaza magazinul" ca sa-i scrie textul.
 *
 * Un text de pornire, nu o bara goala: fara el, sectiunea era o banda colorata
 * fara nimic in ea, si nimic nu spunea de ce.
 */
const TEXT_IMPLICIT = "LIVRARE RAPIDA IN TOATA ROMANIA   ✦   RETUR IN 14 ZILE";

export function AnnouncementMarquee() {
  const { pageContent, color, isHome, announcementOn } = useStoreChrome();
  const bar = pageContent.announcement_bar;
  // „Arata pe pagina magazinului" e o regula de PAGINA: in productie, pagina de
  // produs arata bara doar pe `enabled`, ignorand flagul. Bagat in sectiunea de
  // chrome — comuna tuturor paginilor — stingea bara si acolo unde apărea.
  // Pagina vizata e cea principala, semnalata explicit din chrome; pana acum se
  // ghicea din prezenta catalogului, care azi coincide cu ea.
  const ascunsaPeMagazin = isHome === true && pageContent.show_announcement_on_store === false;

  /*
   * ⚠ APRINSA sau STINSA spune DESIGNUL, nu `page_content`.
   *
   * `announcementOn` e chiar `enabled`-ul sectiunii, iar el se deriva din flagul
   * din `page_content` cat timp editorul de design n-a spus altceva — deci
   * comutatorul vechi functioneaza mai departe. Verificat inca o data flagul
   * aici, ochiul din editorul de design nu putea aprinde nimic: bara nu se
   * randa, dar `hasAnnouncementBar` era deja adevarat, deci header-ul lipicios
   * se aseza cu 36 de pixeli mai jos si prin fasia ramasa se vedea pagina
   * derulandu-se pe sub el.
   *
   * `undefined` inseamna „pagina asta n-are design in context" — atunci se cade
   * pe flagul vechi, ca inainte.
   */
  const aprinsa = announcementOn ?? bar?.enabled === true;
  if (ascunsaPeMagazin || !aprinsa) return null;

  return (
    <div className="h-9 overflow-hidden flex items-center sticky top-0 z-40"
      style={{ background: bar?.bg_color || color }}>
      <Marquee durata={marqueeDuration(bar?.speed)} className="inline-block text-xs font-medium tracking-wide text-white">
        {bar?.text || TEXT_IMPLICIT}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
      </Marquee>
    </div>
  );
}
