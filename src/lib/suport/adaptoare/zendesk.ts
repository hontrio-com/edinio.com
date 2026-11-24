import type { ContextComanda, ContextPagina } from "../context-vitrina";
import type { IdentitateSemnata } from "../tipuri-chat";
import { asteapta, faraSaArunce, incarcaScript, type AdaptorChat, type OptiuniAdaptor } from "./tipuri";

/**
 * Zendesk, widgetul de MESAGERIE (developer.zendesk.com, „Web Widget > Core messaging Web Widget API”).
 *
 *   - scriptul: `https://static.zdassets.com/ekr/snippet.js?key=<cheia widgetului>`, cu `id="ze-snippet"`
 *     (asa il cauta codul lor);
 *   - ⚠ DUPA SCRIPT, `window.zE` E DOAR O COADA. Citit in scriptul lor (22.11.2026): pana porneste widgetul,
 *     `zE` aduna comenzile intr-o lista si le reda apoi, in ordine. Deci comenzile se pot da imediat (asa
 *     spune si documentatia la `hide`: „before or after page load”), dar „exista `zE`” NU inseamna „a pornit”;
 *   - gata: `zE("messenger:get", "config", f)`. `f` e chemata abia cand widgetul si-a primit configurarea
 *     („the callback is deferred until the configuration is received”). ⚠ Nu vine niciodata la o cheie
 *     stearsa, la un widget blocat de un filtru de reclame ori la „Web Widget (Classic)”, care nu cunoaste
 *     comanda. De aceea asteptarea are un termen, iar esecul ajunge la om („Chatul nu s-a putut deschide”),
 *     nu ramane un buton care nu face nimic;
 *   - limba: `zE("messenger:set", "locale", "ro")`;
 *   - cookie-uri: `zE("messenger:set", "cookies", "functional" | "all" | "none")`. Widgetul are trei trepte, iar
 *     noi i-o dam pe cea a acordului: fara analiza, ramane pe „functional” (fara „pagini vizitate”); cu acordul
 *     RETRAS, „none” il ascunde si ii sterge tot ce a pus in stocarea browserului;
 *   - `hide` scoate TOT widgetul (butonul lor si fereastra), `show` il pune la loc, `open` / `close` deschid
 *     si inchid fereastra. ⚠ Dupa `hide`, `open` singur nu arata nimic: intai `show`. Deci cu butonul
 *     nostru: ascuns in repaus, aratat si deschis la apasare, ascuns din nou la `close`;
 *   - necitite: `zE("messenger:on", "unreadMessages", f)`;
 *   - identitatea: `zE("messenger", "loginUser", cereJwt, raspuns)`. `cereJwt` e chemata de widget ori de
 *     cate ori are nevoie de un token nou, deci cere de fiecare data unul proaspat de la server;
 *   - contextul: `conversationMetadata` (fara pregatire in Admin Center) si `conversationTags`. Se aplica la
 *     urmatoarea conversatie sau la urmatorul mesaj, nu peste un tichet deja deschis.
 *
 * ⚠ FARA MESAJ PRECOMPLETAT. Widgetul nu are un camp de scris pe care sa-l putem umple; singura cale
 * (`behavior.messageLog.preConversation`) i-ar schimba comerciantului ecranul de inceput al conversatiei,
 * peste ce si-a reglat el in Zendesk. Comanda ajunge la operator prin `conversationMetadata`.
 *
 * ⚠ NUMAI WIDGETUL DE MESAGERIE. „Web Widget (Classic)”, de pe conturile vechi, are alte comenzi
 * (`zE("webWidget", …)`) si nu e sustinut: pagina din panou o spune, iar aici nu i se trimite nimic.
 */
type Ze = (...args: unknown[]) => void;
type FereastraZendesk = Window & { zE?: Ze };

