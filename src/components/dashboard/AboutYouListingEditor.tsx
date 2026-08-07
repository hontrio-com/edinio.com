"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Send, Upload } from "lucide-react";
import {
  getAboutYouAttributeGroups, getAboutYouBrands, getAboutYouListingEditor,
  publishAboutYouProduct, saveAboutYouListing, syncAboutYouProduct, validateAboutYouListing,
  type AboutYouEditorData, type AboutYouEditorVariant, type AboutYouListingInput,
} from "@/lib/actions/aboutyou.actions";
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
const CHEIE_MARIME_2 = "second_size";
const CHEIE_BRAND = "brand";
// Compozitia materialului are ecran propriu (procente, clustere), nu se alege
// dintr-un simplu selector.
// DOAR cele doua chei consumate de ecranul de compozitie. `material_style` si
// `shoe_material_style` sunt grupuri obisnuite (stil de material, „piele"/„textil")
// si trebuie sa ramana selectabile: rezervate, dispareau din formular si se
// pierdeau tacut la fiecare re-salvare.
const CHEI_MATERIAL = new Set(["material", "material_group_name"]);
const CHEI_REZERVATE = new Set([CHEIE_CULOARE, CHEIE_MARIME, CHEIE_MARIME_2, CHEIE_BRAND, ...CHEI_MATERIAL]);

const grup = (grupuri: AboutYouAttributeGroup[], cheie: string) => grupuri.find((g) => g.name === cheie);

function eurPreview(ron: number, pricing: AboutYouPricing): string {
  if (pricing.mode === "manual_eur" || !pricing.rate || pricing.rate <= 0) return "-";
  const eur = (ron / pricing.rate) * (1 + Math.max(0, pricing.marginPct ?? 0) / 100);
  return `${(Math.round(eur * 100) / 100).toFixed(2)} EUR`;
}

