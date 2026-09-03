/*
  ═══════════════════════════════════════════════════════════════════════════════
  TEMEIUL COMUN AL ETICHETELOR GOOGLE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA. Din 02.09.2026 avem DOUA etichete Google pe acelasi site: GA4
  (categoria „statistici") si Google Ads (categoria „marketing"). Ele pot fi
  pornite SEPARAT — cine acorda marketing si refuza statistici are Ads si n-are
  GA4.

  Amandoua au nevoie de acelasi lucru inainte de orice: `dataLayer`, functia
  `gtag`, si starea de consimtamant declarata. Scris in fiecare componenta,
  lucrul asta s-ar fi facut de doua ori — iar `gtag('consent','default')` chemat
  a doua oara nu e o repetare nevinovata: Google il citeste O SINGURA DATA, la
  prima comanda care ar trimite ceva.

  ⚠ SI DE CE NU SE POATE BIZUI PE ORDINE. Cele doua `<Script>` sunt `afterInteractive`
  si n-au niciun contract intre ele — oricare poate rula primul, si asta se poate
  schimba de la o versiune de Next la alta. De aceea temeiul e scris ca sa
  lucreze la fel indiferent cine ajunge primul: cel dintai il pune, al doilea il
  gaseste pus si trece mai departe.
*/

export type StareEtichete = {
  /** Gazdele pe care are voie sa porneasca. */
  gazde: readonly string[];
  statistici: boolean;
  marketing: boolean;
  /**
   * Id-ul cu care se incarca biblioteca, daca temeiul se pune ACUM.
   *
   * ⚠ CONTEAZA MAI PUTIN DECAT PARE. `gtag.js` e o singura biblioteca; id-ul din
   * adresa spune doar ce se configureaza implicit. Restul se adauga cu `config`,
   * si de aceea a doua eticheta nu mai incarca nimic.
   */
  idIncarcare: string;
};

/**
 * Codul care pregateste `gtag`, o singura data pe pagina.
 *
 * ⚠ INTOARCE UN SIR CARE SE OPRESTE SINGUR pe gazdele straine. Poarta de gazda
 * ramane inauntru, nu in componenta: pe `localhost` si pe desfasurarile de
 * previzualizare nu trebuie sa plece nimic, iar componenta nu stie unde ruleaza.
 */
export function corpBazaGtag(s: StareEtichete): string {
  const gazde = JSON.stringify(s.gazde);
  const acordReclame = s.marketing ? "granted" : "denied";
  return `
        if (${gazde}.indexOf(location.hostname) === -1) return;

        window.dataLayer = window.dataLayer || [];
        if (!window.gtag) { window.gtag = function(){ dataLayer.push(arguments); }; }

        if (!window.__edinioGtagBaza) {
          window.__edinioGtagBaza = true;

          /*
            ═══ CONSENT MODE v2: 'default' TOT REFUZAT, APOI 'update' CU ADEVARUL ═══

            ⚠ ORDINEA E INAINTEA ORICAREI ALTE COMENZI gtag. Google citeste starea
            implicita la prima comanda care ar trimite ceva. Pusa dupa 'config',
            primul eveniment pleaca deja sub starea gresita, si nimic nu arata.

            ⚠ DE CE 'default' REFUZAT, cand aici stim deja ce a ales omul. Pana pe
            03.09.2026 se declara direct starea adevarata si nu se trimitea niciun
            'update'. Rezultatul era corect in date — semnalul ajungea la Google
            (masurat: gcs=G111) — dar gresit in doua feluri mai mici:

              1. wait_for_update: 500 astepta un 'update' care nu venea NICIODATA,
                 deci primul hit se retinea o jumatate de secunda degeaba, la
                 fiecare incarcare de pagina a fiecarui om care acordase.
              2. Uneltele de diagnostic ale Google (Tag Assistant) au un capitol
                 anume pentru „consimtamantul nu se actualizeaza". Cine deschidea
                 unealta vedea o abatere si nu avea cum sa stie daca e o scapare.

            Acum secventa e cea documentata: se pleaca de la refuz, se corecteaza
            pe loc cu ce a ales omul, si abia apoi 'js' si biblioteca. Nu se
            trimite nimic in plus si nimic mai devreme — eticheta asta se randeaza
            oricum numai DUPA ce omul a ales (model „basic").
          */
          gtag('consent', 'default', {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            wait_for_update: 500
          });

          gtag('consent', 'update', {
            analytics_storage: '${s.statistici ? "granted" : "denied"}',
            ad_storage: '${acordReclame}',
            ad_user_data: '${acordReclame}',
            ad_personalization: '${acordReclame}'
          });

          gtag('js', new Date());

          var s = document.createElement('script');
          s.async = true;
          s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(${JSON.stringify(s.idIncarcare)});
          document.head.appendChild(s);
        }
`;
}
