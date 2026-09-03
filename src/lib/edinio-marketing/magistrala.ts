/*
  ═══════════════════════════════════════════════════════════════════════════════
  MAGISTRALA: SINGURA USA PRIN CARE IESE O MASURATOARE
  ═══════════════════════════════════════════════════════════════════════════════

  Componenta cheama `urmareste({ name: "cta_click", … })`. Atat. Ce se intampla
  mai departe — catre ce furnizori pleaca, sub ce nume, cu ce parametri — se
  hotaraste AICI si in adaptoare.

  ⚠ DE CE NU CHEAMA COMPONENTELE DIRECT `gtag`. Trei motive, si fiecare s-a vazut
  in proiectul asta:
    1. adaugarea unui furnizor ar cere umblat in zeci de componente
    2. paza anti-PII ar trebui repetata la fiecare chemare, si s-ar uita
    3. o componenta care stie de `gtag` nu se poate proba fara un browser

  ⚠ SI NU DOBOARA NIMIC. Orice cade aici — un adaptor, o verificare, o eroare de
  retea — se opreste aici. O masuratoare stricata n-are voie sa strice pagina
  omului. Asta e regula pe care o incalca cel mai des sistemele de tracking.
*/

import type { EvenimentEdinio } from "./evenimente";
import { clasificaPagina, grupPagina, type FelPagina, type GrupPagina } from "./pagini";
import { verificaFaraPii, EroarePii } from "./fara-pii";
import { curataAdresa } from "./adresa-curata";
import { eDepanare, eProductieMarketing } from "./mediu";
import { citesteStarea } from "./consimtamant-browser";
import type { Categorie } from "./consimtamant/stare";

export type Adaptor = {
  nume: string;
  /*
    ⚠ SUB CE CATEGORIE STA FURNIZORUL — si de ce e camp, nu o lista undeva.

    Un camp obligatoriu pe tip inseamna ca un adaptor NOU nu se poate scrie fara
    sa raspunda la intrebarea „pe ce temei trimiti?". O lista tinuta deoparte in
    magistrala s-ar fi uitat exact la al cincilea furnizor, iar uitarea ar fi
    tacut: adaptorul ar fi mers, doar ca fara poarta.

    ⚠ SI NU E DERIVATA DIN NUME. „google-ads" pare marketing si „ga4" pare
    statistici, dar potrivirea dupa nume e o ghicitoare care se strica la prima
    redenumire — si s-ar strica in directia periculoasa: catre „trimite".
  */
  categorie: Categorie;
  /** Furnizorul e gata sa primeasca? Daca nu, evenimentul intra la coada. */
  gata: () => boolean;
  trimite: (ev: EvenimentEdinio, context: { page_type: FelPagina; page_group: GrupPagina }) => void;
};

const adaptoare: Adaptor[] = [];

export function inregistreazaAdaptor(a: Adaptor): void {
  if (!adaptoare.some(x => x.nume === a.nume)) adaptoare.push(a);
}

/* ── Coada ─────────────────────────────────────────────────────────────────

  ⚠ DE CE E NEVOIE DE EA. Eticheta Google se incarca `afterInteractive`. Un
  eveniment tras dintr-un efect la montare — `page_view`, `article_view` — se
  produce INAINTE ca `gtag` sa existe. Fara coada, el se pierde tacut: exact
  felul de defect care se vede abia peste o luna, cand cineva se intreaba de ce
  paginile au mai putine vizualizari decat sesiuni.

  ⚠ PLAFON, ca sa nu creasca la nesfarsit daca un furnizor nu se incarca niciodata.
*/
type LaCoada = { ev: EvenimentEdinio; context: { page_type: FelPagina; page_group: GrupPagina }; adaptor: string };
const coada: LaCoada[] = [];
const PLAFON_COADA = 50;

/**
 * Goleste coada pentru un adaptor care tocmai a devenit gata.
 *
 * ═══ ⚠ IN ORDINEA IN CARE S-AU INTAMPLAT, si asta e miezul ═══
 *
 * Prima forma parcurgea coada de la coada spre cap (`for i = length-1; i--`),
 * fiindca asa e simplu sa scoti elemente cu `splice` fara sa strici indicii.
 * Efectul: evenimentele plecau EXACT PE DOS.
 *
 * Pe pagina de intrare asta insemna ca `section_view` si `landing_view` ajungeau
 * in GA4 INAINTEA lui `page_view`-ul paginii lor. Nu cade nimic, nu lipseste
 * nimic — dar in rapoartele de parcurs pagina apare vizitata dupa ce omul a
 * derulat-o, iar secventele de evenimente devin de nefolosit.
 *
 * Deci: intai se scot toate ale adaptorului, in ordine, si abia apoi se trimit.
 */