/** Cat asteptam pornirea widgetului. Peste, spunem ca nu a pornit (vezi nota despre `messenger:get`). */
const ASTEPTARE_PORNIRE_MS = 12000;

export function adaptorZendesk(cheie: string, o: OptiuniAdaptor): AdaptorChat {
  const w = window as FereastraZendesk;
  const ze = (...args: unknown[]) => faraSaArunce(() => w.zE?.(...args));

  function autentifica() {
    ze(
      "messenger",
      "loginUser",
      (raspunde: (jwt: string) => void) => {
        void o.cereIdentitatea()
          .then((i) => { if (i?.furnizor === "zendesk" && i.jwt) raspunde(i.jwt); })
          .catch(() => { /* fara token nou, widgetul ramane cu sesiunea anonima */ });
      },
      () => { /* un login esuat lasa chatul anonim; nu e treaba cumparatorului */ },
    );
  }

  return {
    async incarca(identitate) {
      await incarcaScript(`https://static.zdassets.com/ekr/snippet.js?key=${cheie}`, { id: "ze-snippet" });
      await asteapta(() => typeof w.zE === "function");

      /* Date ACUM, in coada lor: widgetul le gaseste la pornire, deci butonul lui nu apuca sa apara. */
      ze("messenger:set", "locale", "ro");
      ze("messenger:set", "cookies", o.acordAnaliza ? "all" : "functional");
      if (o.ascundeButonulLor) ze("messenger", "hide");
      ze("messenger:on", "open", () => { o.laNecitite(0); o.laStare(true); });
      ze("messenger:on", "close", () => { o.laStare(false); if (o.ascundeButonulLor) ze("messenger", "hide"); });
      ze("messenger:on", "unreadMessages", (n: unknown) => { o.laNecitite(typeof n === "number" && n > 0 ? n : 0); });
      if (identitate?.furnizor === "zendesk") autentifica();

      let pornit = false;
      ze("messenger:get", "config", () => { pornit = true; });
      await asteapta(() => pornit, ASTEPTARE_PORNIRE_MS);
    },

    deschide() {
      ze("messenger", "show");
      ze("messenger", "open");
    },

    inchide() {
      ze("messenger", "close");
    },

    identifica(identitate: IdentitateSemnata | null) {
      if (identitate?.furnizor === "zendesk") autentifica();
      else ze("messenger", "logoutUser");
    },

    acord(functionale, analiza) {
      if (!functionale) {
        /* „none”: widgetul se ascunde singur si isi sterge tot ce a pus in stocarea browserului (documentatia lor). */
        ze("messenger", "close");
        ze("messenger:set", "cookies", "none");
        return;
      }
      ze("messenger:set", "cookies", analiza ? "all" : "functional");
      /* Dupa „none” widgetul ramane ascuns: cu butonul lor il aratam noi; cu al nostru, il arata `deschide`. */
      ze("messenger", o.ascundeButonulLor ? "hide" : "show");
    },

    spuneContextul(pagina: ContextPagina | null, comanda: ContextComanda | null) {
      const meta: Record<string, string | number> = {};
      if (pagina) {
        if (pagina.titlu) meta.pagina = pagina.titlu;
        if (pagina.produs) {
          meta.produs = pagina.produs.nume;
          if (pagina.produs.pret) meta.pret_produs = pagina.produs.pret;
          if (pagina.produs.cod) meta.cod_produs = pagina.produs.cod;
        }
        if (pagina.cos) meta.cos = `${pagina.cos.produse} produse, ${pagina.cos.valoare}`;
      }
      if (comanda) {
        meta.comanda = comanda.numar;
        if (comanda.total) meta.total_comanda = comanda.total;
        if (comanda.plata) meta.plata_comanda = comanda.plata;
      }
      if (Object.keys(meta).length > 0) ze("messenger:set", "conversationMetadata", meta);
      if (comanda) ze("messenger:set", "conversationTags", ["comanda-plasata"]);
    },
  };
}
