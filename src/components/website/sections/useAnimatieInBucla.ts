"use client";

import { useEffect, type RefObject } from "react";
import { cadrePista, urmatorulMoment, type Pista } from "@/lib/website/animatie-bucla";

/**
 * Partea de DOM a machetelor animate din „Soluția” (`MagazinAnimat`, `IntegrariAnimat`): pornește
 * bucla, o oprește când nu se vede și scrie ce nu poate rula pe compozitor. Pistele și cronologia
 * sunt pure, în `lib/website/` (`animatie-bucla.ts` și câte un fișier pe machetă).
 *
 * ═══ CUM PORNEȘTE, CA SĂ NU SE SIMTĂ ═══
 *
 * 1. Din HTML vine CADRUL STATIC: clipa `pornireS` a buclei. E și ce vede cine n-are JavaScript, și
 *    ce rămâne dacă browserul n-are Web Animations. Locul e rezervat de casetă, deci nimic nu sare.
 * 2. Când cardul se APROPIE de ecran (1000 px înainte) se cheamă `pregateste`: imaginile se descarcă
 *    și se DECODEAZĂ înainte de pornire, altfel ar clipi goale prima dată când apar. Cu plasă: după
 *    4 s pornește oricum, ca o cerere înțepenită să nu țină cardul pe cadrul static la nesfârșit.
 * 3. Cadrele-cheie și animațiile se fac în timpul liber al browserului (`requestIdleCallback`), câte
 *    o bucată de cel mult ~4 ms. Măsurat la recenzie: dintr-o bucată, pregătirea cardului cu
 *    integrări era o sarcină de 64-68 ms pe un telefon încetinit de 4 ori, adică patru cadre
 *    pierdute dacă nimerea în timpul derulării.
 *
 * ═══ CÂND SE OPREȘTE ═══
 *
 * Animațiile stau pe loc când cardul iese din ecran, când îl ACOPERĂ cardul următor din teanc și
 * când fila e în fundal. Acoperirea nu o vede un `IntersectionObserver`: pe desktop cardul e lipit
 * sus și rămâne geometric pe ecran, sub cel care urcă peste el. O anunță `FeatureStack`, prin
 * `data-acoperit` pe card. La întoarcere bucla continuă de unde a rămas; după o pauză mai lungă de
 * 2,5 s o ia de la capăt, ca povestea să se vadă întreagă.
 *
 * Cât rulează, rădăcina are `data-ruleaza`: de el ascultă luminile din fundal, care sunt animații
 * CSS (vezi `animatii-carduri.css`). ⚠ MĂSURAT pe pagina de start, nu din prudență: cele două
 * lumini ale primului card, lăsate pornite sub al doilea (un card acoperit primește
 * `visibility: hidden`), țineau pagina la 130 de recalculări de stil pe secundă și ~140 ms de lucru
 * din fiecare secundă, pe desktop, fără încetinire; oprite, zero. Într-o pagină de probă mică, fără
 * nimic altceva care să ceară cadre, efectul nu s-a reprodus, deci mecanismul exact nu e dovedit.
 * Măsurătoarea pe pagina adevărată, da.
 *
 * `prefers-reduced-motion`: niciun cadru nu se mișcă; rămâne clipa `staticS`. Dacă omul o oprește
 * cât e pe pagină, macheta se pregătește din nou (sub ea poate fi pregătit doar cadrul static).
 */
