import type { RegiuneIntercom } from "../config";
import type { ContextComanda, ContextPagina } from "../context-vitrina";
import type { IdentitateSemnata } from "../tipuri-chat";
import { asteapta, comandaDejaSpusa, faraSaArunce, incarcaScript, type AdaptorChat, type OptiuniAdaptor } from "./tipuri";

/**
 * Intercom (developers.intercom.com, „Installing Intercom > Web”).
 *
 *   - scriptul: `https://widget.intercom.io/widget/<Workspace ID>`; pana se incarca, `window.Intercom` e o
 *     coada care tine comenzile si le reda in ordine (forma din codul lor de instalare);
 *   - pornirea: `Intercom("boot", { api_base, app_id, … })`, cu `api_base` dupa regiunea spatiului;
 *   - gata: `Intercom("ready", f)`. ⚠ NU se cheama daca Messengerul nu porneste (ID gresit, mesageria pentru
 *     web oprita la ei, domeniu nepermis), si nu are termen: de aceea asteptarea de aici are unul;
 *   - butonul lor: `hide_default_launcher`; fereastra: `show` / `hide`; mesaj pregatit: `showNewMessage`;
 *   - necitite: `onUnreadCountChange`;
 *   - identitatea: `intercom_user_jwt` (JWT semnat pe server). ⚠ Un JWT gresit opreste Messengerul cu
 *     totul, deci campul se pune numai cand serverul chiar a semnat unul;
 *   - iesirea din cont: `shutdown`, plus stergerea cookie-urilor `intercom-` (pe un calculator folosit de mai
 *     multi oameni, altfel conversatiile unuia apar la urmatorul), apoi o pornire anonima;
 *   - acordul retras: `shutdown` si cookie-urile sterse, FARA pornire. Repornirea vine cu acordul.
 *
 * ⚠ Pagina curenta o stie Intercom singur. Din context pleaca numai produsul privit si cosul (atribute pe
 * vizitator) si comanda (eveniment).
 */
type Coada = ((...args: unknown[]) => void) & { q?: unknown[][]; c?: (args: unknown[]) => void };
type FereastraIntercom = Window & { Intercom?: Coada };

const BAZE: Record<RegiuneIntercom, string> = {
  us: "https://api-iam.intercom.io",
  eu: "https://api-iam.eu.intercom.io",
  au: "https://api-iam.au.intercom.io",
};

/** Cat asteptam pornirea Messengerului. Peste, spunem ca nu a pornit (vezi nota despre `ready`). */
const ASTEPTARE_PORNIRE_MS = 12000;

function stergeCookieurile(): void {
  const gazda = window.location.hostname;
  for (const bucata of document.cookie.split(";")) {
    const nume = bucata.split("=")[0]?.trim();
    if (!nume || !nume.startsWith("intercom-")) continue;
    document.cookie = `${nume}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `${nume}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${gazda}`;
    document.cookie = `${nume}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${gazda}`;
  }
}

export function adaptorIntercom(app: string, regiune: RegiuneIntercom, o: OptiuniAdaptor): AdaptorChat {
  const w = window as FereastraIntercom;
  const ic = (...args: unknown[]) => faraSaArunce(() => w.Intercom?.(...args));
  /* Acordul a fost retras: Messengerul e oprit (`shutdown`) si trebuie pornit din nou inainte de orice altceva. */
  let oprit = false;

  function setari(identitate: IdentitateSemnata | null): Record<string, unknown> {
    const s: Record<string, unknown> = {
      api_base: BAZE[regiune] ?? BAZE.us,
      app_id: app,
      hide_default_launcher: o.ascundeButonulLor,
      alignment: o.pozitie === "stanga" ? "left" : "right",
      language_override: "ro",
    };
    if (identitate?.furnizor === "intercom" && identitate.jwt) s.intercom_user_jwt = identitate.jwt;
    return s;
  }

  return {
    async incarca(identitate) {
      if (typeof w.Intercom !== "function") {
        const coada: Coada = function (...args: unknown[]) { coada.c?.(args); };
        coada.q = [];
        coada.c = (args) => { coada.q?.push(args); };
        w.Intercom = coada;
      }
      let pornit = false;
      ic("ready", () => { pornit = true; });
      ic("onShow", () => { o.laStare(true); });
      ic("onHide", () => { o.laStare(false); });
      ic("onUnreadCountChange", (n: unknown) => { o.laNecitite(typeof n === "number" && n > 0 ? n : 0); });
      ic("boot", setari(identitate));

      await incarcaScript(`https://widget.intercom.io/widget/${app}`);
      await asteapta(() => pornit, ASTEPTARE_PORNIRE_MS);
    },

    deschide(mesaj) {
      if (oprit) { oprit = false; ic("boot", setari(null)); }
      if (mesaj) ic("showNewMessage", mesaj);
      else ic("show");
    },

    inchide() {
      ic("hide");
    },

    identifica(identitate) {
      oprit = false;
      ic("shutdown");
      if (!identitate) faraSaArunce(stergeCookieurile);
      ic("boot", setari(identitate));
    },

    acord(functionale) {
      if (!functionale) {
        /* `shutdown` inchide Messengerul si ii incheie sesiunea; cookie-urile lui le stergem noi. */
        ic("shutdown");
        faraSaArunce(stergeCookieurile);
        oprit = true;
        return;
      }
      /* Anonim: cine e omul se spune din nou la urmatoarea deschidere (`identifica`). */
      if (oprit) { oprit = false; ic("boot", setari(null)); }
    },

    spuneContextul(pagina: ContextPagina | null, comanda: ContextComanda | null) {
      if (pagina && (pagina.produs || pagina.cos)) {
        const atribute: Record<string, string> = {};
        if (pagina.produs) atribute.produs_privit = pagina.produs.pret ? `${pagina.produs.nume} (${pagina.produs.pret})` : pagina.produs.nume;
        if (pagina.cos) atribute.cos = `${pagina.cos.produse} produse, ${pagina.cos.valoare}`;
        ic("update", atribute);
      }
      if (comanda && !comandaDejaSpusa("intercom", comanda.numar)) {
        ic("trackEvent", "comanda-plasata", {
          numar: comanda.numar,
          ...(comanda.total ? { total: comanda.total } : {}),
          ...(comanda.plata ? { plata: comanda.plata } : {}),
        });
      }
    },
  };
}
