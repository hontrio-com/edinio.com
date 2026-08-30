"use server";

/*
 * Mesageria OLX: paginare, favorite, atasamente, si marcarea CA CITIT facuta cinstit.
 *
 * Actiunile vechi (`getOlxThreads`, `getOlxConversation`, `replyOlxThread`) raman in
 * `olx.actions.ts` neatinse. Aici sunt cele noi, plus inlocuitorul lui `getOlxConversation` —
 * vezi nota lunga de la `deschideOlxConversatia` pentru de ce a trebuit unul nou.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureMerchantToken } from "@/lib/olx/oauth";
import {
  getAdvert, getMessage, getThreadMessages, getThreadsPaged, getUser, isOlxError,
  markThreadRead, setThreadFavourite,
} from "@/lib/olx/client";
import type { OlxConfig, OlxMessage, OlxMessageFull, OlxThread } from "@/lib/olx/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Proprietatea magazinului, dovedita cu clientul UTILIZATORULUI (deci sub RLS).
 *
 * ⚠ Se citeste si `error`, nu doar `data`. `supabase-js` nu arunca: o citire cazuta intoarce
 * `data: null`, adica exact ce intoarce si „magazinul nu e al tau". Confundate, o pana de baza
 * i-ar spune comerciantului ca magazinul lui nu exista — un mesaj care il trimite sa caute in
 * locul gresit.
 */
async function guard(businessId: string): Promise<{ supabase: ServerClient; userId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data, error } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (error) return { error: "Nu am putut verifica magazinul. Încearcă din nou." };
  if (!data) return { error: "Magazin negăsit" };
  return { supabase, userId: user.id };
}

/*
 * Configurarea se citeste cu SERVICE ROLE, ca in `olx.actions.ts`: pe clientul utilizatorului
 * `privat.decripteaza_config` nu are dreptul sa decripteze, deci `refresh_token` ar iesi ca sir
 * `enc.v1.…` si reimprospatarea ar cadea cu `invalid_grant` — adica am marca o conexiune sanatoasa
 * drept moarta. Service role ocoleste RLS, de aceea `guard()` ruleaza INAINTE, mereu.
 *
 * ⚠ `maybeSingle` si `error` citit: un magazin fara rand in `store_settings` e legitim si atunci
 * `{}` e raspunsul corect; o citire CAZUTA nu are voie sa arate la fel.
 */
async function loadConfig(businessId: string): Promise<OlxConfig> {
  const { data, error } = await createAdminClient()
    .from("store_settings").select("olx_config").eq("business_id", businessId).maybeSingle();
  if (error) throw new Error(`Configurarea nu s-a putut citi: ${error.message}`);
  return ((data?.olx_config as OlxConfig) ?? {}) || {};
}

/**
 * Tiparul casei pentru orice apel catre OLX: pazeste, citeste configul, reimprospateaza jetonul.
 *
 * ⚠ `loadConfig` ARUNCA, iar aici e locul de cadere: o exceptie scapata dintr-o actiune de server
 * ajunge la ecran ca „a apărut o eroare neașteptată", fara nimic de facut pentru comerciant.
 */
async function withToken<T>(
  businessId: string,
  fn: (token: string, config: OlxConfig) => Promise<T>,
): Promise<T | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };
  let config: OlxConfig;
  try {
    config = await loadConfig(businessId);
  } catch {
    return { error: "Nu am putut citi setările OLX. Încearcă din nou." };
  }
  if (!config.connected || !config.refresh_token) return { error: "Conectează mai întâi contul OLX." };
  const tok = await ensureMerchantToken(createAdminClient(), businessId, config);
  if ("error" in tok) return { error: tok.error };
  return fn(tok.token, tok.config);
}

/** Randurile lor nu sunt o promisiune: fara `id` nu se poate nici selecta, nici desena. */
function conversatiiCurate(brut: unknown): OlxThread[] {
  if (!Array.isArray(brut)) return [];
  return (brut as OlxThread[]).filter((t) => t != null && typeof t.id === "number");
}

