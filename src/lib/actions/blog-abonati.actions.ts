"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin-guard";
import { sendBlogSubscribeConfirmation } from "@/lib/email";
import { logError } from "@/lib/error-logger";
import { clientIpFromHeaders, rateLimit } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { randCsv } from "@/lib/blog/csv";
import { PLATFORM_ORIGIN } from "@/lib/seo";

/**
 * Abonarea la noutățile blogului.
 *
 * ⚠ CU CONFIRMARE, NU FĂRĂ. Fără ea, oricine poate scrie adresa altcuiva în
 * casetă, iar acela începe să primească emailuri pe care nu le-a cerut. E și
 * greșit, și ilegal: consimțământul trebuie să fie al persoanei și trebuie să se
 * poată dovedi. Rândurile fără `confirmed_at` NU sunt abonați și nu primesc
 * nimic.
 *
 * ⚠ NICIO REGULĂ DE `anon` PE TABELĂ, ȘI NICIUN GRANT PE FUNCȚII. Tot ce e aici
 * trece prin cheia de serviciu. Cheia anonimă a Supabase e publică: o funcție
 * chemabilă de `anon` ar fi însemnat că oricine poate încerca jetoane direct,
 * ocolind orice plafon scris aici.
 */
function db() {
  return createAdminClient();
}

export type RaspunsAbonare = { ok: true; mesaj: string } | { ok: false; eroare: string };

/**
 * Amprenta unui jeton.
 *
 * ⚠ ÎN BAZĂ STĂ DOAR ASTA, niciodată jetonul. Un jeton de confirmare furat nu e
 * „o adresă în plus pe listă": e puterea de a FABRICA dovada de consimțământ pe
 * care legea o cere de la noi. Dintr-o amprentă nu se poate reface jetonul, deci
 * o scurgere a bazei nu dă nimănui puterea asta.
 *
 * SHA-256 gol, fără sare și fără trecere lentă, e de ajuns AICI și nu ar fi de
 * ajuns la o parolă: jetonul are 24 de octeți de întâmplare adevărată, deci nu
 * poate fi ghicit cu un dicționar. Sarea și lentoarea apără parole slabe alese
 * de oameni; aici nu alege niciun om.
 */
