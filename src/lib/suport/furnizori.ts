import {
  appIntercomValid, cheieTidioValida, cheieZendeskValida, proprietateTawkValida, widgetTawkValid,
  type ConturiSuport, type FurnizorSuport,
} from "./config";

/**
 * Ce stim despre fiecare furnizor de chat, intr-un singur loc: numele, de unde se incarca, unde raspunde
 * comerciantul si cum se scoate identificatorul din codul de instalare lipit de om.
 *
 * ⚠ GAZDELE SUNT FIXE. Scriptul de chat se incarca NUMAI de la adresele de aici, cu identificatorul
 * verificat ca forma (`config.ts`). Nu exista niciun camp de „cod liber”: pe originea comuna a platformei
 * un script ales de comerciant ruleaza langa toate celelalte magazine.
 *
 * ⚠ Fara `server-only`: il citesc si paginile din panou, si butonul din vitrina.
 */
export type DescriereFurnizor = {
  id: FurnizorSuport;
  /** Numele, cum il scrie furnizorul. */
  nume: string;
  /** Gazdele catre care browserul deschide legatura dinainte (`preconnect`), la apropierea de buton. */
  gazde: readonly string[];
  /** Unde citeste si raspunde comerciantul la conversatii. */
  aplicatie: string;
  /** Unde isi gaseste identificatorul, in panoul furnizorului. */
  undeECheia: string;
  /** Are semnatura pentru identitatea clientului? Tidio nu are. */
  semneaza: boolean;
};

export const FURNIZORI: Record<FurnizorSuport, DescriereFurnizor> = {
  tidio: {
    id: "tidio",
    nume: "Tidio",
    gazde: ["https://code.tidio.co", "https://widget-v4.tidiochat.com"],
    aplicatie: "https://www.tidio.com/panel/",
    undeECheia: "În Tidio: Settings, apoi Developer, apoi Project data. Copiază valoarea de la „Public Key”.",
    semneaza: false,
  },
  tawkto: {
    id: "tawkto",
    nume: "tawk.to",
    gazde: ["https://embed.tawk.to"],
    aplicatie: "https://dashboard.tawk.to/",
    undeECheia: "În tawk.to: Administration, apoi Channels, apoi Chat Widget. Copiază „Direct Chat Link”: are în el și Property ID, și Widget ID.",
    semneaza: true,
  },
  intercom: {
    id: "intercom",
    nume: "Intercom",
    gazde: ["https://widget.intercom.io", "https://js.intercomcdn.com"],
    aplicatie: "https://app.intercom.com/",
    undeECheia: "E în adresa din browser când ești în Intercom: literele și cifrele de după „apps/”. De exemplu, din app.intercom.com/a/apps/abcd1234/home, ID-ul e abcd1234.",
    semneaza: true,
  },
  zendesk: {
    id: "zendesk",
    nume: "Zendesk",
    gazde: ["https://static.zdassets.com", "https://ekr.zdassets.com"],
    aplicatie: "https://www.zendesk.com/login/",
    undeECheia: "În Admin Center: Channels, apoi Messaging and social, apoi Messaging. Deschide widgetul, apoi Installation: cheia e după „key=” în codul afișat.",
    semneaza: true,
  },
};

export function numeleFurnizorului(f: FurnizorSuport): string {
  return FURNIZORI[f].nume;
}

/**
 * Scoate identificatorii din ce a lipit omul: fie valoarea goala, fie tot codul de instalare, fie o adresa.
 * Intoarce felia de `conturi` a furnizorului, sau `null` cand nu gaseste nimic cu forma buna.
 *
 * ⚠ Rezultatul trece oricum prin verificarea de forma din `config.ts` inainte sa ajunga in pagina; aici
 * se cauta doar, cu tipare ancorate pe gazdele furnizorului.
 */
export function scoateIdentificatorii(furnizor: FurnizorSuport, lipit: string): ConturiSuport[FurnizorSuport] | null {
  const text = (lipit ?? "").trim();
  if (!text) return null;

  if (furnizor === "tidio") {
    const dinCod = /code\.tidio\.co\/([A-Za-z0-9]+)\.js/.exec(text)?.[1];
    const cheie = dinCod ?? text;
    return cheieTidioValida(cheie) ? { cheie } : null;
  }

  if (furnizor === "tawkto") {
    const m = /(?:embed\.tawk\.to|tawk\.to\/chat)\/([a-f0-9]{24})\/([A-Za-z0-9]+)/.exec(text);
    if (m && proprietateTawkValida(m[1]) && widgetTawkValid(m[2])) return { proprietate: m[1], widget: m[2] };
    /* Doua valori despartite de `/`, spatiu sau virgula: „<property> <widget>”. */
    const parti = text.split(/[\s,/]+/).filter(Boolean);
    if (parti.length === 2 && proprietateTawkValida(parti[0]) && widgetTawkValid(parti[1])) {
      return { proprietate: parti[0], widget: parti[1] };
    }
    return null;
  }

  if (furnizor === "intercom") {
    const dinCod =
      /widget\.intercom\.io\/widget\/([a-z0-9]+)/.exec(text)?.[1]
      ?? /app_id\s*[:=]\s*["']([a-z0-9]+)["']/i.exec(text)?.[1]
      ?? /\/apps\/([a-z0-9]+)(?:\/|$)/.exec(text)?.[1];
    const app = dinCod ?? text;
    return appIntercomValid(app) ? { app } : null;
  }

  const dinCod = /[?&]key=([0-9a-fA-F-]{36})/.exec(text)?.[1];
  const cheie = (dinCod ?? text).toLowerCase();
  return cheieZendeskValida(cheie) ? { cheie } : null;
}

/**
 * Paragraful pe care comerciantul il poate pune in Politica de confidentialitate. Text pentru PANOU (cu
 * diacritice); comerciantul il copiaza si il adapteaza.
 */
export function paragrafPolitica(furnizor: FurnizorSuport, trimiteIdentitatea: boolean): string {
  const nume = numeleFurnizorului(furnizor);
  const baza =
    `Pentru chatul din magazin folosim ${nume}. Când deschizi chatul, ${nume} folosește cookie-uri și primește `
    + "mesajele pe care le scrii, pagina de pe care scrii și date tehnice despre dispozitiv, ca să îți putem răspunde.";
  return trimiteIdentitatea
    ? `${baza} Dacă ai cont în magazin, îi transmitem și numele și adresa ta de email, ca să te recunoaștem.`
    : baza;
}
