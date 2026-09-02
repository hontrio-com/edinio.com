import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import type { EvenimentEdinio } from "../evenimente";
import type { ContextTrimitere } from "./sarcina-tiktok";
import { dupaEsec, candSeReincearca } from "./ritm-reincercari";
import type { Json } from "@/types/database.types";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  COADA DE CONVERSII: PUNEREA, REVENDICAREA, INCHEIEREA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE O COADA SI NU O TRIMITERE PE LOC. Actiunea care creeaza un cont sau
  primeste o cerere de oferta n-are voie sa astepte dupa serverele Meta sau
  TikTok: un raspuns lent al lor ar incetini inscrierea omului, iar unul picat ar
  trebui reincercat de undeva. Coada desparte cele doua vieti.
*/

export type Destinatie = "meta" | "tiktok";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ⚠ DE UNDE STIM CA AVEM VOIE
  ═══════════════════════════════════════════════════════════════════════════════

  O uniune, nu un `boolean`. Fiecare loc de apel trebuie sa spuna DE UNDE stie, si
  `tsc` cade daca maine apare un al saptelea loc si cineva uita sa se intrebe.

  Un `marketing: boolean` simplu ar fi lasat pe oricine sa scrie `true` fiindca
  „aici sigur e in regula" — iar peste sase luni nimeni n-ar mai sti daca era.

  ⚠ SI DE CE NU SE CITESTE COOKIE-UL AICI. `puneLaCoada` e chemata si din locuri
  fara cerere HTTP — webhook-ul Stripe n-are cookie-urile omului, are doar ce a
  purtat el insusi prin metadata. Verificarea ramane intr-un singur loc;
  HOTARAREA se ia acolo unde exista omul.
*/
export type Temei =
  /** Citit din cookie-ul cererii de fata. */
  | { fel: "cookie"; stare: { marketing: boolean; vid?: string } | null }
  /** Carat de altundeva, fiindca aici nu exista cerere. Spune de unde. */
  | { fel: "carat"; marketing: boolean; vid?: string; unde: string };

function dezleagaTemeiul(t: Temei): { marketing: boolean; vid?: string } {
  return t.fel === "cookie"
    ? { marketing: t.stare?.marketing === true, ...(t.stare?.vid ? { vid: t.stare.vid } : {}) }
    : { marketing: t.marketing, ...(t.vid ? { vid: t.vid } : {}) };
}

/** Ca sa nu se scrie in jurnal la fiecare cerere a fiecarui om care a refuzat. */
const refuzuriStrigate = new Set<string>();

/** Ce se pastreaza langa eveniment, ca sa se poata construi mesajul mai tarziu. */
export type SarcinaPastrata = {
  ev: EvenimentEdinio;
  ctx: ContextTrimitere;
  /** Samanta din care iese `external_id`-ul furnizorului. Niciodata un email. */
  amprentaOmului: string;
  /*
    ⚠ MARTORII LASATI DE PIXELII DIN BROWSER: `_fbp`, `_fbc`, `_ttp`.

    Ei ridica potrivirea mai mult decat orice altceva avem — `_fbc` poarta chiar
    id-ul clicului pe reclama, adica legatura directa cu campania platita.

    ⚠ SI NU ADAUGA NICIO HOTARARE LEGALA NOUA: exista numai daca pixelul a rulat,
    adica numai dupa ce omul a acordat marketing. Trimitem inapoi ceva ce a fost
    scris cu acordul lui, nu ceva ce am strans pe furis.
  */
  martori?: { fbp?: string; fbc?: string; ttp?: string };
  /*
    ⚠ CLIPA IN CARE S-A PETRECUT, nu cea in care se trimite.

    Calculata la trimitere, un rand care asteapta in coada si se reincearca ore in
    sir ar fi raportat cu ceasul de atunci. Furnizorii atribuie conversia dupa
    `event_time`: o inscriere de marti seara ar cadea miercuri dimineata, pe alta
    campanie — sau, dupa sapte zile, ar fi respinsa de tot.

    Optionala fiindca randurile puse la coada inainte de reparatia asta n-o au.
  */
  cand?: string;
};

