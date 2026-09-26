"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  FileText, FolderOpen, Globe, Home, Loader2, Mail, MessageCircle, Package, Phone, Search, ShoppingBag, ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { searchProductsForPicker } from "@/lib/actions/product-picker.actions";
import { hrefCategorie } from "@/lib/storefront/category-href";

/*
  ═══════════════════════════════════════════════════════════════════════════
  LINKUL, CU SUGESTII                                              (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: oriunde se cere un link, sa apara paginile care exista deja.
  Pana acum campul era text gol cu „/produs sau https://" drept indiciu, iar
  comerciantul trebuia sa stie pe de rost slugul paginii, cum arata adresa unei
  categorii (`/magazin?cat=...`) si ce prefix are produsul. O greseala de o
  litera dadea un 404 pe care nu-l vedea nimeni pana nu apasa un cumparator.

  Sugestiile vin din ce EXISTA: paginile de sistem, paginile proprii,
  categoriile si produsele (acestea cautate pe server, fiindca un catalog poate
  avea mii). Se scrie mai departe orice adresa, sugestiile doar ajuta.

  ⚠ Legaturile se salveaza RELATIVE la magazin („/contact"), nu absolute: la
  randare `resolveHref` le pune in fata `/<slug>` sau nimic, dupa cum magazinul
  e pe edinio.com sau pe domeniul lui. Absolute, s-ar fi rupt la mutarea pe
  domeniu propriu.
*/

export interface DateLegaturi {
  businessId: string;
  pagini: { titlu: string; slug: string; publicata: boolean }[];
  categorii: string[];
  /** Radacina catalogului: `/magazin` (sau prefixul ales) ori `` cand produsele stau pe prima pagina. */
  radacinaCatalog: string;
  prefixProdus: string;
}

const Legaturi = createContext<DateLegaturi | null>(null);
export const FurnizorLegaturi = Legaturi.Provider;

type Sugestie = { eticheta: string; href: string; grup: string; Icon: React.ElementType; nota?: string };

export function CampLink({
  eticheta, valoare, onChange, placeholder,
}: {
  eticheta: string;
  valoare?: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const date = useContext(Legaturi);
  const id = useId();
  const [deschis, setDeschis] = useState(false);
  const [produse, setProduse] = useState<Sugestie[]>([]);
  const [cauta, setCauta] = useState(false);
  const cutie = useRef<HTMLDivElement>(null);
  const text = valoare ?? "";

  useEffect(() => {
    if (!deschis) return;
    const inchide = (e: MouseEvent) => { if (!cutie.current?.contains(e.target as Node)) setDeschis(false); };
    document.addEventListener("mousedown", inchide);
    return () => document.removeEventListener("mousedown", inchide);
  }, [deschis]);

  /* Produsele se cauta pe server, dupa o pauza scurta, numai cand omul scrie un cuvant. */
  const termen = text.trim();
  const cautaProduse = deschis && !!date && termen.length >= 2 && !/^(https?:|mailto:|tel:|\/|#)/i.test(termen);
  useEffect(() => {
    if (!cautaProduse || !date) return;
    let anulat = false;
    const t = setTimeout(async () => {
      setCauta(true);
      try {
        const r = await searchProductsForPicker(date.businessId, termen);
        if (!anulat) {
          setProduse(r.slice(0, 6).map((p) => ({
            eticheta: p.name, href: `/${date.prefixProdus}/${p.slug ?? p.id}`, grup: "Produse", Icon: Package,
          })));
        }
      } catch {
        if (!anulat) setProduse([]);
      } finally {
        if (!anulat) setCauta(false);
      }
    }, 250);
    return () => { anulat = true; clearTimeout(t); };
  }, [cautaProduse, termen, date]);

  const fixe = useMemo<Sugestie[]>(() => {
    if (!date) return [];
    const catalog = date.radacinaCatalog;
    const l: Sugestie[] = [
      { eticheta: "Acasă", href: "/", grup: "Pagini de sistem", Icon: Home },
      { eticheta: "Toate produsele", href: catalog || "/", grup: "Pagini de sistem", Icon: ShoppingBag },
      { eticheta: "Coș", href: "/cos", grup: "Pagini de sistem", Icon: ShoppingCart },
      { eticheta: "Căutare", href: "/cautare", grup: "Pagini de sistem", Icon: Search },
      ...date.pagini.map((p) => ({
        eticheta: p.titlu, href: `/${p.slug}`, grup: "Paginile tale", Icon: FileText, nota: p.publicata ? undefined : "ciornă",
      })),
      ...date.categorii.map((c) => ({
        eticheta: c, href: hrefCategorie(catalog, c), grup: "Categorii", Icon: FolderOpen,
      })),
    ];
    return l;
  }, [date]);

  const filtrate = useMemo(() => {
    const q = termen.toLowerCase();
    const potrivite = !q || q === "/" ? fixe : fixe.filter((s) => s.eticheta.toLowerCase().includes(q) || s.href.toLowerCase().includes(q));
    return [...potrivite.slice(0, 40), ...(cautaProduse ? produse : [])];
  }, [fixe, termen, produse, cautaProduse]);

  const special: Sugestie[] = [
    { eticheta: "Sună la un număr", href: "tel:", grup: "Altele", Icon: Phone },
    { eticheta: "Trimite un email", href: "mailto:", grup: "Altele", Icon: Mail },
    { eticheta: "Scrie pe WhatsApp", href: "https://wa.me/40", grup: "Altele", Icon: MessageCircle },
    { eticheta: "Site extern", href: "https://", grup: "Altele", Icon: Globe },
  ];

  const grupuri = [...filtrate, ...(termen ? [] : special)].reduce<Record<string, Sugestie[]>>((acc, s) => {
    (acc[s.grup] ??= []).push(s);
    return acc;
  }, {});

  const eticheteCunoscute = fixe.find((s) => s.href === text);

  return (
    <div ref={cutie} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-foreground">{eticheta}</label>
      <input
        id={id}
        value={text}
        onChange={(e) => { onChange(e.target.value); setDeschis(true); }}
        onFocus={() => setDeschis(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setDeschis(false); }}
        placeholder={placeholder ?? "Caută o pagină sau scrie un link"}
        autoComplete="off"
        role="combobox"
        aria-expanded={deschis}
        aria-controls={`${id}-lista`}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30"
      />
      {eticheteCunoscute && !deschis && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <eticheteCunoscute.Icon className="h-3 w-3" /> {eticheteCunoscute.eticheta}
        </p>
      )}

      {deschis && date && (
        <div
          id={`${id}-lista`}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-xl"
        >
          {Object.entries(grupuri).map(([grup, lista]) => (
            <div key={grup} className="py-1">
              <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{grup}</p>
              {lista.map((s) => (
                <button
                  key={`${grup}-${s.href}-${s.eticheta}`}
                  type="button"
                  role="option"
                  aria-selected={s.href === text}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange(s.href); setDeschis(s.href.endsWith(":") || s.href.endsWith("/40") || s.href === "https://"); }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-muted",
                    s.href === text && "bg-muted",
                  )}
                >
                  <s.Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-foreground">{s.eticheta}</span>
                  {s.nota && <span className="flex-shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">{s.nota}</span>}
                  <span className="max-w-[40%] flex-shrink-0 truncate font-mono text-[10px] text-muted-foreground">{s.href}</span>
                </button>
              ))}
            </div>
          ))}
          {cauta && (
            <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Caut produse…
            </p>
          )}
          {Object.keys(grupuri).length === 0 && !cauta && (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">Nicio pagină potrivită. Poți scrie orice adresă.</p>
          )}
        </div>
      )}
    </div>
  );
}
