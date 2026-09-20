import { ABANDON_MINUTES } from "@/lib/abandoned-cart";
import { LUNI_PE_COMANDA } from "@/app/api/cron/curata-fisiere/reguli";

import { socotesteSms } from "./sms-segmente";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CE POATE IESI PROST DINTR-O AUTOMATIZARE, SI DE CE NU SE VEDE
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ TOATE GRESELILE DE AICI SE SALVEAZA FARA NICIO EROARE. Formularul le
  primeste, serverul le scrie, ecranul spune „salvat" - si abia peste o
  saptamana comerciantul se intreaba de ce pleaca doua SMS-uri deodata, sau de
  ce nu pleaca niciunul.

  De-aia sunt AVERTISMENTE pe ecran, langa campul care le provoaca, si nu
  refuzuri: unele sunt greseli, altele sunt alegeri neobisnuite pe care omul
  are dreptul sa le faca. Ce nu are dreptul e sa nu stie.

  ⚠ TONUL CONTEAZA. „Eroare" langa o alegere legitima il invata pe om sa nu mai
  citeasca avertismentele. De-aia sunt doua trepte: `opreste` (automatizarea
  chiar nu va trimite nimic, sau va trimite ceva gresit) si `atentie`.
*/

export interface PasAutomatizare {
  id: string;
  delay_hours: number;
  channel: "email" | "sms";
  message?: string;
  discount_code?: string;
}

export interface ConfigAutomatizare {
  enabled: boolean;
  steps: PasAutomatizare[];
  min_cart_value?: number | null;
  quiet_hours?: { start: number; end: number } | null;
}

export interface ImprejurimiAutomatizare {
  /** E pornit vreun canal de SMS (SMSO sau notice.ro)? */
  smsPornit: boolean;
  /** Codurile de reducere active ale magazinului. */
  coduriActive: string[];
}

export interface Capcana {
  cheie: string;
  treapta: "opreste" | "atentie";
  /** Pasul la care se arata, cand e legata de unul anume. */
  pasId?: string;
  text: string;
}

/** Cate ore poate trece pana cand cosul nu mai poate fi recuperat deloc. */
export const ORE_PANA_EXPIRA = LUNI_PE_COMANDA * 30 * 24;

