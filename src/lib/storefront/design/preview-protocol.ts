import type { ResolvedStyle, StoreDesign } from "./types";

/**
 * Protocolul dintre editor si preview-ul din iframe.
 *
 * Editorul si magazinul stau pe aceeasi origine (`proxy.ts` sare peste
 * redirectarile de domeniu cand vede `?preview=1`, tocmai ca iframe-ul sa nu fie
 * blocat de `X-Frame-Options`). Comunica prin `postMessage`, nu prin reincarcare:
 * catalogul e deja in browser, deci o schimbare de varianta sau de culoare se
 * vede instant, fara sa se salveze nimic.
 *
 * Ambele capete verifica originea. Mesajele poarta un marcaj propriu ca sa nu se
 * incurce cu ce mai trimit extensiile de browser sau alte biblioteci.
 */

export const PREVIEW_MESSAGE = "__edinioDesign";

/**
 * ⚠⚠ `?preview=1` NU INSEAMNA „EDITORUL DE DESIGN". Sunt doua lucruri diferite,
 * si confundarea lor a omorat previzualizarea din „Editeaza magazinul".
 *
 * `preview=1` a fost inventat pentru UN singur lucru: sa spuna proxy-ului sa nu
 * redirecteze catre `www` sau catre domeniul propriu, ca iframe-ul sa nu fie
 * blocat de `X-Frame-Options`. Il pun AMANDOUA editoarele — si cel vechi
 * (`/dashboard/editor`, un iframe simplu, fara niciun protocol), si cel de
 * design.
 *
 * Cand marcarea sectiunilor, blocarea clicurilor si randarea cioarnei s-au legat
 * tot de el, editorul vechi le-a mostenit pe toate fara sa aiba jumatatea lui de
 * protocol: previzualizarea lui a devenit o poza pe care nu se putea da click
 * nicaieri — nici pe un produs, nici pe cos, nici pe meniu — si care pe deasupra
 * putea arata o ciorna nepublicata in loc de magazinul real.
 *
 * De aceea editorul de design isi pune un semn PROPRIU. Tot ce tine de protocol
 * atarna de semnul asta; `preview=1` ramane doar ce a fost mereu.
 */
export const EDITOR_PARAM = "editor";
export const EDITOR_VALUE = "design";

/** Sirul de interogare al iframe-ului din editorul de design. */
export const PREVIEW_QUERY = `preview=1&${EDITOR_PARAM}=${EDITOR_VALUE}`;

/**
 * Pagina e deschisa in iframe-ul editorului de design?
 *
 * ⚠ Cere si `preview=1`, si proprietarul. Fara proprietar, oricine copiaza
 * adresa cu semnul in ea ar primi un magazin frumos si complet neclicabil, fara
 * niciun mesaj — si semnul se lipeste de sesiune, fiindca rescrierea adresei la
 * filtrare pastreaza parametrii straini.
 */
export function esteEditorDeDesign(
  sp: { preview?: string; editor?: string },
  esteProprietar: boolean,
): boolean {
  return sp.preview === "1" && sp[EDITOR_PARAM] === EDITOR_VALUE && esteProprietar;
}

/** Editor -> preview: designul de randat acum. */
export interface PreviewDesignMessage {
  [PREVIEW_MESSAGE]: "design";
  design: StoreDesign;
  style: ResolvedStyle;
}

/** Editor -> preview: adu sectiunea in dreptul ochilor. */
export interface PreviewScrollMessage {
  [PREVIEW_MESSAGE]: "scrollTo";
  sectionId: string;
}

/** Preview -> editor: sunt montat, trimite-mi designul curent. */
export interface PreviewReadyMessage {
  [PREVIEW_MESSAGE]: "ready";
}

/** Preview -> editor: vizitatorul a dat click pe o sectiune. */
export interface PreviewSelectMessage {
  [PREVIEW_MESSAGE]: "select";
  sectionId: string;
}

export type PreviewMessage =
  | PreviewDesignMessage
  | PreviewScrollMessage
  | PreviewReadyMessage
  | PreviewSelectMessage;

export function isPreviewMessage(data: unknown): data is PreviewMessage {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>)[PREVIEW_MESSAGE] === "string"
  );
}

/** Atributul pus pe fiecare sectiune randata, ca preview-ul sa stie ce s-a atins. */
export const SECTION_ATTR = "data-st-section";
