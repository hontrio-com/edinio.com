"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, Sparkles } from "lucide-react";
import {
  getTrendyolAttributeValues, getTrendyolCategoryAttributes, getTrendyolListingEditor,
  saveTrendyolListing, searchTrendyolBrands, suggestTrendyolAttributes, syncTrendyolProduct,
  type TrendyolEditorData, type TrendyolEditorVariant,
} from "@/lib/actions/trendyol.actions";
import { SelectCautare } from "@/components/dashboard/SelectCautare";
import { deosebesteAtribut, numeRepetate } from "@/lib/trendyol/atribute-obligatorii";
import type { TrendyolBrand, TrendyolCategoryAttribute, TrendyolProductAttribute, TrendyolStoreFront } from "@/lib/trendyol/types";
import { coteTvaVitrina, infoVitrina, necesitaSgr, pretSgr, tvaImplicitVitrina } from "@/lib/trendyol/types";

/**
 * ⚠ `valueIds` e pentru categoriile cu `allowMultipleAttributeValues`. Taxonomia lor ne
 * spunea de mult steagul asta; noi il citeam si nu-l foloseam nicaieri, deci un atribut
 * multi-select OBLIGATORIU nu putea fi completat — se trimitea o singura valoare si ei
 * refuzau produsul.
 */
type AttrSel = { valueId?: number; valueIds?: number[]; custom?: string };
type AttrValue = { attributeValueId: number; attributeValue: string };

function toProductAttribute(attributeId: number, sel: AttrSel | undefined): TrendyolProductAttribute | null {
  if (!sel) return null;
  if (sel.custom && sel.custom.trim()) return { attributeId, customAttributeValue: sel.custom.trim() };
  /* ⚠ Lista INAINTEA valorii singure: cele doua se exclud in incarcatura lor, si cand omul a
     ales mai multe, aceea e alegerea lui. */
  const multe = (sel.valueIds ?? []).filter((x) => typeof x === "number" && x > 0);
  if (multe.length > 0) return { attributeId, attributeValueIds: multe };
  if (sel.valueId) return { attributeId, attributeValueId: sel.valueId };
  return null;
}