function amprenta(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

/** Cât trăiește o legătură de confirmare. */
const ORE_DE_VIATA = 48;

/**
 * E o adresă de email care are cum să existe?
 *
 * Verificarea e deliberat simplă. Una „completă" după RFC respinge adrese
 * valide și tot nu spune dacă cutia există; singura dovadă adevărată e emailul
 * de confirmare, care oricum se trimite.
 */
function emailPlauzibil(e: string): boolean {
  if (e.length < 6 || e.length > 254) return false;
  const p = e.split("@");
  return p.length === 2 && p[0].length > 0 && p[1].includes(".") && !/\s/.test(e);
}

export async function aboneazaLaBlog(emailBrut: string): Promise<RaspunsAbonare> {
  /*
    Plafonul e ÎNAINTE de orice altceva. Acțiunea trimite un email către o adresă
    aleasă de cel care apasă, deci fără limită oricine ne poate folosi domeniul
    ca să trimită mesaje nepoftite. Costul nu e în bani, e în livrabilitate:
    domeniul nostru ajunge în lista neagră, și atunci nu mai ajung nici emailurile
    de comandă ale comercianților.
  */
  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`blogSubscribe:${ip}`, 3, 60_000)) {
    return { ok: false, eroare: "Ai încercat de câteva ori. Așteaptă un minut." };
  }

  const email = emailBrut.trim().toLowerCase();
  if (!emailPlauzibil(email)) {
    return { ok: false, eroare: "Adresa nu pare corectă. Verific-o și încearcă din nou." };
  }

  /*
    ⚠ AL DOILEA PLAFON, CEL CARE CHIAR ȚINE.

    Cel de deasupra e în memoria instanței: se pierde la fiecare desfășurare, iar
    pe serverless „3 pe minut" devine „3 × câte instanțe calde sunt". Pentru o
    acțiune care trimite EMAIL ADEVĂRAT, atât nu e de ajuns.

    Două chei, fiindcă opresc două lucruri diferite: una pe IP (cineva care
    trimite multe adrese), alta pe adresă (mulți care trimit aceeași adresă, ca
    să inunde cutia cuiva).
  */
  const peIp = await consumaLimita(`blog-subscribe:ip:${ip}`, 10, 3600, 3600);
  if (!peIp.permis) {
    return { ok: false, eroare: "Prea multe încercări de aici. Încearcă mai târziu." };
  }

  /*
    ⚠ ACELAȘI RĂSPUNS PE TOATE DRUMURILE.

    Un mesaj care spune „adresa e deja abonată" transformă caseta într-o unealtă
    de aflat cine e abonat: scrii adrese pe rând și citești răspunsul. De aceea
    „te-am înscris acum", „ești deja abonat" și „ai atins plafonul pe adresă"
    arată identic din afară.
  */
  const MESAJ = "Gata. Ți-am trimis un email; apasă legătura din el ca să confirmi.";

  const peAdresa = await consumaLimita(`blog-subscribe:email:${email}`, 3, 86_400);
  if (!peAdresa.permis) return { ok: true, mesaj: MESAJ };

  const jeton = randomBytes(24).toString("base64url");
  const amprentaJetonului = amprenta(jeton);

  /*
    ⚠ O SINGURĂ MIȘCARE, ȘI BAZA HOTĂRĂȘTE.

    Înainte erau două: un `select` care întreba dacă adresa există, apoi un
    `upsert`. Două cereri în același timp treceau amândouă de `select`, emiteau
    două jetoane, al doilea îl omora pe primul — dar PLECAU DOUĂ EMAILURI, iar
    legătura din primul era deja moartă. Omul apasă pe emailul de sus, nu merge,
    și crede că e stricat la noi.

    Acum funcția din bază face totul într-o singură instrucțiune și spune cine a
    câștigat. Emailul pleacă doar de la câștigător.
  */
  const { data: aEmis, error } = await db().rpc("blog_cere_confirmare", {
    p_email: email,
    p_token_hash: amprentaJetonului,
    p_expira_la: new Date(Date.now() + ORE_DE_VIATA * 3600_000).toISOString(),
    p_sursa: "blog",
  });

  if (error) {
    await logError({
      action: "aboneazaLaBlog",
      message: error.message ?? "eroare necunoscuta",
      severity: "error",
    });
    return { ok: false, eroare: "Nu am putut înregistra adresa acum. Încearcă mai târziu." };
  }

  /* Nu e rândul nostru să trimitem: ori e deja abonat, ori are un jeton viu. */
  if (aEmis !== true) return { ok: true, mesaj: MESAJ };

  /*
    ⚠ DACĂ EMAILUL NU PLEACĂ, ÎNSCRIEREA NU S-A ÎNTÂMPLAT. Rândul rămâne
    neconfirmat, deci inofensiv, dar omului i se spune adevărul. Un formular care
    zice „ți-am trimis" fără să fi trimis e mai rău decât unul care dă eroare:
    al doilea măcar îl face să încerce altfel.
  */
  try {
    await sendBlogSubscribeConfirmation(email, `${PLATFORM_ORIGIN}/blog/confirma?t=${jeton}`);
  } catch (err) {
    await logError({
      action: "aboneazaLaBlog.email",
      message: err instanceof Error ? err.message : "eroare necunoscuta",
      severity: "error",
    });

    /*
      ⚠ JETONUL SE STINGE LA LOC, ALTFEL OMUL RAMANE BLOCAT DOUA ZILE.

      Baza emitea jetonul, apoi Resend cadea. Ii spuneam adevarul („n-am putut
      trimite"), dar jetonul ramanea viu 48 de ore — iar `blog_cere_confirmare`
      refuza sa emita altul cat timp exista unul viu, tocmai ca sa nu plece doua
      emailuri. Deci a doua incercare primea raspunsul linistitor „ti-am trimis
      un email" si NU trimitea nimic. Primul n-a plecat, al doilea nici atat.

      ⚠ Se stinge NUMAI jetonul emis de noi acum. Fara conditia pe amprenta, o
      cerere mai noua venita intre timp (alta fila, alt dispozitiv) ar fi ramas
      fara jeton din pricina esecului uneia mai vechi.

      ⚠ Daca si asta pica, nu mai avem ce face — dar macar se vede in jurnal.
      Omul primeste tot un mesaj cinstit; ce se pierde e doar sansa de a reincerca
      imediat.
    */
    const { error: eAnulare } = await db().rpc("blog_anuleaza_confirmare", {
      p_email: email,
      p_token_hash: amprentaJetonului,
    });
    if (eAnulare) {
      await logError({
        action: "aboneazaLaBlog.anulare",
        message: eAnulare.message ?? "eroare necunoscuta",
        severity: "error",
      });
    }

    return { ok: false, eroare: "Nu am putut trimite emailul de confirmare. Încearcă din nou." };
  }

  return { ok: true, mesaj: MESAJ };
}

