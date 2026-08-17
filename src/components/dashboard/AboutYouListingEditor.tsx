"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import {
  getAboutYouAttributeGroups, getAboutYouBrands, getAboutYouListingEditor,
  saveAboutYouListing, syncAboutYouProduct, validateAboutYouListing,
  type AboutYouEditorData, type AboutYouEditorVariant, type AboutYouListingInput,
} from "@/lib/actions/aboutyou.actions";
import { MAX_CLUSTERE_MATERIAL, regulaClustere } from "@/lib/aboutyou/mapping";
import { AboutYouSelectCautare } from "@/components/dashboard/AboutYouSelectCautare";
import type { AboutYouAttributeGroup, AboutYouBrand, AboutYouMaterialCluster } from "@/lib/aboutyou/types";

export interface AboutYouPricing { mode: "fx_from_ron" | "manual_eur"; rate?: number; marginPct?: number }

/*
 * Grupurile de atribute se recunosc dupa CHEIA lor, nu dupa eticheta.
 *
 * Raspunsul real da fiecarui grup un `name` masina („color", „size", „brand",
 * „material") si un `frontend_name` de afisat („Colour of details", „Size").
 * Codul cauta inainte un subsir in ambele, cu `find` — deci lua PRIMUL grup care
 * se potrivea si il pierdea pe al doilea. Categoria „Handbag" are doua grupuri de
 * material („material_style" si „material"), amandoua cu eticheta „Material":
 * al doilea disparea din formular, iar comerciantul nu avea de unde sti ca lipseste.
 *
 * Mai grav: grupul „brand" trecea de filtru si ajungea in `attributes`, alaturi de
 * campul `brand` de nivel superior. About You interzice explicit dublarea unui
 * camp de nivel superior printr-un atribut.
 */
const CHEIE_CULOARE = "color";
const CHEIE_MARIME = "size";
/*
 * A doua dimensiune de marime: lungimea cracului la pantaloni, cupa la sutiene.
 *
 * Cheia era rezervata, dar nu se calcula niciun grup si nu se randa niciun
 * control, deci `second_size_id` era imposibil de completat din interfata:
 * circula in cerc de la editor la baza si inapoi, iar campul din payload era cod
 * mort. Documentatia o cere pe TOATE variantele daca produsul are dimensiunea a
 * doua, iar „wrong sizes" e motiv de respingere — deci sutienele si pantalonii cu
 * lungime de crac erau respinsi sistematic, fara ce sa repare comerciantul.
 * Numele exact al grupului nu e documentat, deci le incercam pe cele plauzibile.
 */
// CONFIRMAT pe API-ul real (sandbox, 17.08): grupul se numeste exact `second_size`
// si apare pe categoriile care chiar au a doua dimensiune — sutiene, blugi,
// pantaloni — si lipseste pe genti. `bra_cup` exista, dar e alt atribut, obisnuit.
const CHEI_MARIME_2 = ["second_size"];
const CHEIE_BRAND = "brand";
// Compozitia materialului are ecran propriu (procente, clustere), nu se alege
// dintr-un simplu selector.
// DOAR cheile consumate de ecranul de compozitie. `material_style` si
// `shoe_material_style` sunt grupuri obisnuite (stil de material, „piele"/„textil")
// si trebuie sa ramana selectabile: rezervate, dispareau din formular si se
// pierdeau tacut la fiecare re-salvare.
//
/*
 * CONFIRMAT pe API-ul real: grupul de clustere se numeste `material_group_name`
 * („Material group", 215 valori, singurul cu `is_default`). `material_group`, pe
 * care il pomeneste ghidul narativ, NU EXISTA — il tineam in lista ca sa acoperim
 * ambele forme, dar rezervat degeaba ar fi putut ascunde un atribut obisnuit cu
 * acel nume, daca l-ar adauga vreodata.
 */
