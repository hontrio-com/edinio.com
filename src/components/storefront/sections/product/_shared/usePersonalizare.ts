"use client";

import { useCallback, useMemo, useState } from "react";
import {
  normalizeazaDefinitia,
  type CampPersonalizare,
  type DefinitiePersonalizare,
} from "@/lib/customization/definitie";
import { podeaPersonalizarii, pretUnitar, pretulPersonalizarii, type RezultatPret } from "@/lib/customization/pret";
import { formatPrice } from "@/lib/utils/format";
import { normalizeazaValorile } from "@/lib/customization/valori";

/**
 * Starea personalizarii pe pagina de produs si in formularul de comanda.
 *
 * ═══ ⚠ DE CE UN CARLIG, SI DE CE UNUL SINGUR ═══
 *
 * Pagina are nevoie de raspuns in trei locuri deodata: pretul de langa titlu, daca se poate
 * comanda, si ce se trimite la apasare. Tinuta inauntrul componentei care deseneaza, starea ar fi
 * trebuit sa iasa inapoi printr-un `onSchimbare` — adica un efect al copilului care scrie in
 * parinte la fiecare tasta.
 *
 * ⚠ Si un singur carlig pentru AMANDOUA modelele de pagina plus formularul de comanda. Regula
 * „cand se poate comanda" scrisa in fiecare ar fi divergit, iar divergenta s-ar fi vazut ca un
 * model in care se poate cumpara un fototapet fara dimensiuni.
 *
 * ═══ ⚠ CE ARATA PAGINA NU E CE INCASEAZA SERVERUL ═══
 *
 * `pretulPersonalizarii` e acelasi modul pe amandoua partile, deci va da acelasi numar. Dar
 * autoritatea ramane a serverului: el primeste VALORILE, le normalizeaza el insusi si recalculeaza.
 * Ce pleaca de aici nu e niciodata un pret.
 */

/** Ce se trimite serverului: valorile brute, cheiate pe id-ul campului. */
export type ValoriBrute = Record<string, unknown>;

export interface StarePersonalizare {
  /** `null` cand produsul n-are personalizare. Atunci tot restul e inert. */
  definitie: DefinitiePersonalizare | null;
  valori: ValoriBrute;
  pune: (campId: string, valoare: unknown) => void;
  /** Cheiate pe `camp.id`. Se arata doar dupa prima incercare de trimitere. */
  constatari: Record<string, string>;
  /** Se poate comanda? ⚠ `true` si cand produsul N-ARE personalizare. */
  gata: boolean;
  /** Suplimentul pe bucata, socotit din valorile de acum. */
  supliment: number;
  /**
   * Pretul de afisat, GATA SCRIS.
   *
   * ⚠ INTOARCE TEXT, NU NUMAR, si asta e chiar reparatia.
   *
   * Cat timp campurile nu sunt completate, in modul „suprafata" cu baza stinsa nu exista nici
   * suprafata, nici supliment — deci `pretUnitar` dadea 0, iar pagina scria „0 lei" langa titlu
   * si in bara lipita jos pe telefon. Fara niciun mesaj alaturi: constatarile tac pana la prima
   * apasare pe „Comanda". Clientul nu putea deosebi intre „produsul e gratis", „pagina e stricata"
   * si „trebuie sa scriu eu dimensiunile" — iar dupa ce completa, cifra sarea de la zero la 778,75,
   * ceea ce se citeste ca pret ascuns.
   *
   * ⚠ Si nu e o configuratie exotica: panoul insusi stinge `includePretulProdusului` cand
   * alegi „Calculat din suprafata", iar campurile „implicit" ale laturilor sunt goale din start.
   * Comerciantul care urmeaza EXACT indicatia panoului obtinea pagina cu „0 lei".
   *
   * Un `number` intors de aici s-ar fi putut da oricand lui `formatPrice` de un model nou de
   * pagina, si defectul ar fi reaparut tacut. Textul nu se poate gresi asa.
   */
  pretDeAfisat: (bazaPeBucata: number) => string;
  detalii: RezultatPret;
  /**
   * Verifica tot si aprinde constatarile. `true` cand se poate merge mai departe.
   *
   * ⚠ Se cheama la APASARE, nu la fiecare tasta: erorile aratate cat timp omul inca scrie sunt
   * zgomot, nu ajutor.
   */
  verifica: () => boolean;
  /** Fisierele in curs de incarcare, pe camp. */
  incarca: Record<string, boolean>;
  incarcaFisiere: (camp: CampPersonalizare, fisiere: FileList | null) => Promise<void>;
  scoateFisier: (campId: string, index: number) => void;
}

/** Valorile de pornire: implicitele comerciantului, ca pretul sa fie de la inceput adevarat. */
function valoriDePornire(definitie: DefinitiePersonalizare | null): ValoriBrute {
  const out: ValoriBrute = {};
  for (const c of definitie?.fields ?? []) {
    switch (c.type) {
      case "image":
        out[c.id] = [];
        break;
      case "color":
        out[c.id] = c.default_color ?? "#000000";
        break;
      case "comutator":
        out[c.id] = false;
        break;
      case "numar":
        out[c.id] = c.implicit ?? "";
        break;
      case "dimensiuni":
        out[c.id] = { latime: c.latime?.implicit ?? "", inaltime: c.inaltime?.implicit ?? "" };
        break;
      case "butoane":
        /*
         * ⚠ NU se alege singura o optiune. La un camp obligatoriu, o preselectie ar fi facut
         * clientul sa cumpere Standard fara sa fi ales nimic — iar comerciantul ar fi produs dupa
         * o alegere pe care nimeni n-a facut-o.
         */
        out[c.id] = "";
        break;
      default:
        out[c.id] = "";
    }
  }
  return out;
}

