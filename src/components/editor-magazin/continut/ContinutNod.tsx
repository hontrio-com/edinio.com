"use client";

import { felContinut } from "@/lib/editor-magazin/noduri";
import type { SectionInstance } from "@/lib/storefront/design/types";
import type { ContinutMagazin } from "../useContinutMagazin";
import { ContinutBeneficii, ContinutCatalog, ContinutCautare, ContinutGalerie, ContinutHero, ContinutRecenzii, ContinutRecomandate, ContinutUsp } from "./ContinutAcasa";
import { ContinutAnunt, ContinutFooter, ContinutHeader } from "./ContinutChrome";
import { ContinutCard, ContinutCos } from "./ContinutComert";
import { ContinutProdus } from "./ContinutProdus";
import { ContinutRand } from "./ContinutRand";
import { Nota } from "./ui";

type Cat = { id: string; name: string; parent_id: string | null; sort_order?: number };

/**
 * Continutul unui nod din arbore, dupa felul sectiunii.
 *
 * Sectiunile fara continut de editat aici arata o nota cu locul din panou de
 * unde se umplu. Fara nota, sectiunea „Contact” goala ar parea stricata.
 */
export function ContinutNod({ sectiune, continut, businessId, categorii, planGratuit, laStil, onRandSters }: {
  sectiune: SectionInstance;
  continut: ContinutMagazin;
  businessId: string;
  categorii: Cat[];
  planGratuit: boolean;
  laStil: () => void;
  onRandSters: () => void;
}) {
  switch (felContinut(sectiune)) {
    case "anunt": return <ContinutAnunt continut={continut} />;
    case "header": return <ContinutHeader continut={continut} laStil={laStil} />;
    case "footer": return <ContinutFooter continut={continut} planGratuit={planGratuit} />;
    case "hero": return <ContinutHero continut={continut} />;
    case "usp": return <ContinutUsp continut={continut} />;
    case "cautare": return <ContinutCautare continut={continut} />;
    case "recomandate": return <ContinutRecomandate continut={continut} />;
    case "rand":
      return (
        <ContinutRand continut={continut} businessId={businessId} categorii={categorii} onSters={onRandSters}
          idRand={String(sectiune.settings.sectionRef ?? sectiune.id)} />
      );
    case "catalog": return <ContinutCatalog continut={continut} businessId={businessId} />;
    case "beneficii": return <ContinutBeneficii continut={continut} />;
    case "recenzii": return <ContinutRecenzii continut={continut} />;
    case "galerie": return <ContinutGalerie continut={continut} />;
    case "produs": return <ContinutProdus continut={continut} />;
    case "card": return <ContinutCard continut={continut} />;
    case "cos": return <ContinutCos continut={continut} />;
    case "categorii":
      return <Nota href="/dashboard/products/categories" eticheta="Produse > Categorii">Categoriile, cu numele și imaginile lor, le faci din Produse.</Nota>;
    case "prag":
      return (
        <Nota href="/dashboard/settings?sectiune=livrare" eticheta="Setări > Livrare">
          Bara arată cât mai are clientul până la livrarea gratuită. Apare doar dacă ai un prag de livrare gratuită în Setări.
        </Nota>
      );
    case "despre":
      return <Nota setare="general" eticheta="Setări > Informații generale">Textul vine din descrierea magazinului. Fără descriere, secțiunea nu apare.</Nota>;
    case "contact":
      return <Nota setare="general" eticheta="Setări > Informații generale">Telefonul, emailul și adresa magazinului se completează în fila Setări.</Nota>;
    case "magazin":
      return <Nota setare="catalog" eticheta="Setări > Catalog">Ce produse apar în catalog alegi din fila Setări. Cum arată pagina alegi mai sus, la Design.</Nota>;
    case "comanda":
      return (
        <Nota setare="formular" eticheta="Setări > Formular de comandă">
          Câmpurile formularului și opțiunile extra cu preț se aleg din fila Setări și se salvează direct: ating banii, transportul și facturile.
        </Nota>
      );
    default:
      return null;
  }
}
