import { CONSENT_VERSION } from "@/lib/cookie-consent";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ETICHETA GOOGLE A MAGAZINULUI: CAND PORNESTE SI CE SPUNE                (25.11.2026)
  ═══════════════════════════════════════════════════════════════════════════════

  ═══ CE S-A INTAMPLAT ═══

  Un comerciant (eSAFE) si-a pus ID-ul de conversie Google Ads in panou, corect, si a
  vrut sa porneasca o campanie. Google Ads i-a spus ca eticheta Google LIPSESTE de pe
  site. Masurat pe pagina lui publica: ID-urile erau in datele paginii, dar nicio cerere
  spre `googletagmanager.com` nu pleca.

  Cauza: eticheta se incarca abia DUPA ce vizitatorul accepta cookie-urile (consent mode
  „de baza”: componenta statea in `ConsentGate`). Google isi judeca detectarea dupa
  semnalele primite de la eticheta, din browsere adevarate; in modul de baza nu pleaca
  nimic pana la acord („not even the default consent status”), deci un magazin nou sau cu
  trafic mic, ori un comerciant care isi verifica singur magazinul fara sa accepte
  bannerul, arata ca un site fara eticheta.

  ═══ CE FACE ACUM: DOUA PURTARI, DUPA CE ARE MAGAZINUL ═══

  1. Magazinul are Google ADS (`AW-…`) si n-a oprit optiunea din Setari > Banner Cookies:
     eticheta de RECLAME porneste la orice vizita, cu toate cele patru semnale consent mode
     pe „denied” (consent mode avansat). Cat sunt refuzate, eticheta nu scrie si nu citeste
     cookie-uri; trimite doar semnalul ca pagina o are, fara identificatori. Atat cat sa o
     gaseasca Google Ads.

     ⚠ PANA LA ACORD PLEACA NUMAI ATAT. Dinadins, mai putin decat ar permite modul avansat:
       - eticheta de ANALYTICS (`G-…`) nu se configureaza pana la acord, ca inainte;
       - EVENIMENTELE (produs vazut, cos, comanda, conversie) asteapta acordul in coada din
         `lib/marketing.ts`, ca inainte: numarul si valoarea comenzii nu pleaca de la cine a
         refuzat;
       - `ads_data_redaction`: identificatorii de clic (gclid) se sterg din cereri, iar ele
         merg pe domeniul fara cookie-uri;
       - ⚠ NUMAI PE O ADRESA CURATA. Semnalul poarta adresa paginii si pe cea a paginii de
         unde vine omul. Pagina de confirmare are in adresa numarul comenzii, numele
         clientului si totalul (`/confirm?orderId=…&name=…&total=…`), iar `/retur?order=…`
         numarul comenzii: gasit la recenzie, inainte de publicare. Deci, fara acord, eticheta
         NU porneste pe paginile de comanda si nici pe o adresa cu alti parametri decat cei de
         campanie (`utm_*`, identificatorii de clic ai Google, `gtm_debug`). Aceeasi judecata
         pentru pagina de unde vine, cand e a magazinului, unde se adauga si zona de cont
         (`/cont/comenzi/<id>`): din ea se iese printr-o incarcare completa, deci adresa ei
         ar pleca drept pagina de provenienta. Cu acord porneste peste tot, ca inainte, deci
         conversia cumparatorului care a acceptat nu se pierde.
         ⚠ ADRESA SE JUDECA DE DOUA ORI: la citirea paginii si din nou cand SOSESTE biblioteca,
         iar `config`-ul de dinainte de acord pleaca abia atunci. Biblioteca isi citeste adresa
         cand construieste semnalul, nu cand primeste comanda: pusa in `dataLayer` de la inceput,
         comanda ar fi dus cu ea si ce s-a schimbat intre timp in adresa fara reincarcare (un
         cuvant scris in cautarea din catalog, un filtru). Daca adresa nu mai e curata la sosire,
         nu pleaca nimic pana la acord. Biblioteca incarcata fara `config` nu trimite nimic.
       - ANALYTICS E OPRIT DE TOT (`window['ga-disable-G-…']`). Un comerciant isi poate COMBINA
         etichetele in contul lui Google: atunci eticheta de reclame poarta si destinatia de
         Analytics, iar `config AW-…` ar trimite semnale fara cookie-uri si spre ea, fara niciun
         `config G-…` de la noi. Comutatorul din documentatia Google opreste Analytics sa trimita
         orice, pentru ID-urile de Analytics pe care magazinul le are in panou; se ridica la
         acord si se pune la loc la retragere. O destinatie pe care comerciantul n-a trecut-o in
         panou nu o putem opri: e spus in ghidul lui.
     Incarcarea unei etichete inainte de acord e recomandata de Google si e o zona fara
     hotarare de autoritate in UE; de aceea ce pleaca e tinut la minimum, iar comerciantul
     (operatorul datelor) o poate opri.

  2. Orice alt caz (numai Analytics, sau optiunea oprita): NIMIC pana la acord, ca inainte.
     Scriptul se opreste fara sa porneasca; il porneste jumatatea din browser (`GoogleTag`)
     cand omul raspunde.

  ⚠ ORDINEA COMENZILOR E CEA DIN DOCUMENTATIE, si conteaza:
    1. `consent default` cu tot refuzat, INAINTEA oricarei alte comenzi;
    2. `consent update` cu ce a ales omul la o vizita de dinainte, daca a ales;
    3. `ads_data_redaction`;
    4. abia apoi `js` si `config`.
  Pusa dupa `config`, starea implicita ajunge prea tarziu: primul semnal pleaca fara ea.
  Cu acord, `config` pleaca pe loc, ca in fragmentul oficial. Fara acord, `config`-ul etichetei
  de reclame pleaca la sosirea bibliotecii (vezi „adresa se judeca de doua ori”, mai sus): tot
  dupa primele trei, iar pentru biblioteca e acelasi lucru, comenzile se pot da oricand.

  ⚠ CU BANNERUL OPRIT din panou nu raspunde nimeni, deci totul pleaca „granted”, ca inainte
  (comerciantul si-a asumat asta in Setari > Banner Cookies).

  ⚠ FARA NUMELE MAGAZINULUI nu avem de unde citi raspunsul omului: ramane totul refuzat.
  O eticheta fara stare implicita se poarta ca si cum ar avea acordul, iar una care poate
  porni inainte de raspuns nu are voie sa cada pe „acordat”.

  ═══ UNDE SE SCRIE, SI UNDE NU PORNESTE ═══

  Scriptul e scris de SERVER direct in pagina (layoutul vitrinei), nu adaugat de browser dupa
  hidratare: ruleaza la citirea paginii, ca fragmentul oficial, si isi cere singur biblioteca.
  Tag Assistant spune pe nume ca o eticheta „incarcata dupa clipa in care incearca sa se lege
  de pagina” poate ramane negasita.

  ⚠ De aceea nu poate sta sub `DoarInMagazinReal` si `DoarInAfaraContului`: acelea sunt
  componente de client si pe server nu deseneaza nimic. Cele doua reguli ale lor stau IN
  script, citite din adresa:
    - nu porneste in previzualizarea din editor (`?preview=1`): fiecare salvare ar trimite o
      vizita care n-a existat;
    - nu porneste in zona de cont a cumparatorului (`/cont…`): adresa de acolo poarta
      identificatorul comenzii. In zona de cont se intra si se iese printr-o incarcare completa
      (`ActiuneCont` si legaturile din ecranele contului folosesc `<a>`, nu `<Link>`), deci
      regula se judeca la fiecare trecere. Iar un document incarcat in zona de cont nu mai
      primeste jumatatea din browser deloc (`DoarInAfaraContului niciDupaIesire`).

  ⚠ O SINGURA PORNIRE PE PAGINA (`__edinioEtichetaGoogle`). Jumatatea din browser (`GoogleTag`,
  prin `legatura.ts`) ruleaza acelasi script cand omul raspunde bannerului si eticheta n-a
  pornit inca.

  ⚠ `window.gtag` NU E LA VEDERE PANA LA ACORD. Scriptul isi trimite comenzile printr-o functie a lui;
  biblioteca Google citeste `dataLayer`, nu `window.gtag`. Pusa la vedere inainte de acord, functia ar fi
  putut fi chemata direct de un script strain (chatul cu integrarea lui de Analytics, de pilda), pe langa
  coada de evenimente. Apare cand omul accepta analiza sau marketingul si dispare la retragere.

  ⚠ `window.__edinioAcordGoogle` tine, pentru restul codului, ce a acordat omul:
    - coada de evenimente (`lib/marketing.ts`) nu trimite nimic fara acordul pentru analiza
      sau pentru marketing;
    - datele clientului (enhanced conversions) cer acordul de MARKETING: `gtagDateleClientului`.
  `window.__edinioGoogleRaspuns(analiza, marketing)` duce raspunsul din banner la eticheta
  pornita: `consent update`, restul ID-urilor, apoi coada.

  Modul PUR: intoarce textul scriptului. Probele il RULEAZA (`corp.test.ts`), cu o fereastra
  falsa, si se uita la ce ajunge in `dataLayer` si in ce ordine.
