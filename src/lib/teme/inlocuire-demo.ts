import type { DesignContext, SectionInstance, StoreDesign } from "@/lib/storefront/design/types";
import { temaAplicataDin, type TemaAplicata } from "./aplicare";
import { CHEIE_DATE_DEMO, urmaDateDemoDin, type UrmaDateDemo } from "./import-demo";
import { TEME, type Tema } from "./teme";

/*
  ═══════════════════════════════════════════════════════════════════════════
  O SINGURA TEMA DEMO IN MAGAZIN (etapa 25.3 din `docs/editor-magazin/PLAN.md`, 11.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Gasit la proba de dinaintea lansarii: importul ADAUGA, deci dupa 30 de teme incercate cu datele demo magazinul avea 331
  de produse demo, 192 de categorii, 40 de bannere si 60 de randuri pe prima pagina. Si textele unei teme treceau la
  urmatoarea: dupa Electra, prima pagina Jupiter scria „Alege camera” si „Cele mai iubite camere”, cu placile „Pentru ea /
  Pentru el / Pentru copii” ale unei teme de moda. Tema noua se construieste peste designul publicat si pastreaza ce e
  „al lui”, iar textele temei de dinainte aratau exact ca ale lui.

  Regula de acum (recomandarea din raportul din 11.11, luata la „vreau sa fie perfect inainte de lansare”):
  - o tema aplicata CU datele demo le scoate intai pe ale celorlalte teme (produse, categorii create, bannere, randuri);
  - orice tema aplicata scoate intai din design textele scrise de o tema (`faraTexteleTemelor`) si neschimbate de om;
  - versiunea `tema` din Istoric tine si starea de atunci (`StareDinainte`: tema aplicata si datele demo), ca „Pune la
    loc” sa readuca magazinul INTOCMAI, cu datele demo ale temei de atunci.
  Ce a scris omul ramane: un text egal cu al unei teme e socotit al temei (riscul: un titlu scris de el, identic, revine la
  cel implicit; nimic nu se sterge din produsele lui).
*/

/* ── Amprentele temelor ───────────────────────────────────────────────────── */

interface Element {
  titlu: string;
  imagine: string;
}

export interface AmprenteTeme {
  /** Textele temelor (si fara datele demo), pe `<loc>.<cheie>`: titlurile sectiunilor, etichetele antetului. */
  texte: ReadonlyMap<string, ReadonlySet<string>>;
  /** Bannerele demo: titlul si poza; amandoua ale unei teme = bannerul e al temei. */
  bannere: readonly Element[];
  /** Elementele demo din liste: cardurile si placile bannerului, placile de recomandare. */
  elemente: readonly Element[];
  /** Mesajele demo din bara de sus. */
  mesaje: ReadonlySet<string>;
}

/** Cheile de TEXT pe care le scrie o tema si fara datele demo (masurate pe cele 30, 11.11.2026). */
export const CHEI_TEXT_TEMA: Readonly<Record<string, readonly string[]>> = {
  category_nav: ["titlu"],
  placi_promo: ["titlu"],
  header: ["actionLabel", "etichetaCategorii"],
  shop: ["titlu"],
};

const LISTE_HERO = ["carduri", "placi"] as const;
const CHEI_BANNER_DEMO = ["titlu", "text", "buton", "link", "imagine"] as const;
const CTX_GOL: DesignContext = { primaryColor: "#07c527", pageContent: {}, features: {} };

function elemente(lista: unknown): Element[] {
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const { titlu, imagine } = x as Record<string, unknown>;
    return typeof titlu === "string" && typeof imagine === "string" ? [{ titlu, imagine }] : [];
  });
}

let amprente: AmprenteTeme | null = null;

/**
 * Ce scrie fiecare tema in design, peste designul clasic, cu si fara datele demo. Se socoteste o data pe proces (60 de
 * designuri, cateva zeci de milisecunde): asa prinde orice tema, si pe Jupiter, care nu e facuta dupa reteta.
 */
