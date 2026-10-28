"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateGeneralSettings, updatePageContent } from "@/lib/actions/store.actions";
import {
  NUME_RETEA, RETELE_SOCIALE, normalizeazaLinkSocial,
  type DateleGenerale, type ReteaSociala,
} from "@/lib/dashboard/datele-magazinului";
import {
  formularDeSalvat, problemaFormularului,
  type CampSuplimentar, type ConfigFormular, type OptiuneExtra,
} from "@/lib/dashboard/formular-comanda";
import {
  catalogModificat, formularModificat, panouriGeneraleModificate,
  type CheieSetare, type StareGenerale, type VizibilitateCatalog,
} from "@/lib/editor-magazin/setari";
import type { TipComanda } from "@/lib/storefront/design/tip-comanda";

/**
 * Starea filei „Setări” din editor (etapa 8, lista lui de pe 27.10.2026): datele magazinului, formularul
 * de comanda si catalogul, mutate din Setari (unde ajunsesera la etapa 1).
 *
 * ⚠ Sta in editor, nu in panouri: un panou se inchide la „Înapoi” sau la schimbarea filei, iar ce era
 * scris si nesalvat s-ar fi pierdut fara semn. Asa ramane pana la salvare, iar „Ieși” intreaba.
 *
 * Se salveaza DIRECT (decizia lui), prin aceleasi actiuni ca in Setari: `updateGeneralSettings` (datele
 * trec prin `pregatesteDateleGenerale` pe server) si `updatePageContent`, doar cu cheile lor.
 */

export interface SetariInitiale {
  generale: DateleGenerale;
  formatComanda: string;
  formular: ConfigFormular;
  /** Tipul de checkout cand nu e salvat niciunul: al designului publicat (etapa 15), adica ce vad clientii azi. */
  tipComandaImplicit: TipComanda;
  catalog: VizibilitateCatalog;
}

const formatDin = (v: string): "sequential" | "random" => (v === "random" ? "random" : "sequential");

/**
 * Lista goala in loc de lipsa, ca ecranul sa le poata desena (ca in fila din Setari). Tipul de checkout (etapa 15) e
 * mereu ales pe ecran: fara unul salvat, cel de azi, deci prima salvare il scrie fara sa schimbe ceva in magazin.
 */
const formularDeLucru = (f: ConfigFormular, tipImplicit: TipComanda): ConfigFormular =>
  ({ ...f, tip: f.tip ?? tipImplicit, custom_fields: f.custom_fields ?? [], extras: f.extras ?? [] });

