import type { AnimatieIntrare, BlockStyle, EfectButon, EfectImagine } from "./blocks.types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ANIMATIILE SI EFECTELE PAGINILOR                                (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: „mai multe variante de animatii si efecte". Pana acum existau
  doar cinci efecte la buton.

  ⚠⚠ FARA BIBLIOTECA SI FARA HIDRATARE. Blocurile sunt componente de server;
  o animatie prin `framer-motion` le-ar fi facut pe toate componente de client
  si ar fi adus ~40 KB de JavaScript pe fiecare pagina. Aici animatia e CSS
  pur (`stil-comun.css`, `edinio-anim-*`), iar pornirea ei la intrarea in
  ecran o face un script de cateva sute de octeti, scris direct in pagina
  (`SCRIPT_ANIMATII`), care ruleaza inainte de hidratare.

  ⚠⚠ CONTINUTUL NU SE ASCUNDE DECAT CAND SCRIPTUL CHIAR RULEAZA. Ascunderea
  initiala e legata de clasa `edinio-anim-ok` pe `<html>`, pusa de script. Fara
  JavaScript (sau pentru un crawler care nu-l ruleaza), blocurile se vad
  normal, iar cu `prefers-reduced-motion` scriptul nu pune clasa deloc.
*/

export const ANIMATII: { cheie: AnimatieIntrare; nume: string }[] = [
  { cheie: "none", nume: "Fără" },
  { cheie: "fade", nume: "Apare treptat" },
  { cheie: "fade-up", nume: "Urcă" },
  { cheie: "fade-down", nume: "Coboară" },
  { cheie: "fade-left", nume: "Vine din dreapta" },
  { cheie: "fade-right", nume: "Vine din stânga" },
  { cheie: "zoom-in", nume: "Se mărește" },
  { cheie: "zoom-out", nume: "Se micșorează" },
  { cheie: "blur-in", nume: "Din neclar" },
  { cheie: "flip-up", nume: "Se răsucește" },
  { cheie: "slide-up", nume: "Alunecă de jos" },
  { cheie: "rotate-in", nume: "Se rotește" },
  { cheie: "bounce-in", nume: "Sare în pagină" },
];

export const EFECTE_BUTON: { cheie: EfectButon; nume: string }[] = [
  { cheie: "none", nume: "Fără" },
  { cheie: "shine", nume: "Luciu care trece" },
  { cheie: "lift", nume: "Se ridică la atingere" },
  { cheie: "fill", nume: "Se umple la atingere" },
  { cheie: "ring", nume: "Undă în jur" },
  { cheie: "float", nume: "Plutește" },
  { cheie: "pulse", nume: "Puls" },
  { cheie: "heartbeat", nume: "Bătăi de inimă" },
  { cheie: "glow", nume: "Strălucire" },
  { cheie: "bounce", nume: "Săltăreț" },
  { cheie: "wobble", nume: "Se clatină" },
  { cheie: "shake", nume: "Tremurat" },
];

export const EFECTE_IMAGINE: { cheie: EfectImagine; nume: string }[] = [
  { cheie: "none", nume: "Fără" },
  { cheie: "zoom", nume: "Se apropie" },
  { cheie: "lift", nume: "Se ridică" },
  { cheie: "brighten", nume: "Se luminează" },
  { cheie: "grayscale", nume: "Din alb-negru în culoare" },
  { cheie: "tilt", nume: "Se înclină ușor" },
];

const CHEI_ANIMATII = new Set<string>(ANIMATII.map((a) => a.cheie));

/** Atributele pe care `BlockShell` le pune pe sectiune. Nimic cand nu e animatie. */
export function atributeAnimatie(style?: BlockStyle): { attrs: Record<string, string> } {
  const a = style?.anim;
  if (!a || a === "none" || !CHEI_ANIMATII.has(a)) return { attrs: {} };
  const attrs: Record<string, string> = { "data-anim": a };
  if (style?.animSpeed && style.animSpeed !== "normal") attrs["data-anim-speed"] = style.animSpeed;
  /* Intarzierea in trepte de 100 ms (0-1500): CSS nu poate citi un timp dintr-un
     atribut, deci fiecare treapta are regula ei in `stil-comun.css`. */
  const d = Math.round(Math.min(1500, Math.max(0, style?.animDelay ?? 0)) / 100) * 100;
  if (d > 0) attrs["data-anim-delay"] = String(d);
  return { attrs };
}