export function amprenteleTemelor(teme: readonly Pick<Tema, "design" | "date">[] = TEME): AmprenteTeme {
  if (amprente && teme === TEME) return amprente;
  const texte = new Map<string, Set<string>>();
  const bannere: Element[] = [];
  const elem: Element[] = [];
  const mesaje = new Set<string>();
  const noteaza = (loc: string, setari: Record<string, unknown> | undefined) => {
    for (const cheie of CHEI_TEXT_TEMA[loc] ?? []) {
      const v = setari?.[cheie];
      if (typeof v !== "string" || !v.trim()) continue;
      const k = `${loc}.${cheie}`;
      if (!texte.has(k)) texte.set(k, new Set());
      texte.get(k)!.add(v);
    }
  };
  for (const t of teme) {
    for (const cuDemo of [true, false]) {
      const d = t.design(CTX_GOL, cuDemo ? t.date : null);
      for (const s of d.home) {
        noteaza(s.kind, s.settings);
        if (!cuDemo) continue;
        if (s.kind === "hero") {
          const { titlu, imagine } = s.settings as Record<string, unknown>;
          if (typeof titlu === "string" && titlu && typeof imagine === "string" && imagine) bannere.push({ titlu, imagine });
          for (const l of LISTE_HERO) elem.push(...elemente(s.settings[l]));
        }
        if (s.kind === "placi_promo") elem.push(...elemente(s.settings.placi));
      }
      noteaza("header", d.chrome.header.settings);
      noteaza("shop", d.shop.page.settings as Record<string, unknown> | undefined);
      const mesaj = d.chrome.header.settings.topText;
      if (cuDemo && typeof mesaj === "string" && mesaj.trim()) {
        // Doar mesajul pus de date: cel pe care tema il scrie si fara ele nu e „demo”.
        const fara = t.design(CTX_GOL, null).chrome.header.settings.topText;
        if (fara !== mesaj) mesaje.add(mesaj);
      }
    }
  }
  const rez = { texte, bannere, elemente: elem, mesaje };
  if (teme === TEME) amprente = rez;
  return rez;
}

const acelasi = (a: Element[] | readonly Element[], x: unknown) => {
  if (!x || typeof x !== "object") return false;
  const { titlu, imagine } = x as Record<string, unknown>;
  return a.some((e) => e.titlu === titlu && e.imagine === imagine);
};

/**
 * Designul fara textele puse de o tema si ramase neschimbate: bannerul demo (titlu si poza ale unei teme), elementele
 * demo din liste, mesajul demo al barii; cu `siTexteleTemei`, si titlurile si etichetele pe care le scrie o tema si fara
 * date (inainte de o tema noua: altfel tema noua le-ar pastra drept ale lui). `schimbat` = s-a scos ceva.
 */
