"use client";

import type { ReactNode } from "react";
import { BlockRenderer } from "@/components/pages/BlockRenderer";
import { PornesteAnimatiile } from "@/components/pages/PornesteAnimatiile";
import type { useStoreChromeOptional } from "@/components/storefront/StorefrontProvider";
import { cheieAnimatie } from "@/lib/pages/animatii";
import { BLOCK_META, type Block } from "@/lib/pages/blocks.types";
import { ETICHETA_CONTINUT_LIBER } from "@/lib/storefront/design/continut-liber";
import type { CaleContinut } from "@/lib/storefront/design/cale-continut";
import { blocuriLaCale } from "@/lib/storefront/design/edit";
import { BLOC_ATTR, ETICHETA_ATTR, idBloc, type DatePrevizualizarePagina } from "@/lib/storefront/design/preview-protocol";
import type { StoreDesign } from "@/lib/storefront/design/types";

/**
 * Blocurile unui „Conținut liber” randate PE LOC, din designul viu trimis de editor (etapa 9 din
 * `docs/editor-magazin/PLAN.md`). Jumatatea de editor a lui `ContinutLiber`.
 *
 * ⚠ Fisier aparte, incarcat la nevoie (19.11.2026, auditul temelor). Pana atunci statea in `ContinutLiber`, care se
 * incarca pe FIECARE magazin: tot randatorul de blocuri (text, formulare, pachete, harta, cod personalizat), operatiile
 * editorului (`edit.ts`) si etichetele blocurilor ajungeau in pachetul de JavaScript al oricarei vitrine, desi pe
 * magazinul public blocurile se randeaza pe server si ramura asta nu ruleaza niciodata.
 *
 * ⚠⚠ Se randeaza NUMAI blocurile venite prin mesajul editorului (vezi nota din `ContinutLiber`): `design` e cel primit
 * prin `postMessage`, curatat de editor la incarcare, niciodata ciorna citita pe server.
 */
export default function ContinutLiberViu({ cale, cheie, chrome, design, date, reluari }: {
  cale: CaleContinut;
  /** Calea in text (`caleInText`): cheia slotului si prefixul marcajelor de bloc. */
  cheie: string;
  chrome: NonNullable<ReturnType<typeof useStoreChromeOptional>>;
  design: StoreDesign;
  date: DatePrevizualizarePagina;
  /** „Redă animația”, pe id de bloc (vezi `cheieAnimatie`). */
  reluari: Record<string, number>;
}) {
  const blocuri = blocuriLaCale(design, cale) ?? [];
  if (blocuri.length === 0) {
    // Doar in editor: un continut gol nu lasa un loc nevazut in magazin, dar aici trebuie gasit si ales.
    return (
      <div className="mx-auto my-6 max-w-3xl rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        {ETICHETA_CONTINUT_LIBER}: adaugă un bloc din stânga.
      </div>
    );
  }
  const marcheazaBloc = (b: Block, continut: ReactNode) => (
    // Cheia animatiei: o animatie aleasa sau reluata remonteaza blocul, iar scriptul il porneste.
    <div key={cheieAnimatie(b, reluari[b.id] ?? 0)} {...{ [BLOC_ATTR]: idBloc(cheie, b.id), [ETICHETA_ATTR]: BLOCK_META[b.type]?.label ?? b.type }} className="contents">
      {continut}
    </div>
  );
  return (
    /*
     * ⚠ PORNIREA ANIMATIILOR, si in editor (etapa 13, gasit dupa mentiunea lui: „nu vad animatia la
     * buton”). In magazin, scriptul vine cu slotul de pe server (`slotBlocuri`); aici slotul e ocolit,
     * fiindca blocurile se deseneaza din designul viu, deci animatia aleasa n-avea cine s-o porneasca.
     * Cheia de animatie remonteaza blocul, iar observatorul pornit aici il prinde si il anima.
     */
    <div className="contents">
      <BlockRenderer
        blocks={blocuri}
        ctx={{
          color: chrome.color,
          basePath: chrome.basePath,
          storeSlug: chrome.business.slug,
          social: chrome.social,
          businessId: chrome.business.id,
          products: date.products,
          bundles: date.bundles,
          forms: date.forms,
          plati: date.plati,
          curieri: date.curieri,
          preview: true,
          caleDesign: cheie,
          h1Id: null,
          marcheazaBloc,
        }}
      />
      <PornesteAnimatiile />
    </div>
  );
}