export type RandDeTrimis = {
  id: string;
  destinatie: Destinatie;
  nume_eveniment: string;
  event_id: string;
  sarcina: SarcinaPastrata;
  incercari: number;
  /** Cine a fost omul, ca sa se poata opri daca isi retrage acordul. */
  vizitator: string | null;
};

const TABELA = "edinio_conversion_outbox";

/**
 * Clientul de baza, dat din afara NUMAI in probe.
 *
 * ═══ ⚠ DE CE EXISTA CUSATURA ASTA ═══
 *
 * Cele trei functii de mai jos si-au schimbat azi purtarea tocmai pe drumul de
 * ESEC: una cade acum inchis in loc de deschis, alta reincearca si striga. Un
 * drum de esec pe care nu-l poti pipai e o promisiune, nu o plasa — si tocmai
 * felul de promisiune pe care l-am scos azi din trei comentarii.
 *
 * Probele au nevoie de o baza care RASPUNDE CU EROARE. Nu se poate cere asta unei
 * baze adevarate fara s-o strici, si nu se poate mima modulul fara un steag
 * experimental pe toata suita. Deci: parametru cu valoare implicita. In productie
 * nimeni nu-l da, si nimic nu se schimba.
 */
type Baza = ReturnType<typeof createAdminClient>;

/*
  ⚠ SE PASTREAZA EVENIMENTUL, NU MESAJUL GATA FACUT.

  Daca am fi pastrat mesajul construit, o reparatie a cartografierii (si azi am
  facut doua) n-ar fi atins randurile deja puse la coada — ar fi plecat cu forma
  veche, ore mai tarziu, si nimic n-ar fi aratat de ce. Asa, mesajul se cladeste
  la trimitere, din cartografierea de atunci.
*/
export async function puneLaCoada(
  ev: EvenimentEdinio,
  sarcina: Omit<SarcinaPastrata, "ev">,
  destinatii: readonly Destinatie[],
  temei: Temei,
): Promise<void> {
  const eventId = (ev as { event_id?: string }).event_id;
  if (!eventId) return;
  if (destinatii.length === 0) return;

  /*
    ═══ ⚠ POARTA 1: CINE N-A ACORDAT MARKETING NU LASA NICIUN RAND ═══

    Nu se pune si se filtreaza mai tarziu — nu se pune deloc. Un rand care exista
    e un rand care poate scapa: printr-un cron scris gresit maine, printr-o
    reparatie de date, printr-un export. Ce nu s-a scris nu se poate scurge.

    ⚠ SI REFUZUL NU E TACUT. O coada sanatoasa care pare goala e chiar felul de
    zero care a pacalit deja de trei ori aici. Se scrie in jurnal o data per
    proces si per eveniment — nu la fiecare vizitator care a apasat „respinge",
    fiindca atunci jurnalul ar deveni zgomot si nimeni nu l-ar mai citi.
  */
  const { marketing, vid } = dezleagaTemeiul(temei);
  if (!marketing) {
    const cheie = `${ev.name}:${temei.fel}`;
    if (!refuzuriStrigate.has(cheie)) {
      refuzuriStrigate.add(cheie);
      await logError({
        action: "conversii.faraConsimtamant",
        message: `"${ev.name}" nu s-a pus la coada: omul n-a acordat marketing (temei: ${
          temei.fel === "carat" ? temei.unde : "cookie"
        })`,
        severity: "info",
      });
    }
    return;
  }

  const cand = new Date().toISOString();
  const randuri = destinatii.map(d => ({
    destinatie: d,
    nume_eveniment: ev.name,
    event_id: eventId,
    sarcina: { ev, cand, ...sarcina } as unknown as Json,
    /* Pe coloana, nu doar in `sarcina`: retragerea trebuie sa-l poata gasi. */
    ...(vid ? { vizitator: vid } : {}),
  }));

  try {
    /*
      ⚠ `ignoreDuplicates` PESTE INDEXUL UNIC. Idempotenta sta in baza, nu aici:
      o a doua punere la coada pentru acelasi (destinatie, eveniment, event_id) nu
      creeaza un al doilea rand. Deci nici o actiune reluata, nici o pagina
      reincarcata nu produc doua conversii.
    */
    /*
      ═══ ⚠ `.throwOnError()`, SI DE CE FARA EL `try` DE MAI SUS ERA DECORATIV ═══

      ⚠ MASURAT pe 03.09.2026 cu supabase-js 2.106.1: o scriere respinsa de
      PostgREST NU arunca. Se rezolva linistit cu `{ data: null, error: {...} }`,
      iar la `update` si `count` iese `null`.

      Deci `catch`-ul de mai jos nu se deschidea niciodata. O eroare de drepturi,
      o restrictie incalcata, un PostgREST cazut — toate treceau drept reusita, si
      conversia se pierdea fara ca nimeni sa afle. Tacerea era chiar felul de zero
      care a mai pacalit aici.
    */
    await createAdminClient().from(TABELA).upsert(randuri, {
      onConflict: "destinatie,nume_eveniment,event_id",
      ignoreDuplicates: true,
    }).throwOnError();
  } catch (e) {
    /*
      ⚠ O COADA CARE NU PRIMESTE N-ARE VOIE SA STRICE INSCRIEREA. Masuratoarea e
      a doua in ordinea importantei; omul care isi face cont e prima. Se scrie in
      jurnal si se merge mai departe.
    */
    await logError({
      action: "conversii.puneLaCoada",
      message: e instanceof Error ? e.message : "punerea la coada a esuat",
      details: { eveniment: ev.name, destinatii: [...destinatii] },
      severity: "warning",
    });
  }
}