// ── 1. Paginare ────────────────────────────────────────────────────────────────────

/** O pagina de conversatii, plus de unde se cere urmatoarea. */
export interface OlxPaginaConversatii {
  threads: OlxThread[];
  /**
   * ⚠ Se numara randurile BRUTE primite, nu cele pastrate dupa curatare. Daca offsetul ar creste
   * cu cate randuri am tinut noi, un rand aruncat ar fi cerut la nesfarsit si „Încarcă mai multe"
   * s-ar invarti pe loc, aducand mereu aceeasi pagina.
   */
  urmatorulOffset: number;
  /**
   * ⚠ „Mai POATE fi", nu „sigur mai e": OLX nu intoarce un total, deci singurul semn e o pagina
   * plina. Ultima pagina exact plina da inca o cerere care intoarce zero — un drum in plus, nu o
   * minciuna in ecran.
   */
  areMaiMulte: boolean;
}

const PAGINA_CONVERSATII = 50;

export async function getOlxThreadsPage(
  businessId: string, offset: number, limit: number = PAGINA_CONVERSATII,
): Promise<OlxPaginaConversatii | { error: string }> {
  const off = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const lim = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : PAGINA_CONVERSATII;

  const res = await withToken(businessId, (token) => getThreadsPaged(token, { offset: off, limit: lim }));
  /* Amandoua caile de esec poarta `error: string` — a lui `withToken` si a lui OLX. */
  if ("error" in res) return { error: res.error };

  const brute = Array.isArray(res.data) ? res.data : [];
  return {
    threads: conversatiiCurate(brute),
    urmatorulOffset: off + brute.length,
    areMaiMulte: brute.length >= lim,
  };
}

// ── 2. Favorite ────────────────────────────────────────────────────────────────────

/**
 * Steaua de pe conversatie.
 *
 * ⚠ Ecranul NU intoarce steaua inainte de raspuns. Favoritul e o stare care traieste la EI: pusa
 * optimist si picata pe drum, comerciantul ar avea o conversatie „stelata" doar la el, iar in
 * aplicatia OLX de pe telefon n-ar gasi-o. Se asteapta raspunsul, si abia atunci se deseneaza.
 */
export async function setOlxThreadFavorit(
  businessId: string, threadId: number, favorit: boolean,
): Promise<{ success: true; favorit: boolean } | { error: string }> {
  if (!Number.isFinite(threadId)) return { error: "Conversație necunoscută." };
  const res = await withToken(businessId, (token) => setThreadFavourite(token, threadId, favorit));
  if ("error" in res) return { error: res.error };
  return { success: true, favorit };
}

// ── 3. Atasamente ──────────────────────────────────────────────────────────────────

/** Un atasament gata de aratat: are adresa, are nume, si stim daca e imagine. */
export interface OlxAtasament {
  url: string;
  name: string;
  /** `true` doar cand chiar STIM ca e imagine. In rest se arata ca legatura, nu ca poza stricata. */
  esteImagine: boolean;
}

export interface OlxMesajCuAtasamente {
  messageId: number;
  atasamente: OlxAtasament[];
}

/**
 * Cate mesaje cerem in detaliu la o deschidere de conversatie.
 *
 * ⚠ Fiecare mesaj inseamna o cerere separata la ei (`GET /threads/{id}/messages/{id}`). Ecranul
 * trimite doar mesajele PRIMITE despre care nu stie sigur ca n-au atasamente, dar o conversatie
 * lunga ar putea trimite oricum zeci de id-uri — plafonul se pune AICI, pe server, fiindca aici e
 * singurul loc pe care ecranul nu-l poate ocoli.
 */
const MAX_MESAJE_DETALIATE = 10;

const EXTENSIE_IMAGINE = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i;