/**
 * Confirmarea, din legătura primită pe email.
 *
 * ⚠ SE CHEAMĂ DINTR-UN POST, NU LA RANDARE. Multă vreme a stat la GET, cu
 * scuza că „cel mai rău, un scaner de legături confirmă o adresă care oricum
 * ceruse confirmarea". Scuza era falsă: oricine poate scrie adresa ALTCUIVA în
 * casetă, și tocmai asta e ce oprește dubla confirmare. Iar scanerele de
 * legături — Safe Links, porțile de email ale firmelor — chiar deschid adresele
 * din mesaje, înainte ca omul să apuce să vadă mesajul.
 *
 * Deci un GET însemna: scriu adresa ta, poarta firmei tale deschide legătura, și
 * din acel moment avem „dovada" că ai cerut tu. Un buton nu poate fi apăsat de o
 * poartă.
 *
 * ⚠ JETONUL SE STINGE, ȘI ARE ȘI TERMEN. Stins, fiindcă o legătură de
 * confirmare n-are de ce să mai lucreze după ce și-a făcut treaba. Cu termen,
 * fiindcă una uitată într-o cutie de email un an nu mai dovedește nimic despre
 * ce vrea omul azi.
 */
/**
 * Ce s-a întâmplat cu un jeton — în trei stări, nu în două.
 *
 * ⚠ „NU E BUN" ȘI „N-AM PUTUT ÎNTREBA" NU SUNT ACELAȘI LUCRU, și amândouă
 * ajungeau la `false`, deci la același text: „Legătura nu mai lucrează".
 *
 * La confirmare asta e supărător. La DEZABONARE e mai mult: omul a cerut anume
 * să nu mai primească emailuri, iar pagina îi spunea că legătura lui nu e bună.
 * El pleacă și crede că a rămas abonat — iar următoarea apăsare nu e „încearcă
 * din nou", e „Raportează ca spam", și de acolo suferă tot domeniul.
 *
 * ⚠ ACELAȘI TIPAR EXISTA DEJA IN PLATFORMA, la `api/recovery/unsubscribe`: ia
 * eroarea, o scrie în jurnal ca `critical`, și răspunde 503 cu „Nu am putut
 * înregistra dezabonarea". Blogul se aliniază la el, nu inventează altul.
 *
 * ⚠ ȘI PLAFOANELE INTRĂ LA „TEMPORAR". Un om care a încercat de prea multe ori
 * n-are un jeton stricat — are de așteptat. Înainte i se spunea tot că legătura
 * a expirat, ceea ce îl făcea să renunțe definitiv.
 */
export type RezultatJeton =
  | { ok: true }
  | { ok: false; motiv: "invalid" }
  | { ok: false; motiv: "temporar" };

