"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, ExternalLink, ShoppingBag, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { produseleLasateAfaraDinCatalog } from "@/lib/actions/facebook-feeds.actions";
import { MOTIVE_LASATE_AFARA, type MotivLipsaDinCatalog, type ProdusLasatAfara } from "@/lib/facebook/lasate-afara";

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
        <LasateAfara />
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

/**
 * Cate produse NU ajung in feed, si de ce.
 *
 * ⚠ CAND NU E NIMIC DE SPUS, RANDUL NU EXISTA. Un panou care striga si cand totul e in regula se
 * invata pe dinafara si se sare cu ochii — iar atunci nu mai spune nimic nici in ziua in care chiar
 * are ceva de spus.
 *
 * ⚠ Motivele NU se socotesc aici: vin gata hotarate de la `motivulLipseiDinCatalog`, chiar functia
 * pe care generatorul feedului o foloseste ca sa lase produsul afara. O a doua judecata scrisa in
 * ecran ar fi ramas in urma la prima schimbare, si ecranul ar fi mintit cu incredere.
 *
 * ⚠ Textele scurte de aici sunt fara diacritice, ca vecinii lor din acelasi ecran; etichetele si
 * explicatiile vin cu diacritice din `lasate-afara.ts`, unde vecinul lor e `MOTIV_PRET_CARE_MINTE`,
 * acelasi text pe care il arata si panoul Google Merchant. Rescrise aici fara diacritice, ar fi
 * fost a doua copie a lor.
 */
function LasateAfara() {
  const [raspuns, setRaspuns] = useState<{ total: number; produse: ProdusLasatAfara[] } | { error: string } | null>(null);
  const [aratate, setAratate] = useState(false);

  useEffect(() => {
    let viu = true;
    produseleLasateAfaraDinCatalog()
      .then((r) => { if (viu) setRaspuns(r); })
      /*
       * ⚠ SE SPUNE SI CEREREA CAZUTA, nu doar eroarea INTOARSA de capat. O actiune de server nu
       * raspunde intotdeauna: cade reteaua, sesiunea a expirat, sau adresa actiunii nu mai exista
       * dupa o livrare noua — si atunci promisiunea se RESPINGE, nu intoarce `{ error }`. Fara
       * randul asta, `raspuns` ramanea `null` pentru totdeauna si randul disparea complet de pe
       * ecran: chiar tacerea care se citeste „pleaca toate", si impotriva careia exista panoul.
       */
      .catch(() => { if (viu) setRaspuns({ error: "cererea a cazut" }); });
    return () => { viu = false; };
  }, []);

  /* Inca se numara. Nicio linie, niciun schelet: ecranul nu tresare la fiecare deschidere. */
  if (!raspuns) return null;
  /*
   * ⚠ O citire cazuta se SPUNE. Tacerea de aici s-ar citi „pleaca toate" — chiar convingerea
   * gresita pentru care exista randul asta.
   */
  if ("error" in raspuns) {
    return <p className="text-xs text-muted-foreground">N-am putut verifica daca ramane vreun produs afara din feed.</p>;
  }
  if (raspuns.total === 0) return null;

  const { total, produse } = raspuns;
  const grupe = (Object.keys(MOTIVE_LASATE_AFARA) as MotivLipsaDinCatalog[])
    .map((motiv) => ({ motiv, produse: produse.filter((p) => p.motiv === motiv) }))
    .filter((g) => g.produse.length > 0);

  return (
    <div className="rounded-xl border border-warning/20 bg-warning/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          {total === 1 ? "Un produs activ nu ajunge in feed." : `${total} produse active nu ajung in feed.`}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAratate((v) => !v)}>
          {aratate ? "Ascunde" : "Arata care"}
        </Button>
      </div>

      {aratate && (
        <div className="mt-3 space-y-3">
          {grupe.map((g) => (
            <div key={g.motiv}>
              <p className="text-xs font-medium text-foreground">{MOTIVE_LASATE_AFARA[g.motiv].eticheta}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{MOTIVE_LASATE_AFARA[g.motiv].explicatie}</p>
              <ul className="mt-1.5 space-y-1">
                {g.produse.map((p) => (
                  <li key={p.id} className="truncate text-[11px]">
                    {/* Numele duce direct in produs: motivul fara locul in care se repara e tot o tacere. */}
                    <Link href={`/dashboard/products/${p.id}/edit`} className="text-foreground underline underline-offset-2">{p.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {total > produse.length && (
            <p className="text-[11px] text-muted-foreground">Sunt aratate primele {produse.length}, din {total}.</p>
          )}
        </div>
      )}
    </div>
  );
}