/**
 * Ia din coada ce e de trimis ACUM, si il marcheaza ca luat.
 *
 * ═══ ⚠ DE CE REVENDICAREA E O SCRIERE, NU O CITIRE ═══
 *
 * Doua rulari de cron se pot suprapune — Vercel nu garanteaza ca una s-a incheiat
 * inainte sa porneasca urmatoarea. Daca fiecare ar CITI randurile scadente si
 * apoi le-ar trimite, amandoua ar trimite aceleasi conversii.
 *
 * Aici randurile se iau printr-un UPDATE care le impinge programarea inainte, si
 * se intorc chiar randurile actualizate. Postgres serializeaza scrierile pe
 * acelasi rand: a doua rulare asteapta, apoi isi reevalueaza filtrul si nu mai
 * gaseste nimic — fiindca prima a mutat deja `next_retry_at`.
 *
 * ⚠ SI DE CE „INAINTE CU UN MINUT" SI NU O INCUIETOARE SEPARATA: daca rularea
 * moare la jumatate, randul se elibereaza singur peste un minut. O incuietoare
 * ar fi trebuit desfacuta de cineva, iar cine moare nu desface nimic.
 */
/**
 * Cat tine arenda pusa de `edinio_revendica_conversii`, in milisecunde.
 *
 * ⚠ CITITA DIN FUNCTIA DIN BAZA pe 03.09.2026: `next_retry_at = now() + interval
 * '1 minute'`. Scrisa aici ca sa poata cronul sa se opreasca INAINTE de ea. Daca
 * se schimba acolo, se schimba si aici — de aceea sta langa `revendica`, nu in
 * ruta.
 */
export const ARENDA_MS = 60_000;

/**
 * Cat asteptam un furnizor pentru o singura conversie.
 *
 * ⚠ DE CE EXISTA. `fetch` din Node NU ARE TERMEN implicit. O cerere catre Meta
 * sau TikTok putea atarna oricat, iar bucla cronului trimite cele 25 de randuri
 * UNUL DUPA ALTUL. Un singur furnizor lent tinea deci rularea peste cele 60 de
 * secunde ale arendei — si cronul urmator, care porneste din minut in minut,
 * revendica aceleasi randuri si le trimitea a doua oara.
 *
 * ⚠ CAT DE RAU ERA, ONEST. Meta si TikTok deduplica dupa `event_id`, deci a doua
 * trimitere n-ar fi umflat cifrele. Dar randul se marca de doua ori, si o
 * trimitere in zbor pe o arenda expirata inseamna ca poarta de consimtamant
 * verificata la revendicare nu mai are nicio valoare.
 */