/**
 * ⚠ CE VINE DE LA EI NU SE PUNE DIRECT INTR-UN `href`.
 *
 * `attachments` poate lipsi cu totul, poate fi `null`, poate avea randuri fara `url` sau fara
 * `name`. Iar o adresa `javascript:` scapata intr-o legatura ar rula in pagina comerciantului: se
 * primesc doar `http`/`https`, restul se arunca in tacere.
 *
 * ⚠ `mime_type` e sursa buna pentru „e imagine?"; cand lipseste, extensia e o GHICEALA — si de
 * aceea ghicim numai in sus (imagine), niciodata in jos: o legatura aratata ca legatura merge
 * oricum, o imagine care nu e imagine ar fi un dreptunghi rupt.
 */
function curataAtasamente(brut: OlxMessageFull["attachments"]): OlxAtasament[] {
  if (!Array.isArray(brut)) return [];
  const iesire: OlxAtasament[] = [];
  for (const a of brut) {
    const url = typeof a?.url === "string" ? a.url.trim() : "";
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const mime = typeof a?.mime_type === "string" ? a.mime_type : "";
    const nume = typeof a?.name === "string" && a.name.trim() ? a.name.trim() : "Atașament";
    iesire.push({ url, name: nume, esteImagine: mime.startsWith("image/") || (!mime && EXTENSIE_IMAGINE.test(url)) });
  }
  return iesire;
}

/**
 * Atasamentele mesajelor cerute, luate unul cate unul prin `getMessage`.
 *
 * Se cheama DUPA ce conversatia e deja pe ecran, dinadins: pusa in acelasi drum cu mesajele, ar fi
 * intarziat cu zece cereri afisarea textului, care e ce vrea omul intai.
 */
export async function getOlxAtasamente(
  businessId: string, threadId: number, messageIds: number[],
): Promise<{ mesaje: OlxMesajCuAtasamente[]; necitite: number } | { error: string }> {
  if (!Number.isFinite(threadId)) return { error: "Conversație necunoscută." };
  /* Cele mai NOI mesaje sunt cele pe care omul le are sub ochi, deci taietura se face de la coada. */
  const ids = [...new Set((messageIds ?? []).filter((id) => typeof id === "number" && Number.isFinite(id)))]
    .slice(-MAX_MESAJE_DETALIATE);
  if (ids.length === 0) return { mesaje: [], necitite: 0 };

  const res = await withToken(businessId, (token) =>
    Promise.all(ids.map((id) => getMessage(token, threadId, id))));
  if (!Array.isArray(res)) return { error: res.error };

  const mesaje: OlxMesajCuAtasamente[] = [];
  let necitite = 0;
  for (let i = 0; i < res.length; i++) {
    const r = res[i];
    /*
     * ⚠ Un mesaj picat NU se socoteste „fara atasamente": se numara separat, iar ecranul spune ca
     * n-a putut citi tot. Altfel un 429 de la ei ar arata exact ca o conversatie fara poze.
     */
    if (isOlxError(r)) { necitite++; continue; }
    const atasamente = curataAtasamente(r.data?.attachments);
    /* Id-ul cerut, nu cel din raspuns: e cel dupa care ecranul isi cauta mesajul. */
    if (atasamente.length > 0) mesaje.push({ messageId: ids[i], atasamente });
  }
  return { mesaje, necitite };
}

// ── 4. Conversatia, cu marcarea „citit" care isi citeste raspunsul ──────────────────

export interface OlxConversatie {
  messages: OlxMessage[];
  buyer: { id: number; name: string; avatar: string | null } | null;
  advert: { id: number; title: string; url: string | null; price: string | null; image: string | null } | null;
  /**
   * Am reusit sa le spunem LOR ca firul e citit. `false` inseamna ca la ei a ramas necitit, deci
   * ecranul tine bulina aprinsa.
   */
  marcatCitit: boolean;
}

