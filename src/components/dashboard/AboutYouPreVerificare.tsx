import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { PreVerificareAboutYou } from "@/lib/actions/aboutyou.actions";

/*
 * „Ce trebuie sa ai pregatit", numarat pe datele REALE ale magazinului.
 *
 * Cerintele blocante se aflau una cate una, pe parcurs: omul intra in editor,
 * completeaza zece minute, apasa trimite si abia atunci vedea „Varianta X nu are
 * cod EAN". Iar cele globale — brand, tari, curs — nu apareau nicaieri pana la
 * prima trimitere. Primul comerciant real a stat zece zile cu toate tabelele
 * goale, oprit chiar in ecranul de setari. Zece secunde de interogari inlocuiesc
 * o ora de formulare.
 */
function Rand({ eticheta, avem, din, nota }: { eticheta: string; avem: number; din: number; nota?: string }) {
  const complet = din > 0 && avem >= din;
  return (
    <li className="flex items-start gap-2">
      {complet
        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" />
        : <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />}
      <span className="text-xs text-foreground">
        <span className={complet ? "" : "font-semibold"}>{avem} din {din}</span> {eticheta}
        {nota && <span className="text-muted-foreground"> · {nota}</span>}
      </span>
    </li>
  );
}

export function AboutYouPreVerificare({ date }: { date: PreVerificareAboutYou }) {
  const d = date;
  /*
   * „Gata" inseamna CHIAR gata.
   *
   * O prima versiune sarea peste codul de bare si peste produsele fara categorie,
   * amandouă blocante. Rezultatul: pastila verde peste un magazin la care toate
   * trimiterile cad — si, mai rau, verdele contrazicea rândul portocaliu de
   * deasupra lui.
   */
  const totulGata = d.lipsuriGlobale.length === 0
    && d.categoriiNemapate === 0 && d.faraCategorie === 0
    && d.produseActive > 0
    && d.cuGreutate >= d.produseActive
    && d.cuImagini >= d.produseActive
    && d.cuEanLaProdus >= d.produseActive
    // Cu variante, codul de bare se cere pe fiecare combinatie, iar aceea nu se
    // poate numara de aici: nu avem dreptul sa spunem „Gata".
    && d.cuVariante === 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-sm font-semibold text-foreground">Ce trebuie să ai pregătit</h2>
        {totulGata && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">Gata</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Numărat pe produsele tale active. About You respinge produsele incomplete la aprobare, iar
        respingerea vine peste zile.
      </p>

      {d.lipsuriGlobale.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-3">
          <p className="text-xs font-semibold text-amber-900 mb-1">Din setările de mai sus lipsesc:</p>
          <ul className="space-y-0.5">
            {d.lipsuriGlobale.map((l) => <li key={l} className="text-xs text-amber-900">• {l}</li>)}
          </ul>
        </div>
      )}

      <ul className="space-y-1.5">
        <Rand eticheta="produse au greutate" avem={d.cuGreutate} din={d.produseActive}
          nota="About You calculează transportul din ea" />
        <Rand eticheta="produse au imagini" avem={d.cuImagini} din={d.produseActive}
          nota="prima imagine, pe fundal alb sau transparent" />
        <Rand eticheta="produse au cod de bare la nivel de produs" avem={d.cuEanLaProdus} din={d.produseActive}
          nota="obligatoriu; la produsele cu variante e nevoie de câte unul pe fiecare variantă" />
        <Rand eticheta="produse au SKU propriu" avem={d.cuSku} din={d.produseActive}
          nota="la produsele cu variante contează SKU-ul fiecărei combinații; fără niciunul se folosește identificatorul intern, greu de recunoscut și practic definitiv pe About You" />
      </ul>

      {d.cuVariante > 0 && (
        <p className="text-xs text-amber-800 mt-3">
          {d.cuVariante} {d.cuVariante === 1 ? "produs are variante" : "produse au variante"}. La ele, codul de
          bare se cere pe FIECARE variantă, iar numărătoarea de mai sus nu le acoperă: verifică-le în editorul
          de listare, care le arată una câte una.
        </p>
      )}

      {d.faraCategorie > 0 && (
        <p className="text-xs text-amber-800 mt-3">
          {d.faraCategorie} {d.faraCategorie === 1 ? "produs activ nu are" : "produse active nu au"} nicio
          categorie. Fără categorie nu există ce mapa la About You, deci nu pot pleca deloc.
        </p>
      )}

      {d.categoriiNemapate > 0 && (
        <p className="text-xs text-amber-800 mt-3">
          {d.categoriiNemapate} {d.categoriiNemapate === 1 ? "categorie nu este mapată" : "categorii nu sunt mapate"} la
          About You{d.exempleNemapate.length > 0 ? `: ${d.exempleNemapate.join(", ")}` : ""}. Fără mapare,
          produsele din ele nu pot pleca.
        </p>
      )}

      {d.produseActive === 0 && (
        <p className="text-xs text-muted-foreground mt-3">Magazinul nu are produse active.</p>
      )}
    </div>
  );
}
