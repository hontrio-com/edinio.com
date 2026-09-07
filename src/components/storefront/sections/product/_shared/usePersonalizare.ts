"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeazaDefinitia,
  type CampPersonalizare,
  type DefinitiePersonalizare,
} from "@/lib/customization/definitie";
import {
  campurileFaraSuprafata, podeaPersonalizarii, pretUnitar, pretulPersonalizarii,
  type RezultatPret,
} from "@/lib/customization/pret";
import { formatPrice } from "@/lib/utils/format";
import { fisiereleCampului, normalizeazaValorile, valoriDePornire, valorileDinLinie } from "@/lib/customization/valori";
import { megaoctetiiCampului } from "@/lib/customization/definitie";
/*
 * ⚠ DIN `adresa`, NU DIN `comanda`. Modulul asta e pur (fara `node:*`, fara `process.env`) tocmai
 * ca pagina de produs sa nu care `node:crypto` in pachetul browserului — vezi antetul lui.
 */
import { sePoateRandaCaImagine } from "@/lib/customization/adresa";

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
 * „cand se poate comanda” scrisa in fiecare ar fi divergit, iar divergenta s-ar fi vazut ca un
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
   * Cat timp campurile nu sunt completate, in modul „suprafata” cu baza stinsa nu exista nici
   * suprafata, nici supliment — deci `pretUnitar` dadea 0, iar pagina scria „0 lei” langa titlu
   * si in bara lipita jos pe telefon. Fara niciun mesaj alaturi: constatarile tac pana la prima
   * apasare pe „Comanda”. Clientul nu putea deosebi intre „produsul e gratis”, „pagina e stricata”
   * si „trebuie sa scriu eu dimensiunile” — iar dupa ce completa, cifra sarea de la zero la 778,75,
   * ceea ce se citeste ca pret ascuns.
   *
   * ⚠ Si nu e o configuratie exotica: panoul insusi stinge `includePretulProdusului` cand
   * alegi „Calculat din suprafata”, iar campurile „implicit” ale laturilor sunt goale din start.
   * Comerciantul care urmeaza EXACT indicatia panoului obtinea pagina cu „0 lei”.
   *
   * Un `number` intors de aici s-ar fi putut da oricand lui `formatPrice` de un model nou de
   * pagina, si defectul ar fi reaparut tacut. Textul nu se poate gresi asa.
   */
  pretDeAfisat: (bazaPeBucata: number) => string;
  /**
   * Aceeasi suma ca `pretDeAfisat`, ca NUMAR — pentru analytics, unde se trimite o valoare, nu un
   * text. Vezi nota de la implementare: cand pretul nu se poate sti inca, intoarce PODEAUA, adica
   * exact cifra pe care o vede omul cu „de la" in fata.
   */
  pretPeBucata: (bazaPeBucata: number) => number;
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
  /**
   * Previzualizarile, cheiate pe cheia fisierului.
   *
   * ⚠ SE FAC DIN FISIERUL PE CARE BROWSERUL IL ARE DEJA (`URL.createObjectURL`), nu dintr-o
   * adresa intoarsa de server — fiindca server-ul nu mai intoarce niciuna. Si e mai bine asa:
   * poza clientului nu mai face drumul inapoi ca sa se vada, deci nu iese din browserul lui.
   *
   * ⚠ LA REINCARCAREA PAGINII SE PIERD, si asta e purtarea corecta: valorile raman (sunt in
   * starea formularului sau in cos), dar imaginea nu se mai poate arata fara sa cerem octetii de
   * undeva. Atunci se arata numele fisierului — vezi `CampuriPersonalizare`.
   *
   * ⚠ SE FAC DOAR PENTRU CE SE POATE CHIAR DESENA, si se ELIBEREAZA. Un `createObjectURL` tine
   * octetii fisierului vii cat traieste documentul, iar App Router pastreaza documentul peste
   * navigarile din magazin: un PDF de tipar de 35 MB scos cu X ramanea prins in fila pana la
   * reincarcare, si dupa a treia incercare Safari-ul de pe telefon omora fila CU FORMULARUL IN EA.
   * Deci: obiect numai pentru terminatiile desenabile, `revokeObjectURL` la scoatere si la
   * demontare.
   */
  previzualizari: Record<string, string>;
  /**
   * Numele ADEVARAT al fisierului, cheiat pe cheia lui — cat timp pagina traieste.
   *
   * ⚠ CHEIA NU-L POARTA. Ea e `<uuid>-<semnatura>.<ext>`, fiindca numele trimis de browser nu se
   * scrie niciodata pe disc. Afisata ca atare, ea e un rand de 65 de caractere de hexazecimal,
   * taiat de `truncate` pe telefon la primele cateva — deci trei poze aratau la fel, si cine voia
   * sa scoata poza gresita apasa X-ul altei poze.
   *
   * ⚠ Numele il avem doar aici, in clipa in care omul tocmai a ales fisierul (`File.name`). Dupa
   * reincarcarea paginii harta e goala si se cade pe „Fisierul N.<ext>” — vezi `numeleFisierului`
   * din `@/lib/customization/adresa`, singura copie a regulii pentru amandoua ecranele.
   */
  nume: Record<string, string>;
  /**
   * De ce n-a mers incarcarea, pe camp — CU CUVINTELE SERVERULUI.
   *
   * ⚠ Fara asta, ecranul isi compunea singur o explicatie din reglajele campului („pana in 100
   * MB”, „accepta PDF, JPG...”), iar cand comerciantul ceruse un plafon peste cel al serverului
   * amandoua erau FALSE: fisierul chiar era sub 100 MB si chiar era PDF. Pe un camp obligatoriu,
   * omul ramanea fara nimic de incercat.
   */
  motive: Record<string, string>;
  incarcaFisiere: (camp: CampPersonalizare, fisiere: FileList | null) => Promise<void>;
  /**
   * Scoate fisierul de pe pozitia `index`.
   *
   * ⚠ CHEIA SE DA DE AFARA, si nu e un moft. Citita inauntru din `valori`, ar fi trebuit citita
   * dintr-o stare care tocmai se schimba — adica dintr-un `setState` care si elibereaza, deci un
   * efect intr-un loc pe care React are voie sa-l cheme de doua ori. Cine deseneaza randul are
   * cheia in mana; o trece mai departe, si eliberarea ramane in ascultatorul de apasare.
   */
  scoateFisier: (campId: string, index: number, cheie?: string) => void;
  /**
   * Umple formularul cu valorile unei linii de cos — editarea unei personalizari deja facute.
   *
   * ⚠ SE IAU DOAR CAMPURILE CARE MAI EXISTA in definitia de ACUM. Linia poate fi veche de zile,
   * iar comerciantul poate fi sters intre timp un camp: turnata intreaga, valoarea lui ar fi
   * calatorit mai departe intr-o comanda pentru un camp care nu mai e — invizibila pe ecran,
   * fiindca nimic n-o mai deseneaza. Ce lipseste din linie ramane pe implicitul comerciantului.
   *
   * ⚠ SI SE STING CONSTATARILE. Ele se aprind dupa prima apasare pe „Adauga"; o linie adusa din
   * cos n-a fost inca trimisa de pe ecranul asta, deci n-are de ce sa se deschida cu rosu.
   */
  incarcaValori: (v: Record<string, unknown>) => void;
}