/**
 * Deschide o conversatie: mesajele, profilul cumparatorului, cartonasul anuntului — si o marcheaza
 * citita ASTEPTAND raspunsul.
 *
 * ═══ ⚠ DE CE O ACTIUNE NOUA, SI NU CEA VECHE ═══
 *
 * `getOlxConversation` din `olx.actions.ts` face `void markThreadRead(token, threadId)` — trimite
 * si pleaca. Iar ecranul stingea bulina de necitit in aceeasi clipa, din `selectThread`. Cele doua
 * impreuna dau singurul rezultat care nu se poate repara singur:
 *
 *     omul deschide firul  ->  bulina se stinge la noi
 *     POST-ul pica (429, retea, jeton expirat intre timp)  ->  la OLX firul ramane NECITIT
 *     omul reincarca pagina  ->  bulina e iar aprinsa, fara ca nimeni sa fi scris ceva
 *
 * Si mai rau: pe telefon, in aplicatia OLX, firul ramane necitit — deci numaratoarea noastra si a
 * lor spun lucruri diferite despre acelasi fir, iar comerciantul crede ca a raspuns la tot.
 *
 * ⚠ ALEGEREA: SE CITESTE RASPUNSUL SI SE SPUNE. Nu „nu actualizam optimist si tacem", fiindca a
 * doua varianta lasa bulina aprinsa dupa o marcare REUSITA — adica minte in cealalta directie, si
 * omul ar recitit firul degeaba. Marcarea e singurul lucru de aici cu efect la ei; starea din ecran
 * e doar oglinda starii lor, si o oglinda are voie sa arate numai ce s-a confirmat.
 *
 * Costul: `markThreadRead` intra in `Promise.all`, deci nu adauga nicio intarziere in serie — doar
 * raspunsul lui nu se mai arunca.
 */
export async function deschideOlxConversatia(
  businessId: string,
  threadId: number,
  opts: { advertId?: number; interlocutorId?: number } = {},
): Promise<OlxConversatie | { error: string }> {
  if (!Number.isFinite(threadId)) return { error: "Conversație necunoscută." };

  const res = await withToken(businessId, async (token, config) => {
    const [msgsRes, buyerRes, advertRes, citRes] = await Promise.all([
      getThreadMessages(token, threadId),
      opts.interlocutorId ? getUser(token, opts.interlocutorId) : Promise.resolve(null),
      opts.advertId ? getAdvert(token, opts.advertId) : Promise.resolve(null),
      markThreadRead(token, threadId),
    ]);
    return { msgsRes, buyerRes, advertRes, citRes, numeVanzator: config.olx_user_name ?? "" };
  });
  if ("error" in res) return { error: res.error };

  const { msgsRes, buyerRes, advertRes, citRes, numeVanzator } = res;
  if (isOlxError(msgsRes)) return { error: msgsRes.error };

  /* Ei pot intoarce cel mai nou intai; firul de chat se citeste crescator. */
  const messages = (Array.isArray(msgsRes.data) ? msgsRes.data : [])
    .filter((m) => m != null && typeof m.id === "number")
    .slice()
    .sort((a, b) => a.id - b.id);

  /*
   * Profilul cumparatorului se pastreaza numai daca e un nume ADEVARAT si ALTUL decat al
   * vanzatorului: OLX intoarce uneori chiar contul magazinului aici, iar ecranul ar arata numele
   * propriu al comerciantului in dreptul „cumparatorului".
   */
  let buyer: OlxConversatie["buyer"] = null;
  if (buyerRes && !isOlxError(buyerRes) && buyerRes.data) {
    const nume = (buyerRes.data.name ?? "").trim();
    if (nume && nume.toLowerCase() !== numeVanzator.trim().toLowerCase()) {
      buyer = { id: buyerRes.data.id, name: nume, avatar: buyerRes.data.avatar ?? null };
    }
  }

  let advert: OlxConversatie["advert"] = null;
  if (advertRes && !isOlxError(advertRes) && advertRes.data) {
    const a = advertRes.data;
    advert = {
      id: a.id,
      title: a.title ?? "",
      url: a.url ?? null,
      price: a.price?.value != null ? `${a.price.value} ${a.price.currency ?? "RON"}` : null,
      image: a.images?.[0]?.url ?? null,
    };
  }

  return { messages, buyer, advert, marcatCitit: !isOlxError(citRes) };
}