export const MS_CERERE_FURNIZOR = 8_000;

export async function revendica(limita: number): Promise<RandDeTrimis[]> {
  /*
    ⚠ NUMELE ARGUMENTULUI (`limita`) TREBUIE SA FIE EXACT. PostgREST alege functia
    dupa numele argumentelor, nu dupa pozitie: scris gresit, apelul trece de
    typecheck si de build, si cade abia la prima rulare.
  */
  const { data, error } = await createAdminClient()
    .rpc("edinio_revendica_conversii", { limita });

  if (error) {
    await logError({
      action: "conversii.revendica",
      message: error.message,
      severity: "error",
    });
    return [];
  }
  return (data ?? []) as unknown as RandDeTrimis[];
}

/**
 * Care dintre vizitatorii astia si-au retras acordul.
 *
 * ⚠ SE INTREABA PENTRU LOTUL INTREG, o data. `revendica` tine randurile o
 * arenda de un minut; intre revendicare si trimitere se poate strecura o
 * retragere. Fara verificarea asta, fereastra aia ar ramane deschisa — si
 * tocmai acolo omul tocmai a apasat, deci e cel mai probabil sa se intample.
 *
 * ⚠ SE INTREABA DUPA CINE E IN LISTA, nu dupa cine lipseste. Un `not in` ar sari
 * peste NULL si ar lasa sa treaca tocmai randurile despre care stim cel mai
 * putin. Aici necunoscutul cade DESCHIS, dinadins: un rand exista numai fiindca
 * acordul exista cand a fost pus.
 */
export async function ceiCareAuRetras(
  vizitatori: readonly string[],
  baza: Baza = createAdminClient(),
): Promise<Set<string> | null> {
  const unici = [...new Set(vizitatori.filter((v): v is string => !!v))];
  if (unici.length === 0) return new Set();

  const { data, error } = await baza
    .from("edinio_consimtamant_retras")
    .select("vizitator")
    .in("vizitator", unici);

  if (error) {
    /*
      ═══ ⚠ LA EROARE SE INTOARCE `null`, SI ASTA INSEAMNA „NU TRIMITE" ═══

      ⚠ AM SUSTINUT PANA AZI CONTRARIUL, si m-am inselat. Argumentul meu era ca
      interogarea asta e doar o plasa pentru o fereastra de un minut, iar poarta
      adevarata sta la punere — deci o baza care clipeste n-are voie sa opreasca
      toate conversiile tuturor.

      Ce n-am cantarit e ASIMETRIA COSTURILOR. Ce apara plasa e exact ce nu poate
      apara poarta de la punere: retragerea de DUPA. Cand interogarea cade, plasa
      nu mai apara nimic — tocmai in clipa in care e singura care ar putea. Iar
      cele doua urmari nu se compara: a nu trimite inseamna o intarziere de un
      minut pentru o masuratoare, si nimic din ce face afacerea nu depinde de ea;
      a trimite inseamna o conversie plecata pentru un om care a spus nu.

      O intarziere se recupereaza. O trimitere nu se ia inapoi.
    */
    await logError({
      action: "conversii.ceiCareAuRetras",
      message: `nu s-a putut afla cine a retras, deci nu se trimite nimic in rularea asta: ${error.message}`,
      severity: "warning",
    });
    return null;
  }
  return new Set((data ?? []).map((r) => r.vizitator));
}

/**
 * A retras omul asta, ACUM?
 *
 * ═══ ⚠ DE CE INCA O INTREBARE, DUPA CEA PE LOT ═══
 *
 * Interogarea pe lot se face o data, la inceput. Dar lotul se trimite rand cu
 * rand, si intre primul si al douazeci si cincilea pot trece zeci de secunde.
 *
 *     12:00:00  se intreaba pentru tot lotul — ABC n-a retras
 *     12:00:02  ABC apasa „retrage"
 *     12:00:07  se ajunge la randul lui ABC, si pleaca
 *
 * Nimic nu poate opri o cerere deja plecata pe fir. Dar fereastra se poate
 * stramta pana aproape de zero, si asta se face aici: ultima intrebare, imediat
 * inaintea cererii catre furnizor.
 *
 * ⚠ `null` INSEAMNA „NU STIU", si se citeste ca „nu trimite" — vezi nota de mai
 * sus despre asimetria costurilor.
 */
