import { verificaPunctul } from "./punctul-ales-e-semnat";
import { reteauaDinPlan } from "./reteaua-punctului";
import type { PlanExpedierii } from "./quote-token";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CE PUNCT SE SCRIE PE COMANDA                                  (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pana azi, cele sase campuri ale punctului ajungeau pe comanda EXACT cum le trimitea browserul, si
 * nimeni nu verifica nimic. La emitere ele nu sunt decorative: la Sameday `locker_city` si
 * `locker_county` INLOCUIESC destinatarul de pe AWB, iar la DPD `pickupOfficeId` vine din
 * `Number(locker_id)` cu `recipientCity` si `recipientCounty` suprascrise din aceleasi siruri.
 * Adica adresa de livrare era scrisa de cumparator.
 *
 * ⚠ SE SCRIE DIN TOKEN, SI CE VINE PE LANGA EL SE ARUNCA. Tokenul POARTA fisa punctului, nu doar o
 * semneaza: verificarea nu are nevoie de niciun sir de la browser ca sa refaca MAC-ul. De aceea
 * `locker_name`, `locker_address`, `locker_city`, `locker_county` si `locker_post_code` din cerere
 * nu mai sunt citite deloc pe drumul asta.
 *
 * ═══ ⚠ TOKENUL LIPSA SE REFUZA, SI E O HOTARARE, NU O SCAPARE ═══
 *
 * Aici e singurul loc unde alegerea putea fi facuta altfel, deci se scrie pe fata.
 *
 * Purtarea vecina, la cotatie, e DINADINS blanda: o semnatura care nu bate cade pe tariful
 * implicit, fiindca „o cotatie pierduta n-are voie sa coste o vanzare". Aici purtarea e alta, si
 * din trei pricini masurate:
 *
 *   1. ⚠ O poarta care se ocoleste prin OMITERE nu e o poarta. Daca tokenul lipsa ar cadea inapoi
 *      pe campurile din cerere, oricine vrea vechea purtare n-are decat sa nu trimita tokenul.
 *      Atunci toata lucrarea ar fi fost decor.
 *   2. Leacul cumparatorului e o singura apasare: isi alege din nou punctul. Nu e o vanzare
 *      pierduta, cum ar fi la cotatie, unde refuzul omoara comanda.
 *   3. Expunerea e mica si masurata: prin selectorul nostru de puncte au trecut SASE comenzi in
 *      toata viata platformei. Cele 96 de comenzi cu locker venite din marketplace nu ating drumul
 *      asta deloc: ele isi scriu `shipping_address` direct la inserare.
 *
 * ⚠ FEREASTRA DE DESFASURARE, pe fata si ea: un cumparator care avea pagina deschisa dinainte de
 * desfasurare trimite campurile fara token si va fi rugat sa aleaga din nou punctul. Dureaza cat o
 * incarcare de pagina, si numai pentru cine era chiar atunci in checkout, la punct.
 *
 * ⚠ SI DE CE NU SE VERIFICA LA EMITERE, unde ar parea firesc: tokenul traieste doua ore, iar lotul
 * se emite cand se aduna comenzile, peste zile. Cerut acolo, ar fi cazut si comenzile NOI si
 * cinstite. Emiterea se bizuie pe campurile deja canonice, scrise aici.
 *
 * ═══ ⚠⚠ CE RAMANE DESCHIS, SI E NUMIT AICI CA SA NU SE CREADA CA E INCHIS ═══
 *
 * Fisa semnata NU e legata de LOCALITATEA pentru care s-a cotat. Identitatea sub care se semneaza
 * si se verifica e `{businessId, curier, retea}`, atat.
 *
 * Deci defectul care RAMANE, masurat pe cod, nu banuit: `getLockers` e export dintr-un fisier
 * `"use server"`, adica o usa publica chemabila direct din browser, si nu cere nici sesiune nici
 * localitate. Cerut fara argumentul `city`, `filtreazaOras` intoarce lista NEATINSA (contul Sameday
 * de productie are 7.021 de puncte), fiecare cu token VALID. Cumparatorul coteaza pentru adresa lui
 * din Bucuresti, primeste tariful de Bucuresti semnat, si plaseaza comanda cu tokenul unui easybox
 * din Cluj. Totul bate: magazinul, curierul si reteaua sunt aceleasi. Pe comanda se scriu
 * `locker_city: "Cluj-Napoca"` si `locker_county: "Cluj"`, iar la emitere Sameday si DPD INLOCUIESC
 * cu ele destinatarul de pe AWB. Coletul pleaca la Cluj pe tariful cotat pentru Bucuresti, si
 * diferenta o plateste COMERCIANTUL.
 *
 * ⚠ Ce s-a inchis si ce nu, ca sa fie limpede. Antetul lui `punctul-ales-e-semnat.ts` numeste trei
 * feluri de abuz: metadate inventate, punct din alta retea, si punct din alt oras. Primele doua
 * sunt inchise de tokenul asta. AL TREILEA NU E, si comentariul de acolo promite mai mult decat
 * apara codul. Vezi si lectia casei despre notele care promit o plasa inexistenta.
 *
 * ⚠ SI DE CE NU S-A INCHIS AICI, dinadins: leacul evident, „judetul punctului trebuie sa fie
 * judetul cotat", ar refuza un caz cinstit si des. Un cumparator din Voluntari care alege un easybox
 * bucurestean face exact asta, si nu greseste cu nimic. Inchiderea corecta cere confruntarea pe ZONA
 * de livrare, nu pe judet (`cfgRow.shipping_zones` e deja citit la plasare), si aia e o regula de
 * pret, adica o hotarare a proprietarului, nu una luata din mers in lotul asta.
 *
 * ⚠ Expunerea, masurata, ca sa se poata pune in balanta: prin selectorul nostru de puncte au trecut
 * SASE comenzi in toata viata platformei, iar cotarea LIVE e pornita la trei perechi magazin-curier.
 * Gaura e reala, dar nu arde.
 */

/** Campurile punctului, asa cum se scriu in `shipping_address`. */
export type CampuriPunct = {
  locker_id: string;
  locker_name: string;
  locker_address: string;
  locker_city: string;
  locker_county: string;
  locker_post_code?: string;
};

export type VerdictPunctComanda =
  /** `campuri: null` inseamna „comanda asta nu e la punct", nu „punct fara campuri". */
  | { ok: true; campuri: CampuriPunct | null }
  | { ok: false; motiv: "lipsa" | "forma" | "expirat" | "semnatura"; mesaj: string };

/**
 * Mesajul catre cumparator.
 *
 * ⚠ DOUA MESAJE, NU UNUL, si asta e chiar rostul pentru care verdictul are motiv in loc de boolean:
 * un punct expirat e vina trecerii timpului si se rezolva prin realegere, iar restul inseamna ca
 * ceva nu se potriveste si merita alt indemn. Cu un singur mesaj, omul caruia i-a expirat alegerea
 * ar fi citit ca e ceva stricat si ar fi plecat.
 */
function mesajul(motiv: "lipsa" | "forma" | "expirat" | "semnatura"): string {
  return motiv === "expirat"
    ? "Alegerea punctului de ridicare a expirat. Alege din nou punctul si trimite comanda."
    : "Punctul de ridicare nu a putut fi confirmat. Alege din nou punctul si trimite comanda.";
}

export function punctulDePeComanda(p: {
  businessId: string;
  /** Curierul CERUT, acelasi sir pe care l-a primit `getLockers`. */
  curier: string | null | undefined;
  lockerId: string | null | undefined;
  token: string | null | undefined;
  /**
   * Planul pretins al expedierii.
   *
   * ⚠ Din el iese reteaua, si nu din cererea browserului: `fanPointType`, `smartshipLockerNet` si
   * `shipoRateId` intra toate trei in `amprentaPlanului`, deci sunt chiar campurile pe care
   * `verificaCotatia` le confrunta cu ce am semnat noi la cotare.
   */
  plan: PlanExpedierii;
}): VerdictPunctComanda {
  /*
   * ⚠ GARDA RAMANE PE `lockerId`, ca si pana azi, si dinadins: ea raspunde la „e comanda asta la
   * punct?", nu la „e punctul bun?". Mutata pe token, o comanda la adresa cu un token strecurat ar
   * fi capatat deodata campuri de punct.
   */
  if (!p.lockerId) return { ok: true, campuri: null };

  const verdict = verificaPunctul(p.token, {
    businessId: p.businessId,
    curier: (p.curier ?? "").trim(),
    retea: reteauaDinPlan((p.curier ?? "").trim(), p.plan),
  });

  if (!verdict.ok) return { ok: false, motiv: verdict.motiv, mesaj: mesajul(verdict.motiv) };

  const punct = verdict.punct;
  return {
    ok: true,
    campuri: {
      locker_id: punct.id,
      locker_name: punct.name,
      locker_address: punct.address,
      locker_city: punct.city,
      locker_county: punct.county,
      /*
       * ⚠ Cheia LIPSESTE cu totul cand punctul n-are cod postal, in loc sa fie prezenta si goala.
       * `verificaPunctul` scoate campul din fisa cand e gol, iar Sameday, FAN, DPD si Cargus nu-l
       * dau niciodata. Cine citeste comanda la emitere (GLS il cere) trebuie sa suporte lipsa
       * cheii, nu doar valoarea goala.
       */
      ...(punct.postCode ? { locker_post_code: punct.postCode } : {}),
    },
  };
}
