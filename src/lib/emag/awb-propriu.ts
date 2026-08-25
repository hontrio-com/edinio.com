/**
 * AWB-ul curierului magazinului, dus si la eMAG.
 *
 * ═══ ⚠ CE LIPSEA, SI DE CE CONTEAZA ═══
 *
 * Panoul spunea „poți expedia cu curierul tău, eMAG le acceptă pe amândouă". Adevarat
 * despre ei — dar Edinio nu inchidea bucla: dupa un AWB emis cu curierul magazinului,
 * NIMIC nu-i trimitea numarul lui eMAG. Comanda ramanea la ei fara urmarire, iar
 * cumparatorul fara nimic de urmarit. eMAG numara asta.
 *
 * ⚠ LA EI NU EXISTA CAMP DE AWB PE COMANDA. Citit din schema lor: `OrderSave` are 22 de
 * campuri si niciunul nu e `awb` sau `tracking_number`. Singura cale e atasamentul
 * `type = 10`, care cere o ADRESA catre un `.pdf`.
 *
 * ═══ ⚠ DE CE O TRECERE, SI NU UN CARLIG PE FIECARE CURIER ═══
 *
 * Sunt CINCISPREZECE coloane de AWB in `orders`, cate una pe curier, si niciun loc comun
 * de dupa emitere. Un carlig pe fiecare ar fi insemnat cincisprezece fire de legat si
 * cincisprezece prilejuri de regresie in fluxuri care merg azi.
 *
 * O trecere care intreaba „ce comanda eMAG are AWB si n-are atasament" e un singur loc,
 * prinde AWB-urile facute pe ORICE cale (buton, lot, mana), si se reia singura. E chiar
 * forma pe care o are toata integrarea.
 *
 * ═══ ⚠ DE CE O PAGINA SCRISA DE NOI, SI NU ETICHETA CURIERULUI ═══
 *
 * Eticheta adevarata exista la fiecare curier, dar prin functia LUI: GLS o da in base64,
 * FanCourier printr-un capat cu `pdf=1`, si asa mai departe. Cincisprezece forme diferite.
 *
 * Pagina asta poarta ce-i trebuie cumparatorului — curierul si numarul — si e aceeasi
 * pentru toti. Nu e eticheta lui, si nu se pretinde a fi: scrie pe ea ce este. Atasarea
 * etichetei adevarate ramane o imbunatatire de facut curier cu curier.
 */

import { cuRegistru } from "@/lib/operatii/registru";
import { uploadToR2 } from "@/lib/r2";
import { salveazaAtasamente, isEmagError } from "./client";
import { pdfDintrunSingurFolio } from "./pdf-simplu";
import { LIMITE_EMAG, taiat } from "./limite";
import type { ContextEmag } from "./sync";

type Admin = Parameters<typeof cuRegistru>[0];

/**
 * Coloanele de AWB, in ordinea in care se citesc.
 *
 * ⚠ ORDINEA CONTEAZA cand o comanda are doua coloane completate — se intampla la
 * reexpediere, sau cand comerciantul incearca doi curieri. Se ia PRIMA gasita, si lista e
 * asezata cu cei mai folositi in fata.
 *
 * ⚠ `tracking_number` sta la URMA, dinadins: e campul generic in care se poate scrie orice
 * de mana, deci e cel mai putin sigur. Dar ramane in lista, fiindca un comerciant care si-a
 * trecut numarul acolo tot vrea ca eMAG sa-l afle.
 */
const COLOANE_AWB: { coloana: string; curier: string }[] = [
  { coloana: "fan_courier_awb_number", curier: "FAN Courier" },
  { coloana: "sameday_awb_number", curier: "Sameday" },
  { coloana: "cargus_awb_number", curier: "Cargus" },
  { coloana: "dpd_awb_number", curier: "DPD" },
  { coloana: "gls_awb_number", curier: "GLS" },
  { coloana: "dhl_awb_number", curier: "DHL" },
  { coloana: "fedex_awb_number", curier: "FedEx" },
  { coloana: "ups_awb_number", curier: "UPS" },
  { coloana: "posta_awb_number", curier: "Posta Romana" },
  { coloana: "pallex_awb_number", curier: "Pall-Ex" },
  { coloana: "ecolet_awb_number", curier: "Ecolet" },
  { coloana: "packeta_courier_number", curier: "Packeta" },
  { coloana: "colete_awb_number", curier: "Colete.ro" },
  { coloana: "woot_awb_number", curier: "Woot" },
  { coloana: "shipo_awb_number", curier: "Shipo" },
  { coloana: "smartship_awb_number", curier: "SmartShip" },
  { coloana: "innoship_awb_number", curier: "Innoship" },
  { coloana: "tracking_number", curier: "curierul magazinului" },
];

