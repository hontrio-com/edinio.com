import { ABANDON_MINUTES } from "@/lib/abandoned-cart";
import type { AbandonedAutomationStep } from "@/lib/abandoned-cart";

/*
  ═══════════════════════════════════════════════════════════════════════════
  DE UNDE PORNESTE CINEVA CARE N-A MAI FACUT ASA CEVA
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ UN FORMULAR GOL CU UN BUTON „ADAUGA PAS" cere comerciantului sa stie
  DINAINTE cate mesaje se trimit si la ce ore - adica tocmai ce vrea sa afle de
  la noi. De-aia sunt trei porniri, fiecare cu ce face si cui i se potriveste.

  ⚠ NICIUNA NU APRINDE AUTOMATIZAREA. Alegerea unei secvente e o alegere de
  text, nu hotararea de a incepe sa trimiti mesaje catre clienti adevarati.
  Aia se face cu comutatorul de sus, dupa ce omul a citit ce pleaca.
*/

export interface Pornire {
  cheie: "simpla" | "recomandata" | "personalizata";
  nume: string;
  explicatie: string;
  rezumat: string;
  pasi: Omit<AbandonedAutomationStep, "id">[];
}

export const PORNIRI: Pornire[] = [
  {
    cheie: "simpla",
    nume: "Simplă",
    explicatie:
      "Un singur email, la o oră după ce coșul a rămas neterminat. Cea mai puțin "
      + "intruzivă și cea mai ieftină: emailul nu costă nimic în plus.",
    rezumat: "1 mesaj · email la 1 oră",
    pasi: [{ delay_hours: 1, channel: "email" }],
  },
  {
    cheie: "recomandata",
    nume: "Recomandată",
    explicatie:
      "Trei mesaje: un memento la o oră, unul cu reducere a doua zi, și un SMS "
      + "după două zile pentru cine tot nu a revenit.",
    rezumat: "3 mesaje · 1h, 24h, 48h",
    pasi: [
      { delay_hours: 1, channel: "email" },
      { delay_hours: 24, channel: "email", discount_code: "" },
      { delay_hours: 48, channel: "sms" },
    ],
  },
  {
    cheie: "personalizata",
    nume: "Personalizată",
    explicatie:
      "Pornești de la un singur pas gol și îl construiești cum vrei: câte mesaje, "
      + "pe ce canal și la ce oră.",
    rezumat: "de la zero",
    pasi: [{ delay_hours: 1, channel: "email" }],
  },
];

/** „la 1 oră", „a doua zi", „după 3 zile" - cum se spune omeneste o intarziere. */
export function scrieIntarzierea(ore: number): string {
  const o = Math.max(0, Math.round(Number(ore) || 0));
  if (o === 0) return "imediat ce e văzut ca abandonat";
  if (o === 1) return "după 1 oră";
  if (o < 24) return `după ${o} ore`;
  const zile = Math.round(o / 24);
  if (o % 24 === 0) return zile === 1 ? "după 1 zi" : `după ${zile} zile`;
  return `după ${zile} ${zile === 1 ? "zi" : "zile"} și ${o % 24} ore`;
}

export interface RandCronologie {
  id: string;
  canal: "email" | "sms" | null;
  titlu: string;
  detaliu: string;
}

/**
 * Ce pateste un client, pas cu pas.
 *
 * ⚠ SE ARATA SI CE E INTRE PASI, nu doar pasii. Campurile spun „24", „48";
 * omul vrea sa vada ca al doilea mesaj vine la o zi DUPA primul, nu la doua
 * zile dupa abandon - iar diferenta asta e tocmai ce nu se citeste din
 * formular.
 */
export function CRONOLOGIE(pasi: AbandonedAutomationStep[]): RandCronologie[] {
  const randuri: RandCronologie[] = [{
    id: "start",
    canal: null,
    titlu: "Coșul rămâne neterminat",
    detaliu: `După ${ABANDON_MINUTES} de minute fără nicio mișcare, coșul e văzut ca abandonat.`,
  }];

  let inainte = 0;
  pasi.forEach((p, i) => {
    const ore = Number(p.delay_hours) || 0;
    const fataDeCelDinainte = i === 0 ? null : ore - inainte;
    randuri.push({
      id: p.id,
      canal: p.channel,
      titlu: `${p.channel === "sms" ? "SMS" : "Email"} ${scrieIntarzierea(ore)} de la abandon`,
      detaliu: fataDeCelDinainte === null
        ? "Primul mesaj din secvență."
        : fataDeCelDinainte > 0
          /* ⚠ Distanta fata de mesajul dinainte: aia simte clientul. */
          ? `La ${scrieIntarzierea(fataDeCelDinainte).replace("după ", "")} după mesajul anterior.`
          : "⚠ Nu e mai târziu decât mesajul dinaintea lui: pleacă tot al "
            + `${i + 1}-lea, fiindcă ordinea e cea din listă.`,
    });
    inainte = ore;
  });

  return randuri;
}
