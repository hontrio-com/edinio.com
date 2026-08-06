import { IntegrationsBenzi } from "./IntegrationsBenzi";
import { IntegrationsConstelatie } from "./IntegrationsConstelatie";
import { IntegrationsEditorial } from "./IntegrationsEditorial";
import { IntegrationsGrila } from "./IntegrationsGrila";
import { IntegrationsOrbite } from "./IntegrationsOrbite";

/**
 * Cele cinci variante de secțiune „Integrări", una sub alta, ca să fie comparate.
 *
 * ═══ ASTA E O SCHELĂ, NU O SECȚIUNE ═══
 *
 * Clientul alege una singură. Când o alege, din fișierul ăsta rămâne un singur
 * import, iar celelalte patru componente se ȘTERG — nu se lasă „pentru mai
 * târziu", fiindcă fiecare aduce cu ea propriile sigle, propriile socoteli de
 * poziționare și propriul cost de întreținere.
 *
 * Până atunci, fiecare variantă e despărțită de un rând care o numește. Rândul
 * ăsta pleacă odată cu schela: nu e parte din niciun desen.
 */

const VARIANTE = [
  { numar: 1, nume: "Benzi care curg", Componenta: IntegrationsBenzi },
  { numar: 2, nume: "Editorială", Componenta: IntegrationsEditorial },
  { numar: 3, nume: "Constelație", Componenta: IntegrationsConstelatie },
  { numar: 4, nume: "Grilă în ramă punctată", Componenta: IntegrationsGrila },
  { numar: 5, nume: "Orbite", Componenta: IntegrationsOrbite },
];

export function VarianteIntegrari() {
  return (
    <>
      {VARIANTE.map(({ numar, nume, Componenta }) => (
        <div key={numar}>
          {/*
            Eticheta de comparat. `select-none` ca sa nu fie luata din greseala
            la copierea textului paginii, si contrast mic fiindca nu e continut.
          */}
          <div className="mx-auto max-w-[1200px] px-5 pt-16 sm:px-6 lg:px-8">
            <p className="select-none border-t border-hairline pt-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3">
              Varianta {numar} — {nume}
            </p>
          </div>
          <Componenta />
        </div>
      ))}
    </>
  );
}
