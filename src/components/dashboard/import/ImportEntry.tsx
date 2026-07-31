"use client";

import { useState } from "react";
import { ArrowRight, Boxes, PackagePlus } from "lucide-react";
import { ImportWizard } from "./ImportWizard";
import { StockFeedWizard } from "./StockFeedWizard";
import { StockFeedSources } from "./StockFeedSources";
import type { StockFeedSource } from "@/lib/import/stock-feed/sources";
import { cn } from "@/lib/utils/cn";

/**
 * Alegerea dintre cele doua feluri de fisier.
 *
 * Exista ca ecran separat, si nu ca o bifa in wizardul de import, pentru ca cele
 * doua fac lucruri de gravitate foarte diferita: unul creeaza si suprascrie tot
 * catalogul, celalalt atinge doua numere. O bifa pusa greseala intr-un singur
 * ecran ar fi diferenta dintre "am actualizat stocul" si "am rescris catalogul".
 * Aici omul alege inainte, si de acolo incolo nu mai are cum sa nimereasca
 * conducta cealalta.
 */

type Mode = "choose" | "products" | "stock";

export function ImportEntry({
  plan,
  productLimit,
  productCount,
  stockSources,
  stockSourcesError,
}: {
  plan: string;
  productLimit: number;
  productCount: number;
  stockSources: StockFeedSource[];
  stockSourcesError: string | null;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const [tab, setTab] = useState<"file" | "auto">("file");

  if (mode === "products") {
    return <ImportWizard plan={plan} productLimit={productLimit} productCount={productCount} />;
  }

  if (mode === "stock") {
    return (
      <div className="space-y-4">
        {/* Aceeasi conducta, doua feluri de a o porni: un fisier acum, sau o
            adresa citita singura, dupa program. */}
        <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
          <Tab active={tab === "file"} onClick={() => setTab("file")}>Fisier</Tab>
          <Tab active={tab === "auto"} onClick={() => setTab("auto")}>Sincronizare automata</Tab>
        </div>

        {tab === "file" ? (
          <StockFeedWizard onBack={() => setMode("choose")} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-base font-semibold text-foreground">Sincronizare automata</h1>
                <p className="text-xs text-muted-foreground">
                  Salvezi adresa fisierului de la furnizor si il citim noi, dupa program.
                </p>
              </div>
              <button type="button" onClick={() => setMode("choose")}
                className="h-9 rounded-lg border border-border px-3 text-xs font-medium">
                Inapoi
              </button>
            </div>
            <StockFeedSources initialSources={stockSources} initialError={stockSourcesError} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-base font-semibold text-foreground">Incarca un fisier</h1>
        <p className="text-xs text-muted-foreground">Ce vrei sa faci cu el?</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Choice
          icon={PackagePlus}
          title="Import produse"
          description="Adauga produse noi sau actualizeaza tot: nume, preturi, descrieri, imagini, categorii si variante."
          note="Fisier complet, de la Shopify, WooCommerce sau al tau."
          onClick={() => setMode("products")}
        />
        <Choice
          icon={Boxes}
          title="Actualizare stocuri"
          description="Schimba doar cantitatile. Nu atinge nume, descrieri, imagini sau categorii."
          note="Doua coloane sunt de ajuns: un cod si cantitatea."
          onClick={() => setMode("stock")}
        />
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Choice({
  icon: Icon,
  title,
  description,
  note,
  onClick,
}: {
  icon: typeof Boxes;
  title: string;
  description: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/40"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/30">
        <Icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" strokeWidth={1.75} />
      </span>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {title}
        <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
      </span>
      <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
      <span className="mt-auto pt-1 text-[11px] text-muted-foreground/80">{note}</span>
    </button>
  );
}