*/

/** Numele sub care pagina tine acordul pentru eticheta Google (`window.__edinioAcordGoogle`). */
export const CHEIE_ACORD_GOOGLE = "__edinioAcordGoogle";

/** Semnul ca eticheta a pornit deja pe pagina asta (`window.__edinioEtichetaGoogle`). */
export const CHEIE_PORNIRE = "__edinioEtichetaGoogle";

/** Functia prin care raspunsul din banner ajunge la eticheta pornita (`window.__edinioGoogleRaspuns`). */
export const CHEIE_RASPUNS = "__edinioGoogleRaspuns";

/** De unde se cere biblioteca Google. */
export const ADRESA_BIBLIOTECII = "https://www.googletagmanager.com/gtag/js";

/**
 * Singurii parametri de adresa cu care eticheta de reclame mai porneste INAINTE de acord: cei de campanie
 * (`utm_*`), identificatorii de clic ai Google (pe care `ads_data_redaction` ii sterge din cereri) si
 * `gtm_debug`, pus de Tag Assistant. Orice alt parametru (numarul comenzii, un nume, un email, un cuvant
 * cautat, identificatorul de clic al altei retele) opreste pornirea de dinainte de acord: semnalul ar duce
 * adresa intreaga la Google.
 *
 * ⚠ E textul unei expresii regulate scrise in script: fara bare inverse, ca sa nu se piarda pe drum.
 */
