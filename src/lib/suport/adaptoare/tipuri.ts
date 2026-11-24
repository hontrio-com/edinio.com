import type { ContextComanda, ContextPagina } from "../context-vitrina";
import type { IdentitateSemnata } from "../tipuri-chat";

/**
 * Forma comuna a celor patru furnizori de chat. Butonul din vitrina vorbeste numai cu ea, deci un al
 * cincilea furnizor inseamna un fisier in plus aici, nu o schimbare in buton.
 *
 * ⚠ Numai in browser: fiecare adaptor umbla la `window` si incarca scriptul furnizorului de la gazda lui
 * fixa. Se aduc prin `import()` abia la prima apasare (sau la incarcarea automata), nu odata cu pagina.
 */
export type OptiuniAdaptor = {
  /** Butonul furnizorului ramane ascuns: in pagina sta butonul magazinului. */
  ascundeButonulLor: boolean;
  pozitie: "dreapta" | "stanga";
  /** Vizitatorul a acceptat si cookie-urile de analiza (Zendesk isi alege nivelul de cookie-uri dupa asta). */
  acordAnaliza: boolean;
  /** Cate mesaje necitite sunt cat fereastra e inchisa. 0 = niciunul. */
  laNecitite: (n: number) => void;
  /** Fereastra de chat s-a deschis sau s-a inchis. */
  laStare: (deschisa: boolean) => void;
  /** Cere din nou identitatea semnata (Zendesk o cere la fiecare token expirat). */
  cereIdentitatea: () => Promise<IdentitateSemnata | null>;
};

export interface AdaptorChat {
  /** Incarca scriptul furnizorului si asteapta pana raspunde. Arunca la esec sau la timp depasit. */
  incarca(identitate: IdentitateSemnata | null): Promise<void>;
  /** Deschide fereastra de chat. `mesaj` precompleteaza campul, unde furnizorul permite. */
  deschide(mesaj?: string): void;
  inchide(): void;
  /** Omul a intrat in cont sau a iesit dupa ce chatul era deja incarcat. `null` = a iesit. */
  identifica(identitate: IdentitateSemnata | null): void;
  /** Pagina, produsul, cosul si comanda, in forma furnizorului. Fara date personale. */
  spuneContextul(pagina: ContextPagina | null, comanda: ContextComanda | null): void;
  /**
   * Acordul pentru cookie-uri s-a schimbat dupa ce chatul era deja incarcat (omul a redeschis „Setari
   * cookie-uri” din subsol).
   *
   *   - `functionale: false`: acordul chatului a fost RETRAS. Fereastra se inchide, widgetul iese din pagina
   *     si, unde furnizorul are o comanda pentru asta, isi sterge ce a pus in browser. Scriptul lui nu se mai
   *     poate scoate din pagina, dar nu mai are voie sa se vada si sa lucreze;
   *   - `functionale: true`: acordul exista (din nou). Cu butonul furnizorului, widgetul lui revine; cu al
   *     nostru, revine la urmatoarea deschidere. `analiza` spune daca omul a acceptat si cookie-urile de analiza.
   */
  acord(functionale: boolean, analiza: boolean): void;
}

/** Cat asteptam scriptul unui furnizor inainte sa spunem ca nu s-a incarcat. */
export const ASTEPTARE_SCRIPT_MS = 15000;

/**
 * Pune scriptul furnizorului in pagina, o singura data, si se rezolva cand s-a incarcat.
 *
 * ⚠ Adresa vine din adaptoare, care o compun din gazda fixa a furnizorului si din identificatorul verificat
 * ca forma (`config.ts`). Aici nu ajunge niciodata un text scris de comerciant.
 */
export function incarcaScript(src: string, atribute: Record<string, string> = {}): Promise<void> {
  return new Promise((rezolva, respinge) => {
    const existent = Array.from(document.scripts).find((s) => s.src === src);
    if (existent?.dataset.edinioIncarcat === "1") { rezolva(); return; }
    const script = existent ?? document.createElement("script");
    /* ⚠ Un script cazut se SCOATE din pagina: altfel a doua apasare l-ar gasi acolo, fara sa mai astepte
       nimic de la el, si omul n-ar mai putea reincerca fara sa reincarce pagina. */
    const cazut = (motiv: string) => { script.remove(); respinge(new Error(motiv)); };
    const ceas = window.setTimeout(() => cazut("scriptul chatului nu a raspuns la timp"), ASTEPTARE_SCRIPT_MS);
    script.addEventListener("load", () => { window.clearTimeout(ceas); script.dataset.edinioIncarcat = "1"; rezolva(); }, { once: true });
    script.addEventListener("error", () => { window.clearTimeout(ceas); cazut("scriptul chatului nu s-a putut incarca"); }, { once: true });
    if (!existent) {
      script.async = true;
      script.src = src;
      for (const [cheie, valoare] of Object.entries(atribute)) script.setAttribute(cheie, valoare);
      document.head.appendChild(script);
    }
  });
}

/** Asteapta pana cand `gata()` spune da, intreband des. Arunca la timp depasit. */
export function asteapta(gata: () => boolean, cat: number = ASTEPTARE_SCRIPT_MS): Promise<void> {
  return new Promise((rezolva, respinge) => {
    if (gata()) { rezolva(); return; }
    const inceput = Date.now();
    const ceas = window.setInterval(() => {
      if (gata()) { window.clearInterval(ceas); rezolva(); }
      else if (Date.now() - inceput > cat) { window.clearInterval(ceas); respinge(new Error("chatul nu a raspuns la timp")); }
    }, 60);
  });
}

/** Un apel catre furnizor nu are voie sa strice pagina magazinului: orice arunca el se opreste aici. */
export function faraSaArunce(f: () => void): void {
  try {
    f();
  } catch {
    /* furnizorul si-a schimbat ceva sau scriptul lui e pe jumatate incarcat: chatul pierde un amanunt, pagina nu */
  }
}

/** Comanda se spune furnizorului o singura data pe fila, oricate pagini ar deschide omul. */
export function comandaDejaSpusa(furnizor: string, numar: string): boolean {
  const cheie = `edinio_chat_spus_${furnizor}_${numar}`;
  try {
    if (window.sessionStorage.getItem(cheie)) return true;
    window.sessionStorage.setItem(cheie, "1");
  } catch {
    /* stocare blocata: se spune de fiecare data, ceea ce e doar o repetare */
  }
  return false;
}