export interface Bucla {
  /** Atributul care numește țintele pistelor: `emx` le caută după `data-emx`. */
  atribut: string;
  /** Lungimea buclei, în secunde. */
  buclaS: number;
  piste: readonly Pista[];
  /** Clipele în care se schimbă partea scrisă din JavaScript, în ordine. */
  momente: readonly number[];
  /**
   * Pregătește, o singură dată, cine scrie partea discretă (texte, clase) pe DOM-ul cardului. Ce
   * întoarce se cheamă la fiecare clipă din `momente`, cu secunda din buclă și a câta buclă e.
   */
  scriitor: (radacina: HTMLElement, elemente: ReadonlyMap<string, HTMLElement>) => (t: number, iteratie: number) => void;
  /**
   * Ce trebuie să fie gata înainte de pornire (imaginile). Se poate chema de mai multe ori: sub
   * „mișcare redusă” poate pregăti doar cadrul static, iar dacă omul oprește setarea, se cheamă iar.
   */
  pregateste?: (radacina: HTMLElement, scena: HTMLElement) => Promise<unknown>;
  /** Clipa pe care o arată HTML-ul: de aici pornește bucla prima oară și după o pauză lungă. */
  pornireS: number;
  /** Cadrul static pentru „mișcare redusă”. */
  staticS: number;
  /**
   * Rezerva pentru browserele fără funcții trigonometrice în CSS (Safari sub 15.4): ce trebuie
   * scris din JavaScript la fiecare lățime a scenei. Lipsește când macheta nu le folosește.
   */
  faraTrig?: (scena: HTMLElement, latime: number) => void;
}

/** Peste atâta pauză, la întoarcere bucla o ia de la capăt. */
const DE_LA_CAPAT_DUPA_MS = 2500;
/** Cât de devreme se pregătește, înainte să intre cardul în ecran. */
const PREGATIRE_DE_LA = "1000px 0px";
/** Cât se așteaptă imaginile, cel mult: după atât, bucla pornește oricum. */
const PREGATIRE_CEL_MULT_MS = 4000;
/** Cât lucrează, cel mult, o bucată din construcția animațiilor. */
const BUCATA_MS = 4;