export const PARAMETRI_DE_CAMPANIE = "/^(utm_[a-z0-9_]+|gclid|gclsrc|gbraid|wbraid|dclid|gad_source|gad_campaignid|gtm_debug)$/";

/* Valorile ajung intr-un script scris in pagina: se pastreaza numai caracterele unui ID. */
const doarId = (v: string | null | undefined) => (v ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "");
const doarSlug = (v: string | null | undefined) => (v ?? "").replace(/[^a-zA-Z0-9-]/g, "");

/**
 * Numai ID-urile pe care Google le tine la etichetele Google: `G-` (Analytics), `AW-` (reclame), `GT-`.
 *
 * ⚠ UN `GTM-` NU TRECE. Salvarea din panou il refuza, dar comerciantul isi poate scrie randul direct in baza.
 * Biblioteca incarcata cu un ID `GTM-` e un container intreg, in care ruleaza orice script; prin `gtag/js` s-ar
 * fi incarcat la fel.
 */
const ID_DE_ETICHETA = /^(G|AW|GT)-[A-Z0-9]{4,20}$/i;

/** ID-urile curate, fara dubluri, fara goluri si fara ce nu e ID de eticheta Google, in ordinea primita. */
export function iduriCurate(tagIds: readonly (string | null | undefined)[]): string[] {
  return [...new Set(tagIds.map(doarId).filter((id) => ID_DE_ETICHETA.test(id)))];
}

export interface CorpEticheta {
  /** ID-ul din adresa bibliotecii (`gtag/js?id=`): cel de reclame cand exista, altfel primul din lista. */
  idIncarcare: string;
  /** Eticheta de reclame porneste si fara raspuns la banner (consent mode avansat). */
  inainteDeAcord: boolean;
  /** Scriptul care pregateste `gtag`, declara consimtamantul si configureaza ID-urile. */
  script: string;
}