interface ComponentaMaterial { material_id: number; fraction: number }

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

  const [brandId, setBrandId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [colorId, setColorId] = useState<number | null>(null);
  const [attrSel, setAttrSel] = useState<Record<number, number[]>>({});
  const [materiale, setMateriale] = useState<ComponentaMaterial[]>([]);
  const [clusterId, setClusterId] = useState<number | null>(null);
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
      setBrandId(ed.listing?.brand_id ?? null);
      setCategoryId(ed.listing?.category_id ?? ed.mappedCategoryId ?? null);
      setColorId(ed.listing?.color_id ?? null);
      setHsCode(ed.listing?.hs_code ?? "");
      setCountryOfOrigin(ed.listing?.country_of_origin ?? "RO");
      setVariants(ed.variants);
      const m = ed.listing?.material ?? null;
      if (m && m.clusters?.length) {
        setClusterId(m.clusters[0].cluster_id ?? null);
        setMateriale(m.clusters[0].components.map((c) => ({ material_id: c.material_id, fraction: c.fraction ?? 0 })));
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
  const materialGroup = useMemo(() => grup(groups, "material"), [groups]);
  const clusterGroup = useMemo(() => grup(groups, "material_group_name"), [groups]);
  const otherGroups = useMemo(() => groups.filter((g) => !CHEI_REZERVATE.has(g.name)), [groups]);

  const materialType = data?.materialType ?? null;
  const areMaiMulteCulori = variants.length > 1 && !!colorGroup;

  const setVariant = (key: string, patch: Partial<AboutYouEditorVariant>) =>
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  const buildInput = useCallback((): AboutYouListingInput => {
    // `cluster_id` are `minimum: 1` in schema: trimis 0, respinge toata cererea.
    // Fara grupa aleasa nu construim deloc compozitia — `validateListing` cere
    // atunci explicit alegerea grupei.
    const clusters: AboutYouMaterialCluster[] = materiale.length > 0 && clusterId
      ? [{
        cluster_id: clusterId,
        components: materiale.map((m) => (materialType === "textile"
          ? { material_id: m.material_id, fraction: m.fraction }
          : { material_id: m.material_id })),
      }]
      : [];
    return {
      brand_id: brandId,
      category_id: categoryId,
      color_id: colorId,
      attributes: Object.values(attrSel).flat().filter((x): x is number => !!x),
      material: clusters.length > 0 && materialType ? { type: materialType, clusters } : null,
      country_of_origin: countryOfOrigin.trim().toUpperCase() || "RO",
      hs_code: hsCode.trim() || null,
      variants: variants.map((v) => ({
        sku: v.sku, ean: v.ean, size_id: v.size_id, second_size_id: v.second_size_id,
        color_id: v.color_id, quantity: v.quantity, retail_price_eur: v.retail_price_eur,
        sale_price_eur: v.sale_price_eur, enabled: v.enabled,
      })),
    };
  }, [brandId, categoryId, colorId, attrSel, materiale, clusterId, materialType, countryOfOrigin, hsCode, variants]);

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
          if (v.issues.length > 0) {
            setIssues(v.issues);
            toast.error("Mai sunt lucruri de completat înainte de trimitere.");
            return;
          }
        }
        setIssues([]);

        const res = await saveAboutYouListing(businessId, productId, input);
        if ("error" in res) { toast.error(res.error); return; }
        if (then === "sync") {
          const s = await syncAboutYouProduct(businessId, productId);
          if ("error" in s) { toast.error(s.error); return; }
          toast.success("Trimis pe About You.");
        } else if (then === "publish") {
          const p = await publishAboutYouProduct(businessId, productId);
          if ("error" in p) { toast.error(p.error); return; }
          toast.success("Publicat pe About You.");
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

      {issues.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold mb-1">Înainte de trimitere:</p>
          <ul className="space-y-0.5">
            {issues.map((it) => <li key={it}>• {it}</li>)}
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
        </div>
        {colorGroup && !areMaiMulteCulori && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Culoare</label>
            <select
              value={colorId ?? ""} onChange={(e) => setColorId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Alege culoarea</option>
              {colorGroup.attributes.map((a) => <option key={a.id} value={a.id}>{a.frontend_name}</option>)}
            </select>
          </div>
        )}
        {otherGroups.map((g) => (
          <div key={g.id}>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {g.frontend_name}{g.is_multiselect ? " (mai multe)" : ""}
            </label>
            <select
              multiple={g.is_multiselect}
              value={g.is_multiselect
                ? (attrSel[g.id] ?? []).map(String)
                : String(attrSel[g.id]?.[0] ?? "")}
              onChange={(e) => {
                const alese = g.is_multiselect
                  ? Array.from(e.target.selectedOptions).map((o) => Number(o.value)).filter(Boolean)
                  : (e.target.value ? [Number(e.target.value)] : []);
                setAttrSel((prev) => ({ ...prev, [g.id]: alese }));
              }}
              className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm ${g.is_multiselect ? "h-24" : ""}`}
            >
              {!g.is_multiselect && <option value="">-</option>}
              {g.attributes.map((a) => <option key={a.id} value={a.id}>{a.frontend_name}</option>)}
            </select>
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

      {/* Compozitia materialului: obligatorie pe aproape toate categoriile */}
      {materialType && materialGroup && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs font-semibold text-foreground mb-1">
            Compoziția materialului {materialType === "textile" ? "(textil, cu procente)" : "(non-textil)"}
          </p>
          <p className="text-[11px] text-muted-foreground mb-2">
            About You o cere pentru această categorie. {materialType === "textile" ? "Procentele trebuie să însumeze 100%." : ""}
          </p>

          {clusterGroup && (
            <div className="mb-2">
              <label className="block text-[10px] text-muted-foreground mb-0.5">Grupa de material</label>
              <select
                value={clusterId ?? ""} onChange={(e) => setClusterId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
              >
                <option value="">Alege grupa</option>
                {clusterGroup.attributes.map((a) => <option key={a.id} value={a.id}>{a.frontend_name}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            {materiale.map((m, i) => (
              <div key={`${m.material_id}-${i}`} className="flex items-center gap-2">
                <select
                  value={m.material_id}
                  onChange={(e) => setMateriale((prev) => prev.map((x, j) =>
                    j === i ? { ...x, material_id: Number(e.target.value) } : x))}
                  className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs"
                >
                  {materialGroup.attributes.map((a) => <option key={a.id} value={a.id}>{a.frontend_name}</option>)}
                </select>
                {materialType === "textile" && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="0" max="100" value={m.fraction}
                      onChange={(e) => setMateriale((prev) => prev.map((x, j) =>
                        j === i ? { ...x, fraction: Number(e.target.value) } : x))}
                      className="w-16 rounded border border-border bg-background px-2 py-1.5 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                )}
                <button
                  onClick={() => setMateriale((prev) => prev.filter((_, j) => j !== i))}
                  className="text-xs text-muted-foreground hover:text-red-600"
                >
                  Scoate
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-2">
            <button
              onClick={() => setMateriale((prev) => [
                ...prev,
                { material_id: materialGroup.attributes[0]?.id ?? 0, fraction: prev.length === 0 ? 100 : 0 },
              ])}
              className="text-xs font-medium text-primary hover:underline"
            >
              + Adaugă material
            </button>
            {materialType === "textile" && materiale.length > 0 && (
              <span className={`text-[11px] font-medium ${
                materiale.reduce((s, m) => s + m.fraction, 0) === 100 ? "text-green-700" : "text-amber-700"
              }`}>
                Total: {materiale.reduce((s, m) => s + m.fraction, 0)}%
              </span>
            )}
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
                    <select value={v.color_id ?? ""} onChange={(e) => setVariant(v.key, { color_id: e.target.value ? Number(e.target.value) : null })}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs">
                      <option value="">-</option>
                      {colorGroup.attributes.map((a) => <option key={a.id} value={a.id}>{a.frontend_name}</option>)}
                    </select>
                  </div>
                )}
                {sizeGroup && (
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">{sizeGroup.frontend_name}</label>
                    <select value={v.size_id ?? ""} onChange={(e) => setVariant(v.key, { size_id: e.target.value ? Number(e.target.value) : null })}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs">
                      <option value="">-</option>
                      {sizeGroup.attributes.map((a) => <option key={a.id} value={a.id}>{a.frontend_name}</option>)}
                    </select>
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
        <button onClick={() => save("sync")} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
          <Send className="h-3.5 w-3.5" /> Salvează și trimite
        </button>
        <button onClick={() => save("publish")} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary text-primary px-3 py-2 text-sm font-semibold hover:bg-primary/10 disabled:opacity-60">
          <Upload className="h-3.5 w-3.5" /> Publică
        </button>
        <button onClick={onClose} disabled={pending}
          className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60">
          Închide
        </button>
      </div>
    </div>
  );
}
