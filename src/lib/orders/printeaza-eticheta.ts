/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ETICHETA SE PRINTEAZA DIRECT, FARA SA FIE SALVATA PE DISC       (04.10.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de un comerciant: „sa se deschida direct pentru printare, fara sa il descarc". Pana azi
 * fiecare fereastra de AWB salva fisierul, iar omul il cauta apoi in Descarcari ca sa-l printeze.
 * Butonul „Descarca" ramane; asta e un al doilea drum, langa el.
 *
 * ⚠ DOUA DRUMURI, DUPA BROWSER, si nu e un moft:
 *
 *   Chromium (Chrome, Edge, Opera, Brave): PDF-ul se incarca intr-un `iframe` nevazut si i se
 *     cere `print()`. Apare direct fereastra de printare, cu eticheta in ea.
 *   Firefox si Safari: acolo `print()` pe un PDF dintr-un `iframe` fie arunca, fie printeaza o
 *     pagina goala (vizualizatorul lor de PDF nu e documentul cadrului). Se deschide PDF-ul intr-un
 *     tab nou, unde omul apasa Print. Tot fara fisier salvat.
 *
 * ⚠ `iframe`-ul NU e `display: none`. Chrome nu deseneaza deloc un cadru ascuns asa, si atunci
 * printeaza o pagina alba. E pus in afara ecranului, cu marime reala.
 *
 * ⚠ ETICHETA E DATE PERSONALE (numele, adresa si telefonul cumparatorului). Adresa `blob:` se
 * elibereaza la urmatoarea printare si la plecarea de pe pagina, nu ramane in memorie la nesfarsit.
 */

/** Cum s-a putut deschide eticheta. `false` cand nu e un PDF (ZPL, o pagina de eroare). */
export type RezultatPrintare = "printare" | "tab-nou" | "blocat" | false;

/** Primii octeti ai oricarui PDF adevarat. */
export function estePdf(octeti: Uint8Array): boolean {
  return octeti.length >= 5
    && octeti[0] === 0x25 && octeti[1] === 0x50 && octeti[2] === 0x44 && octeti[3] === 0x46
    && octeti[4] === 0x2d;
}

/** Octetii unei etichete primite in base64 de la o actiune de server. */
export function dinBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/**
 * Chromium se recunoaste dupa `navigator.userAgentData`, pe care numai el il are. Nu dupa textul
 * `userAgent`: Edge, Opera si Samsung il scriu fiecare altfel, iar Safari pe iOS se da „Chrome".
 */
export function esteChromium(nav: { userAgentData?: { brands?: { brand: string }[] } } | undefined): boolean {
  return !!nav?.userAgentData?.brands?.some((b) => /Chromium/i.test(b.brand));
}

const ID_CADRU = "edinio-printare-eticheta";
let adresaCurenta: string | null = null;

function elibereaza() {
  document.getElementById(ID_CADRU)?.remove();
  if (adresaCurenta) URL.revokeObjectURL(adresaCurenta);
  adresaCurenta = null;
}

/**
 * Deschide eticheta pentru printare. Chemata DUPA ce s-au adus octetii, din acelasi clic.
 *
 * @returns `false` daca nu e un PDF (apelantul o descarca, cum facea si pana azi), `"blocat"` daca
 * browserul a oprit tabul nou, altfel drumul pe care s-a deschis.
 */
export async function printeazaEticheta(sursa: Blob | Uint8Array): Promise<RezultatPrintare> {
  const octeti = sursa instanceof Uint8Array ? sursa : new Uint8Array(await sursa.arrayBuffer());
  if (!estePdf(octeti)) return false;

  elibereaza();
  /* `.slice()`: o vedere peste un bloc comun ar fi dus in fisier si octetii din jur. */
  const url = URL.createObjectURL(new Blob([octeti.slice()], { type: "application/pdf" }));
  adresaCurenta = url;

  if (!esteChromium(navigator as Parameters<typeof esteChromium>[0])) {
    const tab = window.open(url, "_blank");
    return tab ? "tab-nou" : "blocat";
  }

  const cadru = document.createElement("iframe");
  cadru.id = ID_CADRU;
  cadru.title = "Eticheta pentru printare";
  cadru.setAttribute("aria-hidden", "true");
  cadru.tabIndex = -1;
  cadru.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;";
  /*
   * ⚠ FARA `contentWindow.focus()`. Chrome printeaza si fara el, iar cu el focusul ramanea in
   * cadrul nevazut dupa ce omul inchidea printarea: Escape nu mai inchidea fereastra de AWB,
   * iar Tab umbla prin vizualizatorul de PDF din afara ecranului.
   */
  cadru.onload = () => {
    try {
      cadru.contentWindow?.print();
    } catch {
      /* Un Chromium care refuza totusi: tab nou, ca in celelalte browsere. */
      window.open(url, "_blank");
    }
  };
  cadru.src = url;
  document.body.appendChild(cadru);
  return "printare";
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", elibereaza);
}