export function usePersonalizare(pageSections: unknown, businessId: string): StarePersonalizare {
  const definitie = useMemo(() => {
    const ps = pageSections && typeof pageSections === "object"
      ? (pageSections as Record<string, unknown>)
      : null;
    return normalizeazaDefinitia(ps?.customization);
  }, [pageSections]);

  const [valori, setValori] = useState<ValoriBrute>(() => valoriDePornire(definitie));
  const [aratate, setAratate] = useState(false);
  const [incarca, setIncarca] = useState<Record<string, boolean>>({});

  const pune = useCallback((campId: string, valoare: unknown) => {
    setValori((v) => ({ ...v, [campId]: valoare }));
  }, []);

  const curate = useMemo(
    () => (definitie ? normalizeazaValorile(definitie, valori) : null),
    [definitie, valori],
  );

  const detalii = useMemo(
    () =>
      definitie && curate
        ? pretulPersonalizarii(definitie, curate.valori)
        : { supliment: 0, bazaInclusa: true, defalcare: [] },
    [definitie, curate],
  );

  const constatari = useMemo(() => {
    if (!aratate || !curate) return {};
    const out: Record<string, string> = {};
    for (const c of curate.constatari) if (!out[c.campId]) out[c.campId] = c.mesaj;
    return out;
  }, [aratate, curate]);

  const verifica = useCallback(() => {
    if (!definitie || !curate) return true;
    setAratate(true);
    return curate.ok;
  }, [definitie, curate]);

  const incarcaFisiere = useCallback(
    async (camp: CampPersonalizare, fisiere: FileList | null) => {
      if (!fisiere || fisiere.length === 0) return;
      setIncarca((u) => ({ ...u, [camp.id]: true }));
      try {
        const acum = Array.isArray(valori[camp.id]) ? (valori[camp.id] as string[]) : [];
        const maxim = camp.max_files ?? 5;
        const octetiMax = (camp.max_file_size_mb ?? 10) * 1024 * 1024;
        const adrese: string[] = [];
        let refuzat = false;

        for (const f of Array.from(fisiere).slice(0, Math.max(0, maxim - acum.length))) {
          /*
           * ⚠ Fisierul prea mare se SEMNALEAZA, nu se sare tacut. Pana acum bucla facea
           * `continue`, iar clientul alegea patru poze si vedea trei — fara niciun mesaj, si fara
           * sa stie care lipseste.
           */
          if (f.size > octetiMax) { refuzat = true; continue; }
          const fd = new FormData();
          fd.append("file", f);
          fd.append("business_id", businessId);
          try {
            const res = await fetch("/api/upload-customization", { method: "POST", body: fd });
            const date = (await res.json()) as { url?: string; error?: string };
            if (date.url) adrese.push(date.url);
            else refuzat = true;
          } catch {
            /* ⚠ Si o retea cazuta se spune. Pana acum `fetch` nu era nici macar in `try`. */
            refuzat = true;
          }
        }

        if (adrese.length) pune(camp.id, [...acum, ...adrese]);
        if (refuzat) {
          setAratate(true);
          setIncarca((u) => ({ ...u, [`${camp.id}:eroare`]: true }));
        }
      } finally {
        setIncarca((u) => ({ ...u, [camp.id]: false }));
      }
    },
    [businessId, pune, valori],
  );

  const scoateFisier = useCallback(
    (campId: string, index: number) => {
      setValori((v) => {
        const acum = Array.isArray(v[campId]) ? (v[campId] as string[]) : [];
        return { ...v, [campId]: acum.filter((_, i) => i !== index) };
      });
    },
    [],
  );

  const pretDeAfisat = useCallback(
    (bazaPeBucata: number): string => {
      const exact = pretUnitar(detalii, bazaPeBucata);
      if (!definitie) return formatPrice(exact);
      /*
       * ⚠ NEDETERMINAT, nu ZERO. Doua feluri in care pretul inca nu se poate sti:
       *  - modul „suprafata" fara suprafata facturabila (laturile necompletate);
       *  - orice caz in care ar iesi 0 pe un produs care nu e gratis (sursa de tarif nealeasa).
       * In amandoua se arata PODEAUA — cel mai mic pret posibil — cu „de la" in fata. Acelasi
       * numar il vede omul si pe cardul din grila, deci cele doua ecrane nu se mai contrazic.
       */
      const nedeterminat =
        exact <= 0
        || (definitie.pret?.fel === "suprafata" && detalii.ariaFacturata === undefined);
      if (!nedeterminat) return formatPrice(exact);
      const podea = podeaPersonalizarii(definitie, bazaPeBucata);
      return podea === null ? formatPrice(exact) : `de la ${formatPrice(podea)}`;
    },
    [definitie, detalii],
  );

  return {
    definitie,
    valori,
    pune,
    constatari,
    /* ⚠ `true` si cand produsul n-are personalizare — altfel butonul ar fi fost stins pe TOT
       magazinul, nu doar pe produsele personalizabile. */
    gata: !definitie || (curate?.ok ?? true),
    supliment: detalii.supliment,
    pretDeAfisat,
    detalii,
    verifica,
    incarca,
    incarcaFisiere,
    scoateFisier,
  };
}
