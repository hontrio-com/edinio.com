"use client";

import { useMemo, useState } from "react";
import { afisat, conversia, dinText, eStricat, textulDeAratat } from "@/lib/configurators/camp-numar";
import type { NodNumar } from "@/lib/configurators/definitie";

/**
 * Bucatile mici pe care le folosesc toate filele builderului.
 *
 * ⚠ SCRISE O SINGURA DATA, SI DE ACEEA INTR-UN FISIER AL LOR. Trei panouri cu cate o copie a
 * aceleiasi etichete de camp inseamna ca a treia arata altfel decat primele doua dupa prima
 * retusare, si ca cine schimba inaltimea unui camp o schimba intr-un singur loc din trei.
 */

/** Inaltimea si chenarul folosite de toate campurile builderului. */
export const INTRARE =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

/** Aceeasi intrare, dar mica, pentru randurile inghesuite din reguli. */
export const INTRARE_MICA =
  "h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary";

export function Camp({ eticheta, ajutor, children }: {
  eticheta: string; ajutor?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{eticheta}</span>
      {children}
      {ajutor && <span className="mt-1 block text-[11px] text-muted-foreground">{ajutor}</span>}
    </label>
  );
}

export function Bifa({ eticheta, ajutor, pornit, onSchimba }: {
  eticheta: string; ajutor?: string; pornit: boolean; onSchimba: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5">
      <input
        type="checkbox" checked={pornit} onChange={(e) => onSchimba(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
      />
      <span>
        <span className="block text-sm text-foreground">{eticheta}</span>
        {ajutor && <span className="block text-[11px] text-muted-foreground">{ajutor}</span>}
      </span>
    </label>
  );
}

/**
 * Ce nu merge, spus pe loc.
 *
 * ⚠ Se arata langa campurile care l-au produs, nu la publicare. Un minim mai mare decat maximul
 * refuzat abia la „Publica" l-ar fi pus pe comerciant sa caute prin trei file care dintre
 * numerele scrise acum zece minute e cel gresit.
 */
export function Probleme({ probleme }: { probleme: string[] }) {
  if (!probleme.length) return null;
  return (
    <ul className="space-y-1 rounded-lg border border-amber-300/50 bg-amber-50/60 px-3 py-2 dark:bg-amber-950/20">
      {probleme.map((p) => (
        <li key={p} className="text-[11px] text-foreground">{p}</li>
      ))}
    </ul>
  );
}

/**
 * Un camp de numar in care se poate CHIAR tasta.
 *
 * ═══ ⚠ DE CE NU `type="number"` ═══
 *
 * Drumul dus-intors text → numar → text mananca tastarea: cine scrie „2,5" apasa intai virgula,
 * „2," nu e un numar, valoarea se goleste, campul se redeseneaza cu „2" — si virgula dispare de
 * sub degete. Cu `type="number"` e si mai rau, fiindca browserul intoarce sir GOL pentru starile
 * intermediare, deci nici macar n-am sti ce a scris omul. Iar in Romania zecimalele se scriu cu
 * virgula, deci defectul loveste tocmai forma obisnuita.
 *
 * ⚠ Acelasi defect a fost reparat o data, pe campul de numar al VITRINEI, si a reaparut aici la
 * primul ecran nou. Regula sta in `@/lib/configurators/camp-numar`, cu probele ei, si se
 * refoloseste — nu se rescrie.
 *
 * `inputMode="decimal"` pastreaza tastatura numerica pe telefon, deci nu se pierde nimic.
 */
export function IntrareNumar({
  valoare, onSchimba, unitate, clase = INTRARE, eticheta, placeholder,
}: {
  /**
   * Valoarea din MOTOR, in unitatea lui de baza (milimetri, grame).
   *
   * ⚠ Campul o arata in `unitate` si o primeste inapoi tot in baza, deci apelantul nu mai
   * converteste nimic. Fiecare panou care isi scria propriul dus-intors a scris si propria
   * greseala: `Limite` din reguli stia doar de lungimi, deci o limita pusa pe un camp in
   * kilograme intra in motor de o mie de ori mai mica. `conversia` stie si masa, si e probata.
   */
  valoare: number | undefined;
  onSchimba: (n: number | undefined) => void;
  unitate?: NodNumar["unitate"];
  clase?: string;
  eticheta?: string;
  placeholder?: string;
}) {
  const c = useMemo(() => conversia(unitate), [unitate]);
  const [text, setText] = useState(() => afisat(valoare, c));
  const deAratat = textulDeAratat(text, valoare, c);
  const stricat = eStricat(deAratat, c);

  return (
    <input
      type="text" inputMode="decimal" autoComplete="off"
      aria-label={eticheta}
      aria-invalid={stricat || undefined}
      placeholder={placeholder}
      value={deAratat}
      onChange={(e) => {
        setText(e.target.value);
        onSchimba(dinText(e.target.value, c));
      }}
      className={clase}
    />
  );
}