export async function aRetras(vizitator: string, baza: Baza = createAdminClient()): Promise<boolean | null> {
  const { data, error } = await baza
    .from("edinio_consimtamant_retras")
    .select("vizitator")
    .eq("vizitator", vizitator)
    .maybeSingle();

  if (error) {
    await logError({
      action: "conversii.aRetras",
      message: `verificarea finala a acordului a cazut, deci randul nu pleaca: ${error.message}`,
      severity: "warning",
    });
    return null;
  }
  return data !== null;
}

/**
 * Randul a plecat. Se inchide, SI se goleste de ce nu mai foloseste nimanui.
 *
 * ═══ ⚠ DE CE SE STERG DATELE PERSONALE AICI, SI NU PESTE 30 DE ZILE ═══
 *
 * `sarcina` poarta ip-ul omului, browserul lui, si martorii lasati de pixeli
 * (`_fbp`, `_fbc`, `_ttp`). Toate exista dintr-un singur motiv: sa se poata
 * cladi mesajul catre furnizor.
 *
 * In clipa in care mesajul a plecat, motivul s-a stins. Ce ramane nu mai e o
 * unealta, e doar un risc care se aduna: randurile astea n-aveau nicio stergere,
 * deci ip-ul unui om ar fi stat acolo la nesfarsit.
 *
 * ⚠ SI NUMAI LA IZBANDA. La esec, sarcina trebuie sa supravietuiasca intacta —
 * reincercarea o reconstruieste din ea. De aceea golirea sta AICI, nu in
 * `marcheazaEsuat`.
 *
 * ⚠ CE SE PASTREAZA: numele evenimentului si clipa. Atat cat sa se poata
 * raspunde peste o luna la „ce s-a trimis si cand", fara sa se poata raspunde la
 * „cine era omul".
 */
/**
 * Ce ramane dintr-o sarcina dupa ce a plecat.
 *
 * ⚠ E O FUNCTIE DE SINE STATATOARE ca sa se poata proba fara nicio baza. Scrisa
 * inauntrul scrierii, singura ei proba ar fi fost una care cere Postgres — adica
 * una pe care n-o ruleaza nimeni la fiecare `npm test`.
 */
export function sarcinaGolita(s: SarcinaPastrata): Record<string, unknown> {
  return { ev: { name: s.ev.name }, cand: s.cand, golita: true };
}

/**
 * Randul a plecat: se insemneaza, si se goleste sarcina.
 *
 * ═══ ⚠ AICI ESECUL SE STRIGA, DAR NU SE ARUNCA ═══
 *
 * ⚠ CE SE INTAMPLA DACA SCRIEREA CADE. Conversia a ajuns DEJA la furnizor — asta
 * nu se mai poate lua inapoi. Daca insemnarea nu se scrie, arenda expira si
 * rularea urmatoare revendica acelasi rand si il trimite din nou.
 *
 * ⚠ SI DE CE NU ARUNCA. In cron, chemarea asta sta in acelasi `try` cu
 * trimiterea. Aruncand, ar cadea in `catch`-ul care cheama `marcheazaEsuat` — iar
 * acela ar programa o REINCERCARE pentru ceva ce a plecat cu bine. Adica leacul
 * ar face chiar raul de care ne temem, si l-ar face sigur, nu doar posibil.
 *
 * Deci: se incearca o data, se reincearca o data, si daca tot nu merge se scrie
 * in jurnal cu severitate `error` — e singurul caz din fisierul asta in care
 * datele din baza si lumea de afara chiar s-au despartit.
 */