export function capcaneleAutomatizarii(
  c: ConfigAutomatizare, imp: ImprejurimiAutomatizare,
): Capcana[] {
  const g: Capcana[] = [];
  const pasi = c.steps ?? [];

  /* 1. Pornita si goala: nu trimite nimic, si nimic nu spune asta. */
  if (c.enabled && pasi.length === 0) {
    g.push({
      cheie: "fara-pasi", treapta: "opreste",
      text: "Automatizarea e pornită, dar nu are niciun mesaj în secvență: nu va trimite nimic.",
    });
  }

  /* 2. Oprita, dar cu pasi scrisi: munca nu pleaca nicaieri. */
  if (!c.enabled && pasi.length > 0) {
    g.push({
      cheie: "oprita", treapta: "atentie",
      text: "Secvența e scrisă, dar automatizarea e oprită: mesajele nu pleacă până nu o pornești.",
    });
  }

  const codActive = new Set(imp.coduriActive.map((x) => x.trim().toUpperCase()));
  const vazuteLaOra = new Map<number, string[]>();

  pasi.forEach((p, i) => {
    const ore = Number(p.delay_hours) || 0;

    /*
      3. ⚠ Un pas la 0 ore nu pleaca imediat: cosul devine „abandonat" abia
      dupa o ora de liniste, iar cronul se uita numai la cele abandonate. Deci
      „0" nu inseamna „acum", ci „la prima rulare dupa ce devine abandonat" -
      si omul care scrie 0 crede altceva.
    */
    if (ore <= 0) {
      g.push({
        cheie: "zero-ore", treapta: "atentie", pasId: p.id,
        text: `Un coș devine abandonat abia după ${ABANDON_MINUTES} de minute de inactivitate, deci `
          + "mesajul la 0 ore nu pleacă instant, ci la prima verificare de după. Pune cel puțin 1 oră "
          + "ca să fie limpede.",
      });
    }

    /*
      4. ⚠ Ordinea pasilor E ORDINEA DIN LISTA, nu a intarzierilor: cronul ia
      `steps[automation_step]`. Un pas de 6 ore pus dupa unul de 24 se trimite
      AL DOILEA, deci al doilea mesaj ajunge „mai devreme" decat scrie pe el.
    */
    if (i > 0) {
      const inainte = Number(pasi[i - 1].delay_hours) || 0;
      if (ore < inainte) {
        g.push({
          cheie: "ordine", treapta: "opreste", pasId: p.id,
          text: `Pasul acesta are o întârziere mai mică (${ore}h) decât cel dinaintea lui (${inainte}h). `
            + "Mesajele pleacă în ordinea din listă, nu în ordinea orelor, deci va fi trimis tot al "
            + `${i + 1}-lea. Mută-l mai sus sau mărește-i întârzierea.`,
        });
      }
    }

    /* 5. Doi pasi la aceeasi ora: clientul primeste doua mesaje deodata. */
    const laFel = vazuteLaOra.get(ore) ?? [];
    if (laFel.length > 0) {
      g.push({
        cheie: "aceeasi-ora", treapta: "atentie", pasId: p.id,
        text: `Mai există un mesaj tot la ${ore} ore. Clientul le va primi aproape în același timp.`,
      });
    }
    vazuteLaOra.set(ore, [...laFel, p.id]);

    /*
      6. ⚠ Un pas dincolo de fereastra de recuperare NU va pleca niciodata:
      `cosulMaiPoateFiRecuperat` il refuza, si tacut.
    */
    if (ore >= ORE_PANA_EXPIRA) {
      g.push({
        cheie: "prea-tarziu", treapta: "opreste", pasId: p.id,
        text: `După ${LUNI_PE_COMANDA} luni coșul nu mai poate fi recuperat (fișierele și prețurile `
          + "lui expiră), deci mesajul acesta nu va pleca niciodată.",
      });
    }

    /* 7. Pas pe SMS fara niciun canal de SMS pornit. */
    if (p.channel === "sms" && !imp.smsPornit) {
      g.push({
        cheie: "sms-fara-canal", treapta: "opreste", pasId: p.id,
        text: "Pasul trimite SMS, dar nu ai niciun serviciu de SMS pornit (SMSO sau notice.ro). "
          + "Pasul va fi sărit.",
      });
    }

    /* 8. Cod de reducere care nu mai exista sau nu mai e activ. */
    const cod = p.discount_code?.trim();
    if (cod && !codActive.has(cod.toUpperCase())) {
      g.push({
        cheie: "cod-inexistent", treapta: "opreste", pasId: p.id,
        text: `Codul „${cod}” nu mai e activ. Mesajul va pleca promițând o reducere care nu se aplică.`,
      });
    }

    /*
      9. ⚠ Un SMS lung costa de doua-trei ori cat crede omul, iar aici pleaca
      la TOTI clientii, nu la unul. Vezi `sms-segmente.ts`.
    */
    if (p.channel === "sms" && p.message?.trim()) {
      const s = socotesteSms(p.message, " https://magazin.ro/?recover=00000000-0000-4000-8000-000000000000");
      if (s.segmente >= 3) {
        g.push({
          cheie: "sms-lung", treapta: "atentie", pasId: p.id,
          text: `Cu tot cu linkul de recuperare, mesajul se trimite ca ${s.segmente} SMS-uri `
            + `(${s.codare}) și se plătește ca atare — la fiecare client.`,
        });
      }
    }

    /* 10. Sablon cu {nume}, dar multi clienti n-au lasat niciun nume. */
    if (/\{nume\}/i.test(p.message ?? "")) {
      g.push({
        cheie: "nume-gol", treapta: "atentie", pasId: p.id,
        text: "Mesajul folosește {nume}. Clienții care nu și-au lăsat numele primesc textul fără el "
          + "(„Salut! Ai uitat...”), deci scrie-l ca să sune bine și așa.",
      });
    }
  });

  /* 11. Prea multe mesaje: de la un punct incolo nu mai e recuperare, e insistenta. */
  if (pasi.length > 4) {
    g.push({
      cheie: "prea-multe", treapta: "atentie",
      text: `${pasi.length} mesaje pentru același coș abandonat înseamnă insistență, nu recuperare: `
        + "crește riscul de dezabonări și de reclamații de spam.",
    });
  }

  /*
    12. ⚠ Ore de liniste care acopera toata ziua: nimic nu mai pleaca niciodata.
    `start === end` nu inseamna „zero ore", ci fereastra intreaga.
  */
  const q = c.quiet_hours;
  if (q && Number(q.start) === Number(q.end)) {
    g.push({
      cheie: "liniste-toata-ziua", treapta: "opreste",
      text: "Orele de liniște încep și se termină la aceeași oră, adică acoperă toată ziua: "
        + "niciun mesaj automat nu va mai pleca.",
    });
  }

  /* 13. Prag de cos mai mare decat orice cos abandonat: automatizarea tace. */
  if (c.min_cart_value != null && Number(c.min_cart_value) < 0) {
    g.push({
      cheie: "prag-negativ", treapta: "atentie",
      text: "Valoarea minimă a coșului e negativă, deci nu filtrează nimic.",
    });
  }

  return g;
}

/** Cate dintre ele chiar opresc trimiterea. */
export function opresteTrimiterea(capcane: Capcana[]): boolean {
  return capcane.some((c) => c.treapta === "opreste");
}
