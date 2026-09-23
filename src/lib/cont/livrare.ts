/**
 * Livrarea unei comenzi, spusa cumparatorului.
 *
 * ⚠⚠ FELUL NU SE CITESTE NUMAI DIN `delivery_type`. Ridicarea personala are
 * `delivery_type = 'address'` si `courier = 'pickup'`, iar acolo `address` e adresa
 * OMULUI, nu locul de unde ridica. Citit doar dupa `delivery_type`, ecranul i-ar fi
 * spus „livrare la adresa ta" unui om care vine la magazin (12 comenzi pe
 * productie).
 *
 * ⚠ La livrarea in punct (easybox, locker), `address` e adresa PUNCTULUI, iar a
 * omului sta in `home_address`, si numai cand difera.
 */

export type LivrareBruta = {
  nume?: string | null;
  telefon?: string | null;
  email?: string | null;
  adresa?: string | null;
  adresa_acasa?: string | null;
  oras?: string | null;
  judet?: string | null;
  cod_postal?: string | null;
  tara?: string | null;
  fel_livrare?: string | null;
  curier_ales?: string | null;
  eticheta_livrare?: string | null;
  punct?: string | null;
  punct_adresa?: string | null;
  punct_oras?: string | null;
  punct_judet?: string | null;
};

export type FelLivrare = "adresa" | "punct" | "ridicare" | "propriu";

export type Livrarea = {
  fel: FelLivrare;
  titlu: string;
  /** Ce a ales omul la checkout („FAN Courier - livrare in 1-2 zile"). */
  metoda: string | null;
  /** Numele punctului, la livrarea in punct. */
  punct: string | null;
  /** Adresa destinatiei, gata de afisat pe randuri. */
  adresa: string[];
  destinatar: { nume: string | null; telefon: string | null; email: string | null };
};

const curat = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

/** „jud. Cluj", fara sa dubleze un judet scris deja cu prefix sau Bucurestiul. */
function judetul(judet: string | null): string | null {
  if (!judet) return null;
  if (/^(jud|judetul|municipiul|sector)\b/i.test(judet)) return judet;
  return `jud. ${judet}`;
}

function randuriDeAdresa(p: {
  strada: string | null; oras: string | null; judet: string | null; cod: string | null; tara: string | null;
}): string[] {
  const out: string[] = [];
  if (p.strada) out.push(p.strada);
  const loc = [p.cod, p.oras].filter(Boolean).join(" ");
  const linie2 = [loc || null, judetul(p.judet)].filter(Boolean).join(", ");
  if (linie2) out.push(linie2);
  /* Tara se scrie numai cand nu e Romania: aproape toate comenzile sunt locale. */
  if (p.tara && !/^(ro|rou|romania)$/i.test(p.tara)) out.push(p.tara.toUpperCase());
  return out;
}

export function livrarea(l: LivrareBruta | null): Livrarea | null {
  if (!l) return null;
  const curier = curat(l.curier_ales);
  const fel: FelLivrare =
    curier === "pickup" ? "ridicare"
      : curat(l.fel_livrare) === "locker" ? "punct"
        : curier === "own" ? "propriu"
          : "adresa";

  const titluri: Record<FelLivrare, string> = {
    adresa: "Livrare la adresa",
    punct: "Livrare la punct de ridicare",
    ridicare: "Ridicare personala",
    propriu: "Livrare prin curierul magazinului",
  };

  let adresa: string[];
  if (fel === "punct") {
    adresa = randuriDeAdresa({
      strada: curat(l.punct_adresa) ?? curat(l.adresa),
      oras: curat(l.punct_oras) ?? curat(l.oras),
      judet: curat(l.punct_judet) ?? curat(l.judet),
      cod: null,
      tara: curat(l.tara),
    });
  } else if (fel === "ridicare") {
    /* La ridicare, adresa de pe comanda e a omului, nu destinatia. Nu se arata
       ca „unde ajunge coletul". */
    adresa = [];
  } else {
    adresa = randuriDeAdresa({
      strada: curat(l.adresa),
      oras: curat(l.oras),
      judet: curat(l.judet),
      cod: curat(l.cod_postal),
      tara: curat(l.tara),
    });
  }

  return {
    fel,
    titlu: titluri[fel],
    metoda: curat(l.eticheta_livrare),
    punct: fel === "punct" ? curat(l.punct) : null,
    adresa,
    destinatar: { nume: curat(l.nume), telefon: curat(l.telefon), email: curat(l.email) },
  };
}
