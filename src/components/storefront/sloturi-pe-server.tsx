import "server-only";

import { Suspense, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BlocuriPagina } from "@/components/pages/BlocuriPagina";
import { PornesteAnimatiile } from "@/components/pages/PornesteAnimatiile";
import { claseFonturi } from "@/components/pages/fonturi-incarcate";
import { SCRIPT_ANIMATII } from "@/lib/pages/animatii";
import { flattenBlocks } from "@/lib/pages/block-tree";
import type { Block } from "@/lib/pages/blocks.types";
import { fonturiDinBlocuri } from "@/lib/pages/fonturi";
import { prepareBlocksForPublic } from "@/lib/pages/prepare-blocks";
import { caleInText } from "@/lib/storefront/design/edit";
import type { ContinutDeRandat } from "@/lib/storefront/design/continut-publicat";
import type { Database } from "@/types/database.types";

/**
 * Blocurile paginilor proprii randate pe SERVER, ca „sloturi” pentru randul din client
 * (`FurnizorSloturiBlocuri` / `SlotBlocuri`). Le folosesc pagina principala aleasa din „Pagini”
 * (01.10.2026) si „Conținut liber” (etapa 9: pagina principala, pagina de produs, Pagina Magazin), deci
 * fonturile, animatiile si interogarile blocurilor merg la fel peste tot.
 */

/** Ce e comun tuturor grupurilor unei pagini. */
export interface ComunSloturi {
  supabase: SupabaseClient<Database>;
  businessId: string;
  /** Regulile de vizibilitate ale catalogului (ascunde fara imagini / fara stoc), ca la pagini. */
  hideNoImage: boolean;
  hideOutOfStock: boolean;
  color: string;
  basePath: string;
  storeSlug: string;
  social: Record<string, string>;
}

/**
 * Un grup de blocuri, DEJA curatate (`prepareBlocksForPublic`), cu fonturile si animatiile lor.
 *
 * ⚠ Scriptul animatiilor porneste pe PARINTELE lui si ii pune `data-anim-pornit` inainte de hidratare,
 * deci invelisul il ignora la comparare. Pus langa `MiniStoreRenderer`, parintele era `<body>`.
 */
export function slotBlocuri(
  cheie: string,
  blocuri: Block[],
  comun: ComunSloturi,
  sursa: { pageId?: string; caleDesign?: string; h1Id: string | null },
): ReactNode {
  const toate = flattenBlocks(blocuri);
  const claseFont = claseFonturi(fonturiDinBlocuri(toate));
  const animatii = toate.some((b) => b.style?.anim && b.style.anim !== "none");
  return (
    <div key={cheie} className={claseFont || undefined} suppressHydrationWarning>
      <Suspense fallback={null}>
        <BlocuriPagina
          supabase={comun.supabase}
          businessId={comun.businessId}
          blocks={blocuri}
          hideNoImage={comun.hideNoImage}
          hideOutOfStock={comun.hideOutOfStock}
          color={comun.color}
          basePath={comun.basePath}
          storeSlug={comun.storeSlug}
          social={comun.social}
          pageId={sursa.pageId}
          caleDesign={sursa.caleDesign}
          h1Id={sursa.h1Id}
        />
      </Suspense>
      {animatii && <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANIMATII }} />}
      {animatii && <PornesteAnimatiile />}
    </div>
  );
}

/**
 * Sloturile „Conținut liber” ale unei pagini (etapa 9), dupa calea containerului (`caleInText`).
 * Blocurile vin din design, deci se curata AICI, la granita de incredere, ca la paginile proprii.
 * Fara H1 din blocuri: pagina are titlul ei (hero-ul, numele produsului, titlul catalogului).
 */
export function sloturiContinutLiber(continuturi: readonly ContinutDeRandat[], comun: ComunSloturi): Record<string, ReactNode> | undefined {
  if (continuturi.length === 0) return undefined;
  return Object.fromEntries(continuturi.map(({ cale, blocuri }) => {
    const cheie = caleInText(cale);
    return [cheie, slotBlocuri(cheie, prepareBlocksForPublic(blocuri), comun, { caleDesign: cheie, h1Id: null })];
  }));
}
