"use client";

import { useStorefront } from "@/components/storefront/StorefrontProvider";

/**
 * Campurile de filtrare a catalogului: interval de pret, optiunile de varianta
 * din produse, reduceri si stoc.
 *
 * Aceleasi campuri apar in panoul de pe desktop si in foaia de jos de pe mobil,
 * deci traiesc intr-o singura componenta.
 */
export function CatalogFilterFields() {
  const {
    color,
    facets,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    selectedOptions,
    toggleOption,
    onSaleOnly,
    setOnSaleOnly,
    inStockOnly,
    setInStockOnly,
    catalogPeServer,
  } = useStorefront();

  const inputCls =
    "w-28 px-3 py-2 text-sm border border-border rounded-xl bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20";
  const pastila = "px-3 py-1.5 rounded-full text-sm border transition-colors";
  const inactiv = {
    backgroundColor: "transparent",
    color: "var(--color-foreground)",
    borderColor: "var(--color-border)",
  };
  const activ = { backgroundColor: color, color: "white", borderColor: color };

  return (
    <>
      <div>
        <p className="text-xs font-semibold text-foreground mb-2">Pret (lei)</p>
        <div className="flex items-center gap-2">
          <input type="number" inputMode="numeric" min={0} placeholder={`De la ${facets.priceMin}`}
            value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className={inputCls} />
          <span className="text-muted-foreground">-</span>
          <input type="number" inputMode="numeric" min={0} placeholder={`Pana la ${facets.priceMax}`}
            value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/*
        Pastilele de varianta NU se arata pe palierul server.
        Doua motive, si amandoua le-ar fi facut mincinoase acolo: lista de valori
        se deriva din produsele trimise in browser, iar acelea sunt o singura
        pagina; si selectia lor nu ajunge in adresa, deci n-ar avea cum sa ceara
        serverului nimic — ar fi comutatoare care se coloreaza si nu fac nimic.
        Ce filtreaza cu adevarat pe atribute sunt FATETELE (`fatete` din rezumat),
        care exista pe pagina de catalog. Aici, pe pagina principala, filtrul
        rămâne pretul plus reducerile si stocul, care chiar ajung in interogare.
      */}
      {!catalogPeServer && facets.options.map((opt) => (
        <div key={opt.name}>
          <p className="text-xs font-semibold text-foreground mb-2">{opt.name}</p>
          <div className="flex flex-wrap gap-2">
            {opt.values.map((v) => {
              const selectat = (selectedOptions[opt.name] ?? []).includes(v);
              return (
                // Pastilele sunt comutatoare a caror stare se vedea exclusiv din
                // culoarea de fundal: `aria-pressed` o spune si celor care nu o
                // vad, fara nicio schimbare vizuala.
                <button key={v} type="button" onClick={() => toggleOption(opt.name, v)}
                  aria-pressed={selectat}
                  className={pastila} style={selectat ? activ : inactiv}>
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" onClick={() => setOnSaleOnly(!onSaleOnly)}
          aria-pressed={onSaleOnly}
          className={pastila} style={onSaleOnly ? activ : inactiv}>
          Doar reduceri
        </button>
        <button type="button" onClick={() => setInStockOnly(!inStockOnly)}
          aria-pressed={inStockOnly}
          className={pastila} style={inStockOnly ? activ : inactiv}>
          Doar in stoc
        </button>
      </div>
    </>
  );
}