const CHEI_CLUSTER = ["material_group_name"];
const CHEI_MATERIAL = new Set(["material", ...CHEI_CLUSTER]);
const CHEI_REZERVATE = new Set([CHEIE_CULOARE, CHEIE_MARIME, CHEIE_BRAND, ...CHEI_MARIME_2, ...CHEI_MATERIAL]);

const grup = (grupuri: AboutYouAttributeGroup[], cheie: string) => grupuri.find((g) => g.name === cheie);
const primulGrup = (grupuri: AboutYouAttributeGroup[], chei: string[]) => {
  for (const cheie of chei) {
    const g = grup(grupuri, cheie);
    if (g) return g;
  }
  return undefined;
};

function eurPreview(ron: number, pricing: AboutYouPricing): string {
  if (pricing.mode === "manual_eur" || !pricing.rate || pricing.rate <= 0) return "-";
  const eur = (ron / pricing.rate) * (1 + Math.max(0, pricing.marginPct ?? 0) / 100);
  return `${(Math.round(eur * 100) / 100).toFixed(2)} EUR`;
}

/*
 * Fiecare rand isi poarta propria identitate.
 *
 * Cheia lui React era derivata din VALOAREA pe care randul o editeaza
 * (`${material_id}-${index}`), deci fiecare alegere de material schimba cheia,
 * randul se remonta si pierdea focusul — se simte imediat la navigarea cu
 * tastatura. Un contor simplu e de ajuns: identitatile trebuie doar sa fie
 * stabile cat trece randul prin editor.
 */
let contorRand = 0;
const idRand = () => `r${++contorRand}`;

interface ComponentaMaterial { id: string; material_id: number; fraction: number }
/**
 * O grupa de material = o PARTE a produsului (exterior, căptușeală, talpă), cu
 * materialele ei. Editorul tinea o singura grupa, iar About You cere doua la
 * gentile captusite si trei la incaltaminte — deci gentile nu se puteau lista
 * corect deloc. La incarcare se citea tot doar prima grupa, asa ca o compozitie
 * completa pusa din alta parte se reducea la una singura la prima salvare.
 */
interface ClusterMaterial { id: string; cluster_id: number | null; components: ComponentaMaterial[] }