function useDateleGenerale(businessId: string, initiale: DateleGenerale, formatInitial: string, dupaSalvare: () => void) {
  const [d, setD] = useState(initiale);
  /*
   * ⚠ Bifa spune ADEVARUL despre ce e in baza, nu un implicit (ca in Setari): pornita bifata cand
   * WhatsApp-ul lipsea, prima salvare il scria inapoi, cu tot cu butonul flotant.
   */
  const [acelasiNumar, setAcelasiNumar] = useState(
    () => !!initiale.phone.trim() && initiale.whatsapp.trim() === initiale.phone.trim(),
  );
  const [altNumar, setAltNumar] = useState(() =>
    initiale.whatsapp.trim() && initiale.whatsapp.trim() !== initiale.phone.trim() ? initiale.whatsapp : "",
  );
  const [formatComanda, setFormatComanda] = useState(() => formatDin(formatInitial));
  const [salvat, setSalvat] = useState<StareGenerale>(() => ({ date: initiale, formatComanda: formatDin(formatInitial) }));
  /* Linkul se judeca abia dupa ce omul iese din camp sau apasa Salvează, nu la prima litera. */
  const [verificate, setVerificate] = useState<ReadonlySet<ReteaSociala>>(new Set());
  const [cautaAnaf, setCautaAnaf] = useState(false);
  const [salvez, startSalvare] = useTransition();

  const whatsappFinal = acelasiNumar ? d.phone.trim() : altNumar.trim();
  const acum = useMemo<StareGenerale>(() => ({ date: { ...d, whatsapp: whatsappFinal }, formatComanda }), [d, whatsappFinal, formatComanda]);
  const modificate = useMemo(() => panouriGeneraleModificate(acum, salvat), [acum, salvat]);
  const reteleGresite = RETELE_SOCIALE.filter((retea) => "eroare" in normalizeazaLinkSocial(d.social[retea]));

  const schimba = <K extends keyof DateleGenerale>(cheie: K, valoare: DateleGenerale[K]) =>
    setD((p) => ({ ...p, [cheie]: valoare }));
  const verificata = (retea: ReteaSociala) => setVerificate((v) => new Set(v).add(retea));

  async function completeazaDinAnaf() {
    if (!d.cui.trim()) { toast.error("Scrie întâi CUI-ul."); return; }
    setCautaAnaf(true);
    try {
      const res = await fetch("/api/anaf/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cui: d.cui }),
      });
      const data = await res.json() as { business_name?: string; county?: string; city?: string; address?: string; reg_com?: string; error?: string };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "CUI-ul nu a fost găsit la ANAF.");
      } else {
        setD((p) => ({
          ...p,
          business_name: data.business_name ?? p.business_name,
          county: data.county ?? p.county,
          city: data.city ?? p.city,
          address: data.address ?? p.address,
          reg_com: data.reg_com ?? p.reg_com,
        }));
        toast.success("Datele firmei au fost completate din ANAF. Verifică-le și salvează.");
      }
    } catch {
      toast.error("Nu am putut întreba ANAF-ul. Încearcă din nou peste câteva minute.");
    } finally {
      setCautaAnaf(false);
    }
  }

  function salveaza() {
    if (!d.business_name.trim()) { toast.error("Denumirea firmei este obligatorie. O scrii la Datele firmei."); return; }
    if (reteleGresite.length > 0) {
      setVerificate(new Set(RETELE_SOCIALE));
      const prima = reteleGresite[0];
      toast.error(`Linkul de ${NUME_RETEA[prima]} nu e o adresă web. Scrie-l complet, de exemplu https://${prima}.com/magazinul-tau.`);
      return;
    }
    const trimise = acum;
    startSalvare(async () => {
      let rezultat: Awaited<ReturnType<typeof updateGeneralSettings>>;
      try {
        rezultat = await updateGeneralSettings(businessId, trimise.date, trimise.formatComanda);
      } catch {
        /* ⚠ Nu stim daca scrierea a apucat sa ajunga in baza. Mesajul spune doar atat. */
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă setările s-au salvat. "
          + "Reîncarcă pagina și uită-te la valorile de pe ecran înainte să salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in rezultat) { toast.error(rezultat.error); return; }
      setSalvat(trimise);
      toast.success("Setările au fost salvate. Le vezi în magazin.");
      dupaSalvare();
    });
  }

  return {
    d, schimba, acelasiNumar, setAcelasiNumar, altNumar, setAltNumar, formatComanda, setFormatComanda,
    verificate, verificata, reteleGresite, cautaAnaf, completeazaDinAnaf, salvez, salveaza, modificate,
  };
}