/**
 * Are omul voie sa fie masurat de adaptorul asta, ACUM?
 *
 * ═══ ⚠ SE INTREABA LA FIECARE EVENIMENT, nu o data la incarcare ═══
 *
 * ⚠ CE APARA, MASURAT PE 03.09.2026. Magistrala nu stia nimic despre hotarare.
 * Poarta era numai la incarcarea etichetelor, si asta lasa DOUA gauri:
 *
 *   1. INAINTE de alegere, `gata()` era fals (niciun furnizor incarcat), deci
 *      evenimentele se puneau LA COADA. Cand omul apasa apoi „Accepta", coada se
 *      golea — si furnizorii primeau ce s-a intamplat CAT TIMP omul nu alesese
 *      inca. Consimtamantul se da inainte, nu se cumpara retroactiv.
 *
 *   2. DUPA retragere, `window.gtag` ramane in pagina — o functie incarcata nu se
 *      descarca. Deci `gata()` ramanea ADEVARAT, si evenimentele plecau mai
 *      departe catre un om care tocmai spusese nu. Asta pana la reincarcarea
 *      paginii, adica nedefinit de mult pe o aplicatie de o singura pagina.
 *
 * Amandoua se inchid punand intrebarea aici, la fiecare eveniment: singurul loc
 * prin care trec toate.
 *
 * ⚠ SI TACEREA INSEAMNA NU. `citesteStarea()` da `null` si cand nu s-a ales, si
 * cand cookie-ul e stricat, si cand s-a schimbat lista de scopuri. Toate trei duc
 * in aceeasi ramura: nu se trimite. Starea de plecare e „fara".
 */
function areVoie(a: Adaptor): boolean {
  return citesteStarea()?.[a.categorie] === true;
}

/* ── Evenimentele de STARE, retinute peste clipa acordului ─────────────────

  ═══ ⚠ DE CE EXISTA, SI CUM SE DEOSEBESTE DE RELUAREA PE CARE AM SCOS-O ═══

  Reparatia de ieri a inchis reluarea: ce s-a intamplat INAINTE de acord nu mai
  pleaca dupa el. Corect — dar a deschis o gaura pe cealalta parte.

  ⚠ MASURAT IN PRODUCTIE pe 03.09.2026: cu marketing acordat intai si statistici
  dupa, pe aceeasi pagina, GA4 se incarca (`__edinioGa4Pornit` adevarat) si nu
  primeste NICIUN `page_view` — singurul lui `page_view` fusese aruncat mai
  devreme, iar componentele nu se remonteaza.

  ⚠ SI CAT DE UMBLATA E CALEA, cinstit. Masuratoarea aia am facut-o pe `/preturi`
  DE MANA, dispecerizand din consola evenimentul care deschide panoul. Un om nu
  poate face asta: `deschideSetari()` n-are niciun apelant in tot repo-ul (numai
  definitia si un ascultator in banner), iar bannerul nu se mai arata dupa prima
  alegere. Singurul ecran pe care cineva poate acorda de doua ori FARA sa
  navigheze e `/cookies/setari`.

  ⚠ CE FACE REPARATIA SA MERITE TOTUSI. Pe `article_view` si `landing_view` calea
  e cea obisnuita, nu una de mana: omul deschide un articol sau o pagina de
  campanie, citeste bannerul acolo si accepta STAND in ea. Componentele sunt
  one-shot si nu se remonteaza, deci evenimentul se pierde definitiv — la fiecare
  vizitator nou care accepta pe pagina pe care a aterizat.

  ⚠ DEOSEBIREA CARE FACE TOTUL. Un eveniment de STARE spune „omul se afla ACUM
  aici" — e adevarat si in clipa acordului, deci se poate reafirma. O FAPTA
  („a apasat", „a derulat pana la 75%") s-a petrecut intr-un timp in care omul
  nu daduse voie, si nu are voie sa invie. De aceea lista de mai jos e SCURTA si
  inchisa: numai stari.

  ⚠ SI DE CE STA AICI, nu in cele trei componente. Ar fi fost trei reparatii
  aproape la fel, iar a patra componenta de stare, scrisa peste sase luni, ar fi
  fost uitata. Aici trece totul printr-un singur loc.
*/
const EVENIMENTE_DE_STARE: readonly string[] = ["page_view", "article_view", "landing_view"];