/**
 * Scriptul de pornire al etichetei Google pentru un magazin, sau `null` cand magazinul n-are niciun ID.
 *
 * @param cuBanner Magazinul are bannerul de cookie-uri pornit. Fara el, toate semnalele pleaca „granted”.
 * @param adsInainteDeAcord Optiunea comerciantului din Setari > Banner Cookies. Are efect numai cu banner si
 *   numai cand magazinul are un ID de reclame (`adsId`).
 */
export function corpEticheteiGoogle(p: {
  tagIds: readonly (string | null | undefined)[];
  slug?: string | null;
  cuBanner: boolean;
  /** ID-ul de conversie Google Ads (`AW-…`): eticheta de reclame si remarketingul dinamic din `gtagEvent`. */
  adsId?: string | null;
  adsInainteDeAcord?: boolean;
}): CorpEticheta | null {
  /* Eticheta de reclame e numai un `AW-`: ea e cea care poate porni inainte de acord. */
  const adsBrut = doarId(p.adsId);
  const ads = /^AW-[A-Z0-9]{4,20}$/i.test(adsBrut) ? adsBrut : "";
  /* ID-ul de reclame intai: el e cel configurat inainte de acord si cel cu care se cere biblioteca. */
  const ids = iduriCurate([ads, ...p.tagIds]);
  if (ids.length === 0) return null;
  const slug = doarSlug(p.slug);
  const inainteDeAcord = p.cuBanner && p.adsInainteDeAcord === true && ads !== "";
  const lista = (v: readonly string[]) => v.map((id) => `'${id}'`).join(", ");

  /* Zona de cont, ca in `eZonaDeCont`: `/cont` pe domeniul propriu, `/{slug}/cont` pe gazda platformei. */
  const zoneDeCont = lista(["/cont", ...(slug ? [`/${slug}/cont`] : [])]);

  /* Paginile de comanda: adresa lor poarta numarul comenzii si, la confirmare, numele clientului si totalul. */
  const paginiDeComanda = lista(["/confirm", "/retur", ...(slug ? [`/${slug}/confirm`, `/${slug}/retur`] : [])]);

  /*
   * ID-urile de Analytics ale magazinului: tot ce nu e eticheta de reclame. Cat omul n-a acordat nimic, fiecare
   * primeste `window['ga-disable-<ID>'] = true`, comutatorul din documentatia Google („turns off the Google tag
   * from sending data”; se verifica la fiecare incercare de a scrie un cookie sau de a trimite ceva, iar pe
   * `false` „Analytics will work as usual”). ⚠ Numai comutatoarele puse de noi se ridica la acord: unul pus de
   * altcineva (un refuz al omului, tinut de alt cod) ramane cum l-am gasit.
   */
  const analize = ids.filter((id) => !/^AW-/i.test(id));
  const oprireaAnalizei = analize.length > 0
    ? `var analize = [${lista(analize)}], oprite = {};
          function masoara(da) {
            for (var q = 0; q < analize.length; q++) {
              var cheie = 'ga-disable-' + analize[q];
              if (!da) { if (w[cheie] !== true) { w[cheie] = true; oprite[cheie] = 1; } }
              else if (oprite[cheie]) { w[cheie] = false; oprite[cheie] = 0; }
            }
          }`
    : "function masoara() {}";

  /* Ce a ales omul la o vizita de dinainte. Fara banner: totul acordat. Cu banner si fara raspuns: nimic. */
  const citireaAcordului = !p.cuBanner
    ? "analiza = true; reclame = true;"
    : slug
      ? `try {
            var c = JSON.parse(w.localStorage.getItem('edinio_cc_${slug}') || 'null');
            if (c && c.v === ${CONSENT_VERSION}) { analiza = !!c.analytics; reclame = !!c.marketing; }
          } catch (e) {}`
      : "";

  const semnale = `{
              analytics_storage: a ? 'granted' : 'denied',
              ad_storage: m ? 'granted' : 'denied',
              ad_user_data: m ? 'granted' : 'denied',
              ad_personalization: m ? 'granted' : 'denied'
            }`;

  const consimtamant = p.cuBanner
    ? `gtag('consent', 'default', {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied'
          });
          if (!faraAcord) spune(analiza, reclame);
          gtag('set', 'ads_data_redaction', true);`
    : `gtag('consent', 'default', {
            analytics_storage: 'granted',
            ad_storage: 'granted',
            ad_user_data: 'granted',
            ad_personalization: 'granted'
          });`;

  const script = `
        (function () {
          var w = window;
          if (w.${CHEIE_PORNIRE}) return;
          try {
            if (new URLSearchParams(w.location.search).get('preview') === '1') return;
            var cale = w.location.pathname, zone = [${zoneDeCont}];
            for (var i = 0; i < zone.length; i++) {
              if (cale === zone[i] || cale.indexOf(zone[i] + '/') === 0) return;
            }
          } catch (e) { return; }
          var analiza = false, reclame = false;
          ${citireaAcordului}
          var faraAcord = !(analiza || reclame);
          ${inainteDeAcord ? `var adresaCurata = false;
          try {
            var comanda = [${paginiDeComanda}].concat(zone), permis = ${PARAMETRI_DE_CAMPANIE};
            var curata = function (drum, cautare) {
              for (var j = 0; j < comanda.length; j++) {
                if (drum === comanda[j] || drum.indexOf(comanda[j] + '/') === 0) return false;
              }
              var bine = true;
              new URLSearchParams(cautare).forEach(function (valoare, cheie) { if (!permis.test(cheie)) bine = false; });
              return bine;
            };
            adresaCurata = curata(w.location.pathname, w.location.search);
            var deUnde = w.document.referrer;
            if (adresaCurata && deUnde) {
              var u = new URL(deUnde);
              if (u.origin === w.location.origin) adresaCurata = curata(u.pathname, u.search);
            }
          } catch (e) { adresaCurata = false; }
          if (faraAcord && !adresaCurata) return;` : "if (faraAcord) return;"}
          w.${CHEIE_PORNIRE} = true;
          ${ads ? `w.__edinioGoogleAds = { id: '${ads}' };` : ""}
          w.dataLayer = w.dataLayer || [];
          var gtag = function () { w.dataLayer.push(arguments); };
          function arata(da) {
            if (da) { if (typeof w.gtag !== 'function') w.gtag = gtag; }
            else if (w.gtag === gtag) { w.gtag = undefined; }
          }
          ${oprireaAnalizei}
          function spune(a, m) {
            gtag('consent', 'update', ${semnale});
          }
          if (faraAcord) masoara(false);
          w.${CHEIE_ACORD_GOOGLE} = { analytics: analiza, marketing: reclame };
          ${consimtamant}
          gtag('js', new Date());
          var facute = {};
          function configureaza(iduri) {
            for (var k = 0; k < iduri.length; k++) {
              if (!facute[iduri[k]]) { facute[iduri[k]] = 1; gtag('config', iduri[k]); }
            }
          }
          if (!faraAcord) configureaza([${lista(ids)}]);
          w.${CHEIE_RASPUNS} = function (a, m) {
            a = !!a; m = !!m;
            w.${CHEIE_ACORD_GOOGLE} = { analytics: a, marketing: m };
            masoara(a || m);
            spune(a, m);
            arata(a || m);
            if (a || m) {
              configureaza([${lista(ids)}]);
              if (w.__edinioFlushQueue) w.__edinioFlushQueue('ga');
            }
          };
          arata(!faraAcord);
          if (!faraAcord && w.__edinioFlushQueue) w.__edinioFlushQueue('ga');
          var s = w.document.createElement('script');
          s.async = true;
          s.src = '${ADRESA_BIBLIOTECII}?id=${ids[0]}';
          ${inainteDeAcord ? `if (faraAcord) s.onload = function () {
            try { if (curata(w.location.pathname, w.location.search)) configureaza(['${ads}']); } catch (e) {}
          };` : ""}
          w.document.head.appendChild(s);
        })();
      `;

  return { idIncarcare: ids[0], inainteDeAcord, script };
}