export function TrendyolListingEditor({
  businessId, productId, storefront, origine, onClose, onSaved,
}: {
  businessId: string; productId: string; storefront: TrendyolStoreFront;
  /** Tara de origine a vanzatorului, cand si-a declarat-o. Vezi Cross Country. */
  origine?: TrendyolStoreFront;
  onClose: () => void;
  /** Lista de deasupra isi reimprospateaza randul, ca starea sa nu ramana veche. */
  onSaved?: () => void | Promise<void>;
}) {
  // Moneda si cotele de TVA nu sunt alegerea noastra: le impune vitrina pe care
  // vinde comerciantul. Preturile trimise sunt citite in moneda ei.
  const moneda = infoVitrina(storefront).moneda;
  /*
   * Cotele de TVA ale vitrinei, largite cu cele ale tarii de ORIGINE doar cand
   * comerciantul si-a declarat-o (Cross Country). Presupusa, ar fi aratat drept
   * valide cote pe care Trendyol le respinge.
   */
  const coteTva = coteTvaVitrina(storefront, origine);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TrendyolEditorData | null>(null);
  const [groups, setGroups] = useState<TrendyolCategoryAttribute[]>([]);
  const [attrValues, setAttrValues] = useState<Record<number, AttrValue[]>>({});

  const [brandId, setBrandId] = useState<number | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandQuery, setBrandQuery] = useState("");
  const [brandResults, setBrandResults] = useState<TrendyolBrand[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [dimWeight, setDimWeight] = useState("");
  const [sgrUnits, setSgrUnits] = useState("");
  const [taraOrigine, setTaraOrigine] = useState("");
  const [listingAttrSel, setListingAttrSel] = useState<Record<number, AttrSel>>({});
  // Ce a fost completat automat, ca sa i se spuna comerciantului de unde vine.
  const [completate, setCompletate] = useState<Record<number, "firma" | "produs">>({});
  const [salveazaImplicite, setSalveazaImplicite] = useState(false);
  const [completeaza, startCompletare] = useTransition();
  const [variantAttrSel, setVariantAttrSel] = useState<Record<string, Record<number, AttrSel>>>({});
  const [variants, setVariants] = useState<TrendyolEditorVariant[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ed = await getTrendyolListingEditor(businessId, productId);
      if (!alive) return;
      if ("error" in ed) { toast.error(ed.error); onClose(); return; }
      setData(ed);
      setBrandId(ed.listing?.brand_id ?? ed.mappedBrandId ?? null);
      setBrandName(ed.mappedBrandName ?? "");
      setCategoryId(ed.listing?.category_id ?? ed.mappedCategoryId ?? null);
      // Valorile deja salvate: intai cele ale produsului, altfel implicitele
      // categoriei — munca facuta pe un produs se vede pe urmatoarele.
      const salvate = ed.listing?.attributes?.length ? ed.listing.attributes : ed.mappedAttributes;
      if (salvate?.length) {
        const sel: Record<number, AttrSel> = {};
        for (const a of salvate) sel[a.attributeId] = { valueId: a.attributeValueId, valueIds: a.attributeValueIds, custom: a.customAttributeValue };
        setListingAttrSel(sel);
      }
      setDimWeight(ed.listing?.dimensional_weight != null ? String(ed.listing.dimensional_weight) : "");
      setSgrUnits(ed.listing?.sgr_units != null ? String(ed.listing.sgr_units) : "");
      setTaraOrigine((ed.listing?.country_of_origin ?? "").toUpperCase());
      setVariants(ed.variants);
      /*
       * Atributele DE VARIANTA se reincarca in stare.
       *
       * Lipsea pasul asta cu totul: `variantAttrSel` pornea gol si `buildInput`
       * il citea ca atare, deci fiecare salvare trimitea `attributes: []` pe
       * fiecare varianta. Comerciantul alegea marimea si culoarea, salva, si
       * dispareau — iar Trendyol raspundea „Lipseste ID atribut: 47" (Culoare)
       * la produse pe care omul le completase corect de trei ori.
       */
      const peVarianta: Record<string, Record<number, AttrSel>> = {};
      for (const v of ed.variants) {
        if (!v.attributes?.length) continue;
        const sel: Record<number, AttrSel> = {};
        for (const a of v.attributes) sel[a.attributeId] = { valueId: a.attributeValueId, valueIds: a.attributeValueIds, custom: a.customAttributeValue };
        peVarianta[v.key] = sel;
      }
      setVariantAttrSel(peVarianta);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [businessId, productId, onClose]);

  /*
   * Atributele categoriei si valorile lor.
   *
   * `atributeIncarcate` deosebeste „categoria n-are atribute" de „nu le-am putut
   * incarca". Fara distinctia asta, o eroare de retea golea `groups`, iar
   * salvarea de dupa trimitea `attributes: []` — adica stergea tot ce completase
   * comerciantul, inclusiv atributele obligatorii, si produsul se intorcea de la
   * Trendyol cu „Lipseste ID atribut: 47".
   */
  const [atributeIncarcate, setAtributeIncarcate] = useState(false);
  const [eroareAtribute, setEroareAtribute] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId) return;
    let alive = true;
    (async () => {
      // Marcarea „se incarca" sta INAUNTRU, nu in corpul efectului: pusa acolo,
      // declanseaza o randare in cascada la fiecare trecere.
      setAtributeIncarcate(false);
      setEroareAtribute(null);
      const res = await getTrendyolCategoryAttributes(businessId, categoryId);
      if (!alive) return;
      if ("error" in res) { setGroups([]); setEroareAtribute(res.error); return; }
      /*
       * TOATE atributele, nu primele 20.
       *
       * Taierea ascundea atribute obligatorii — o categorie Trendyol poate avea
       * 35 — si atunci comerciantul nu avea nici macar unde sa le completeze.
       * Cele obligatorii urca primele: sunt singurele care blocheaza listarea.
       */
      const gs = [...res.attributes].sort((a, b) => Number(!!b.required) - Number(!!a.required));
      setGroups(gs);
      setAtributeIncarcate(true);
      // Fetch values for attributes that use predefined values (not freetext-only).
      const withValues = gs.filter((g) => !(g.allowCustom && (!g.attributeValues || g.attributeValues.length === 0)));
      const map: Record<number, AttrValue[]> = {};
      for (const g of withValues) {
        const v = await getTrendyolAttributeValues(businessId, categoryId, g.attribute.id);
        if (!alive) return;
        if (!("error" in v)) map[g.attribute.id] = v.values;
        setAttrValues({ ...map });
      }
    })();
    return () => { alive = false; };
  }, [businessId, categoryId]);

  /*
   * Atributele categoriei, despartite dupa unde se completeaza: cele de PRODUS
   * o data, cele `varianter` (marime, culoare) pe fiecare varianta. Stau aici,
   * inaintea completarii automate, fiindca ea trebuie sa stie unde sa scrie.
   */
  const productAttrs = useMemo(() => groups.filter((g) => !g.varianter), [groups]);
  const varianterAttrs = useMemo(() => groups.filter((g) => g.varianter), [groups]);

  /**
   * Completeaza atributele goale.
   *
   * `doarGoale` la incarcare: nu calcam peste ce a scris comerciantul. Butonul
   * „Completeaza automat" trece peste tot, ca sa poata reface dupa ce si-a
   * schimbat datele firmei.
   */
  const completeazaAutomat = (doarGoale: boolean) => {
    if (!categoryId) return;
    startCompletare(async () => {
      const res = await suggestTrendyolAttributes(businessId, productId, categoryId);
      if ("error" in res) { if (!doarGoale) toast.error(res.error); return; }
      if (res.sugestii.length === 0) { if (!doarGoale) toast.info("Nu am găsit ce completa automat."); return; }

      /*
       * Numaratoarea se face PUR, inaintea scrierii in stare.
       *
       * Pusa in updater-ul lui `setState`, React il poate evalua mai tarziu (sau
       * de doua ori, in modul strict), iar `puse`/`propuse` se citeau sincron
       * imediat dupa — deci mesajul putea sa nu apara deloc, sau sa numere dublu.
       */
      /*
       * ⚠ Atributele `varianter` (marimea, culoarea) NU se pun aici.
       *
       * Ele se completeaza PE FIECARE VARIANTA, mai jos in formular. Scrise in
       * `listingAttrSel`, valoarea nu se randeaza nicaieri, e taiata la salvare
       * si nu satisface verificarea de obligatorii — deci comerciantul primea
       * „1 câmp completat", nu vedea nicio schimbare, iar butonul de trimitere
       * ramanea blocat pe acelasi atribut. Un blocaj fara iesire.
       */
      const idVarianter = new Set(varianterAttrs.map((g) => g.attribute.id));
      const deVarianta = res.sugestii.filter((s) => idVarianter.has(s.attributeId));
      const deProdus = res.sugestii.filter((s) => !idVarianter.has(s.attributeId));

      let puse = 0;
      let propuse = 0;
      for (const s of deProdus) {
        const acum = listingAttrSel[s.attributeId];
        const gol = !acum || (!acum.valueId && !acum.custom?.trim());
        if (doarGoale && !gol) continue;
        if (s.slaba && doarGoale) { propuse++; continue; }
        puse++;
      }

      setListingAttrSel((prev) => {
        const next = { ...prev };
        for (const s of deProdus) {
          const acum = next[s.attributeId];
          const gol = !acum || (!acum.valueId && !acum.custom?.trim());
          if (doarGoale && !gol) continue;
          /*
           * Deducțiile slabe pe atribute OBLIGATORII nu se aplică singure.
           *
           * O potrivire unică tot poate fi greșită — „Negru" apare în „husă
           * neagră pentru telefon alb" — iar un obligatoriu greșit nu e respins
           * de Trendyol: se publică, se vinde, și rămâne pe fișa produsului. La
           * încărcare doar le propunem; la apăsarea explicită pe „Completează
           * automat", comerciantul a cerut-o, deci se aplică.
           */
          if (s.slaba && doarGoale) continue;
          next[s.attributeId] = { valueId: s.attributeValueId, valueIds: s.attributeValueIds, custom: s.customAttributeValue };
        }
        return next;
      });

      /*
       * Sugestiile de VARIANTA merg pe fiecare varianta activa, acolo unde chiar
       * exista campul si de unde chiar se salveaza.
       */
      if (deVarianta.length > 0) {
        setVariantAttrSel((prev) => {
          const next = { ...prev };
          for (const v of variants) {
            if (!v.enabled) continue;
            const alVariantei = { ...(next[v.key] ?? {}) };
            for (const s of deVarianta) {
              const acum = alVariantei[s.attributeId];
              const gol = !acum || (!acum.valueId && !acum.custom?.trim());
              if (doarGoale && !gol) continue;
              if (s.slaba && doarGoale) continue;
              alVariantei[s.attributeId] = { valueId: s.attributeValueId, custom: s.customAttributeValue };
            }
            next[v.key] = alVariantei;
          }
          return next;
        });
        for (const s of deVarianta) {
          if (s.slaba && doarGoale) propuse++; else puse++;
        }
      }
      if (doarGoale && propuse > 0) {
        toast.info(
          propuse === 1
            ? "Un atribut obligatoriu are o valoare probabilă, dar nesigură. Apasă „Completează automat” ca s-o pun, sau alege-o tu."
            : `${propuse} atribute obligatorii au valori probabile, dar nesigure. Apasă „Completează automat” ca să le pun, sau alege-le tu.`,
        );
      }
      setCompletate((prev) => {
        const next = { ...prev };
        for (const s of res.sugestii) next[s.attributeId] = s.sursa;
        return next;
      });
      if (!doarGoale) toast.success(`${puse} ${puse === 1 ? "câmp completat" : "câmpuri completate"}.`);
    });
  };

  // La deschidere, campurile goale se umplu singure. Datele de conformitate
  // (producator, importatori) sunt aceleasi pe tot catalogul: cerute produs cu
  // produs, ar insemna mii de completari identice.
  const autoRulat = useRef(false);
  useEffect(() => {
    if (!categoryId || groups.length === 0 || autoRulat.current) return;
    autoRulat.current = true;
    completeazaAutomat(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, groups.length]);

  /*
   * Eticheta unui atribut, deosebita cand categoria cere DOUA cu acelasi nume.
   *
   * ⚠ Se intampla real: „Genți de umăr" cere de doua ori „Culoare" — una scrisa
   * de mana (dupa care Trendyol grupeaza variantele pe pagina lor) si una aleasa
   * din lista lor de 26 de valori standard, folosita la filtre. Amandoua sunt
   * obligatorii si sunt lucruri diferite, dar afisate identic pareau un camp
   * desenat de doua ori din greseala.
   */
  const numeDuble = useMemo(() => numeRepetate(groups.map((g) => g.attribute.name)), [groups]);
  const eticheta = (g: TrendyolCategoryAttribute) => {
    const valori = attrValues[g.attribute.id] ?? [];
    const textLiber = !!g.allowCustom && valori.length === 0;
    return deosebesteAtribut(g.attribute.name, textLiber, numeDuble.has(g.attribute.name));
  };

  const setVariant = (key: string, patch: Partial<TrendyolEditorVariant>) =>
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  // Daca produsul are marca (din atributele Google), o cautam la Trendyol si o
  // alegem cand se potriveste exact — un click in minus pe fiecare produs.
  useEffect(() => {
    const marca = data?.productBrand?.trim();
    if (!marca || brandId) return;
    let alive = true;
    (async () => {
      const res = await searchTrendyolBrands(businessId, marca);
      if (!alive || "error" in res) return;
      const exact = res.brands.find((b) => b.name.trim().toLowerCase() === marca.toLowerCase());
      if (exact) { setBrandId(exact.id); setBrandName(exact.name); }
    })();
    return () => { alive = false; };
  }, [businessId, data?.productBrand, brandId]);

  const searchBrand = (q: string) => {
    setBrandQuery(q);
    if (q.trim().length < 2) { setBrandResults([]); return; }
    startTransition(async () => {
      const res = await searchTrendyolBrands(businessId, q);
      if (!("error" in res)) setBrandResults(res.brands);
    });
  };

  const buildInput = () => {
    /*
     * Atributele se construiesc din TOT ce s-a selectat, nu doar din campurile
     * randate acum.
     *
     * Randarea depinde de nomenclatorul lui Trendyol, care poate lipsi: o
     * categorie care nu si-a incarcat atributele nu randa niciun camp, iar
     * salvarea trimitea o lista goala peste ce era salvat. Sursa e starea, care
     * porneste de la valorile deja salvate.
     */
    const idVarianter = new Set(varianterAttrs.map((g) => g.attribute.id));
    const listingAttributes = Object.entries(listingAttrSel)
      .filter(([id]) => !idVarianter.has(Number(id)))
      .map(([id, sel]) => toProductAttribute(Number(id), sel))
      .filter((x): x is TrendyolProductAttribute => x !== null);
    return {
      brand_id: brandId,
      brand_name: brandName || null,
      category_id: categoryId,
      attributes: listingAttributes,
      save_as_category_defaults: salveazaImplicite,
      dimensional_weight: dimWeight.trim() === "" ? null : Number(dimWeight),
      // Numar de AMBALAJE, deci intreg si cel putin unu. „1.5" (litri, nu
      // ambalaje) ar fi picat altfel abia la baza de date, cu un mesaj care nu
      // numeste campul, dupa ce omul completase tot formularul.
      sgr_units: sgrUnits.trim() === "" ? null : Math.max(1, Math.floor(Number(sgrUnits)) || 1),
      // ⚠ Tara de FABRICATIE a acestui produs. Goala, se foloseste cea din setarile
      // magazinului — si de-aia campul are voie sa ramana gol.
      country_of_origin: taraOrigine.trim() === "" ? null : taraOrigine.trim().toUpperCase(),
      // Curierul nu face parte din produs pe marketplace-ul international; se
      // declara la expediere, o data cu AWB-ul.
      cargo_company_id: null,
      variants: variants.map((v) => {
        const sel = variantAttrSel[v.key] ?? {};
        // Ca mai sus: din stare, nu din campurile randate.
        const variantAttributes = Object.entries(sel)
          .map(([id, s]) => toProductAttribute(Number(id), s))
          .filter((x): x is TrendyolProductAttribute => x !== null);
        return {
          barcode: v.barcode, stock_code: v.stock_code, attributes: variantAttributes,
          variant_title: v.variant_title,
          quantity: v.quantity, list_price: v.list_price, sale_price: v.sale_price, vat_rate: v.vat_rate, enabled: v.enabled,
        };
      }),
    };
  };

  /** Atributele obligatorii ramase necompletate, ca sa nu afle comerciantul de la Trendyol, ore mai tarziu. */
  const obligatoriiLipsa = useMemo(() => {
    if (!atributeIncarcate) return [];
    const lipsaProdus = productAttrs.filter((g) => {
      if (!g.required) return false;
      const sel = listingAttrSel[g.attribute.id];
      return !sel || (!sel.valueId && !sel.custom?.trim());
    }).map((g) => g.attribute.name);
    const lipsaVarianta = varianterAttrs.filter((g) => {
      if (!g.required) return false;
      return variants.some((v) => {
        if (!v.enabled) return false;
        const sel = variantAttrSel[v.key]?.[g.attribute.id];
        return !sel || (!sel.valueId && !sel.custom?.trim());
      });
    }).map((g) => g.attribute.name);
    return [...new Set([...lipsaProdus, ...lipsaVarianta])];
  }, [atributeIncarcate, productAttrs, varianterAttrs, listingAttrSel, variantAttrSel, variants]);

  const save = (then?: "sync") => {
    if (!categoryId) { toast.error("Mapează categoria produsului mai întâi."); return; }
    if (!brandId) { toast.error("Alege brandul."); return; }
    /*
     * Salvarea sterge si rescrie randurile, deci nu are voie sa plece cu o lista
     * de atribute pe care n-a apucat s-o incarce: ar sterge exact ce e salvat.
     */
    if (!atributeIncarcate && eroareAtribute) {
      toast.error("Atributele categoriei nu s-au încărcat. Reîncarcă pagina — altfel salvarea ar șterge ce ai completat.");
      return;
    }
    /*
     * Garantia SGR e obligatorie prin lege, dar nu e un atribut de categorie —
     * deci `obligatoriiLipsa` n-o vede. Lasat gol, campul trimitea 0,50 lei
     * pentru orice bax, fara nicio avertizare.
     */
    if (then === "sync" && necesitaSgr(categoryId, storefront) && sgrUnits.trim() === "") {
      toast.error("Completează numărul de ambalaje pentru garanția SGR. Categoria o cere prin lege.");
      return;
    }
    if (then === "sync" && obligatoriiLipsa.length > 0) {
      toast.error(`Completează întâi: ${obligatoriiLipsa.slice(0, 4).join(", ")}${obligatoriiLipsa.length > 4 ? ` și încă ${obligatoriiLipsa.length - 4}` : ""}.`);
      return;
    }
    startTransition(async () => {
      const res = await saveTrendyolListing(businessId, productId, buildInput());
      if ("error" in res) { toast.error(res.error); return; }
      if (then === "sync") {
        const s = await syncTrendyolProduct(businessId, productId);
        if ("error" in s) { toast.error(s.error); return; }
        toast.success("Trimis pe Trendyol.");
        await onSaved?.();
        router.refresh(); onClose(); return;
      }
      toast.success("Listare salvată.");
      await onSaved?.();
      router.refresh();
    });
  };

  if (loading) {
    return <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Se încarcă...</div>;
  }
  if (!data) return null;

  const renderAttrSelect = (g: TrendyolCategoryAttribute, sel: AttrSel | undefined, onChange: (s: AttrSel) => void) => {
    const values = attrValues[g.attribute.id] ?? [];
    if (values.length === 0 && g.allowCustom) {
      return <input value={sel?.custom ?? ""} onChange={(e) => onChange({ custom: e.target.value })}
        placeholder="valoare" className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />;
    }
    /*
     * Selector cu cautare, nu `<select>`.
     *
     * Un atribut de categorie Trendyol vine cu pana la 1000 de valori: „Culoare"
     * sau „Model" nu se parcurg deruland. Acelasi component ca la About You,
     * care filtreaza fara diacritice si fara sensibilitate la registru.
     */
    /*
     * ═══ ATRIBUTELE CU MAI MULTE VALORI ═══
     *
     * `allowMultipleAttributeValues` vine din taxonomia LOR si spune ca atributul asta
     * primeste o lista. Cu un singur selector, o categorie care cere asa ceva nu putea fi
     * completata deloc — produsul pleca cu o valoare si ei il refuzau.
     *
     * ⚠ Lista se arata ca BIFE, nu ca un al doilea selector: omul trebuie sa vada deodata ce
     * a ales, iar valorile sunt putine la atributele multi-select (materiale, caracteristici).
     * Cand sunt multe, cautarea de deasupra le filtreaza.
     */
    if (g.allowMultipleAttributeValues) {
      const alese = new Set(sel?.valueIds ?? []);
      return (
        <div className="max-h-32 overflow-y-auto rounded border border-border bg-background p-1.5 space-y-1">
          {values.map((v) => (
            <label key={v.attributeValueId} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={alese.has(v.attributeValueId)}
                onChange={(e) => {
                  const next = new Set(alese);
                  if (e.target.checked) next.add(v.attributeValueId);
                  else next.delete(v.attributeValueId);
                  onChange({ valueIds: [...next] });
                }}
              />
              <span>{v.attributeValue}</span>
            </label>
          ))}
          {values.length === 0 && (
            <span className="text-[11px] text-muted-foreground">Fără valori de ales.</span>
          )}
        </div>
      );
    }

    return (
      <SelectCautare
        dimensiune="mic"
        optiuni={values.map((v) => ({ id: v.attributeValueId, frontend_name: v.attributeValue }))}
        valoare={sel?.valueId ?? null}
        onSchimba={(id) => onChange({ valueId: id ?? undefined })}
        placeholder={g.required ? "Alege" : "-"}
      />
    );
  };

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-4">
      {!categoryId && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Categoria acestui produs nu este mapată. Mapeaz-o în secțiunea de mapare categorii, apoi revino.
        </div>
      )}
      {eroareAtribute && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          Nu am putut încărca atributele categoriei: {eroareAtribute} Reîncarcă pagina înainte să salvezi — altfel
          salvarea ar șterge atributele deja completate.
        </div>
      )}
      {obligatoriiLipsa.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Trendyol cere aceste atribute, altfel respinge produsul: <strong>{obligatoriiLipsa.join(", ")}</strong>.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Brand</label>
          <input value={brandId ? (brandName || `#${brandId}`) : brandQuery}
            onChange={(e) => { setBrandId(null); setBrandName(""); searchBrand(e.target.value); }}
            placeholder="caută brandul sau scrie ID-ul lui" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          {!brandId && brandResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border shadow">
              {brandResults.map((b) => (
                <button key={b.id} onClick={() => { setBrandId(b.id); setBrandName(b.name); setBrandResults([]); setBrandQuery(""); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted">
                  {b.name} <span className="text-[10px] text-muted-foreground">#{b.id}</span>
                </button>
              ))}
            </div>
          )}
          {/* Brandul e singura conditie de listare care nu se poate ocoli: fara el,
              produsul nu pleaca. Merita spus unde se gaseste, nu lasat ca un camp
              gol care refuza sa se completeze. */}
          {!brandId && brandQuery.trim().length >= 2 && !pending && brandResults.length === 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Niciun brand cu numele ăsta. Dacă îl vezi în panoul Trendyol, scrie aici ID-ul lui numeric.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Greutate (desi/kg, opțional)</label>
          <input type="number" step="0.1" min="0" value={dimWeight} onChange={(e) => setDimWeight(e.target.value)}
            placeholder="auto din greutatea produsului" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        {/*
          ⚠ ȚARA DE FABRICAȚIE: conducta exista de-o săptămână, robinetul nu (26.08.2026).

          `country_of_origin` pe listare, `default_country_of_origin` în config și `origin` în
          payload erau toate scrise și legate — dar nicăieri în panou nu se putea completa
          vreuna, deci câmpul pleca gol la toată lumea.

          ⚠ Nu e obligatoriu: gol aici, se folosește cel din setările magazinului. Trendyol îl
          cere obligatoriu de la 23.10.2026, iar până atunci lipsa lui nu strică nimic.
        */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Țara de fabricație (opțional)
          </label>
          <input
            value={taraOrigine}
            onChange={(e) => setTaraOrigine(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="ex. DE" maxLength={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono uppercase"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Unde se fabrică produsul, nu unde ești tu. Lăsat gol, se folosește țara implicită
            din setările Trendyol.
          </p>
        </div>
        {/*
          Garanția SGR: obligatorie prin lege în România, dar DOAR pe băuturi și
          uleiuri. Câmpul apare numai când categoria chiar o cere — altfel ar fi
          o întrebare fără sens la fiecare produs.
        */}
        {necesitaSgr(categoryId, storefront) && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Ambalaje pentru garanția SGR *
            </label>
            <input type="number" step="1" min="1" value={sgrUnits} onChange={(e) => setSgrUnits(e.target.value)}
              placeholder="1" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Categoria intră sub Sistemul Garanție-Returnare. Se trimit{" "}
              <strong>{pretSgr(sgrUnits.trim() === "" ? 1 : Number(sgrUnits)).toFixed(2)} lei</strong>{" "}
              garanție. Un bax de 6 doze înseamnă 6 ambalaje, nu unul.
            </p>
          </div>
        )}
      </div>

      {productAttrs.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <p className="text-xs font-semibold text-foreground">Atribute produs</p>
            <button type="button" onClick={() => completeazaAutomat(false)} disabled={completeaza}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-60">
              {completeaza ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-primary" />}
              Completează automat
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">
            Datele de conformitate (producător, importatori) se iau din datele firmei tale, din Setări. Restul se
            deduc din produs, doar când sunt fără dubiu — verifică-le înainte de trimitere.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {productAttrs.map((g) => {
              const sursa = completate[g.attribute.id];
              const sel = listingAttrSel[g.attribute.id];
              const areValoare = !!sel && (!!sel.valueId || (sel.valueIds?.length ?? 0) > 0 || !!sel.custom?.trim());
              return (
                <div key={g.attribute.id}>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">
                    <span>{eticheta(g)}{g.required ? " *" : ""}</span>
                    {sursa && areValoare && (
                      <span className="text-[9px] font-bold uppercase tracking-wide bg-primary/10 text-primary px-1 py-px rounded">
                        {sursa === "firma" ? "din datele firmei" : "din produs"}
                      </span>
                    )}
                  </label>
                  {renderAttrSelect(g, sel, (s) => {
                    setListingAttrSel((p) => ({ ...p, [g.attribute.id]: s }));
                    // Odata schimbat de om, nu mai e „completat automat".
                    setCompletate((p) => { const n = { ...p }; delete n[g.attribute.id]; return n; });
                  })}
                </div>
              );
            })}
          </div>
          {data?.category && (
            <label className="mt-3 flex items-start gap-2 text-xs text-foreground cursor-pointer">
              <input type="checkbox" checked={salveazaImplicite} onChange={(e) => setSalveazaImplicite(e.target.checked)}
                className="mt-0.5 rounded" />
              <span>
                Salvează brandul și aceste atribute ca implicite pentru categoria „{data.category}”
                <span className="block text-[11px] text-muted-foreground">
                  Următoarele produse din aceeași categorie vor porni completate.
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      {/* Variants */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-2">Variante ({variants.length})</p>
        <div className="space-y-2">
          {variants.map((v) => (
            <div key={v.key} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{v.label}</span>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={v.enabled} onChange={(e) => setVariant(v.key, { enabled: e.target.checked })} /> Activă
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Barcode</label>
                  <input value={v.barcode} onChange={(e) => setVariant(v.key, { barcode: e.target.value })}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Stoc</label>
                  {/*
                    Cand varianta are stoc propriu in Edinio, campul nu se mai
                    editeaza aici: numarul scris o data ramane inghetat pentru
                    totdeauna, in timp ce stocul real se misca la fiecare vanzare.
                    Se arata cifra care chiar pleaca la Trendyol.
                  */}
                  {v.stoc_viu != null ? (
                    <div className="w-full rounded border border-border bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground"
                      title="Se ia automat din stocul variantei din Edinio.">
                      {v.stoc_viu} <span className="text-[10px]">(din Edinio)</span>
                    </div>
                  ) : (
                    <input type="number" min="0" value={v.quantity ?? ""} onChange={(e) => setVariant(v.key, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                  )}
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Preț vânzare ({moneda})</label>
                  <input type="number" step="0.01" min="0" value={v.sale_price ?? ""} onChange={(e) => setVariant(v.key, { sale_price: e.target.value === "" ? null : Number(e.target.value) })}
                    placeholder={String(v.ron_price)} className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Preț listă ({moneda})</label>
                  <input type="number" step="0.01" min="0" value={v.list_price ?? ""} onChange={(e) => setVariant(v.key, { list_price: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">TVA</label>
                  <select value={v.vat_rate ?? tvaImplicitVitrina(storefront)}
                    onChange={(e) => setVariant(v.key, { vat_rate: Number(e.target.value) })}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs">
                    {coteTva.map((c) => <option key={c} value={c}>{c}%</option>)}
                  </select>
                </div>
                {varianterAttrs.map((g) => (
                  <div key={g.attribute.id}>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">{eticheta(g)}{g.required ? " *" : ""}</label>
                    {renderAttrSelect(g, variantAttrSel[v.key]?.[g.attribute.id], (s) =>
                      setVariantAttrSel((p) => ({ ...p, [v.key]: { ...(p[v.key] ?? {}), [g.attribute.id]: s } })))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={() => save()} disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60">Salvează</button>
        <button onClick={() => save("sync")} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
          <Send className="h-3.5 w-3.5" /> Salvează și trimite
        </button>
        <button onClick={onClose} disabled={pending}
          className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60">Închide</button>
      </div>
    </div>
  );
}
