import type { ContextComanda, ContextPagina } from "../context-vitrina";
import type { IdentitateSemnata } from "../tipuri-chat";
import { asteapta, comandaDejaSpusa, faraSaArunce, incarcaScript, type AdaptorChat, type OptiuniAdaptor } from "./tipuri";

/**
 * tawk.to (developer.tawk.to/jsapi).
 *
 *   - scriptul: `https://embed.tawk.to/<property>/<widget>`, cu `charset` si `crossorigin`, ca in codul lor;
 *   - `window.Tawk_API` se pregateste INAINTE de script; functiile `on…` puse pe el sunt chemate de widget;
 *   - gata: `Tawk_API.onLoad`. Inaintea lui vine `onBeforeLoad` („before the widget is rendered”): acolo
 *     ascundem butonul lor, ca sa nu apuce sa apara o clipa inainte de `onLoad`;
 *   - `hideWidget()` / `showWidget()` scot si pun la loc tot widgetul; `maximize()` deschide fereastra;
 *   - identitatea: `Tawk_API.login({ hash, userId, … })`, cu `hash` = HMAC-SHA256(userId, cheia API), facut
 *     pe server. `logout()` la iesirea din cont;
 *   - contextul: `setAttributes` (cheile: doar litere, cifre si `-`; valorile, cel mult 255 de caractere),
 *     `addEvent` pentru comanda, `setChatInputMessage` pentru mesajul pregatit.
 */
type TawkApi = {
  onBeforeLoad?: () => void;
  onLoad?: () => void;
  onChatMaximized?: () => void;
  onChatMinimized?: () => void;
  onChatHidden?: () => void;
  onChatMessageAgent?: (mesaj: unknown) => void;
  maximize?: () => void;
  minimize?: () => void;
  showWidget?: () => void;
  hideWidget?: () => void;
  login?: (date: Record<string, unknown>, raspuns?: (eroare?: unknown) => void) => void;
  logout?: (raspuns?: (eroare?: unknown) => void) => void;
  setAttributes?: (atribute: Record<string, string>, raspuns?: (eroare?: unknown) => void) => void;
  addEvent?: (nume: string, date?: Record<string, string>, raspuns?: (eroare?: unknown) => void) => void;
  setChatInputMessage?: (mesaj: string, raspuns?: (eroare?: unknown) => void) => void;
};

type FereastraTawk = Window & { Tawk_API?: TawkApi; Tawk_LoadStart?: Date };

const nimic = () => {};

function dateleLui(i: Extract<IdentitateSemnata, { furnizor: "tawkto" }>): Record<string, unknown> {
  const d: Record<string, unknown> = { hash: i.hash, userId: i.id, email: i.email };
  if (i.nume) d.name = i.nume;
  if (i.telefon) d.phone = i.telefon;
  return d;
}

export function adaptorTawk(proprietate: string, widget: string, o: OptiuniAdaptor): AdaptorChat {
  const w = window as FereastraTawk;
  let deschisa = false;
  let necitite = 0;
  let incarcat = false;
  const api = () => w.Tawk_API;

  return {
    async incarca(identitate) {
      const a: TawkApi = (w.Tawk_API = w.Tawk_API ?? {});
      w.Tawk_LoadStart = new Date();
      /* Inainte ca widgetul sa fie desenat: ascuns de aici, butonul lor nu se vede nicio clipa. */
      a.onBeforeLoad = () => {
        if (o.ascundeButonulLor) faraSaArunce(() => a.hideWidget?.());
      };
      a.onLoad = () => {
        incarcat = true;
        if (o.ascundeButonulLor) faraSaArunce(() => a.hideWidget?.());
        if (identitate?.furnizor === "tawkto") faraSaArunce(() => a.login?.(dateleLui(identitate), nimic));
      };
      a.onChatMaximized = () => { deschisa = true; necitite = 0; o.laNecitite(0); o.laStare(true); };
      a.onChatMinimized = () => {
        deschisa = false;
        o.laStare(false);
        if (o.ascundeButonulLor) faraSaArunce(() => a.hideWidget?.());
      };
      a.onChatMessageAgent = () => {
        if (deschisa) return;
        necitite += 1;
        o.laNecitite(necitite);
      };

      await incarcaScript(`https://embed.tawk.to/${proprietate}/${widget}`, { charset: "UTF-8", crossorigin: "*" });
      await asteapta(() => incarcat);
    },

    deschide(mesaj) {
      faraSaArunce(() => { api()?.showWidget?.(); api()?.maximize?.(); });
      if (mesaj) faraSaArunce(() => api()?.setChatInputMessage?.(mesaj, nimic));
    },

    inchide() {
      faraSaArunce(() => api()?.minimize?.());
    },

    identifica(identitate) {
      if (identitate?.furnizor === "tawkto") faraSaArunce(() => api()?.login?.(dateleLui(identitate), nimic));
      else faraSaArunce(() => api()?.logout?.(nimic));
    },

    acord(functionale) {
      /* tawk.to nu are o comanda care sa-i stearga datele: widgetul se inchide si iese din pagina. */
      if (!functionale) {
        faraSaArunce(() => api()?.minimize?.());
        faraSaArunce(() => api()?.hideWidget?.());
        return;
      }
      if (!o.ascundeButonulLor) faraSaArunce(() => api()?.showWidget?.());
    },

    spuneContextul(pagina: ContextPagina | null, comanda: ContextComanda | null) {
      if (pagina) {
        const atribute: Record<string, string> = {};
        if (pagina.produs) {
          atribute.produs = pagina.produs.nume;
          if (pagina.produs.pret) atribute["pret-produs"] = pagina.produs.pret;
          if (pagina.produs.cod) atribute["cod-produs"] = pagina.produs.cod;
        }
        if (pagina.cos) atribute.cos = `${pagina.cos.produse} produse, ${pagina.cos.valoare}`;
        if (Object.keys(atribute).length > 0) faraSaArunce(() => api()?.setAttributes?.(atribute, nimic));
      }
      if (comanda && !comandaDejaSpusa("tawkto", comanda.numar)) {
        const date: Record<string, string> = { numar: comanda.numar };
        if (comanda.total) date.total = comanda.total;
        if (comanda.plata) date.plata = comanda.plata;
        faraSaArunce(() => api()?.addEvent?.("comanda-plasata", date, nimic));
        faraSaArunce(() => api()?.setAttributes?.({ "ultima-comanda": comanda.numar }, nimic));
      }
    },
  };
}
