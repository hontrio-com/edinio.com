"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CartProvider } from "@/components/storefront/cart/CartProvider";
import { ChromeSection } from "@/components/storefront/SectionRenderer";
import { StoreChromeProvider } from "@/components/storefront/StorefrontProvider";
import { cdnImage } from "@/lib/cdn-image";
import { StoreCartPanels } from "@/components/storefront/StoreCartPanels";
import type { StoreChromeData } from "@/lib/storefront/chrome-value";
import { standaloneAnnouncement } from "@/lib/storefront/design/chrome";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { useDesignPreview } from "@/components/storefront/useDesignPreview";
import { usePastreazaPreview } from "@/components/storefront/usePastreazaPreview";
import type { ResolvedStyle, StoreDesign } from "@/lib/storefront/design/types";

/**
 * Stil gol, pentru apelantii care nu trimit unul.
 *
 * Nu se foloseste la randare — scopul de tema se pune doar cand exista `style` —
 * dar hook-ul cere o valoare, iar una construita in randare ar fi un obiect nou
 * la fiecare trecere.
 */
const FARA_STIL = {} as ResolvedStyle;

/**
 * Invelisul paginilor publice care nu au catalog: pagini custom, politici,
 * retur, confirmare.
 *
 * Aduce acolo exact aceleasi bara de anunt, header si footer ca pe pagina de
 * magazin, alese din aceeasi configuratie de design. Pana acum fiecare dintre
 * paginile astea isi avea propria copie de header si footer, asa ca designul
 * ales de comerciant se oprea la primul click pe un produs.
 *
 * `CartProvider` e montat si aici pentru ca numarul din cos sa fie citit dintr-un
 * singur loc pe toate paginile. Nu schimba ce se randeaza pe server: cosul
 * porneste gol si se completeaza dupa montare, exact ca inainte.
 */
export function StorePageShell({
  chrome,
  design: designSalvat,
  style,
  esteEditorDesign = false,
  className,
  children,
}: {
  chrome: StoreChromeData;
  design: StoreDesign;
  /**
   * Stilul rezolvat. Cand e dat, invelisul isi pune singur scopul de tema — asa
   * culorile si fonturile se pot schimba live in previzualizare. Cand lipseste,
   * apelantul il pune el pe dinafara, ca pana acum.
   */
  style?: ResolvedStyle;
  /**
   * Pagina e deschisa in iframe-ul editorului de design.
   *
   * ⚠ Fara asta, magazinele „un singur produs" n-aveau DELOC protocol de
   * previzualizare: ramura lor nu ajunge niciodata la `MiniStoreRenderer`,
   * singurul loc unde se monta `useDesignPreview`. Nu se trimitea „ready", deci
   * editorul nu primea nimic inapoi, nimic nu se actualiza live, clicul pe o
   * sectiune nu selecta nimic — pentru comerciantii cu un singur produs,
   * editorul de design era complet mort.
   */
  esteEditorDesign?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { design, style: styleEfectiv } = useDesignPreview(designSalvat, style ?? FARA_STIL, esteEditorDesign);
  // Aceleasi semne de previzualizare pe TOATE paginile fara catalog: produs, cos,
  // comanda, politici, pagini proprii. Fara ele, suprafetele noi din selectorul
  // editorului ramaneau albe la primul click.
  usePastreazaPreview();
  // Galeria foto poate aparea in orice sectiune de continut, deci lightbox-ul
  // trebuie sa existe si aici, nu doar pe pagina de magazin.
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Sertarul de cos si fereastra de comanda, montate mai jos. Vezi `StoreCartPanels`.
  const [cosDeschis, setCosDeschis] = useState(false);
  const [comandaDeschisa, setComandaDeschisa] = useState(false);
  const value = useMemo(
    () => ({
      ...chrome,
      // Aceeasi sursa ca bara randata mai jos: sectiunea stinsa sau stearsa din
      // editor, ori banda purtata in interiorul header-ului, nu lasa nimic de
      // ocolit deasupra lui.
      /*
       * Amandoua se re-deriva din designul EFECTIV, nu se mostenesc de la server.
       *
       * ⚠ `announcementOn` ramanea inghetat pe ce se calculase la incarcarea
       * paginii, iar `AnnouncementMarquee` se opreste tocmai la el: in
       * previzualizarea editorului de design, ochiul barei de anunt putea sa o
       * STINGA, dar nu s-o aprinda — un buton care merge intr-o singura directie
       * e mai derutant decat unul care nu merge deloc. Regula de PAGINA („arata
       * pe pagina magazinului") ramane cea de la server: ea chiar nu depinde de
       * design.
       */
      hasAnnouncementBar:
        chrome.pageContent.show_announcement_on_store !== false
        && standaloneAnnouncement(design)?.enabled === true,
      announcementOn: design.chrome.announcement?.enabled === true,
      // Designul EFECTIV, ca sa-l poata citi si continutul paginii, nu doar
      // header-ul si footerul de mai jos: in previzualizare varianta paginii de
      // produs se schimba fara reincarcare.
      design,
      esteEditorDesign,
      // Butonul de cos deschide sertarul CHIAR AICI cand magazinul are sertar.
      // Era o functie goala, iar header-ul cadea pe linkul catre magazin.
      openCart: () => setCosDeschis(true),
      openLightbox: setLightbox,
    }),
    [chrome, design, esteEditorDesign],
  );

  const continut = (
    <>
      <div className={className}>
        <ChromeSection section={standaloneAnnouncement(design)} />
        <ChromeSection section={design.chrome.header} />
        {children}
        <ChromeSection section={design.chrome.footer} />
      </div>
    </>
  );

  return (
    <CartProvider slug={chrome.business.slug} businessId={chrome.business.id}>
      <StoreChromeProvider value={value}>
        {style ? <StorefrontThemeScope style={styleEfectiv}>{continut}</StorefrontThemeScope> : continut}
        <StoreCartPanels
          chrome={chrome}
          design={design}
          cosDeschis={cosDeschis}
          inchideCos={() => setCosDeschis(false)}
          comandaDeschisa={comandaDeschisa}
          deschideComanda={() => setComandaDeschisa(true)}
          inchideComanda={() => setComandaDeschisa(false)}
        />
        {lightbox && (
          <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setLightbox(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cdnImage(lightbox, 2560)} alt="Imagine galerie marita"
              className="max-w-full max-h-full object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </StoreChromeProvider>
    </CartProvider>
  );
}