/** Toate coloanele care trebuie citite ca sa se poata hotari. */
export const CAMPURI_AWB_DE_CITIT = [
  ...COLOANE_AWB.map((c) => c.coloana),
  /* Numele adevarat al curierului, cand furnizorul ni-l spune. Mai bun decat eticheta
     noastra: „Innoship" e un intermediar, iar clientul urmareste la curierul de dedesubt. */
  "innoship_courier_name",
  "smartship_courier_name",
  "shipo_courier_name",
].join(", ");

export interface AwbPropriu {
  awb: string;
  curier: string;
}

/**
 * Ce AWB are comanda, si de la ce curier.
 *
 * ⚠ Numele venit de la furnizor bate eticheta noastra: la intermediari (Innoship,
 * SmartShip, Shipo) numarul e emis de un curier de dedesubt, iar clientul acolo il
 * urmareste. Scris „Innoship", omul ar fi cautat pe un site care nu-l stie.
 */
export function awbPropriuAlComenzii(
  rand: Record<string, unknown> | null | undefined,
  /*
   * ⚠ NUMERELE DEJA URCATE LA eMAG, ca sa nu fie alese a doua oara.
   *
   * Fara asta, ordinea fixa a coloanelor intoarce mereu primul AWB nenul — deci un
   * comerciant care renunta la FAN si emite GLS ramanea cu FAN123 ales pe veci, iar GLS999
   * nu ajungea NICIODATA la ei. Vezi migratia `2026-10-20-emag-awb-multime.sql`.
   *
   * ⚠ Si de-aia e o MULTIME, nu ultimul numar: cu un singur numar, doua AWB-uri s-ar fi
   * urcat pe rand la nesfarsit, fiecare scotandu-l pe celalalt din joc.
   */
  dejaUrcate: readonly string[] = [],
): AwbPropriu | null {
  if (!rand) return null;
  const duse = new Set(dejaUrcate.filter(Boolean));
  for (const { coloana, curier } of COLOANE_AWB) {
    const v = rand[coloana];
    const awb = typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
    if (!awb) continue;
    if (duse.has(awb)) continue;

    const numeReal =
      coloana.startsWith("innoship") ? rand.innoship_courier_name
        : coloana.startsWith("smartship") ? rand.smartship_courier_name
          : coloana.startsWith("shipo") ? rand.shipo_courier_name
            : null;
    const numeCurat = typeof numeReal === "string" ? numeReal.trim() : "";
    return { awb, curier: numeCurat || curier };
  }
  return null;
}

/** Cheia in R2. ⚠ Curatata: numarul de AWB ajunge intr-o cale de fisier. */
export function cheiaPdfAwb(businessId: string, orderId: string, awb: string): string {
  const curat = awb.replace(/[^A-Za-z0-9._-]/g, "");
  return `awb-emag/${businessId}/${orderId}-${curat}.pdf`;
}

/** Pagina care pleaca la ei. Exportata ca sa poata fi probata fara retea. */
export function paginaAwb(a: AwbPropriu, numarComanda: string): Buffer {
  return pdfDintrunSingurFolio([
    { text: "Expediere cu curierul vanzatorului", marime: 15 },
    { text: `Curier: ${a.curier}`, spatiu: 34 },
    { text: `AWB: ${a.awb}`, marime: 13 },
    { text: `Comanda: ${numarComanda}`, spatiu: 22 },
    {
      /* ⚠ Se scrie ce ESTE documentul. Un cumparator care primeste o pagina si crede ca e
         eticheta curierului ar incerca s-o foloseasca la ghiseu. */
      text: "Document informativ. Numarul de AWB se urmareste pe site-ul curierului.",
      marime: 9,
      spatiu: 30,
    },
  ]);
}

