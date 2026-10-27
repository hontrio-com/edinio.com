"use client";

import { ChevronRight } from "lucide-react";
import { SETARI_EDITOR, type CheieSetare } from "@/lib/editor-magazin/setari";
import { PunctNesalvat } from "../ArboreSectiuni";
import { PanouCatalog, PanouDateleFirmei, PanouFormularComanda, PanouInformatiiGenerale, PanouSocialMedia } from "./PanouriSetari";
import type { SetariMagazin } from "./useSetariMagazin";

/**
 * Fila „Setări” a editorului (etapa 8, lista lui de pe 27.10.2026): lista setarilor magazinului, ca
 * arborele (fara iconite), si panoul celei deschise, in acelasi loc.
 */
export function FilaSetari({ setari, deschisa, onDeschide, onInapoi }: {
  setari: SetariMagazin;
  deschisa: CheieSetare | null;
  onDeschide: (cheie: CheieSetare) => void;
  onInapoi: () => void;
}) {
  switch (deschisa) {
    case "general": return <PanouInformatiiGenerale g={setari.generale} onInapoi={onInapoi} />;
    case "social": return <PanouSocialMedia g={setari.generale} onInapoi={onInapoi} />;
    case "firma": return <PanouDateleFirmei g={setari.generale} onInapoi={onInapoi} />;
    case "formular": return <PanouFormularComanda f={setari.formular} onInapoi={onInapoi} />;
    case "catalog": return <PanouCatalog c={setari.catalog} onInapoi={onInapoi} />;
  }

  return (
    <div className="space-y-3 pb-6">
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
        Setările de aici se salvează direct în magazin, fiecare cu butonul ei. Nu așteaptă „Publică”.
      </p>
      <ul className="space-y-1.5">
        {SETARI_EDITOR.map((s) => (
          <li key={s.cheie} className="rounded-xl border border-border bg-surface">
            <button type="button" onClick={() => onDeschide(s.cheie)} className="w-full flex items-center gap-1 pl-3 pr-1.5 py-1 text-left">
              <span className="flex-1 min-w-0 py-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <span className="truncate">{s.titlu}</span>
                  {setari.nesalvate.includes(s.cheie) && <PunctNesalvat titlu="Modificat, nesalvat" />}
                </span>
                <span className="block text-[11px] text-muted-foreground truncate">{s.descriere}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