type Ragaz = { didTimeout: boolean; timeRemaining: () => number };
/** O funcție chemată în timpul liber al browserului (sau imediat după, unde nu există). */
function laRagaz(f: (ragaz?: Ragaz) => void): void {
  const liber = (window as Window & { requestIdleCallback?: (cb: (r: Ragaz) => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (liber) liber(f, { timeout: 800 });
  else window.setTimeout(() => f(), 0);
}

/**
 * ⚠ `bucla` trebuie să fie o constantă de modul: efectul rulează o dată pe ea și n-o mai citește.
 */
export function useAnimatieInBucla(radacina: RefObject<HTMLElement | null>, bucla: Bucla): void {
  useEffect(() => {
    const root = radacina.current;
    const scenaGasita = root?.querySelector<HTMLElement>(".anim-scena");
    if (!root || !scenaGasita) return;
    /* Fixate după verificare: funcțiile de mai jos nu moștenesc îngustarea de tip. */
    const scena: HTMLElement = scenaGasita;
    const radacinaSigura: HTMLElement = root;
    const buclaMs = bucla.buclaS * 1000;

    let anulat = false;
    const card = root.closest<HTMLElement>("[data-feature-card]");
    const miscareRedusa = window.matchMedia("(prefers-reduced-motion: reduce)");

    /* ─── Rezervele pentru browserele vechi ─────────────────────────────────
       Fără interogări de container (Safari sub 16), `cqw` nu există: scena și unitatea `--u` se
       scriu în pixeli. Fără funcții trigonometrice în CSS (Safari sub 15.4), ce socotea foaia de
       stil cu ele o scrie macheta (`faraTrig`). Pe un browser de azi, niciuna nu rulează. */
    const faraContainer = !CSS.supports("width", "1cqw");
    const faraTrig = bucla.faraTrig !== undefined && !CSS.supports("transform", "scale(tan(atan2(1px, 2px)))");
    let urmaritorMarime: ResizeObserver | null = null;
    if (faraContainer || faraTrig) {
      const aplicaGeometria = () => {
        let latime = scena.offsetWidth;
        if (faraContainer) {
          latime = Math.min(radacinaSigura.clientWidth, (radacinaSigura.clientHeight * 4) / 3);
          scena.style.width = `${latime}px`;
          scena.style.setProperty("--u", `${latime / 100}px`);
        }
        if (faraTrig) bucla.faraTrig?.(scena, latime);
      };
      aplicaGeometria();
      if (typeof ResizeObserver !== "undefined") {
        urmaritorMarime = new ResizeObserver(aplicaGeometria);
        urmaritorMarime.observe(root);
      }
    }

    const atribut = `data-${bucla.atribut}`;
    const elemente = new Map<string, HTMLElement>();
    root.querySelectorAll<HTMLElement>(`[${atribut}]`).forEach((e) => elemente.set(e.getAttribute(atribut) ?? "", e));
    const scrie = bucla.scriitor(root, elemente);

    let animatii: Animation[] = [];
    let gata = false;
    let ruleaza = false;
    let staticAplicat = false;
    let vizibil = typeof IntersectionObserver === "undefined";
    let acoperit = card?.hasAttribute("data-acoperit") ?? false;
    let filaVizibila = document.visibilityState !== "hidden";
    let pornitVreodata = false;
    let opritLa = -Infinity;
    let ceas = 0;

    /* ─── Partea discretă: singura scrisă din JavaScript ─────────────────── */

    /**
     * Secunda din buclă și a câta buclă e, citite din ceasul animațiilor (prima pistă). Cei 3 ms de
     * avans acoperă un `setTimeout` care sună puțin mai devreme.
     */
    function acum(): { t: number; iteratie: number } {
      const ms = animatii[0]?.currentTime;
      const n = (typeof ms === "number" ? ms : 0) + 3;
      const iteratie = Math.floor(n / buclaMs);
      return { t: (n - iteratie * buclaMs) / 1000, iteratie };
    }

    /** Scrie starea de acum și se programează pentru următoarea clipă în care se schimbă ceva. */
    function programeaza() {
      window.clearTimeout(ceas);
      const { t, iteratie } = acum();
      scrie(t, iteratie);
      const urmator = urmatorulMoment(bucla.momente, t, bucla.buclaS);
      ceas = window.setTimeout(programeaza, Math.max(4, (urmator - t) * 1000));
    }

    /* ─── Pornit, oprit, static ─────────────────────────────────────────── */

    function porneste() {
      const pauza = performance.now() - opritLa;
      const curent = animatii[0].currentTime;
      const ms =
        !pornitVreodata || pauza > DE_LA_CAPAT_DUPA_MS || typeof curent !== "number" ? bucla.pornireS * 1000 : curent;
      /* Toate primesc același timp și pornesc în aceeași sarcină, deci rămân sincronizate. */
      for (const a of animatii) {
        a.currentTime = ms;
        a.play();
      }
      pornitVreodata = true;
      ruleaza = true;
      staticAplicat = false;
      radacinaSigura.setAttribute("data-ruleaza", "");
      programeaza();
    }

    function opreste() {
      for (const a of animatii) a.pause();
      window.clearTimeout(ceas);
      ruleaza = false;
      opritLa = performance.now();
      radacinaSigura.removeAttribute("data-ruleaza");
    }

    function cadruStatic() {
      if (staticAplicat) return;
      for (const a of animatii) {
        a.pause();
        a.currentTime = bucla.staticS * 1000;
      }
      window.clearTimeout(ceas);
      scrie(bucla.staticS, 0);
      ruleaza = false;
      staticAplicat = true;
      radacinaSigura.removeAttribute("data-ruleaza");
    }

    function actualizeaza() {
      if (!gata || animatii.length === 0) return;
      if (miscareRedusa.matches) {
        cadruStatic();
        return;
      }
      const poate = vizibil && !acoperit && filaVizibila;
      if (poate && !ruleaza) porneste();
      else if (!poate && ruleaza) opreste();
    }

    /* ─── Pregătirea: imaginile, apoi cadrele-cheie ─────────────────────── */

    /** Imaginile cardului, cu plasă: o cerere înțepenită nu ține bucla pe loc la nesfârșit. */
    function pregatesteImaginile(): Promise<unknown> {
      const plasa = new Promise((rezolva) => window.setTimeout(rezolva, PREGATIRE_CEL_MULT_MS));
      return Promise.race([Promise.resolve(bucla.pregateste?.(radacinaSigura, scena)).catch(() => undefined), plasa]);
    }

    /**
     * Cadrele-cheie și animațiile, câte o bucată în fiecare răgaz al browserului: cel mult
     * `BUCATA_MS`, chiar și când răgazul vine forțat, după 800 ms fără timp liber. Toate pleacă
     * oprite pe clipa din HTML, deci până pornesc împreună cardul arată exact ce arăta.
     */
    function construiesteAnimatiile(): Promise<Animation[] | null> {
      return new Promise((rezolva) => {
        const facute: Animation[] = [];
        let i = 0;
        const bucata = (ragaz?: Ragaz) => {
          if (anulat) {
            for (const a of facute) a.cancel();
            rezolva(null);
            return;
          }
          const pana = performance.now() + BUCATA_MS;
          while (i < bucla.piste.length) {
            const p = bucla.piste[i++];
            const el = elemente.get(p.tinta);
            if (el) {
              const a = el.animate(cadrePista(p, bucla.buclaS), { duration: buclaMs, iterations: Infinity });
              a.pause();
              a.currentTime = bucla.pornireS * 1000;
              facute.push(a);
            }
            const fortat = !ragaz || ragaz.didTimeout;
            if (performance.now() >= pana || (!fortat && ragaz.timeRemaining() < 1)) break;
          }
          if (i < bucla.piste.length) laRagaz(bucata);
          else rezolva(facute);
        };
        laRagaz(bucata);
      });
    }

    let pregatit = false;
    function pregateste() {
      if (pregatit) return;
      pregatit = true;
      void pregatesteImaginile()
        .then(() => (anulat || typeof scena.animate !== "function" ? null : construiesteAnimatiile()))
        .then((facute) => {
          if (anulat) {
            for (const a of facute ?? []) a.cancel();
            return;
          }
          animatii = facute ?? [];
          gata = true;
          actualizeaza();
        });
    }

    /* ─── Cine pornește și cine oprește ─────────────────────────────────── */

    const aproape =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (intrari) => {
              if (intrari.some((i) => i.isIntersecting)) {
                aproape?.disconnect();
                pregateste();
              }
            },
            { rootMargin: PREGATIRE_DE_LA },
          );
    if (aproape) aproape.observe(root);
    else pregateste();

    const vedere =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((intrari) => {
            vizibil = intrari[intrari.length - 1].isIntersecting;
            actualizeaza();
          });
    vedere?.observe(root);

    const acoperire =
      card && typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            acoperit = card.hasAttribute("data-acoperit");
            actualizeaza();
          })
        : null;
    if (card && acoperire) acoperire.observe(card, { attributes: true, attributeFilter: ["data-acoperit"] });

    function laVizibilitate() {
      filaVizibila = document.visibilityState !== "hidden";
      actualizeaza();
    }
    document.addEventListener("visibilitychange", laVizibilitate);

    function laMiscareRedusa() {
      if (!miscareRedusa.matches) {
        staticAplicat = false;
        pornitVreodata = false;
        /* Sub „mișcare redusă” macheta poate să-și fi pregătit doar cadrul static; acum îi trebuie
           tot, deci se pregătește din nou și abia apoi pornește. */
        if (gata && bucla.pregateste) {
          void pregatesteImaginile().then(() => {
            if (!anulat) actualizeaza();
          });
          return;
        }
      }
      actualizeaza();
    }
    miscareRedusa.addEventListener?.("change", laMiscareRedusa);

    return () => {
      anulat = true;
      aproape?.disconnect();
      vedere?.disconnect();
      acoperire?.disconnect();
      urmaritorMarime?.disconnect();
      document.removeEventListener("visibilitychange", laVizibilitate);
      miscareRedusa.removeEventListener?.("change", laMiscareRedusa);
      window.clearTimeout(ceas);
      for (const a of animatii) a.cancel();
      animatii = [];
      radacinaSigura.removeAttribute("data-ruleaza");
    };
  }, [radacina, bucla]);
}
