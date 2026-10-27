import type { ResolvedStyle, StoreDesign } from "./types";
import type { Block } from "@/lib/pages/blocks.types";
import type { PublicForm } from "@/lib/pages/forms.types";
import type { MetodaAfisata } from "@/lib/pages/integrari-pagini";
import type { PachetPagina } from "@/lib/pages/resolve-bundles";
import type { PageProduct } from "@/components/pages/blocks/ProductsBlock";

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

/**
 * Semnele de editor dintr-o adresa, in forma pe care o cere `esteEditorDeDesign`.
 *
 * Next da parametrii ca sir SAU ca lista (`?preview=1&preview=1`); o lista nu e
 * un semn, deci ramane `undefined`, nu primul ei element.
 */
export function semneDeEditor(
  sp: Record<string, string | string[] | undefined> | undefined,
): { preview?: string; editor?: string } {
  const unul = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return { preview: unul(sp?.preview), editor: unul(sp?.[EDITOR_PARAM]) };
}

/**
 * Sablonul de produs impus de editor in previzualizare (etapa 4b): cand comerciantul editeaza un
 * sablon pe care nu-l foloseste inca niciun produs, pagina il arata oricum. Ruta il citeste DOAR
 * in modul editor; aici doar se curata: un singur id, din caracterele unui id de sectiune.
 */
export const SABLON_PARAM = "sablon";

export function sablonImpusDin(sp: Record<string, string | string[] | undefined> | undefined): string | null {
  const v = sp?.[SABLON_PARAM];
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
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

/**
 * Editor -> preview: ce sectiune e deschisa in panou si peste ce rand din arbore
 * e mouse-ul. Previzualizarea doar deseneaza conturul; selectia o tine editorul.
 */
export interface PreviewEvidentiereMessage {
  [PREVIEW_MESSAGE]: "evidentiere";
  selectat: string | null;
  peste: string | null;
}

/**
 * Preview -> editor: stratul de contur s-a montat, trimite-mi evidentierea.
 *
 * Separat de „ready”: stratul se incarca la cerere, dupa hidratare, deci
 * raspunsul la „ready” ajunge de obicei inaintea lui si s-ar pierde.
 */
export interface PreviewConturGataMessage {
  [PREVIEW_MESSAGE]: "conturGata";
}

/**
 * Paginile proprii in editorul unic (etapa 5). In previzualizare, continutul unei pagini proprii e
 * sectiunea `pagina:<id>`, iar blocurile ei `pagina:<id>/<bloc>`; aceeasi cheie o are pagina in
 * „Editezi”, deci un clic in cadru spune singur pe ce pagina e.
 */
export const PREFIX_PAGINA_PROPRIE = "pagina:";

export function cheiaPaginiiProprii(id: string): `pagina:${string}` {
  return `${PREFIX_PAGINA_PROPRIE}${id}`;
}

/** Ce mai trebuie blocurilor ca sa se randeze fara server: aceleasi date ca panza editorului vechi. */
export interface DatePrevizualizarePagina {
  products: PageProduct[];
  bundles: PachetPagina[];
  forms: PublicForm[];
  plati: MetodaAfisata[];
  curieri: MetodaAfisata[];
}

/**
 * Editor -> preview: blocurile paginii proprii editate, inainte de salvare (etapa 5).
 *
 * Pagina din cadru le randeaza NUMAI daca e chiar pagina `id` si e deschisa in editor; pe magazinul
 * public mesajul nu are cine sa-l asculte. `date` vine o singura data, cand se deschide pagina.
 */
export interface PreviewPaginaMessage {
  [PREVIEW_MESSAGE]: "pagina";
  id: string;
  blocks: Block[];
  css: string;
  date?: DatePrevizualizarePagina;
  /** De cate ori s-a cerut „Redă animația”, pe id de bloc (vezi `cheieAnimatie`). */
  reluari?: Record<string, number>;
}

/**
 * „Conținut liber” din magazin (etapa 9). Preview -> editor: pagina are continut si n-are inca datele
 * blocurilor (produse, pachete, formulare, plati, curieri); le cere o singura data.
 */
export interface PreviewCereDateBlocuriMessage {
  [PREVIEW_MESSAGE]: "cereDateBlocuri";
}

/** Editor -> preview: datele blocurilor, ca la paginile proprii (`DatePrevizualizarePagina`). */
export interface PreviewDateBlocuriMessage {
  [PREVIEW_MESSAGE]: "dateBlocuri";
  date: DatePrevizualizarePagina;
}

export type PreviewMessage =
  | PreviewDesignMessage
  | PreviewScrollMessage
  | PreviewReadyMessage
  | PreviewSelectMessage
  | PreviewEvidentiereMessage
  | PreviewConturGataMessage
  | PreviewPaginaMessage
  | PreviewCereDateBlocuriMessage
  | PreviewDateBlocuriMessage;

export function isPreviewMessage(data: unknown): data is PreviewMessage {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>)[PREVIEW_MESSAGE] === "string"
  );
}

/** Atributul pus pe fiecare sectiune randata, ca preview-ul sa stie ce s-a atins. */
export const SECTION_ATTR = "data-st-section";

/** Numele sectiunii, langa id, ca stratul de contur sa-l scrie fara sa caute in design. */
export const ETICHETA_ATTR = "data-st-eticheta";

/**
 * Atributul pus pe fiecare bloc randat in editor (etapa 4), cu id-ul lui intreg:
 * `<sectiune>/<bloc>`. In mesaje (`select`, `evidentiere`) un bloc circula sub
 * acelasi id; id-urile de sectiune nu contin „/”, deci nu se pot confunda.
 */
export const BLOC_ATTR = "data-st-bloc";

/** Id-ul unui bloc in protocol. */
export function idBloc(idSectiune: string, idBlocului: string): string {
  return `${idSectiune}/${idBlocului}`;
}

/** Sectiunea si, daca e cazul, blocul dintr-un id din protocol. */
export function despartireId(id: string): { sectiune: string; bloc: string | null } {
  const i = id.indexOf("/");
  return i < 0 ? { sectiune: id, bloc: null } : { sectiune: id.slice(0, i), bloc: id.slice(i + 1) };
}

/** Selectorul marcajului pentru un id din protocol: de bloc sau de sectiune. */
export function selectorMarcaj(id: string): string {
  const atribut = id.includes("/") ? BLOC_ATTR : SECTION_ATTR;
  return `[${atribut}="${id.replace(/["\\]/g, "\\$&")}"]`;
}
