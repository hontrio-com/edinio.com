import { stareaSaSchimbat } from "@/lib/orders/semnalarea-ajunge-la-om";
import type { FelEroareEpacket, StareEpacket } from "./client";
import { descriereStare, eStareFinala, esteRetur, normalizeazaStatus, type StatusEpacket } from "./statusuri";

/**
 * Hotararile cronului `epacket-tracking`, scoase din ruta ca sa poata fi probate pe purtare.
 *
 * ═══ CE E ALTFEL DECAT LA CURIERA ═══
 *
 *   - NU exista lot: `GET /status` ia un singur AWB. Si plafonul e de 60 de cereri pe minut pe
 *     cheie, toate adresele la un loc. Deci cronul merge pe magazine IN PARALEL (fiecare cu cheia
 *     lui) si in fiecare magazin pe rand.
 *   - NU exista istoric: se vede doar starea curenta. Un „avizat" urmat de „in_livrare" intre doua
 *     treceri se pierde, si asta nu se poate repara de la noi. Ei nu reintreaba curierul mai des
 *     de 30 de minute, iar cronul trece la doua ore.
 *   - Cheia salvata e chiar codul lor (`in_tranzit`): eticheta vine de la ei, cu diacritice.
 */

export type Citire = {
  status: StatusEpacket | null;
  /** Codul cum l-au scris ei, ca sa se poata strange pe nume. */
  brut: string;
  /** Cheia salvata pe comanda. */
  cheie: string;
  schimbata: boolean;
  eticheta: string;
  /** Clipa starii la curier (ISO), sau `null`. */
  la: string | null;
  /** Nu se mai intreaba: final in harta noastra SAU la ei (`is_final`). */
  finala: boolean;
};

export function citesteStarea(s: StareEpacket, cheieSalvata: string | null): Citire {
  const status = normalizeazaStatus(s.status);
  const cheie = status ?? s.status.trim();
  return {
    status,
    brut: s.status,
    cheie,
    schimbata: stareaSaSchimbat(cheieSalvata, cheie),
    eticheta: descriereStare(s.status, s.eticheta),
    la: s.la && Number.isFinite(Date.parse(s.la)) ? new Date(s.la).toISOString() : null,
    finala: eStareFinala(cheie, s.final),
  };
}

/**
 * Notificarea pentru comerciant. ⚠ Textul spune si ce inseamna, si ce se poate face: e-packet
 * n-are anulare prin API, deci la o anulare vazuta aici omul trebuie sa stie ca s-a facut prin ei.
 */
export function semnalareEpacket(p: {
  orderNumber: string | null;
  awb: string;
  curier: string;
  cheie: string;
  eticheta: string;
}): { titlu: string; mesaj: string } {
  const comanda = p.orderNumber ? `Comanda ${p.orderNumber}` : "O comanda";
  const prin = p.curier ? ` (${p.curier} prin e-packet)` : " (prin e-packet)";

  if (esteRetur(p.cheie)) {
    return {
      titlu: "Colet e-packet returnat",
      mesaj: `${comanda}: coletul ${p.awb}${prin} se intoarce la tine (${p.eticheta}). Marfa vine inapoi, iar rambursul NU s-a incasat: anularea comenzii si returul banilor raman decizia ta.`,
    };
  }
  if (normalizeazaStatus(p.cheie) === "anulat") {
    return {
      titlu: "AWB e-packet anulat",
      mesaj: `${comanda}: AWB-ul ${p.awb}${prin} a fost anulat la e-packet. Coletul nu mai pleaca. Scoate numarul de pe comanda (Editeaza comanda, Detaseaza AWB) inainte sa emiti altul.`,
    };
  }
  return {
    titlu: "Expediere e-packet care cere atentie",
    mesaj: `${comanda}: expedierea ${p.awb}${prin} are o stare care cere o decizie: ${p.eticheta}.`,
  };
}

/**
 * Socoteala unui magazin intr-o trecere. Cheile de esec sunt EXACT felurile din
 * `felulEroriiEpacket`, ca ruta sa scrie `g[felulEroriiEpacket(e)]` fara sa poata gresi galeata.
 */
export type Galeata = Record<FelEroareEpacket, number> & {
  /** AWB-uri pe care cheia nu le vede (`not_found`): alt cont, sau test fata de live. */
  negasite: number;
  reusite: number;
  exemplu: string;
};

export function galeataGoala(): Galeata {
  return { autentificare: 0, credit: 0, indisponibil: 0, refuz: 0, negasite: 0, reusite: 0, exemplu: "" };
}

export type Alarma = { severity: "critical" | "warning"; fel: string; mesaj: string };

/**
 * Alarma unui magazin, sau `null`. ⚠ PE MAGAZIN, si numai fara nicio reusita (lectia GLS: un
 * magazin sanatos nu are voie sa ascunda cheia expirata a vecinului).
 *
 * ⚠ Numai refuzul cheii primeste sfatul „verifica cheia": pe o cadere la ei, omul ar schimba o
 * cheie buna. Iar AWB-urile negasite au o cauza anume la e-packet: o cheie de test nu vede
 * AWB-urile live, si invers (scris de ei).
 */
export function alarmaMagazinului(
  g: Galeata,
  praguri: { autentificare: number; refuz: number; esecuri: number; negasite: number },
): Alarma | null {
  if (g.reusite > 0) return null;
  if (g.autentificare >= praguri.autentificare) {
    return {
      severity: "critical",
      fel: "autentificare",
      mesaj: `e-packet a respins cheia API pentru toate cele ${g.autentificare} expedieri verificate ale magazinului. Verifica cheia din configurarea e-packet.`,
    };
  }
  const altele = g.indisponibil + g.refuz + g.credit;
  if (g.refuz >= praguri.refuz || altele >= praguri.esecuri) {
    return {
      severity: "warning",
      fel: "indisponibil",
      mesaj: `urmarirea e-packet a esuat pentru toate cele ${altele} expedieri verificate ale magazinului, dar NU din cauza cheii: ${g.exemplu || "fara raspuns"}. Nu schimba cheia.`,
    };
  }
  if (g.negasite >= praguri.negasite) {
    return {
      severity: "warning",
      fel: "negasite",
      mesaj: `e-packet nu gaseste niciunul dintre cele ${g.negasite} AWB-uri ale magazinului. Cel mai probabil cheia din configurare e a altui cont, sau e o cheie de TEST pentru AWB-uri emise cu una LIVE (ori invers): fiecare vede doar AWB-urile ei.`,
    };
  }
  return null;
}
