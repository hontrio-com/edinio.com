"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Copy, ExternalLink, ShoppingBag, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

export function FacebookCatalogClient({ feedUrl, hasCustomDomain, productCount, pixelConfigured }: {
  feedUrl: string;
  hasCustomDomain: boolean;
  productCount: number;
  pixelConfigured: boolean;
}) {
  const copy = (v: string) => { navigator.clipboard?.writeText(v); toast.success("Copiat."); };

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShoppingBag className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-semibold text-foreground">Catalog Facebook si Instagram</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Trimite automat produsele in Meta pentru reclame dinamice (Advantage+), tag-uri de shopping si Shops. Sincronizarea se face printr-un feed pe care il actualizam noi; tu il conectezi o singura data.</p>
          </div>
        </div>
      </div>

      {/* Pixel prerequisite */}
      {!pixelConfigured && (
        <Callout variant="warning" icon={AlertTriangle}>
          Pentru reclame dinamice (retargeting) ai nevoie de <strong>Facebook Pixel</strong> conectat. <Link href="/dashboard/features/facebook-pixel" className="font-medium underline">Conecteaza pixelul</Link>, apoi leaga-l de catalog la pasul 3.
        </Callout>
      )}

      {/* Feed URL */}
      <div className="space-y-2 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground">Adresa feed-ului tau</p>
        <p className="text-xs text-muted-foreground">{productCount} {productCount === 1 ? "produs activ" : "produse active"} in magazin. Feed-ul se actualizeaza automat.</p>
        <div className="flex items-center gap-2">
          <input readOnly value={feedUrl} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs text-foreground" />
          <Button type="button" variant="outline" size="sm" onClick={() => copy(feedUrl)}><Copy className="h-3.5 w-3.5" /> Copiaza</Button>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground">Cum conectezi (o singura data)</p>
        <ol className="space-y-3 text-xs text-muted-foreground">
          <li><span className="font-semibold text-foreground">1.</span> Deschide <a href="https://business.facebook.com/commerce" target="_blank" rel="noreferrer" className="text-primary underline">Meta Commerce Manager</a> si creeaza un catalog de tip <span className="font-medium text-foreground">E-commerce</span>.</li>
          <li><span className="font-semibold text-foreground">2.</span> In catalog: Data Sources (Surse de date) {"->"} Add {"->"} <span className="font-medium text-foreground">Use a URL</span> {"->"} lipeste adresa de mai sus {"->"} seteaza actualizarea <span className="font-medium text-foreground">zilnica</span>.</li>
          <li><span className="font-semibold text-foreground">3.</span> Leaga <span className="font-medium text-foreground">Pixel-ul</span> de catalog (sectiunea Events) ca sa pornesti reclamele dinamice care re-arata vizitatorilor exact produsele vazute.</li>
        </ol>
        <a href="https://business.facebook.com/commerce" target="_blank" rel="noreferrer" className="inline-flex">
          <Button size="sm"><ExternalLink className="h-3.5 w-3.5" /> Deschide Commerce Manager</Button>
        </a>
      </div>

      {/* Domain note */}
      <p className="text-[11px] text-muted-foreground">
        {hasCustomDomain
          ? "Feed-ul foloseste domeniul tau propriu, la fel ca pixelul, asa se potrivesc produsele cu evenimentele de tracking."
          : "Feed-ul foloseste adresa edinio.com. Daca vrei domeniul tau propriu, conecteaza-l din Setari, sectiunea Domeniu."}
      </p>
    </div>
  );
}