/** Clasa efectului unui buton. Cheile vechi (`pulse`...) pastreaza clasele `fx-*` de dinainte. */
export function clasaEfectButon(e?: EfectButon | string | null): string {
  if (!e || e === "none") return "";
  return `fx-${e}`;
}

export function clasaEfectImagine(e?: EfectImagine | string | null): string {
  if (!e || e === "none") return "";
  return `img-fx img-fx-${e}`;
}

/**
 * Porneste animatiile sub `radacina` (`<main>`-ul paginii). Functie de sine
 * statatoare, fara importuri: se trimite si ca text, intr-un `<script>` scris
 * in pagina (`SCRIPT_ANIMATII`), si se cheama si din `PornesteAnimatiile`.
 *
 * ⚠⚠ Ce s-a stricat in prima forma, gasit pe ecran (25.09.2026):
 *  1. Blocurile vin pe flux (Suspense): intai intr-un container ascuns, apoi
 *     mutate la locul lor. Scriptul le masura cand erau ascunse (0 px), iar
 *     observatorul nu mai raporta nimic dupa mutare: TOATE blocurile animate
 *     ramaneau invizibile. Acum un `MutationObserver` le reia la fiecare mutare.
 *  2. Pornirea era o clasa pe `<html>`. React o vedea la hidratare ca
 *     nepotrivire, iar la navigarea fara reincarcare clasa ramanea, dar
 *     scriptul (scris in pagina) nu mai rula: pagina urmatoare ar fi ramas cu
 *     blocurile ascunse. Acum pornirea e atributul `data-anim-pornit` pe
 *     `<main>`-ul paginii, pe care React nu-l compara, si care dispare odata cu
 *     pagina.
 *
 * ⚠ Plasa de siguranta: la 4 s dupa pornire, orice bloc deja trecut de
 * marginea de sus a ecranului se marcheaza. Un bloc ramas invizibil e mai rau
 * decat unul neanimat.
 */
export function pornesteAnimatiile(radacina: Element | null): void {
  try {
    const w = window;
    if (!radacina || radacina.hasAttribute("data-anim-pornit")) return;
    if (!("IntersectionObserver" in w) || !("MutationObserver" in w)) return;
    if (w.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const intra = (x: Element) => x.setAttribute("data-anim-in", "");
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { intra(e.target); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });
    const ia = (x: Element) => {
      if (x.hasAttribute("data-anim-in")) return;
      const r = x.getBoundingClientRect();
      if (r.height > 0 && r.top < w.innerHeight && r.bottom > 0) intra(x);
      else { io.unobserve(x); io.observe(x); }
    };
    const cauta = (n: Node) => {
      if (n.nodeType !== 1) return;
      const el = n as Element;
      if (el.hasAttribute("data-anim")) ia(el);
      el.querySelectorAll("[data-anim]").forEach(ia);
    };
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(cauta))).observe(radacina, { childList: true, subtree: true });
    cauta(radacina);
    radacina.setAttribute("data-anim-pornit", "");
    w.setTimeout(() => {
      radacina.querySelectorAll("[data-anim]:not([data-anim-in])").forEach((x) => {
        if (x.getBoundingClientRect().top < w.innerHeight) intra(x);
      });
    }, 4000);
  } catch {
    /* O animatie care nu porneste nu are voie sa strice pagina. */
  }
}

/**
 * Scriptul scris in pagina, la capatul lui `<main>`, IN AFARA lui `<Suspense>`:
 * porneste animatiile inainte de hidratare, pe `<main>`-ul in care sta.
 */
export const SCRIPT_ANIMATII = `(${pornesteAnimatiile.toString()})(document.currentScript&&document.currentScript.parentElement);`;