export async function marcheazaTrimis(
  id: string,
  sarcina?: SarcinaPastrata,
  baza: Baza = createAdminClient(),
): Promise<void> {
  const golita = sarcina ? (sarcinaGolita(sarcina) as unknown as Json) : undefined;
  const campuri = {
    trimis_la: new Date().toISOString(),
    ultima_eroare: null,
    ...(golita ? { sarcina: golita } : {}),
    /* ⚠ Si legatura cu omul: fara ea, randul nu mai spune al cui a fost. */
    ...(golita ? { vizitator: null } : {}),
  };

  for (const incercare of [1, 2]) {
    try {
      await baza.from(TABELA).update(campuri).eq("id", id).throwOnError();
      return;
    } catch (e) {
      if (incercare === 1) continue;
      await logError({
        action: "conversii.marcajPierdut",
        message: `conversia a plecat, dar randul nu s-a putut insemna ca trimis: ${
          e instanceof Error ? e.message : "eroare necunoscuta"
        }. Se va retrimite dupa expirarea arendei.`,
        details: { rand: id },
        severity: "error",
      });
    }
  }
}

/**
 * Dupa un esec: se programeaza urmatoarea incercare, sau se abandoneaza.
 *
 * ⚠ MOTIVUL SE PASTREAZA SI LA ABANDON. Un rand abandonat fara motiv scris e o
 * conversie pierduta despre care nu se mai poate afla nimic — iar peste o luna
 * nimeni nu mai stie daca a fost o pana a lor sau o greseala a noastra.
 */
export async function marcheazaEsuat(id: string, incercariDeAcum: number, eroare: string): Promise<void> {
  const h = dupaEsec(incercariDeAcum);
  const comun = { incercari: incercariDeAcum, ultima_eroare: eroare.slice(0, 500) };

  /*
    ⚠ SI AICI ESECUL SE STRIGA. Fara `.throwOnError()`, o scriere respinsa trecea
    drept reusita — iar `incercari` nu crestea. Randul s-ar fi reincercat la
    nesfarsit, mereu cu acelasi numar, fara sa ajunga niciodata la abandon.
  */
  try {
    await createAdminClient().from(TABELA).update(
      h.fel === "abandoneaza"
        ? { ...comun, abandonat_la: new Date().toISOString(), ...scrubLaAbandon() }
        : { ...comun, next_retry_at: candSeReincearca(new Date(), h.pesteMinute) },
    ).eq("id", id).throwOnError();
  } catch (e) {
    await logError({
      action: "conversii.marcajEsecPierdut",
      message: `nu s-a putut insemna esecul randului: ${e instanceof Error ? e.message : "eroare necunoscuta"}`,
      details: { rand: id, fel: h.fel },
      severity: "error",
    });
  }
}

/**
 * Ce se sterge de pe un rand ABANDONAT.
 *
 * ═══ ⚠ DE CE SI LA ABANDON, NU DOAR LA REUSITA ═══
 *
 * La reusita sarcina se golea deja. La abandon ramanea INTREAGA — cu IP, cu
 * `user-agent`, cu `_fbp`/`_fbc`/`_ttp`, cu adresa de venire.
 *
 * ⚠ SI CINE AJUNGE ACOLO. Chiar oamenii care si-au RETRAS acordul: randurile lor
 * se abandoneaza pe calea asta. Deci tocmai cui a spus „nu mai vreau" ii ramanea
 * contextul cel mai bogat, pastrat la nesfarsit.
 *
 * ⚠ NU SE PIERDE NIMIC DIN CE TREBUIE PENTRU DEPANARE. Numele evenimentului,
 * `event_id`-ul, destinatia, numarul de incercari, motivul si clipele stau in
 * COLOANE separate, nu in `sarcina` — deci raman intacte. Se sterge numai ce
 * descrie OMUL, si numai dupa ce s-a hotarat ca randul nu mai pleaca nicaieri.
 *
 * ⚠ SI NUMAI LA ABANDON. Pe calea de reincercare sarcina trebuie sa ramana
 * intreaga: din ea se cladeste mesajul la incercarea urmatoare.
 */
export function scrubLaAbandon(): { sarcina: Json; vizitator: null } {
  return { sarcina: { golita: true, abandonata: true } as unknown as Json, vizitator: null };
}