type Retinut = {
  ev: EvenimentEdinio;
  context: { page_type: FelPagina; page_group: GrupPagina };
  adaptor: string;
  /** Pe ce cale s-a petrecut. Vezi nota din `redeschide`. */
  cale: string;
};

/** Cheia e `adaptor:nume`, deci se pastreaza numai CEA MAI NOUA stare de fiecare fel. */
const retinute = new Map<string, Retinut>();

function caleaAcum(): string {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

/**
 * Omul tocmai a acordat ceva: se reafirma starile care fusesera aruncate.
 *
 * ⚠ SE CHEAMA LA ORICE SCHIMBARE de hotarare, nu doar la acordare. Pe retragere
 * nu se scurge nimic — niciun adaptor n-are voie, deci bucla nu trimite nimic.
 *
 * ⚠ SI NUMAI PE PAGINA UNDE S-A PETRECUT. Fara paza asta, cine deschide un
 * articol fara acord, pleaca la pagina de preturi si accepta acolo ar trimite un
 * `article_view` pentru un articol pe care nu-l mai citeste. Starea trebuie sa
 * fie adevarata in clipa in care o afirmi, altfel e tot o reluare.
 */
export function redeschide(): void {
  const cale = caleaAcum();

  for (const [cheie, r] of [...retinute]) {
    const a = adaptoare.find(x => x.nume === r.adaptor);
    if (!a) { retinute.delete(cheie); continue; }

    /* Inca fara voie: se pastreaza pentru cand si daca omul se razgandeste. */
    if (!areVoie(a)) continue;

    retinute.delete(cheie);
    if (r.cale !== cale) continue;

    try {
      if (a.gata()) { a.trimite(r.ev, r.context); continue; }
      if (coada.length >= PLAFON_COADA) coada.shift();
      coada.push({ ev: r.ev, context: r.context, adaptor: a.nume });
    } catch (e) {
      console.error(`[edinio-marketing] adaptorul ${a.nume} a cazut la reafirmare:`, e);
    }
  }
}

/** Scoate din coada tot ce astepta pentru un adaptor. */
function scoateDinCoada(numeAdaptor: string): LaCoada[] {
  const ale = coada.filter(x => x.adaptor === numeAdaptor);
  for (let i = coada.length - 1; i >= 0; i--) {
    if (coada[i].adaptor === numeAdaptor) coada.splice(i, 1);
  }
  return ale;
}

export function goleste(numeAdaptor: string): void {
  const a = adaptoare.find(x => x.nume === numeAdaptor);
  if (!a) return;

  /*
    ⚠ POARTA SE REVERIFICA LA GOLIRE. Intre clipa in care un eveniment a intrat la
    coada si clipa asta, omul poate sa-si fi schimbat hotararea. Coada nu e o
    promisiune de trimitere, e o asteptare — iar asteptarea nu supravietuieste
    unui „nu".
  */
  if (!areVoie(a)) { scoateDinCoada(numeAdaptor); return; }
  if (!a.gata()) return;

  /* Scoase din coada INAINTE de trimitere: daca un adaptor arunca, evenimentul
     lui nu ramane sa fie incercat la nesfarsit la fiecare golire. */
  const ale = scoateDinCoada(numeAdaptor);
  if (ale.length === 0) return;

  for (const item of ale) {
    try { a.trimite(item.ev, item.context); } catch { /* vezi nota de sus */ }
  }
}

function contextul(): { page_type: FelPagina; page_group: GrupPagina } {
  const cale = typeof window === "undefined" ? null : window.location.pathname;
  const fel = clasificaPagina(cale);
  return { page_type: fel, page_group: grupPagina(fel) };
}

/**
 * Trimite un eveniment catre toti adaptorii care il vor.
 *
 * ⚠ VERIFICAREA ANTI-PII SE FACE O SINGURA DATA, AICI, inainte de orice adaptor.
 * In afara productiei ARUNCA — ca greseala sa fie vazuta de cine o scrie. In
 * productie se lasa balta si se scrie in consola: o masuratoare stricata n-are
 * voie sa doboare pagina.
 */
export function urmareste(ev: EvenimentEdinio): void {
  if (typeof window === "undefined") return;

  const { name, ...parametri } = ev;

  /*
    ═══ ⚠ ADRESA SE CURATA INAINTE DE PAZA, NU DUPA ═══

    Paza PII arunca orice valoare mai lunga de 100 de caractere, iar cand arunca
    se pierde evenimentul pentru TOTI adaptorii (`return`, nu `continue`).

    ⚠ MASURAT IN PRODUCTIE pe 03.09.2026: cu o adresa de reclama de 177 de
    caractere (`utm_*` + `gclid`), `page_view`-ul NOSTRU nu ajungea la GA4.
    Recunoscut dupa parametrii pe care numai el ii poarta — `page_type` si
    `page_group`: niciun `page_view` cu adresa peste 100 de caractere nu-i avea.

    ⚠ SI DE CE N-A VAZUT NIMENI. GA4 trage SINGUR un `page_view` la schimbarea de
    istoric, daca „Enhanced measurement" e pornit. Rapoartele aratau deci
    `page_view`-uri — doar ca nu ale noastre, si fara adresa curatata. Defectul
    lovea exact traficul platit, adica tocmai ce se masoara cel mai atent.

    Curatarea exista de mult, dar traia in adaptorul GA4 — adica STRUCTURAL dupa
    paza. Aici e inaintea ei, si foloseste toti adaptorii.
  */
  const camp = parametri as Record<string, unknown>;
  for (const cheieAdresa of ["page_location", "page_referrer"]) {
    const v = camp[cheieAdresa];
    if (typeof v === "string") camp[cheieAdresa] = curataAdresa(v);
  }

  try {
    verificaFaraPii(name, parametri as Record<string, unknown>);
  } catch (e) {
    if (e instanceof EroarePii && eProductieMarketing()) {
      console.error("[edinio-marketing] eveniment oprit:", e.message);
      return;
    }
    throw e;
  }

  const context = contextul();
  if (eDepanare()) console.info("[edinio-marketing]", name, { ...parametri, ...context });

  /*
    ⚠ SI ADAPTOARELE PRIMESC VERSIUNEA CURATATA. Pana acum primeau `ev` brut, iar
    fiecare se curata singur — GA4 o facea, Meta si TikTok nu. Deci adresa cu
    `gclid` ajungea intreaga la doi din patru furnizori.
  */
  const evCurat = { name, ...parametri } as EvenimentEdinio;

  for (const a of adaptoare) {
    try {
      /*
        ⚠ FARA VOIE NU SE TRIMITE SI NICI NU SE ASTEAPTA. A doua parte e miezul:
        daca s-ar pune la coada „pentru mai tarziu", atunci un „Accepta" de peste
        zece secunde ar trimite tot ce s-a intamplat inainte de el.
      */
      if (!areVoie(a)) {
        scoateDinCoada(a.nume);
        /*
          ⚠ STARILE SE RETIN, FAPTELE NU. Vezi nota de la `EVENIMENTE_DE_STARE`:
          „omul e pe pagina asta" ramane adevarat si daca acorda peste zece
          secunde; „omul a apasat butonul" nu are voie sa invie.
        */
        if (EVENIMENTE_DE_STARE.includes(name)) {
          retinute.set(`${a.nume}:${name}`, { ev: evCurat, context, adaptor: a.nume, cale: caleaAcum() });
        }
        continue;
      }
      if (a.gata()) { a.trimite(evCurat, context); continue; }
      if (coada.length >= PLAFON_COADA) coada.shift();
      coada.push({ ev: evCurat, context, adaptor: a.nume });
    } catch (e) {
      /* ⚠ Un adaptor cazut nu-i opreste pe ceilalti, si nu opreste pagina. */
      console.error(`[edinio-marketing] adaptorul ${a.nume} a cazut:`, e);
    }
  }
}

/** Numai pentru probe: sterge starea dintre ele. */
export function resetPentruProbe(): void {
  adaptoare.length = 0;
  coada.length = 0;
  retinute.clear();
}

/** Numai pentru probe: cate stari asteapta reafirmarea. */
export function lungimeRetinute(): number {
  return retinute.size;
}

/** Numai pentru probe: cate evenimente asteapta. */
export function lungimeCoada(): number {
  return coada.length;
}