export function AboutYouListingEditor({
  businessId, productId, pricing, onClose,
}: {
  businessId: string; productId: string; pricing: AboutYouPricing; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AboutYouEditorData | null>(null);
  const [brands, setBrands] = useState<AboutYouBrand[]>([]);
  const [groups, setGroups] = useState<AboutYouAttributeGroup[]>([]);
  const [eroareGrupuri, setEroareGrupuri] = useState<string | null>(null);
  const [reincarcaGrupuri, setReincarcaGrupuri] = useState(0);
  const [issues, setIssues] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [brandId, setBrandId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [colorId, setColorId] = useState<number | null>(null);
  const [attrSel, setAttrSel] = useState<Record<number, number[]>>({});
  const [clustere, setClustere] = useState<ClusterMaterial[]>([]);
  const [hsCode, setHsCode] = useState("");
  const [countryOfOrigin, setCountryOfOrigin] = useState("RO");
  const [variants, setVariants] = useState<AboutYouEditorVariant[]>([]);

  /*
   * `onClose` vine ca sageata inline din parinte, deci are alta identitate la
   * fiecare randare a lui. Pusa in dependentele efectului de incarcare, orice
   * re-randare a paginii (un `router.refresh()`, o navigare) reincarca datele si
   * ARUNCA tot ce a completat comerciantul si n-a salvat inca. Tinut intr-un ref,
   * efectul nu-l mai vede ca schimbare.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [ed, br] = await Promise.all([
        getAboutYouListingEditor(businessId, productId),
        getAboutYouBrands(businessId),
      ]);
      if (!alive) return;
      if ("error" in ed) { toast.error(ed.error); onCloseRef.current(); return; }
      setData(ed);
      // Brandul din setari se ARATA, nu doar se aplica pe tacute. Fara asta,
      // selectorul ramanea gol pentru un produs care oricum ar fi plecat cu
      // brandul global — deci comerciantul nu vedea ce brand se trimite.
      setBrandId(ed.listing?.brand_id ?? ed.defaultBrandId ?? null);
      setCategoryId(ed.listing?.category_id ?? ed.mappedCategoryId ?? null);
      setColorId(ed.listing?.color_id ?? null);
      setHsCode(ed.listing?.hs_code ?? "");
      setCountryOfOrigin(ed.listing?.country_of_origin ?? "RO");
      setVariants(ed.variants);
      const m = ed.listing?.material ?? null;
      if (m && m.clusters?.length) {
        setClustere(m.clusters.map((cl) => ({
          id: idRand(),
          cluster_id: cl.cluster_id ?? null,
          components: (cl.components ?? []).map((c) => ({
            id: idRand(), material_id: c.material_id, fraction: c.fraction ?? 0,
          })),
        })));
      }
      if (!("error" in br)) setBrands(br.brands);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [businessId, productId]);

  const atributeSalvate = data?.listing?.attributes;
  useEffect(() => {
    if (!categoryId) return;
    let alive = true;
    (async () => {
      const res = await getAboutYouAttributeGroups(businessId, categoryId);
      if (!alive) return;
      if ("error" in res) {
        // Inainte, eroarea era inghitita: ramanea un formular fara niciun camp,
        // pe care nimeni nu-l putea completa si nimeni nu stia de ce.
        setGroups([]);
        setEroareGrupuri(res.error);
        return;
      }
      setEroareGrupuri(null);
      setGroups(res.groups);
      const alese = new Set(atributeSalvate ?? []);
      if (alese.size > 0) {
        const sel: Record<number, number[]> = {};
        for (const g of res.groups) {
          if (CHEI_REZERVATE.has(g.name)) continue;
          const hits = g.attributes.filter((a) => alese.has(a.id)).map((a) => a.id);
          if (hits.length > 0) sel[g.id] = hits;
        }
        setAttrSel(sel);
      }
    })();
    return () => { alive = false; };
  }, [businessId, categoryId, atributeSalvate, reincarcaGrupuri]);

  const colorGroup = useMemo(() => grup(groups, CHEIE_CULOARE), [groups]);
  const sizeGroup = useMemo(() => grup(groups, CHEIE_MARIME), [groups]);
  const secondSizeGroup = useMemo(() => primulGrup(groups, CHEI_MARIME_2), [groups]);
  const materialGroup = useMemo(() => grup(groups, "material"), [groups]);
  const clusterGroup = useMemo(() => primulGrup(groups, CHEI_CLUSTER), [groups]);
  /*
   * Etichetele care se repeta se desipart.
   *
   * Pe categoria „Handbag", TREI grupuri se cheama toate „Material" in interfata:
   * `material` (consumat de ecranul de compozitie), `material_style` si
   * `shoe_material_style`. Raman doua in formular, cu acelasi text, si comerciantul
   * n-are cum sa stie care ce e. Cand doua grupuri impart eticheta, ii adaugam
   * numele tehnic — urat, dar mai putin rau decat doua campuri identice.
   */
  const otherGroups = useMemo(() => {
    const ramase = groups.filter((g) => !CHEI_REZERVATE.has(g.name));
    const deCateOri = new Map<string, number>();
    for (const g of ramase) deCateOri.set(g.frontend_name, (deCateOri.get(g.frontend_name) ?? 0) + 1);
    return ramase.map((g) => ({
      grup: g,
      eticheta: (deCateOri.get(g.frontend_name) ?? 0) > 1
        ? `${g.frontend_name} (${g.name.replace(/_/g, " ")})`
        : g.frontend_name,
    }));
  }, [groups]);

  const materialType = data?.materialType ?? null;
  // Cate grupe cere categoria — aceeasi regula pe care o aplica si validarea de
  // pe server, ca omul sa nu afle abia la trimitere.
  const regulaMaterial = useMemo(() => regulaClustere(data?.materialPath ?? null), [data?.materialPath]);
  const areMaiMulteCulori = variants.length > 1 && !!colorGroup;

  const setVariant = (key: string, patch: Partial<AboutYouEditorVariant>) =>
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  const buildInput = useCallback((): AboutYouListingInput => {
    /*
     * Grupele se trimit AȘA CUM SUNT, inclusiv cele incomplete.
     *
     * Erau filtrate aici, inainte de validare, si atunci o grupa completata pe
     * jumatate dispărea în tăcere: omul o vedea pe ecran, dar n-o primea nici
     * validarea, nici baza. Iar cele doua verificari scrise pentru ea („alege
     * grupa", „nu are niciun material") nu se puteau declansa NICIODATA.
     * `cluster_id: 0` e sentinela pe care `validateListing` o respinge explicit
     * (schema cere `minimum: 1`), si nimic invalid nu poate ajunge la About You:
     * `syncProductNow` valideaza inainte de a construi payload-ul.
     */
    /*
     * Tipul compozitiei: cand taxonomia n-a raspuns, il luam pe cel STOCAT.
     *
     * Altfel `materialType` era `null`, `material` devenea `null`, iar un simplu
     * „Salvează" stergea compozitia completata anterior — exact in momentul in
     * care sectiunea nici nu se afisa, deci fara ca omul sa vada ce pierde.
     */
    const tipMaterial = materialType ?? data?.listing?.material?.type ?? null;
    const clusters: AboutYouMaterialCluster[] = clustere.map((cl) => ({
      cluster_id: cl.cluster_id ?? 0,
      components: cl.components.map((m) => (tipMaterial === "textile"
        ? { material_id: m.material_id, fraction: m.fraction }
        : { material_id: m.material_id })),
    }));
    return {
      brand_id: brandId,
      category_id: categoryId,
      color_id: colorId,
      attributes: Object.values(attrSel).flat().filter((x): x is number => !!x),
      material: clusters.length > 0 && tipMaterial ? { type: tipMaterial, clusters } : null,
      country_of_origin: countryOfOrigin.trim().toUpperCase() || "RO",
      hs_code: hsCode.trim() || null,
      variants: variants.map((v) => ({
        sku: v.sku, ean: v.ean, size_id: v.size_id, second_size_id: v.second_size_id,
        color_id: v.color_id, quantity: v.quantity, retail_price_eur: v.retail_price_eur,
        sale_price_eur: v.sale_price_eur, enabled: v.enabled,
        // Titlul REAL al combinatiei merge in `aboutyou_variants.variant_title`:
        // fara el, o comanda About You nu scade stocul combinatiei, ci pe al
        // produsului. Eticheta afisata („Unic") NU e acelasi lucru.
        variant_title: v.variantTitle,
      })),
    };
  }, [brandId, categoryId, colorId, attrSel, clustere, materialType, data, countryOfOrigin, hsCode, variants]);

  const save = (then?: "sync" | "publish") => {
    void (async () => {
      setPending(true);
      try {
        const input = buildInput();
        // Verificarea completa se cere INAINTE de a trimite, ca omul sa vada tot
        // ce lipseste dintr-o data, nu cate o problema pe rand, peste minute.
        if (then) {
          const v = await validateAboutYouListing(businessId, productId, input);
          if ("error" in v) { toast.error(v.error); return; }
          // Avertismentele NU opresc trimiterea: sunt cerinte pe care
          // documentatia le conditioneaza (o geanta chiar poate fi necaptusita),
          // dar pentru care About You respinge tarziu si scump.
          setWarnings(v.warnings);
          if (v.issues.length > 0) {
            setIssues(v.issues);
            toast.error("Mai sunt lucruri de completat înainte de trimitere.");
            return;
          }
        } else {
          // Avertismentele si problemele de la o trimitere anterioara nu mai
          // descriu ce e pe ecran acum: o salvare simpla nu revalideaza nimic.
          setWarnings([]);
        }
        setIssues([]);

        const res = await saveAboutYouListing(businessId, productId, input);
        if ("error" in res) { toast.error(res.error); return; }
        if (then === "sync") {
          const s = await syncAboutYouProduct(businessId, productId);
          if ("error" in s) { toast.error(s.error); return; }
          // NU „Publicat": produsul pleaca acum, publicarea se inlantuie cand ei il
          // accepta, iar aprobarea lor vine dupa aceea si poate dura.
          toast.success("Trimis pe About You. Se publică singur imediat ce îl acceptă.");
        } else {
          toast.success("Listare salvată.");
        }
        router.refresh();
        if (then) onCloseRef.current();
      } finally {
        setPending(false);
      }
    })();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă...
      </div>
    );
  }
  if (!data) return null;

  const manual = pricing.mode === "manual_eur";

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-4">
      {!categoryId && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Categoria acestui produs nu este mapată. Mapeaz-o în secțiunea de mapare categorii, apoi revino.
        </div>
      )}

      {eroareGrupuri && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span className="flex-1">
            Nu am putut încărca atributele categoriei. {eroareGrupuri}
          </span>
          <button onClick={() => setReincarcaGrupuri((n) => n + 1)} className="font-semibold underline whitespace-nowrap">
            Reîncearcă
          </button>
        </div>
      )}

      {/* Taxonomia necitita nu inseamna „categoria nu cere material": fara ea nu
          stim ce cere About You, iar tacerea de dinainte lasa produsul sa plece gol. */}
      {data.taxonomyError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span className="flex-1">
            Nu am putut citi taxonomia About You, deci nu știm ce compoziție de material cere această
            categorie. Trimiterea rămâne blocată până se încarcă. {data.taxonomyError}
          </span>
        </div>
      )}

      {issues.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold mb-1">Înainte de trimitere:</p>
          <ul className="space-y-0.5">
            {issues.map((it) => <li key={it}>• {it}</li>)}
          </ul>
        </div>
      )}

      {/* Doar cand nu exista blocaje: altfel „Poți trimite așa" ar contrazice
          direct banda galbena si butonul care nu lasa trimiterea. */}
      {issues.length === 0 && warnings.length > 0 && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900">
          <p className="font-semibold mb-1">Poți trimite așa, dar About You ar putea respinge:</p>
          <ul className="space-y-0.5">
            {warnings.map((it) => <li key={it}>• {it}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Brand</label>
          <select
            value={brandId ?? ""} onChange={(e) => setBrandId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Alege brand</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {/* Brandul e per PRODUS la About You, nu per magazin. Cel din setări e
              doar valoarea implicită, iar comerciantul nu avea de unde ști asta. */}
          <p className="text-[11px] text-muted-foreground mt-1">
            {data.defaultBrandId != null && brandId === data.defaultBrandId
              ? `Implicit din setări${data.defaultBrandName ? ` (${data.defaultBrandName})` : ""}. Poți alege alt brand pentru acest produs.`
              : "Fiecare produs poate avea alt brand. Lista conține brandurile aprobate în contul tău About You."}
          </p>
        </div>
        {colorGroup && !areMaiMulteCulori && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Culoare</label>
            <AboutYouSelectCautare
              optiuni={colorGroup.attributes} valoare={colorId} onSchimba={setColorId}
              placeholder="Alege culoarea"
            />
          </div>
        )}
        {otherGroups.map(({ grup: g, eticheta }) => (
          <div key={g.id}>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {eticheta}{g.is_multiselect ? " (mai multe)" : ""}
            </label>
            <AboutYouSelectCautare
              optiuni={g.attributes}
              multiplu={g.is_multiselect}
              valori={attrSel[g.id] ?? []}
              onSchimbaMultiplu={(ids) => setAttrSel((prev) => ({ ...prev, [g.id]: ids }))}
              valoare={attrSel[g.id]?.[0] ?? null}
              onSchimba={(id) => setAttrSel((prev) => ({ ...prev, [g.id]: id == null ? [] : [id] }))}
              placeholder="-"
            />
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Cod HS (opțional)</label>
          <input value={hsCode} onChange={(e) => setHsCode(e.target.value)} maxLength={20}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Țară de origine</label>
          <input value={countryOfOrigin} onChange={(e) => setCountryOfOrigin(e.target.value)} maxLength={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase" />
        </div>
      </div>

      {/* Compozitia materialului: obligatorie pe aproape toate categoriile.
          O „grupă" e o PARTE a produsului (exterior, căptușeală, talpă) — About
          You cere doua la gentile captusite si trei la incaltaminte, iar
          editorul stia sa emita una singura. */}
      {materialType && materialGroup && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs font-semibold text-foreground mb-1">
            Compoziția materialului {materialType === "textile" ? "(textil, cu procente)" : "(non-textil)"}
          </p>
          <p className="text-[11px] text-muted-foreground mb-2">
            {regulaMaterial.minim > 1
              ? regulaMaterial.mesaj
              : "About You o cere pentru această categorie."}
            {materialType === "textile" ? " Procentele fiecărei grupe trebuie să însumeze 100%." : ""}
          </p>

          <div className="space-y-2">
            {clustere.map((cl, ci) => {
              const total = cl.components.reduce((s, m) => s + m.fraction, 0);
              return (
                <div key={cl.id} className="rounded border border-border/70 bg-muted/30 p-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    {clusterGroup ? (
                      <div className="flex-1">
                        <AboutYouSelectCautare
                          optiuni={clusterGroup.attributes} dimensiune="mic"
                          valoare={cl.cluster_id}
                          onSchimba={(id) => setClustere((prev) => prev.map((x, j) =>
                            j === ci ? { ...x, cluster_id: id } : x))}
                          placeholder="Alege partea produsului"
                        />
                      </div>
                    ) : (
                      <span className="flex-1 text-[11px] text-amber-700">
                        Lista grupelor de material nu a venit de la About You pentru această categorie.
                      </span>
                    )}
                    <button
                      onClick={() => setClustere((prev) => prev.filter((_, j) => j !== ci))}
                      className="text-xs text-muted-foreground hover:text-red-600 whitespace-nowrap"
                    >
                      Scoate grupa
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {cl.components.map((m, i) => (
                      <div key={m.id} className="flex items-center gap-2">
                        <div className="flex-1">
                          <AboutYouSelectCautare
                            optiuni={materialGroup.attributes} dimensiune="mic"
                            valoare={m.material_id || null}
                            onSchimba={(id) => setClustere((prev) => prev.map((x, j) => j !== ci ? x : {
                              ...x,
                              components: x.components.map((y, k) =>
                                k === i ? { ...y, material_id: id ?? 0 } : y),
                            }))}
                            placeholder="Alege materialul"
                          />
                        </div>
                        {materialType === "textile" && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min="0" max="100" value={m.fraction}
                              onChange={(e) => setClustere((prev) => prev.map((x, j) => j !== ci ? x : {
                                ...x,
                                components: x.components.map((y, k) =>
                                  k === i ? { ...y, fraction: Number(e.target.value) } : y),
                              }))}
                              className="w-16 rounded border border-border bg-background px-2 py-1.5 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        )}
                        <button
                          onClick={() => setClustere((prev) => prev.map((x, j) => j !== ci ? x : {
                            ...x, components: x.components.filter((_, k) => k !== i),
                          }))}
                          className="text-xs text-muted-foreground hover:text-red-600"
                        >
                          Scoate
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-1.5">
                    <button
                      onClick={() => setClustere((prev) => prev.map((x, j) => j !== ci ? x : {
                        ...x,
                        components: [
                          ...x.components,
                          { id: idRand(), material_id: materialGroup.attributes[0]?.id ?? 0, fraction: x.components.length === 0 ? 100 : 0 },
                        ],
                      }))}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      + Adaugă material
                    </button>
                    {materialType === "textile" && cl.components.length > 0 && (
                      <span className={`text-[11px] font-medium ${total === 100 ? "text-green-700" : "text-amber-700"}`}>
                        Total: {total}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-2">
            <button
              onClick={() => setClustere((prev) => [...prev, { id: idRand(), cluster_id: null, components: [] }])}
              disabled={clustere.length >= MAX_CLUSTERE_MATERIAL}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
            >
              + Adaugă grupă de material
            </button>
            <span className="text-[11px] text-muted-foreground">
              {clustere.length} din maximum {MAX_CLUSTERE_MATERIAL}
              {regulaMaterial.minim > 1
                ? `, ${regulaMaterial.blocheaza ? "obligatoriu" : "recomandat"} cel puțin ${regulaMaterial.minim}`
                : ""}
            </span>
          </div>
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
                  <input type="checkbox" checked={v.enabled} onChange={(e) => setVariant(v.key, { enabled: e.target.checked })} />
                  Activă
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[10px] text-muted-foreground mb-0.5">EAN</label>
                  <input value={v.ean ?? ""} onChange={(e) => setVariant(v.key, { ean: e.target.value || null })}
                    placeholder="cod EAN-13" inputMode="numeric" maxLength={13}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                </div>
                {/* Fiecare varianta isi are culoarea ei cand produsul are mai multe:
                    inainte, toate plecau cu culoarea de pe listare si About You le
                    vedea ca duplicate ale aceleiasi variante. */}
                {areMaiMulteCulori && colorGroup && (
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Culoare</label>
                    <AboutYouSelectCautare
                      optiuni={colorGroup.attributes} dimensiune="mic"
                      valoare={v.color_id} onSchimba={(id) => setVariant(v.key, { color_id: id })}
                      placeholder="-"
                    />
                  </div>
                )}
                {sizeGroup && (
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">{sizeGroup.frontend_name}</label>
                    {/* 696 de valori pe categoria „Handbag". Fara cautare, „One
                        Size" se gaseste prin derulare, la fiecare varianta. */}
                    <AboutYouSelectCautare
                      optiuni={sizeGroup.attributes} dimensiune="mic"
                      valoare={v.size_id} onSchimba={(id) => setVariant(v.key, { size_id: id })}
                      placeholder="-"
                    />
                  </div>
                )}
                {/* A doua dimensiune: se cere pe TOATE variantele sau pe niciuna. */}
                {secondSizeGroup && (
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">{secondSizeGroup.frontend_name}</label>
                    <AboutYouSelectCautare
                      optiuni={secondSizeGroup.attributes} dimensiune="mic"
                      valoare={v.second_size_id} onSchimba={(id) => setVariant(v.key, { second_size_id: id })}
                      placeholder="-"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Stoc</label>
                  <input type="number" min="0" value={v.quantity ?? ""} onChange={(e) => setVariant(v.key, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                </div>
                {manual ? (
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Preț EUR</label>
                    <input type="number" step="0.01" min="0" value={v.retail_price_eur ?? ""}
                      onChange={(e) => setVariant(v.key, { retail_price_eur: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Preț (auto)</label>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">{eurPreview(v.ron_price, pricing)}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={() => save()} disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60">
          Salvează
        </button>
        {/* UN SINGUR BUTON pentru o singura intentie.
            Erau doua, „Salvează și trimite" si „Publică", fiindca API-ul lor are
            doi pasi. Dar pasii sunt asincroni, iar al doilea apasat prea devreme
            raspunde „Product master not found" — i se cerea omului sa nimereasca
            un moment pe care nu-l vede. Acum publicarea se inlantuie singura, cand
            lotul e acceptat. */}
        <button onClick={() => save("sync")} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
          <Send className="h-3.5 w-3.5" /> Trimite pe About You
        </button>
        <button onClick={onClose} disabled={pending}
          className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60">
          Închide
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Produsul pleacă spre About You, iar publicarea se face singură imediat ce ei îl acceptă. Apoi intră în
        aprobarea lor, care poate dura. Starea o vezi în listă.
      </p>
    </div>
  );
}