export type RezultatAwbEmag =
  | { fel: "urcat"; awb: string }
  | { fel: "deja"; awb: string }
  | { fel: "fara_awb" }
  | { fel: "esuat"; mesaj: string };

/**
 * Urca la eMAG atasamentul cu AWB-ul curierului propriu.
 *
 * ⚠ PRIN `cuRegistru`, ca si factura: e un efect cu UN SINGUR FOC intr-un cont strain. O
 * reincercare oarba ar lipi al doilea document pe aceeasi comanda, iar cumparatorul ar
 * vedea doua AWB-uri si n-ar sti pe care sa-l urmareasca.
 *
 * ⚠ CHEIA POARTA SI NUMARUL DE AWB: la o reexpediere numarul e altul, si atunci chiar
 * TREBUIE urcat din nou. O cheie numai pe comanda ar fi oprit al doilea document tocmai
 * cand era nevoie de el.
 */
export async function urcaAwbPropriu(
  admin: Admin,
  ctx: ContextEmag,
  date: {
    orderId: string;
    emagOrderId: number;
    tipComanda: 2 | 3;
    numarComanda: string;
    awb: AwbPropriu;
  },
): Promise<RezultatAwbEmag> {
  const { orderId, emagOrderId, tipComanda, numarComanda, awb } = date;

  const rez = await cuRegistru(
    admin,
    {
      businessId: ctx.businessId,
      orderId,
      fel: "awb",
      furnizor: "emag",
      cheie: `emag-awb-${orderId}-${awb.awb}`,
    },
    async () => {
      /* ⚠ `private, no-store`: pagina poarta numarul comenzii si al AWB-ului. */
      const url = await uploadToR2(
        paginaAwb(awb, numarComanda),
        cheiaPdfAwb(ctx.businessId, orderId, awb.awb),
        "application/pdf",
        "private, no-store",
      );

      const r = await salveazaAtasamente(ctx.auth, [{
        order_id: emagOrderId,
        /* ⚠ Obligatoriu la ei. Atasamentele sunt printre putinele operatii ingaduite si pe
           comenzile FBE, deci se trimite tipul ADEVARAT, nu se sare peste. */
        order_type: tipComanda,
        /* ⚠ `maxLength = 60` la ei, si e numele pe care il vede cumparatorul. */
        name: taiat(`AWB ${awb.curier} ${awb.awb}`, LIMITE_EMAG.atasamentNume),
        url,
        /* ⚠ 10 = AWB, din enumul lor: 1 factura, 3 garantie, 4 manual, 8 ghid, 10 AWB,
           11 proforma. */
        type: 10,
      }]);
      if (isEmagError(r)) throw new Error(r.error);

      return { referinta: awb.awb, detalii: { url, curier: awb.curier }, valoare: awb.awb };
    },
    (e) => {
      /*
       * ⚠ SE DEOSEBESTE REFUZUL DOVEDIT DE „NU STIM", si implicitul e „nu stim". Aceeasi
       * alegere ca la factura: o cadere de retea la jumatate poate sa fi lasat atasamentul
       * FACUT la ei, iar reincercat, comanda ar avea doua documente de AWB.
       */
      const m = e instanceof Error ? e.message : String(e);
      return /nu (e|este) valid|invalid|refuz|not allowed|cannot/i.test(m) ? "esuat" : "necunoscut";
    },
  );

  if (rez.fel === "facut") return { fel: "urcat", awb: awb.awb };
  /* ⚠ „deja" nu e o reusita noua, dar nici o eroare: registrul stie ca s-a facut o data,
     iar cel de-al doilea document n-are voie sa plece. */
  if (rez.fel === "deja") return { fel: "deja", awb: awb.awb };
  /* `blocat` si `eroare` poarta amandoua un mesaj. `blocat` inseamna ca registrul cere o
     privire de om — o incercare de dinainte s-a oprit intr-un „nu stim". */
  return { fel: "esuat", mesaj: rez.mesaj || "AWB-ul nu s-a putut urca la eMAG." };
}