export async function confirmaAbonarea(jeton: string): Promise<RezultatJeton> {
  const t = (jeton ?? "").trim();
  if (t.length < 20 || t.length > 200) return { ok: false, motiv: "invalid" };

  const ip = clientIpFromHeaders(await headers());
  /* Plafon și aici: fără el, jetoanele se pot încerca la nesfârșit. */
  if (!rateLimit(`blogConfirm:${ip}`, 10, 60_000)) return { ok: false, motiv: "temporar" };
  const durabil = await consumaLimita(`blog-confirm:ip:${ip}`, 60, 3600, 3600);
  if (!durabil.permis) return { ok: false, motiv: "temporar" };

  const { data, error } = await db().rpc("blog_confirma", { p_token_hash: amprenta(t), p_ip: ip });
  if (error) {
    await logError({
      action: "blog.confirma",
      message: `Confirmarea nu a putut fi scrisă: ${error.message}`,
      severity: "error",
    });
    return { ok: false, motiv: "temporar" };
  }
  return typeof data === "string" && data.length > 0
    ? { ok: true }
    : { ok: false, motiv: "invalid" };
}

/**
 * Dezabonarea.
 *
 * ⚠ TEXTUL O PROMITEA DE LA ÎNCEPUT — „te poți dezabona din orice email" — și
 * nu exista. O promisiune de felul ăsta nu e cosmetică: e ce desparte un
 * newsletter de spam, și pentru cine primește e singura ieșire. Fără ea,
 * următorul pas al omului nu e să ne scrie, e să apese „Raportează ca spam", și
 * de acolo strică livrabilitatea întregului domeniu.
 *
 * ⚠ IDEMPOTENTĂ. Cine apasă de două ori vede tot „gata", nu o eroare. O pagină
 * de dezabonare care dă eroare îl face pe om să creadă că n-a ieșit.
 */
export async function dezaboneazaDinBlog(jeton: string): Promise<RezultatJeton> {
  const t = (jeton ?? "").trim();
  if (t.length < 20 || t.length > 200) return { ok: false, motiv: "invalid" };

  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`blogUnsub:${ip}`, 10, 60_000)) return { ok: false, motiv: "temporar" };

  const { data, error } = await db().rpc("blog_dezaboneaza", { p_unsub_token: t });
  /*
    ⚠ AICI SE SCRIE `critical`, NU `error`, si nu e o exagerare.

    O dezabonare care nu se inregistreaza inseamna ca omul va mai primi emailuri
    dupa ce a cerut anume sa nu mai primeasca. Asta nu e o suparare a lui, e
    riscul ca tot domeniul sa fie raportat ca spam.
  */
  if (error) {
    await logError({
      action: "blog.dezabonare",
      message: `Dezabonarea NU s-a inregistrat: ${error.message}`,
      severity: "critical",
    });
    return { ok: false, motiv: "temporar" };
  }
  return data === true ? { ok: true } : { ok: false, motiv: "invalid" };
}

// ── Partea de admin ──────────────────────────────────────────────────────────

