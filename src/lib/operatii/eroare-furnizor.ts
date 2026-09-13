/**
 * Verdictul, pastrat pe eroare — ca sa se poata raspunde la o singura intrebare:
 * A REFUZAT furnizorul, sau doar n-a raspuns?
 *
 * ═══ DE CE E NEVOIE ═══
 *
 * Wrapperele arunca acelasi `Error` si pentru un refuz de validare, si pentru o
 * cadere de retea. Din afara, `catch (e)` vede acelasi lucru. Dar registrul de
 * operatii externe trebuie sa le deosebeasca, fiindca deciziile sunt opuse:
 *
 *   refuz dovedit  -> nu s-a creat nimic acolo -> reincercarea e LIBERA
 *   nu stim        -> poate s-a creat          -> reincercarea face DUPLICAT
 *
 * Fara asta, singura alegere onesta ar fi „nu stim" la orice esec — si atunci un
 * 400 de validare (la Woot: un caracter cu diacritice in adresa, cazul documentat
 * in src/lib/woot.ts) ar bloca comanda pana la o interventie manuala. Adica
 * registrul ar strica un drum care merge azi.
 *
 * ═══ DE CE VERDICTUL, SI NU STATUSUL ═══
 *
 * Prima forma pastra `res.status` si deducea verdictul din el. Merge la Woot, dar
 * NU la DPD: `dpdCall` (src/lib/dpd.ts:94) trateaza si `data["error"]` pe un
 * raspuns 200 — DPD raspunde „OK" la nivel HTTP si refuza in corp. Cu status,
 * refuzul ala ar fi iesit „necunoscut" si ar fi blocat comanda degeaba.
 *
 * Deci fiecare wrapper spune ce STIE, in locul unde stie, si aici nu se mai
 * ghiceste nimic.
 *
 * ═══ CE E ADITIV IN ASTA ═══
 *
 * Constructorii intorc un `Error` obisnuit, cu acelasi `message` ca inainte. Cine
 * il prinde si citeste `.message` nu vede nicio schimbare; doar cine intreaba de
 * verdict afla in plus. Deci wrapperele se pot inzestra fara sa-si schimbe
 * purtarea — ceea ce conteaza, fiindca ele functioneaza si sunt testate.
 */

export type Verdict = "esuat" | "necunoscut";

/** Cheia e lunga si specifica dinadins: nu se poate ciocni cu un camp al furnizorului. */
const CHEIE = "verdictFurnizor" as const;

function cu(mesaj: string, verdict: Verdict): Error {
  const e = new Error(mesaj) as Error & { [CHEIE]?: Verdict };
  e[CHEIE] = verdict;
  return e;
}

/**
 * Furnizorul a primit cererea, a inteles-o si a RESPINS-O. Nimic nu s-a creat.
 * Reincercarea, dupa corectarea datelor, e chiar ce vrea comerciantul sa poata face.
 */
export const eroareRefuz = (mesaj: string): Error => cu(mesaj, "esuat");

/**
 * Nu stim daca s-a intamplat: retea cazuta, raspuns necitibil, 5xx dupa ce cererea
 * a ajuns. Cazul clasic in care documentul exista si raspunsul nu mai ajunge.
 */
export const eroareNesigura = (mesaj: string): Error => cu(mesaj, "necunoscut");

/**
 * Cand tot ce avem e statusul HTTP.
 *
 *   4xx   furnizorul a inteles si a respins -> REFUZ.
 *   408   „Request Timeout": singurul 4xx care NU dovedeste un refuz — poate
 *         insemna ca cererea a fost primita si a expirat la mijloc. NESIGUR.
 *   5xx   a picat la ei, DUPA ce au primit cererea. NESIGUR.
 *
 * 429 ramane REFUZ deliberat: inseamna „nu am procesat, incetineste". Daca vreun
 * furnizor se dovedeste ca raspunde 429 dupa ce a lucrat, se muta aici, intr-un
 * singur loc.
 */
export function eroareCuStatus(mesaj: string, status: number): Error {
  const refuz = status >= 400 && status < 500 && status !== 408;
  return cu(mesaj, refuz ? "esuat" : "necunoscut");
}

/**
 * Termenul depasit. „NU STIU" pe o SCRIERE, refuz DOVEDIT pe o CITIRE.
 *
 * ═══ DE CE CELE DOUA RASPUNSURI SUNT OPUSE ═══
 *
 * Pe o SCRIERE (emitere, anulare, ridicare) cererea poate sa fi ajuns si sa fi fost
 * executata inainte ca noi sa renuntam sa asteptam. Marcata refuz, reincercarea ar fi
 * libera si ar emite AL DOILEA colet real, facturat. Deci `necunoscut`: randul din
 * registru blocheaza si iese la om.
 *
 * Pe o CITIRE de pe drumul emiterii (tokenul, sucursala expeditoare, nomenclatoare)
 * raspunsul corect e pe dos. Citirea se face INAINTE de scriere, in aceeasi functie:
 * daca ea a expirat, cererea care creeaza nici n-a plecat. Lasat `necunoscut`, un
 * asemenea termen blocheaza comanda pentru un AWB pe care furnizorul nu l-a vazut
 * niciodata, iar comerciantul trebuie sa deblocheze de mana un rand despre nimic.
 *
 * ⚠ MUTATA AICI DIN `fancourier.ts` PE 13.09.2026. Era buna, dar era a unui singur
 * curier, si chiar in ziua in care s-au pus termene la Sameday, Woot, DPD, Cargus si
 * Colete ar fi ramas acolo: cinci clienti noi ar fi blocat comenzi pe citiri expirate.
 * O regula care se aplica la sase furnizori nu are voie sa stea in fisierul unuia.
 *
 * ⚠ CE NU E TERMEN, NU SE ATINGE: orice alta eroare se intoarce neschimbata, deci
 * clasificarea de dedesubt (`eroareRefuz`, `eroareCuStatus`) ramane stapana pe ea.
 */
export function eroareDeTermen(e: unknown, scriere: boolean, ce: string, furnizor: string): Error {
  const abort = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
  if (!abort) return e as Error;
  const mesaj = `${furnizor} nu a raspuns la timp (${ce}).`;
  return scriere
    ? eroareNesigura(`${mesaj} Verifica in contul ${furnizor} inainte de a reincerca.`)
    : eroareRefuz(mesaj);
}

/**
 * Verdictul unei erori prinse.
 *
 * ⚠ Implicitul e `necunoscut`, si nu din prudenta decorativa: o eroare care n-a
 * trecut prin niciun constructor de mai sus e una despre care chiar nu stim nimic
 * — `fetch` picat, `JSON.parse` crapat, o exceptie din codul nostru. A o lua drept
 * esec ar debloca exact reincercarea care emite al doilea document fiscal.
 */
export function verdictFurnizor(e: unknown): Verdict {
  if (!(e instanceof Error)) return "necunoscut";
  const v = (e as Error & { [CHEIE]?: unknown })[CHEIE];
  return v === "esuat" ? "esuat" : "necunoscut";
}
