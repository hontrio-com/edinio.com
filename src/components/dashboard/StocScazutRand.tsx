"use client";

import { Suspense, useCallback, useState, useSyncExternalStore } from "react";
import { Loader2, X } from "lucide-react";
import { ModalStocScazut, type CerereProduse } from "./ModalStocScazut";
import { citesteProduseSubPrag } from "@/lib/actions/stoc-scazut.actions";

/*
  Banda de stoc scazut din panoul principal: un singur rand, calm.

  ⚠ CE INSEAMNA „IGNORA”, si de ce nu e o simpla ascundere.

  Alegerea proprietarului: banda dispare, dar se intoarce „cand se schimba
  situatia". Situatie schimbata inseamna MAI RAU, nu „altfel": daca mai cade un
  produs sub prag sau mai ramane unul fara stoc, banda reapare. Daca omul
  completeaza stocul si numerele scad, ea ramane ascunsa, fiindca exact asta a
  cerut cand a apasat „Ignora".

  De aceea in memoria browserului se tin CIFRELE de la ascundere, nu un simplu
  „ascuns": comparatia se face cu ele. Cheia e pe magazin, ca un comerciant cu
  doua magazine sa nu ascunda din greseala banda celuilalt.

  Se tine in `localStorage`, nu in baza: e o preferinta de privit, nu un fapt
  despre magazin, si nu merita nici o coloana noua, nici o cerere la fiecare
  incarcare. Pretul: ascunderea e pe browserul asta. E pretul corect aici.
*/
function cheie(businessId: string): string {
  return `edinio:stoc-scazut:ignorat:${businessId}`;
}

type Ignorat = { subPrag: number; epuizate: number };

function desfaIgnorat(brut: string | null): Ignorat | null {
  if (!brut) return null;
  try {
    const v = JSON.parse(brut) as Partial<Ignorat>;
    if (typeof v?.subPrag !== "number" || typeof v?.epuizate !== "number") return null;
    return { subPrag: v.subPrag, epuizate: v.epuizate };
  } catch {
    /* Valoare stricata in memoria browserului: o tratam ca pe „neignorat”. */
    return null;
  }
}

/*
  ⚠ `useSyncExternalStore`, nu `useEffect` cu `setState`.

  Memoria browserului nu exista pe server, deci valoarea initiala difera intre
  randarea de pe server si prima randare din browser. Citita intr-un efect, ar fi
  insemnat o a doua randare si o regula de lint incalcata; citita direct la
  randare, ar fi rupt hidratarea. Carligul asta e facut anume pentru cazul asta:
  are o valoare separata pentru server (`null`, adica nimic ascuns) si una pentru
  browser, iar React le impaca singur, fara palpaire.
*/
function abonare(reimprospateaza: () => void): () => void {
  window.addEventListener("storage", reimprospateaza);
  return () => window.removeEventListener("storage", reimprospateaza);
}

export function StocScazutRand({
  businessId,
  epuizate,
  subPrag,
}: {
  businessId: string;
  /** Cate produse au ajuns la 0 bucati. */
  epuizate: number;
  /** Cate produse sunt sub prag, epuizatele incluse. */
  subPrag: number;
}) {
  /*
    Cererea catre server porneste CHIAR IN APASARE, nu intr-un efect din modal:
    asa lista incepe sa vina in clipa clicului, iar modalul n-are nevoie nici de
    efect, nici de stare de incarcare (vezi nota din `ModalStocScazut`).
  */
  const [cerere, setCerere] = useState<CerereProduse | null>(null);
  const [ascunsAcum, setAscunsAcum] = useState(false);

  const citeste = useCallback(() => {
    try {
      return window.localStorage.getItem(cheie(businessId));
    } catch {
      /* Memoria browserului poate fi oprita; atunci banda se arata. */
      return null;
    }
  }, [businessId]);

  const ignorat = desfaIgnorat(useSyncExternalStore(abonare, citeste, () => null));

  function ignora() {
    try {
      window.localStorage.setItem(cheie(businessId), JSON.stringify({ subPrag, epuizate }));
    } catch {
      /* Fara memorie, ascunderea tine doar pana la reincarcare. Nu e o eroare
         pe care omul sa o poata rezolva, deci nu i-o aratam. */
    }
    setAscunsAcum(true);
  }

  /* Ascunsa doar cat timp situatia NU s-a inrautatit fata de clipa ignorarii. */
  const ascunsDinMemorie = !!ignorat && subPrag <= ignorat.subPrag && epuizate <= ignorat.epuizate;

  if (subPrag === 0 || ascunsAcum || ascunsDinMemorie) return null;

  const urgent = epuizate > 0;

  return (
    <>
      <div className="mt-4 flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          {urgent && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60" />
          )}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${urgent ? "bg-destructive" : "bg-warning"}`}
          />
        </span>

        <p className="min-w-0 flex-1 text-sm text-foreground">
          <span className="font-semibold">
            {subPrag} {subPrag === 1 ? "produs" : "produse"}
          </span>{" "}
          sub pragul de stoc
          {epuizate > 0 && (
            <>
              , dintre care{" "}
              <span className="font-semibold text-destructive">
                {epuizate} {epuizate === 1 ? "epuizat" : "epuizate"}
              </span>
            </>
          )}
          .
        </p>

        <button
          type="button"
          onClick={() => setCerere(citesteProduseSubPrag(businessId))}
          className="flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted"
        >
          Vezi produsele sub pragul de stoc
        </button>

        <button
          type="button"
          onClick={ignora}
          title="Ignora. Banda reapare daca mai scade un produs sub prag."
          aria-label="Ignora avertizarea de stoc"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {cerere && (
        <Suspense fallback={<SeIncarcaModalul />}>
          <ModalStocScazut
            businessId={businessId}
            cerere={cerere}
            reincarca={() => setCerere(citesteProduseSubPrag(businessId))}
            inchide={() => setCerere(null)}
          />
        </Suspense>
      )}
    </>
  );
}

/** Cat vine lista, o cutie de aceeasi forma, ca ecranul sa nu sara. */
function SeIncarcaModalul() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative flex w-full max-w-2xl items-center justify-center gap-2 rounded-2xl bg-card px-5 py-16 text-sm text-muted-foreground shadow-2xl ring-1 ring-foreground/10">
        <Loader2 className="h-4 w-4 animate-spin" /> Se incarca produsele...
      </div>
    </div>
  );
}