function useFormularComanda(businessId: string, initial: ConfigFormular, tipImplicit: TipComanda, dupaSalvare: () => void) {
  const [config, setConfig] = useState<ConfigFormular>(() => formularDeLucru(initial, tipImplicit));
  const [salvat, setSalvat] = useState<ConfigFormular>(() => formularDeLucru(initial, tipImplicit));
  const [salvez, startSalvare] = useTransition();
  const modificat = formularModificat(config, salvat);

  const schimbaCamp = (i: number, patch: Partial<CampSuplimentar>) =>
    setConfig((c) => ({ ...c, custom_fields: (c.custom_fields ?? []).map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const schimbaExtra = (i: number, patch: Partial<OptiuneExtra>) =>
    setConfig((c) => ({ ...c, extras: (c.extras ?? []).map((e, j) => (j === i ? { ...e, ...patch } : e)) }));

  /*
   * ⚠ Se trimite DOAR `checkout_config`: `updatePageContent` imbina pe chei de prim nivel, deci o cheie
   * in plus, dintr-o copie facuta la deschidere, ar scrie peste ce a schimbat intre timp alt ecran.
   */
  function salveaza() {
    const problema = problemaFormularului(config);
    if (problema) { toast.error(problema); return; }
    const curat = formularDeSalvat(config);
    startSalvare(async () => {
      let rezultat: Awaited<ReturnType<typeof updatePageContent>>;
      try {
        rezultat = await updatePageContent(businessId, { checkout_config: curat });
      } catch {
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă formularul s-a salvat. "
          + "Reîncarcă pagina și uită-te la valorile de pe ecran înainte să salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in rezultat) { toast.error(rezultat.error); return; }
      setConfig(curat);
      setSalvat(curat);
      toast.success("Setările comenzii au fost salvate.");
      dupaSalvare();
    });
  }

  /*
   * Tipul SALVAT, nu cel de pe ecran: dupa el se uita editorul (previzualizarea, pagina „Finalizarea comenzii”), ca
   * si magazinul, care il citeste din baza. Un tip ales si nesalvat nu schimba nimic pana la „Salvează”.
   */
  const tipSalvat: TipComanda = salvat.tip ?? tipImplicit;

  return { config, setConfig, schimbaCamp, schimbaExtra, salvez, salveaza, modificat, tipSalvat };
}

function useCatalog(businessId: string, initial: VizibilitateCatalog, dupaSalvare: () => void) {
  const [valori, setValori] = useState(initial);
  const [salvat, setSalvat] = useState(initial);
  const [salvez, startSalvare] = useTransition();
  const modificat = catalogModificat(valori, salvat);

  /* ⚠ Se trimit DOAR cele trei chei ale catalogului, din acelasi motiv ca la formular. */
  function salveaza() {
    const trimis: VizibilitateCatalog = {
      hide_products_without_images: valori.hide_products_without_images,
      hide_out_of_stock_products: valori.hide_out_of_stock_products,
      show_empty_categories: valori.show_empty_categories,
    };
    startSalvare(async () => {
      let rezultat: Awaited<ReturnType<typeof updatePageContent>>;
      try {
        rezultat = await updatePageContent(businessId, trimis);
      } catch {
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă setările s-au salvat. "
          + "Reîncarcă pagina și uită-te la valorile de pe ecran înainte să salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in rezultat) { toast.error(rezultat.error); return; }
      setSalvat(trimis);
      toast.success("Setările catalogului au fost salvate.");
      dupaSalvare();
    });
  }

  return { valori, setValori, salvez, salveaza, modificat };
}

export function useSetariMagazin({ businessId, initiale, dupaSalvare }: {
  businessId: string;
  initiale: SetariInitiale;
  /** Dupa o salvare reusita: previzualizarea si datele editorului se reincarca. */
  dupaSalvare: () => void;
}) {
  const generale = useDateleGenerale(businessId, initiale.generale, initiale.formatComanda, dupaSalvare);
  const formular = useFormularComanda(businessId, initiale.formular, initiale.tipComandaImplicit, dupaSalvare);
  const catalog = useCatalog(businessId, initiale.catalog, dupaSalvare);

  const nesalvate: CheieSetare[] = [
    ...generale.modificate,
    ...(formular.modificat ? ["formular" as const] : []),
    ...(catalog.modificat ? ["catalog" as const] : []),
  ];
  const areNesalvate = nesalvate.length > 0;

  // Inchiderea ferestrei cu setari nesalvate merita un avertisment, ca la pagina proprie.
  useEffect(() => {
    if (!areNesalvate) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [areNesalvate]);

  return { generale, formular, catalog, nesalvate };
}

export type SetariMagazin = ReturnType<typeof useSetariMagazin>;