export type Abonat = {
  id: string;
  email: string;
  source: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type PaginaAbonati = {
  abonati: Abonat[];
  /** Toți, confirmați sau nu, minus cei dezabonați. */
  total: number;
  /** Câți dintre ei au apăsat legătura. Numai ei primesc emailuri. */
  confirmati: number;
  pagina: number;
  pagini: number;
};

const PAGINA_GOALA: PaginaAbonati = { abonati: [], total: 0, confirmati: 0, pagina: 1, pagini: 1 };

const PE_PAGINA = 50;

/**
 * Abonații, pe pagini.
 *
 * ⚠ AVEA `.limit(1000)` ȘI NIMIC ALTCEVA. La al 1001-lea abonat, ecranul ar fi
 * arătat mai departe o mie, fără niciun semn că lipsește cineva — și, mai rău,
 * exportul se făcea din lista deja încărcată în browser, deci ar fi exportat tot
 * o mie. Un export de listă de abonați care tace despre ce lipsește e cel mai
 * prost fel de a afla că ai mai mulți abonați decât credeai.
 *
 * Vezi memoria „plafonul-de-o-mie-in-scripturi": aici nu era în script, era în
 * ecran, dar tăcerea e aceeași.
 */
export async function listeazaAbonati(pagina = 1): Promise<PaginaAbonati> {
  /*
    ⚠ ADMIN, NU REDACTOR. Sunt adrese de email ale unor oameni, adică date
    personale — n-au nicio treabă cu scrisul articolelor. Ecranul cerea doar
    `requireBlogEditor`, deci un redactor ajungea pe pagină; lista ieșea goală
    fiindcă acțiunea cerea admin, dar asta e o apărare din întâmplare, nu una
    pe față: pagina îi spunea „niciun abonat", ceea ce e o minciună.
  */
  if (!(await requireAdminApi())) return PAGINA_GOALA;

  const p = Number.isSafeInteger(pagina) && pagina >= 1 ? pagina : 1;
  const de_la = (p - 1) * PE_PAGINA;

  const [lista, ceiConfirmati] = await Promise.all([
    db()
      .from("blog_subscribers")
      .select("id, email, source, confirmed_at, created_at", { count: "exact" })
      .is("unsubscribed_at", null)
      .order("created_at", { ascending: false })
      .range(de_la, de_la + PE_PAGINA - 1),
    /* ⚠ Numărat în bază, nu din pagina încărcată. Ecranul scria „N abonați
       confirmați" socotind din cele câteva rânduri pe care le avea în mână —
       adică spunea un număr mic cu deplină siguranță. */
    db()
      .from("blog_subscribers")
      .select("id", { count: "exact", head: true })
      .is("unsubscribed_at", null)
      .not("confirmed_at", "is", null),
  ]);

  const total = lista.count ?? 0;
  return {
    abonati: (lista.data ?? []) as unknown as Abonat[],
    total,
    confirmati: ceiConfirmati.count ?? 0,
    pagina: p,
    pagini: Math.max(1, Math.ceil(total / PE_PAGINA)),
  };
}

/**
 * Exportul, făcut pe server.
 *
 * ⚠ NU DIN CE E ÎN BROWSER. Ecranul arată o pagină de 50; un export construit
 * din ce se vede ar fi dat 50 de rânduri și ar fi spus „abonati.csv". Aici se
 * citește din bază, în felii, până se termină — deci fișierul are ce scrie pe el.
 *
 * ⚠ DOAR CONFIRMAȚII. Un rând neconfirmat nu e abonat: e o adresă pe care a
 * scris-o cineva. Scoasă în CSV, ar ajunge într-o listă de trimitere, și de
 * acolo trimitem fără consimțământ.
 */
export async function exportaAbonati(): Promise<{ csv: string; randuri: number } | { error: string }> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };

  const FELIE = 500;
  const toti: Abonat[] = [];
  for (let de_la = 0; ; de_la += FELIE) {
    const { data, error } = await db()
      .from("blog_subscribers")
      .select("id, email, source, confirmed_at, created_at")
      .is("unsubscribed_at", null)
      .not("confirmed_at", "is", null)
      .order("created_at", { ascending: true })
      .range(de_la, de_la + FELIE - 1);
    if (error) return { error: "Nu am putut citi lista." };
    const felie = (data ?? []) as unknown as Abonat[];
    toti.push(...felie);
    if (felie.length < FELIE) break;
  }

  /*
    Vezi `blog/csv.ts`: ghilimelele apără CSV-ul, dar nu și foaia de calcul. O
    celulă care începe cu `=`, `+`, `-` sau `@` e citită ca FORMULĂ de Excel și
    de LibreOffice, oricâte ghilimele ar avea în jur — iar verificarea adresei de
    email e deliberat simplă, deci o adresă chiar poate începe așa.
  */
  const linii = [
    "email,sursa,confirmat_la,creat_la",
    ...toti.map((a) => randCsv([a.email, a.source, a.confirmed_at, a.created_at])),
  ];

  return { csv: linii.join("\r\n"), randuri: toti.length };
}

export async function stergeAbonat(id: string): Promise<{ error: string } | { success: true }> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const { error } = await db().from("blog_subscribers").delete().eq("id", id);
  if (error) return { error: "Nu s-a putut sterge." };
  revalidatePath("/admin/blog/abonati");
  return { success: true };
}
