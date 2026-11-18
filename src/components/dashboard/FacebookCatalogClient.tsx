"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Copy, ExternalLink, Filter, Fingerprint, Globe, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  CardCifre, CumFunctioneaza, PaginaIntegrare, Sectiune, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { produseleLasateAfaraDinCatalog } from "@/lib/actions/facebook-feeds.actions";
import { MOTIVE_LASATE_AFARA, type MotivLipsaDinCatalog, type ProdusLasatAfara } from "@/lib/facebook/lasate-afara";

export function FacebookCatalogClient({ feedUrl, hasCustomDomain, productCount, pixelConfigured, feeduri }: {
  feedUrl: string;
  hasCustomDomain: boolean;
  productCount: number;
  pixelConfigured: boolean;
  /** Feedurile segmentate (`FacebookFeeduriClient`), randate ca al treilea pas. */
  feeduri?: ReactNode;
}) {
  const copy = (v: string) => { navigator.clipboard?.writeText(v); toast.success("Copiat."); };

  const stari: StareAntet[] = [
    { ton: "info", text: `${productCount} ${productCount === 1 ? "produs activ" : "produse active"}` },
    pixelConfigured ? { ton: "bun", text: "Pixel conectat" } : { ton: "asteptare", text: "Fără pixel Meta" },
  ];

  return (
    <PaginaIntegrare
      id="facebook-catalog"
      titlu="Catalog Facebook și Instagram"
      descriere="Produsele ajung în Meta pentru reclame dinamice (Advantage+), etichete de cumpărături și Shops."
      stari={stari}
      aside={<>
        <CardCifre
          titlu="Feedul principal"
          cifre={[{ eticheta: productCount === 1 ? "produs activ" : "produse active", valoare: productCount }]}
          randuri={[
            { eticheta: "Actualizare", valoare: "automată" },
            { eticheta: "Domeniu", valoare: hasCustomDomain ? "domeniul tău" : "edinio.com" },
          ]}
        />
        <CumFunctioneaza id="facebook-catalog" puncte={[
          { Icon: RefreshCw, text: "Feedul îl ținem noi la zi: tu îl conectezi o singură dată în Commerce Manager." },
          { Icon: Fingerprint, text: "Cu pixelul legat de catalog, reclamele dinamice arată fiecărui vizitator exact produsele văzute." },
          { Icon: Filter, text: "Pentru reclame la o parte din produse folosești un Product Set în Commerce Manager, nu un feed nou." },
          { Icon: Globe, text: hasCustomDomain
            ? "Feedul folosește domeniul tău, la fel ca pixelul, așa se potrivesc produsele cu evenimentele."
            : "Feedul folosește adresa edinio.com. Pentru domeniul tău, conectează-l din Setări, Domeniu." },
        ]} />
      </>}
    >
      {!pixelConfigured && (
        <Callout variant="warning" icon={AlertTriangle} title="Pentru reclame dinamice îți trebuie pixelul Meta">
          <Link href="/dashboard/features/facebook-pixel" className="font-medium underline">Conectează pixelul</Link>, apoi leagă-l de catalog, la pasul 3 de mai jos.
        </Callout>
      )}

      <Sectiune pas={1} titlu="Adresa feedului" descriere="Se actualizează singură. O lipești o singură dată în Commerce Manager.">
        <LasateAfara />
        <div className="flex items-center gap-2">
          <input readOnly aria-label="Adresa feedului" value={feedUrl} onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded-lg border border-input bg-muted/30 px-3 py-2 font-mono text-xs text-foreground" />
          <Button type="button" variant="outline" size="sm" onClick={() => copy(feedUrl)}><Copy /> Copiază</Button>
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="Cum îl conectezi (o singură dată)">
        <ol className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
          <li><span className="font-semibold text-foreground">1.</span> Deschide Meta Commerce Manager și creează un catalog de tip <span className="font-medium text-foreground">E-commerce</span>.</li>
          <li><span className="font-semibold text-foreground">2.</span> În catalog: Data Sources (Surse de date), Add, <span className="font-medium text-foreground">Use a URL</span>; lipești adresa de mai sus și alegi actualizarea <span className="font-medium text-foreground">zilnică</span>.</li>
          <li><span className="font-semibold text-foreground">3.</span> Legi <span className="font-medium text-foreground">pixelul</span> de catalog (secțiunea Events), ca să pornești reclamele dinamice care le arată vizitatorilor exact produsele văzute.</li>
        </ol>
        <div>
          <a href="https://business.facebook.com/commerce" target="_blank" rel="noreferrer" className="inline-flex">
            <Button size="sm"><ExternalLink /> Deschide Commerce Manager</Button>
          </a>
        </div>
      </Sectiune>

      {feeduri}
    </PaginaIntegrare>
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
 * ⚠ Textele scurte de aici au diacritice, ca restul panoului (refacut pe 15.11.2026); etichetele si
 * explicatiile vin din `lasate-afara.ts`, unde vecinul lor e `MOTIV_PRET_CARE_MINTE`, acelasi text
 * pe care il arata si panoul Google Merchant. Rescrise aici, ar fi fost a doua copie a lor.
 *
 * ⚠ Il foloseste si panoul theMarketer (18.11.2026): feedul lui lasa afara EXACT aceleasi produse
 * (`motivulLipseiDinCatalog`, aceleasi filtre). Se schimba doar explicatia, unde textul de aici
 * vorbeste despre Meta.
 */
export function LasateAfara({ explicatii }: { explicatii?: Partial<Record<MotivLipsaDinCatalog, string>> } = {}) {
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
    return <p className="text-xs text-muted-foreground">N-am putut verifica dacă rămâne vreun produs afară din feed.</p>;
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
          {total === 1 ? "Un produs activ nu ajunge în feed." : `${total} produse active nu ajung în feed.`}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAratate((v) => !v)}>
          {aratate ? "Ascunde" : "Arată care"}
        </Button>
      </div>

      {aratate && (
        <div className="mt-3 space-y-3">
          {grupe.map((g) => (
            <div key={g.motiv}>
              <p className="text-xs font-medium text-foreground">{MOTIVE_LASATE_AFARA[g.motiv].eticheta}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{explicatii?.[g.motiv] ?? MOTIVE_LASATE_AFARA[g.motiv].explicatie}</p>
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
            <p className="text-[11px] text-muted-foreground">Sunt arătate primele {produse.length}, din {total}.</p>
          )}
        </div>
      )}
    </div>
  );
}