export function faraTexteleTemelor(
  design: StoreDesign,
  { siTexteleTemei }: { siTexteleTemei: boolean },
  a: AmprenteTeme = amprenteleTemelor(),
): { design: StoreDesign; schimbat: boolean } {
  let schimbat = false;
  const faraTextele = (loc: string, setari: Record<string, unknown>): Record<string, unknown> => {
    if (!siTexteleTemei) return setari;
    let st = setari;
    for (const cheie of CHEI_TEXT_TEMA[loc] ?? []) {
      const v = st[cheie];
      if (typeof v === "string" && a.texte.get(`${loc}.${cheie}`)?.has(v)) {
        st = { ...st };
        delete st[cheie];
        schimbat = true;
      }
    }
    return st;
  };
  const faraElemente = (lista: unknown): unknown => {
    if (!Array.isArray(lista)) return lista;
    const ramase = lista.filter((x) => !acelasi(a.elemente, x));
    if (ramase.length !== lista.length) schimbat = true;
    return ramase.length !== lista.length ? ramase : lista;
  };

  const home = design.home.map((s): SectionInstance => {
    let st = faraTextele(s.kind, s.settings);
    if (s.kind === "hero") {
      const banner = acelasi(a.bannere, st);
      const liste = LISTE_HERO.filter((l) => Array.isArray(st[l]));
      if (banner || liste.length > 0) {
        const nou = { ...st };
        if (banner) {
          for (const k of CHEI_BANNER_DEMO) nou[k] = "";
          schimbat = true;
        }
        for (const l of liste) nou[l] = faraElemente(nou[l]);
        st = nou;
      }
    }
    if (s.kind === "placi_promo" && Array.isArray(st.placi)) st = { ...st, placi: faraElemente(st.placi) };
    return st === s.settings ? s : { ...s, settings: st };
  });

  let header = design.chrome.header;
  let setariAntet = faraTextele("header", header.settings);
  if (typeof setariAntet.topText === "string" && a.mesaje.has(setariAntet.topText)) {
    setariAntet = { ...setariAntet, topText: "" };
    schimbat = true;
  }
  if (setariAntet !== header.settings) header = { ...header, settings: setariAntet };

  let shop = design.shop;
  const setariMagazin = (shop.page.settings ?? {}) as Record<string, unknown>;
  const faraMagazin = faraTextele("shop", setariMagazin);
  if (faraMagazin !== setariMagazin) shop = { ...shop, page: { ...shop.page, settings: faraMagazin as typeof shop.page.settings } };

  if (!schimbat) return { design, schimbat };
  return { design: { ...design, home, chrome: { ...design.chrome, header }, shop }, schimbat };
}

/* ── Datele demo din `page_content` ───────────────────────────────────────── */

/** Poza unei teme (`public/teme/<cheie>/`), unde stau toate pozele demo. */
const POZA_TEMA = /^\/teme\/([a-z0-9-]+)\//;
/** Randul demo (`idRandDemo`: `demo-<tema>-<cheie>`). */
const RAND_DEMO = /^demo-([a-z0-9]+)-/;

/** A carei teme e bannerul demo (dupa poza), sau `null` cand nu e al unei teme. */
export function temaBanneruluiDemo(x: unknown): string | null {
  return typeof x === "string" ? x.match(POZA_TEMA)?.[1] ?? null : null;
}

/** A carei teme e randul demo (dupa id), sau `null` cand e al lui. */
export function temaRanduluiDemo(r: unknown): string | null {
  if (!r || typeof r !== "object") return null;
  const id = (r as { id?: unknown }).id;
  return typeof id === "string" ? id.match(RAND_DEMO)?.[1] ?? null : null;
}

/**
 * `page_content` fara datele demo ale altor teme decat `pastreaza` (`null` = ale niciuneia): bannerele (pereche cu
 * linkurile), randurile de produse si urma, cand nu e a temei pastrate. Dupa urma SI dupa forma (poza din `/teme/<x>/`,
 * id-ul `demo-<x>-`), ca sa prinda si ce a adunat un magazin inainte de 11.11. Doar cheile care se schimba.
 */
