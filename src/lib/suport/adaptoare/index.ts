import type { ContPublic } from "../config";
import type { AdaptorChat, OptiuniAdaptor } from "./tipuri";

/**
 * Adaptorul furnizorului pornit. Fiecare sta in bucata lui de cod, adusa abia cand e nevoie de ea: un
 * magazin cu Tidio nu descarca niciodata codul pentru Zendesk, iar unul fara chat, niciunul.
 */
export async function adaptorulPentru(cont: ContPublic, o: OptiuniAdaptor): Promise<AdaptorChat> {
  if (cont.furnizor === "tidio") return (await import("./tidio")).adaptorTidio(cont.cheie, o);
  if (cont.furnizor === "tawkto") return (await import("./tawkto")).adaptorTawk(cont.proprietate, cont.widget, o);
  if (cont.furnizor === "intercom") return (await import("./intercom")).adaptorIntercom(cont.app, cont.regiune, o);
  return (await import("./zendesk")).adaptorZendesk(cont.cheie, o);
}

/**
 * De unde vine scriptul fiecarui furnizor, pentru legatura deschisa din timp. `cors` spune cum il cere
 * adaptorul lui: tawk.to isi pune scriptul cu `crossorigin`, deci legatura se deschide la fel, altfel
 * browserul nu o refoloseste.
 */
const ORIGINEA_SCRIPTULUI: Record<ContPublic["furnizor"], { href: string; cors: boolean }> = {
  tidio: { href: "https://code.tidio.co", cors: false },
  tawkto: { href: "https://embed.tawk.to", cors: true },
  intercom: { href: "https://widget.intercom.io", cors: false },
  zendesk: { href: "https://static.zdassets.com", cors: false },
};

/**
 * La apropierea de buton (cursorul deasupra lui, focusul pe el), ca fereastra sa se deschida mai repede:
 *
 *   - aduce bucata de cod a furnizorului. E codul NOSTRU, de pe magazin: nicio cerere spre furnizor;
 *   - `cuLegatura`: deschide si legatura spre gazda scriptului lor (`preconnect`).
 *
 * ⚠ LEGATURA NUMAI CU ACORDUL OMULUI. O legatura deschisa ii arata furnizorului adresa IP a vizitatorului,
 * chiar daca nu se cere nimic pe ea. Apelantul o cere numai dupa acordul pentru „functionale” (sau cand
 * magazinul are bannerul oprit), exact ca incarcarea scriptului.
 */
export function pregatesteChatul(furnizor: ContPublic["furnizor"], cuLegatura: boolean): void {
  const bucata =
    furnizor === "tidio" ? import("./tidio")
    : furnizor === "tawkto" ? import("./tawkto")
    : furnizor === "intercom" ? import("./intercom")
    : import("./zendesk");
  /* O bucata care nu vine acum se cere din nou la apasare; aici nu e nimic de spus nimanui. */
  bucata.catch(() => {});

  if (!cuLegatura) return;
  const { href, cors } = ORIGINEA_SCRIPTULUI[furnizor];
  if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
  const legatura = document.createElement("link");
  legatura.rel = "preconnect";
  legatura.href = href;
  if (cors) legatura.crossOrigin = "anonymous";
  document.head.appendChild(legatura);
}

export type { AdaptorChat, OptiuniAdaptor } from "./tipuri";
