"use client";

import type { ReactNode } from "react";
import { useStoreChromeOptional } from "@/components/storefront/StorefrontProvider";
import { BLOC_ATTR, ETICHETA_ATTR, idBloc } from "@/lib/storefront/design/preview-protocol";

/**
 * Invelisul de editor al unui bloc (etapa 4 din `docs/editor-magazin/PLAN.md`):
 * ca `MarcajSectiune`, dar pentru o bucata din sectiune. Id-ul lui in protocol
 * e `<sectiune>/<bloc>`, iar numele sta langa el, pentru stratul de contur.
 *
 * In afara editorului de design intoarce bucata neatinsa: niciun element in plus
 * pe magazinul public. In editor, `display: contents`: bucata ramane copilul
 * direct al coloanei sau al grilei ei, deci asezarea nu se schimba.
 */
export function MarcajBloc({ idSectiune, idBlocului, eticheta, children }: {
  idSectiune: string;
  idBlocului: string;
  eticheta: string;
  children: ReactNode;
}) {
  const chrome = useStoreChromeOptional();
  if (!chrome?.esteEditorDesign) return <>{children}</>;
  return (
    <div {...{ [BLOC_ATTR]: idBloc(idSectiune, idBlocului), [ETICHETA_ATTR]: eticheta }} className="contents">
      {children}
    </div>
  );
}