export function pcFaraDemoAlAltorTeme(pc: Record<string, unknown>, pastreaza: string | null): Record<string, unknown> {
  const urma = urmaDateDemoDin(pc);
  const dinUrma = (lista: readonly string[] | undefined, x: unknown) => !!urma && urma.tema !== pastreaza && typeof x === "string" && !!lista?.includes(x);
  const strain = (tema: string | null) => tema !== null && tema !== pastreaza;
  const patch: Record<string, unknown> = {};

  const imagini = Array.isArray(pc.hero_banners) ? pc.hero_banners : [];
  const scoateBanner = (x: unknown) => strain(temaBanneruluiDemo(x)) || dinUrma(urma?.bannere, x);
  if (imagini.some(scoateBanner)) {
    const linkuri = Array.isArray(pc.hero_banner_links) ? pc.hero_banner_links : [];
    const raman = imagini.map((x, i) => [x, linkuri[i] ?? ""] as const).filter(([x]) => !scoateBanner(x));
    patch.hero_banners = raman.map(([x]) => x);
    patch.hero_banner_links = raman.map(([, l]) => l);
  }
  const randuri = Array.isArray(pc.product_sections) ? pc.product_sections : [];
  const scoateRand = (r: unknown) => strain(temaRanduluiDemo(r))
    || (!!r && typeof r === "object" && dinUrma(urma?.randuri, (r as { id?: unknown }).id));
  if (randuri.some(scoateRand)) patch.product_sections = randuri.filter((r) => !scoateRand(r));
  if (urma && urma.tema !== pastreaza) patch[CHEIE_DATE_DEMO] = null;
  return patch;
}

/** Id-urile produselor demo de scos: ale altor teme decat `pastreaza` (codul lor e `<tema>:<cheie>`). */
export function produseDemoDeScos(randuri: readonly { id: string; external_id: string | null }[], pastreaza: string | null): string[] {
  return randuri.filter((p) => !pastreaza || !String(p.external_id ?? "").startsWith(`${pastreaza}:`)).map((p) => p.id);
}

/* ── Starea de dinainte, in versiunea `tema` ──────────────────────────────── */

/** Ce era in magazin, pe langa design si continut, inainte de o tema: tema aplicata si datele demo. */
export interface StareDinainte {
  tema: TemaAplicata | null;
  demo: UrmaDateDemo | null;
}

/** Starea de acum a magazinului, de scris in versiunea `tema`. */
export function stareaMagazinului(pc: Record<string, unknown>): StareDinainte {
  return { tema: temaAplicataDin(pc), demo: urmaDateDemoDin(pc) };
}

/**
 * Starea din versiune (`continut.stare`). `undefined` = versiune scrisa inainte de 11.11.2026, fara stare: „Pune la loc”
 * face atunci ce facea (designul si continutul, fara datele demo).
 */
export function stareDinVersiune(continut: unknown): StareDinainte | undefined {
  if (!continut || typeof continut !== "object" || !("stare" in continut)) return undefined;
  const s = (continut as { stare?: unknown }).stare;
  if (!s || typeof s !== "object") return { tema: null, demo: null };
  const { tema, demo } = s as Record<string, unknown>;
  return { tema: temaAplicataDin({ tema_aplicata: tema }), demo: urmaDateDemoDin({ [CHEIE_DATE_DEMO]: demo }) };
}

/**
 * Continutul versiunii cu randurile demo de ACUM: dupa ce „Pune la loc” reimporta datele demo ale temei de atunci,
 * produsele au id-uri noi, iar randurile versiunii ar fi aratat spre cele sterse. Randul cu acelasi id (`demo-<tema>-
 * <cheie>`, acelasi la orice import) ia produsele de acum; unul care nu mai exista iese. Restul continutului ramane.
 */
export function continutCuRandurileDemoDeAcum(continut: unknown, pcAcum: Record<string, unknown>): unknown {
  if (!continut || typeof continut !== "object") return continut;
  const c = continut as { pc?: Record<string, unknown> };
  const randuri = c.pc && Array.isArray(c.pc.product_sections) ? c.pc.product_sections : null;
  if (!randuri) return continut;
  const acum = new Map<string, unknown>();
  for (const r of Array.isArray(pcAcum.product_sections) ? pcAcum.product_sections : []) {
    if (temaRanduluiDemo(r)) acum.set((r as { id: string }).id, r);
  }
  const noi = randuri.flatMap((r) => {
    if (!temaRanduluiDemo(r)) return [r];
    const azi = acum.get((r as { id: string }).id);
    return azi ? [azi] : [];
  });
  return { ...c, pc: { ...c.pc, product_sections: noi } };
}
