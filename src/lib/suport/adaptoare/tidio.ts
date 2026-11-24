import type { ContextComanda, ContextPagina } from "../context-vitrina";
import type { IdentitateSemnata } from "../tipuri-chat";
import { asteapta, comandaDejaSpusa, faraSaArunce, incarcaScript, type AdaptorChat, type OptiuniAdaptor } from "./tipuri";

/**
 * Tidio (developers.tidio.com, „Widget SDK”).
 *
 *   - scriptul: `https://code.tidio.co/<cheia publica>.js`;
 *   - limba si identitatea se pun INAINTE de script: `document.tidioChatLang`, `document.tidioIdentify`;
 *   - gata: evenimentul `tidioChat-ready` pe `document` (sau `tidioChatApi.on("ready")`);
 *   - `hide()` scoate TOT widgetul din pagina (butonul lor si fereastra), `show()` il pune la loc. Deci cu
 *     butonul nostru: ascuns in repaus, aratat si deschis la apasare, ascuns din nou la `close`. Se pot chema
 *     si inainte ca chatul sa se fi incarcat („You can call them before the chat loads”), deci il ascundem de
 *     cum exista `tidioChatApi`, ca butonul lor sa nu apuce sa apara;
 *   - Tidio nu are semnatura pentru identitate: datele sunt o completare a formularului lor.
 *
 * ⚠ Pagina de pe care scrie omul o arata Tidio singur operatorului, deci `spuneContextul` nu trimite nimic
 * pentru pagina. Comanda pleaca drept eticheta pe vizitator si drept eveniment de automatizare.
 */
type TidioApi = {
  on: (eveniment: string, f: (date?: unknown) => void) => void;
  open: () => void;
  close: () => void;
  show: () => void;
  hide: () => void;
  setVisitorData?: (date: Record<string, unknown>) => void;
  addVisitorTags?: (etichete: string[]) => void;
  track?: (eveniment: string) => void;
  resetVisitor?: () => void;
};

type FereastraTidio = Window & { tidioChatApi?: TidioApi };
type DocumentTidio = Document & { tidioChatLang?: string; tidioIdentify?: Record<string, string> };

function dateleLui(i: Extract<IdentitateSemnata, { furnizor: "tidio" }>): Record<string, string> {
  const d: Record<string, string> = { distinct_id: i.id, email: i.email };
  if (i.nume) d.name = i.nume;
  if (i.telefon) d.phone = i.telefon;
  return d;
}

export function adaptorTidio(cheie: string, o: OptiuniAdaptor): AdaptorChat {
  const w = window as FereastraTidio;
  const doc = document as DocumentTidio;
  let deschisa = false;
  let necitite = 0;
  const api = () => w.tidioChatApi;

  return {
    async incarca(identitate) {
      doc.tidioChatLang = "ro";
      if (identitate?.furnizor === "tidio") doc.tidioIdentify = dateleLui(identitate);

      let gata = false;
      const laGata = () => { gata = true; };
      document.addEventListener("tidioChat-ready", laGata, { once: true });
      await incarcaScript(`https://code.tidio.co/${cheie}.js`);
      /* Ascuns de cum exista API-ul, nu abia la „gata”: intre cele doua, butonul lor ar aparea o clipa. */
      let ascunsDevreme = false;
      const ascundeDevreme = () => {
        if (!o.ascundeButonulLor || ascunsDevreme || !api()) return;
        ascunsDevreme = true;
        faraSaArunce(() => api()?.hide());
      };
      ascundeDevreme();
      /* Scriptul poate fi deja „gata” inainte sa apuce ascultatorul nostru: intrebam si API-ul. */
      faraSaArunce(() => api()?.on("ready", laGata));
      await asteapta(() => { ascundeDevreme(); return gata && !!api(); });

      const a = api()!;
      if (o.ascundeButonulLor) faraSaArunce(() => a.hide());
      faraSaArunce(() => a.on("open", () => { deschisa = true; necitite = 0; o.laNecitite(0); o.laStare(true); }));
      faraSaArunce(() => a.on("close", () => {
        deschisa = false;
        o.laStare(false);
        if (o.ascundeButonulLor) faraSaArunce(() => a.hide());
      }));
      faraSaArunce(() => a.on("messageFromOperator", () => {
        if (deschisa) return;
        necitite += 1;
        o.laNecitite(necitite);
      }));
    },

    deschide() {
      faraSaArunce(() => { api()?.show(); api()?.open(); });
    },

    inchide() {
      faraSaArunce(() => api()?.close());
    },

    identifica(identitate) {
      if (identitate?.furnizor === "tidio") {
        doc.tidioIdentify = dateleLui(identitate);
        faraSaArunce(() => api()?.setVisitorData?.(dateleLui(identitate)));
        return;
      }
      /* A iesit din cont: datele lui nu au voie sa ramana pentru urmatorul om de la acelasi calculator. */
      delete doc.tidioIdentify;
      faraSaArunce(() => api()?.resetVisitor?.());
    },

    acord(functionale) {
      /* Tidio nu are o comanda de oprire: widgetul se inchide si iese din pagina (`hide` scoate tot). */
      if (!functionale) {
        faraSaArunce(() => api()?.close());
        faraSaArunce(() => api()?.hide());
        return;
      }
      if (!o.ascundeButonulLor) faraSaArunce(() => api()?.show());
    },

    spuneContextul(_pagina: ContextPagina | null, comanda: ContextComanda | null) {
      if (!comanda || comandaDejaSpusa("tidio", comanda.numar)) return;
      faraSaArunce(() => api()?.addVisitorTags?.([`Comanda ${comanda.numar}`]));
      faraSaArunce(() => api()?.track?.("order_placed"));
    },
  };
}
