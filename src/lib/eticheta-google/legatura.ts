import { CONSENT_EVENT } from "@/lib/cookie-consent";
import { CHEIE_ACORD_GOOGLE, CHEIE_RASPUNS } from "./corp";

/*
  Jumatatea din BROWSER a etichetei Google, ca functie simpla (25.11.2026).

  Scriptul etichetei e scris de server in pagina si ruleaza la citirea ei (`corp.ts`). Aici raman doua
  lucruri pe care serverul nu le poate face:
    1. raspunsul din banner (si retragerea lui) ajunge la eticheta pe loc, prin
       `window.__edinioGoogleRaspuns`: `consent update`, restul ID-urilor si evenimentele din coada;
    2. eticheta se porneste de aici, cu ACELASI script, cand n-a pornit din pagina: omul tocmai a acceptat,
       iar magazinul n-are reclame Google sau are optiunea oprita, deci nu pornise nimic.

  ⚠ De ce o functie, nu corpul unui `useEffect`: asa se RULEAZA in probe, in aceeasi fereastra falsa ca
  scriptul. Cat a stat in componenta, probele ii citeau doar textul, iar 11 din 13 stricaciuni incercate la
  recenzie treceau neobservate (ascultatorul scos, raspunsul aplicat pe dos, scriptul nepus in pagina).
*/

/** Ce a acordat omul etichetei Google, pe cele doua categorii ale bannerului care o privesc. */
export interface AcordPentruGoogle {
  analytics: boolean;
  marketing: boolean;
}

/** Atat din fereastra browserului cat foloseste legatura. */
export interface FereastraEtichetei {
  document: {
    createElement(fel: "script"): { text: string };
    head: { appendChild(nod: never): unknown };
  };
  addEventListener(tip: string, ascultator: () => void): void;
  removeEventListener(tip: string, ascultator: () => void): void;
}

type CuEticheta = {
  [CHEIE_RASPUNS]?: (analiza: boolean, marketing: boolean) => void;
  [CHEIE_ACORD_GOOGLE]?: Partial<AcordPentruGoogle>;
};

/**
 * Porneste eticheta (daca n-a pornit din pagina) si o leaga de banner. Intoarce functia care desface legatura.
 *
 * @param slug Numele magazinului, curatat. Gol: nu avem de unde citi raspunsul, deci nu se asculta nimic.
 * @param cuBanner Magazinul are bannerul pornit. Fara el nu raspunde nimeni, deci nu e nimic de ascultat.
 * @param citesteAcord Raspunsul scris de banner pentru magazinul dat, sau `null` cand omul n-a raspuns.
 */
export function leagaEtichetaGoogle(p: {
  fereastra: FereastraEtichetei;
  script: string;
  slug: string;
  cuBanner: boolean;
  citesteAcord: (slug: string) => AcordPentruGoogle | null;
}): () => void {
  const w = p.fereastra;
  const eticheta = w as unknown as CuEticheta;
  /*
   * Scriptul isi tine singur socoteala: daca eticheta a pornit deja, a doua rulare nu face nimic; in
   * previzualizare, in zona de cont si, cand n-are voie inainte de acord, fara acord, nu porneste nici de aici.
   */
  const porneste = () => {
    const s = w.document.createElement("script");
    s.text = p.script;
    w.document.head.appendChild(s as never);
  };
  porneste();

  if (!p.slug || !p.cuBanner) return () => {};

  /*
   * Raspunsul dat cat legatura nu exista (componenta demontata, bannerul raspuns intre timp): se aplica la
   * legare, o singura data si numai daca eticheta pornita stie altceva. `ConsentGate`, pe care il inlocuieste,
   * recitea raspunsul la fiecare montare.
   */
  const laLegare = () => {
    const acord = p.citesteAcord(p.slug);
    const duce = eticheta[CHEIE_RASPUNS];
    if (!acord || typeof duce !== "function") return;
    const stiut = eticheta[CHEIE_ACORD_GOOGLE];
    if (stiut?.analytics === acord.analytics && stiut?.marketing === acord.marketing) return;
    duce(acord.analytics, acord.marketing);
  };
  laLegare();

  /* Raspunsul din banner, si retragerea lui, pe loc, fara reincarcarea paginii. */
  const laRaspuns = () => {
    const acord = p.citesteAcord(p.slug);
    if (!acord) return;
    const duce = eticheta[CHEIE_RASPUNS];
    if (typeof duce === "function") duce(acord.analytics, acord.marketing);
    /* Eticheta n-a pornit inca: scriptul isi citeste singur raspunsul abia scris si porneste cu el. */
    else porneste();
  };
  w.addEventListener(CONSENT_EVENT, laRaspuns);
  return () => w.removeEventListener(CONSENT_EVENT, laRaspuns);
}