/**
 * @param permis Permisul de incarcare, emis pe SERVER cand s-a randat pagina produsului.
 *
 * ⚠ `null` inseamna „produsul n-are campuri de fisier" SAU „pagina asta nu emite permise" (de
 * pilda previzualizarea din panou). In amandoua cazurile ruta refuza incarcarea CU MESAJ, nu se
 * preface ca merge — vezi `permis-incarcare.ts`.
 */
export function usePersonalizare(pageSections: unknown, permis?: string | null): StarePersonalizare {
  const definitie = useMemo(() => {
    const ps = pageSections && typeof pageSections === "object"
      ? (pageSections as Record<string, unknown>)
      : null;
    return normalizeazaDefinitia(ps?.customization);
  }, [pageSections]);

  const [valori, setValori] = useState<ValoriBrute>(() => valoriDePornire(definitie));
  const [aratate, setAratate] = useState(false);
  const [incarca, setIncarca] = useState<Record<string, boolean>>({});
  const [motive, setMotive] = useState<Record<string, string>>({});
  const [previzualizari, setPrevizualizari] = useState<Record<string, string>>({});
  const [nume, setNume] = useState<Record<string, string>>({});

  /*
   * ⚠ ACELEASI OBIECTE, DAR INTR-UN REF — ca sa se poata elibera si dupa demontare.
   *
   * Curatenia de la demontare ruleaza cand starea nu mai exista, deci n-are de unde citi harta
   * `previzualizari`. Un `useEffect` cu ea in dependinte ar fi eliberat obiecte inca folosite la
   * fiecare adaugare. Ref-ul e adevarul despre ce trebuie eliberat; starea e doar ce se deseneaza.
   */
  const obiecte = useRef<Record<string, string>>({});

  const elibereaza = useCallback((cheie: string) => {
    const obiect = obiecte.current[cheie];
    if (!obiect) return;
    delete obiecte.current[cheie];
    try {
      URL.revokeObjectURL(obiect);
    } catch { /* eliberarea nu are de ce sa strice ecranul */ }
  }, []);

  /* ⚠ La demontare se elibereaza TOT ce a mai ramas: altfel octetii traiesc cat traieste fila. */
  useEffect(
    () => () => {
      for (const obiect of Object.values(obiecte.current)) {
        try {
          URL.revokeObjectURL(obiect);
        } catch { /* idem */ }
      }
      obiecte.current = {};
    },
    [],
  );

  const pune = useCallback((campId: string, valoare: unknown) => {
    setValori((v) => ({ ...v, [campId]: valoare }));
  }, []);

  const incarcaValori = useCallback((aduse: Record<string, unknown>) => {
    setValori(valorileDinLinie(definitie, aduse));
    setAratate(false);
  }, [definitie]);

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

  /*
   * ⚠ CAMPURILE CARE CER O SUPRAFATA PE CARE N-O AU, aratate langa ele.
   *
   * Serverul le refuza oricum (vezi `verificaPersonalizarea`), dar aici omul afla INAINTE sa-si
   * scrie toata adresa — si afla langa campul vinovat, nu intr-un mesaj general.
   */
  const cerSuprafata = useMemo(
    () => (definitie && curate ? campurileFaraSuprafata(definitie, curate.valori) : []),
    [definitie, curate],
  );

  const constatari = useMemo(() => {
    if (!aratate || !curate) return {};
    const out: Record<string, string> = {};
    for (const c of curate.constatari) if (!out[c.campId]) out[c.campId] = c.mesaj;
    for (const camp of cerSuprafata) {
      if (!out[camp.id]) out[camp.id] = "Completeaza dimensiunile, ca sa putem socoti pretul.";
    }
    return out;
  }, [aratate, curate, cerSuprafata]);

  const verifica = useCallback(() => {
    if (!definitie || !curate) return true;
    setAratate(true);
    return curate.ok && cerSuprafata.length === 0;
  }, [definitie, curate, cerSuprafata]);

  const incarcaFisiere = useCallback(
    async (camp: CampPersonalizare, fisiere: FileList | null) => {
      if (!fisiere || fisiere.length === 0) return;
      /*
       * ⚠ MESAJUL ROSU SE STINGE LA FIECARE INCERCARE NOUA, si asta e chiar reparatia.
       *
       * Steagul si textul se puneau la esec si nu se stergeau niciodata: nici la o incercare noua,
       * nici la reusita. Deci cine alegea o poza de 18 MB pe un camp cu plafon 10, o micsora si o
       * incarca din nou cu succes, citea in continuare, cu rosu, „Fisierul depaseste limita de
       * 10MB.” — singurul semn vizual pe care il primea dupa o incarcare REUSITA era eroarea de la
       * incercarea de dinainte. Sters aici, mesajul descrie mereu ultima incercare.
       */
      setIncarca((u) => ({ ...u, [camp.id]: true, [`${camp.id}:eroare`]: false }));
      setMotive((m) => ({ ...m, [camp.id]: "" }));
      try {
        const acum = Array.isArray(valori[camp.id]) ? (valori[camp.id] as string[]) : [];
        /* ⚠ Plafonul nostru peste al comerciantului — vezi `fisiereleCampului`. */
        const maxim = fisiereleCampului(camp);
        /*
         * ⚠ AICI STATEA `const documente = camp.type === "fisier"`, si a ramas fara treaba dupa ce
         * felul campului a inceput sa iasa din PERMIS, nu din ce declara clientul. Implicitul
         * fiecarui tip (10 MB imagine, 40 MB fisier) il da acum `megaoctetiiCampului(camp.type)`,
         * chiar mai jos — o singura sursa in loc de doua.
         */
        /*
         * ⚠ ACELASI PLAFON CA AL SERVERULUI, nu unul mai mare. Comerciantul putea scrie 100, iar
         * filtrul de aici il credea: fisierul pleca, serverul il refuza la 40, si ecranul ii spunea
         * clientului „pana in 100 MB” — adica il mintea de doua ori. Poarta de salvare nu mai lasa
         * cifra sa treaca, dar randul asta o margineste si pe randurile scrise inainte.
         */
        const mbMax = Math.min(camp.max_file_size_mb ?? megaoctetiiCampului(camp.type),
          megaoctetiiCampului(camp.type));
        const octetiMax = mbMax * 1024 * 1024;
        const adrese: string[] = [];
        let refuzat = false;
        let motiv = "";

        for (const f of Array.from(fisiere).slice(0, Math.max(0, maxim - acum.length))) {
          /*
           * ⚠ Fisierul prea mare se SEMNALEAZA, nu se sare tacut. Pana acum bucla facea
           * `continue`, iar clientul alegea patru poze si vedea trei — fara niciun mesaj, si fara
           * sa stie care lipseste.
           */
          if (f.size > octetiMax) { refuzat = true; continue; }
          /*
           * ═══ ⚠ TREI PASI, SI OCTETII NU TREC PRIN SERVERUL NOSTRU ═══
           *
           * Pana pe 07.09.2026 fisierul pleca intr-un `FormData` catre `/api/upload-customization`.
           * Nu putea sa mearga peste 4,5 MB: Vercel refuza cererea cu 413 inainte ca vreun rand de
           * pe server sa ruleze — iar campurile promiteau 10 MB (16 din 26, masurat). O poza de
           * telefon de 6 MB pica pe un camp OBLIGATORIU, si omul citea „incarcarea a esuat" pentru
           * un fisier pe care ecranul tocmai i-l acceptase.
           *
           * Acum: (1) cerem voie si primim un link semnat, (2) punem octetii DE-A DREPTUL in
           * depozit, (3) cerem serverului sa-i verifice si sa-i dea o cheie buna.
           *
           * ⚠ PERMISUL merge la pasii 1 si 3, ca inainte: el spune ce magazin, ce produs si ce
           * camp. Ce se schimba e doar pe unde curg octetii.
           */
          try {
            const cerere = await fetch("/api/upload-customization", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                permis: permis ?? "",
                camp: camp.id,
                /*
                 * ⚠ TIPUL SI MARIMEA DECLARATE aici sunt doar o cerere, nu o dovada: marimea intra
                 * in SEMNATURA linkului (deci R2 refuza orice altceva), iar tipul se rejudeca pe
                 * OCTETI la pasul 3.
                 */
                tip: f.type || "application/octet-stream",
                octeti: f.size,
              }),
            });
            const voie = (await cerere.json()) as { incarcare?: string; referinta?: string; error?: string };
            if (!voie.incarcare || !voie.referinta) {
              refuzat = true;
              if (voie.error) motiv = voie.error;
              continue;
            }

            /*
             * ⚠ PUT CURAT, cu EXACT antetul semnat: `Content-Type` si nimic altceva. Orice antet in
             * plus schimba semnatura, si R2 raspunde 403.
             */
            const pus = await fetch(voie.incarcare, {
              method: "PUT",
              headers: { "content-type": f.type || "application/octet-stream" },
              body: f,
            });
            if (!pus.ok) {
              refuzat = true;
              motiv = "Incarcarea nu a ajuns in depozit. Incearca din nou.";
              continue;
            }

            const res = await fetch("/api/upload-customization/finalizeaza", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ permis: permis ?? "", camp: camp.id, referinta: voie.referinta }),
            });
            const date = (await res.json()) as { cheie?: string; error?: string };
            if (date.cheie) {
              const cheie = date.cheie;
              adrese.push(cheie);
              /*
               * ⚠ NUMELE OMULUI, tinut langa cheie. Cheia nu-l poarta (`<uuid>-<semnatura>.<ext>`),
               * si el il are la indemana o singura data: acum, in `File.name`.
               */
              if (f.name) setNume((n) => ({ ...n, [cheie]: f.name }));
              /*
               * ⚠ Previzualizarea din FISIERUL DE AICI, nu de la server: ruta intoarce cheia, si
               * continutul se serveste doar comerciantului, pe o ruta cu sesiune. Vezi
               * `fisiere-private.ts`.
               *
               * ⚠ SI NUMAI PENTRU CE SE POATE DESENA. Un PDF de tipar sau un HEIC de pe iPhone nu
               * ajung niciodata pe ecran ca imagine (vezi `sePoateRandaCaImagine`), deci un obiect
               * facut pentru ele ar fi tinut zeci de megaocteti in fila pentru zero folos.
               */
              if (sePoateRandaCaImagine(cheie)) {
                try {
                  const obiect = URL.createObjectURL(f);
                  obiecte.current[cheie] = obiect;
                  setPrevizualizari((p) => ({ ...p, [cheie]: obiect }));
                } catch { /* fara previzualizare: se arata numele fisierului */ }
              }
            } else {
              refuzat = true;
              /*
               * ⚠ SE PASTREAZA MESAJUL SERVERULUI, nu se arunca.
               *
               * Aruncat, ecranul scria o explicatie generica din reglajele campului — „pana in
               * 100 MB”, „accepta PDF, JPG...” — iar fisierul clientului ERA sub 100 MB si ERA
               * PDF. Amandoua explicatiile false, pe un camp obligatoriu de care depinde comanda.
               * Serverul stie adevaratul motiv; el trebuie sa ajunga la om.
               */
              if (!motiv && typeof date.error === "string" && date.error) motiv = date.error;
            }
          } catch {
            /* ⚠ Si o retea cazuta se spune. Pana acum `fetch` nu era nici macar in `try`. */
            refuzat = true;
          }
        }

        /*
         * ⚠ SE SCRIE PRIN FORMA FUNCTIONALA, care nu poate fi invechita.
         *
         * `acum` s-a citit la INTRARE, iar scrierea vine dupa `await`-uri de retea. Campul de
         * fisier nu era blocat intre timp, deci a doua apasare pornea o a doua rulare cu ACELASI
         * `acum` gol si o suprascria pe prima: pe 4G, cine alegea doua poze si mai adauga una in
         * timpul urcarii ramanea cu una singura in formular. Fisierele primei serii erau deja in
         * R2 — platite, orfane — si dispareau din valoare fara niciun semn.
         *
         * ⚠ SI NU SE TAIE AICI LA PLAFON, oricat ar ispiti. Doua rulari suprapuse chiar pot trece
         * impreuna peste plafon — fiecare taie la intrare din cat stia EA ca e in camp — dar un
         * `.slice()` la scriere ar scoate din valoare chei ale unor fisiere DEJA URCATE, fara
         * `refuzat` si fara motiv: clientul n-ar afla nimic, octetii ar ramane platiti si orfani in
         * R2, iar randul taiat n-ar mai avea niciun X pe ecran care sa-i elibereze obiectul. Mai
         * rau: valoarea n-ar mai depasi NICIODATA plafonul, deci constatarea scrisa anume pentru
         * cazul asta in `normalizeazaValorile` („Se pot trimite cel mult N fisiere...”) n-ar mai
         * putea sa se aprinda vreodata, si asa s-ar stinge chiar semnalul.
         *
         * Regula proiectului e scrisa acolo, negru pe alb: CE E PESTE PLAFON SE SPUNE, NU SE TAIE
         * IN TACERE — taierea tacuta e singura cale din tot sistemul prin care o comanda iese buna
         * cu date lipsa. Deci se scrie tot, si vorbeste `valori.ts`: langa camp in vitrina, si ca
         * refuz pe server.
         */
        if (adrese.length) {
          setValori((v) => {
            const deja = Array.isArray(v[camp.id]) ? (v[camp.id] as string[]) : [];
            return { ...v, [camp.id]: [...deja, ...adrese] };
          });
        }
        if (refuzat) {
          setAratate(true);
          setIncarca((u) => ({ ...u, [`${camp.id}:eroare`]: true }));
          /* Textul serverului, cand exista; altfel ramane cel generic din componenta. */
          setMotive((m) => ({ ...m, [camp.id]: motiv }));
        }
      } finally {
        setIncarca((u) => ({ ...u, [camp.id]: false }));
      }
    },
    [permis, valori],
  );

  const scoateFisier = useCallback(
    (campId: string, index: number, cheie?: string) => {
      setValori((v) => {
        const acum = Array.isArray(v[campId]) ? (v[campId] as string[]) : [];
        return { ...v, [campId]: acum.filter((_, i) => i !== index) };
      });
      /*
       * ⚠ SCOS DE PE ECRAN INSEAMNA SI ELIBERAT. Pana acum `scoateFisier` taia doar din `valori` si
       * lasa obiectul in harta: cei 35 MB ai unui PDF gresit ramaneau prinsi in fila, invizibili,
       * pana la reincarcarea paginii.
       */
      if (!cheie) return;
      elibereaza(cheie);
      setPrevizualizari((p) => {
        if (!(cheie in p)) return p;
        const rest = { ...p };
        delete rest[cheie];
        return rest;
      });
      setNume((n) => {
        if (!(cheie in n)) return n;
        const rest = { ...n };
        delete rest[cheie];
        return rest;
      });
    },
    [elibereaza],
  );

  /**
   * Acelasi pret ca `pretDeAfisat`, dar ca NUMAR.
   *
   * ⚠ EXISTA CA SA NU FIE DOUA SOCOTELI. Analytics are nevoie de o suma, nu de un text, iar
   * calculata a doua oara la apelant s-ar fi departat de ce vede omul pe ecran — exact felul de
   * despartire pe care restul lucrarii a inchis-o peste tot.
   *
   * ⚠ SI INTOARCE PODEAUA cand pretul inca nu se poate sti (laturi necompletate, sursa de tarif
   * nealeasa), fiindca aia e cifra ARATATA, cu „de la" in fata. Un zero trimis la Meta si GA4 ar fi
   * stricat chiar cifrele pe care se socotesc pragurile de licitatie.
   */
  const pretPeBucata = useCallback(
    (bazaPeBucata: number): number => {
      const exact = pretUnitar(detalii, bazaPeBucata);
      if (!definitie) return exact;
      const nedeterminat =
        exact <= 0
        || (definitie.pret?.fel === "suprafata" && detalii.ariaFacturata === undefined);
      if (!nedeterminat) return exact;
      return podeaPersonalizarii(definitie, bazaPeBucata) ?? exact;
    },
    [definitie, detalii],
  );

  const pretDeAfisat = useCallback(
    (bazaPeBucata: number): string => {
      const exact = pretUnitar(detalii, bazaPeBucata);
      if (!definitie) return formatPrice(exact);
      /*
       * ⚠ NEDETERMINAT, nu ZERO. Doua feluri in care pretul inca nu se poate sti:
       *  - modul „suprafata” fara suprafata facturabila (laturile necompletate);
       *  - orice caz in care ar iesi 0 pe un produs care nu e gratis (sursa de tarif nealeasa).
       * In amandoua se arata PODEAUA — cel mai mic pret posibil — cu „de la” in fata. Acelasi
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
    incarcaValori,
    constatari,
    /* ⚠ `true` si cand produsul n-are personalizare — altfel butonul ar fi fost stins pe TOT
       magazinul, nu doar pe produsele personalizabile. */
    /* ⚠ `true` si cand produsul n-are personalizare — altfel butonul ar fi fost stins pe TOT
       magazinul. Si `false` cand un supliment pe m² n-are de unde sa-si ia metrii. */
    gata: !definitie || ((curate?.ok ?? true) && cerSuprafata.length === 0),
    supliment: detalii.supliment,
    pretDeAfisat,
    pretPeBucata,
    detalii,
    verifica,
    incarca,
    motive,
    previzualizari,
    nume,
    incarcaFisiere,
    scoateFisier,
  };
}
