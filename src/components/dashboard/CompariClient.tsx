"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Copy, ExternalLink, Fingerprint, Globe, RefreshCw, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  CardCifre, CumFunctioneaza, PaginaIntegrare, Sectiune, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { rezumatulFeeduluiCompariAlMeu } from "@/lib/actions/compari.actions";
import { MOTIVE_COMPARI, type MotivLipsaCompari, type RezumatCompari } from "@/lib/compari/lasate-afara";
import { formatPrice, pluralRo } from "@/lib/utils/format";

/*
 * Pagina „Compari.ro” din Integrari.
 *
 * Feedul nu se porneste si nu se opreste: exista pentru orice magazin publicat, la `{adresa}/compari.xml`. Pagina
 * ii da comerciantului adresa, ii spune unde o lipeste si ii arata ce ANUNTA feedul in numele lui (pret, termen,
 * cost de livrare) si ce produse raman afara.
 *
 * ⚠ Cifrele de aici nu se socotesc aici: vin din `lib/compari/server.ts` si `feed.ts`, aceleasi locuri din care isi
 * ia ruta feedului datele. Un ecran cu propria lui regula ar fi vorbit despre alt feed decat cel descarcat de Compari.
 */

export type LivrareCompari = {
  /** Zilele pana la client, sau `null` cand comerciantul nu a declarat un termen. */
  zile: number | null;
  /** Magazinul livreaza. */
  activa: boolean;
  /** Tariful de livrare asa cum pleaca in feed (brut), sau `null` cand nu e scris. */
  cost: number | null;
  /** Pragul de transport gratuit, in preturile magazinului, sau `null`. */
  pragGratuit: number | null;
};

export function CompariClient({ feedUrl, hasCustomDomain, publicat, livrare, tvaAdaugat, eroareCitire }: {
  feedUrl: string;
  hasCustomDomain: boolean;
  publicat: boolean;
  livrare: LivrareCompari | null;
  /** Cota adaugata peste pretul din magazin (magazin cu preturi fara TVA), sau `null` cand pretul pleaca neschimbat. */
  tvaAdaugat: number | null;
  /** Setarile magazinului nu s-au putut citi: randurile despre livrare si pret lipsesc, nu se ghicesc. */
  eroareCitire: boolean;
}) {
  const copy = (v: string) => { navigator.clipboard?.writeText(v); toast.success("Copiat."); };

  const stari: StareAntet[] = publicat
    ? [{ ton: "bun", text: "Feed disponibil" }]
    : [{ ton: "asteptare", text: "Magazin nepublicat" }];

  return (
    <PaginaIntegrare
      id="compari"
      titlu="Listare în Compari.ro"
      descriere="Produsele apar în comparatorul de prețuri Compari.ro, iar cine le caută ajunge direct în magazinul tău."
      stari={stari}
      aside={<>
        <CardCifre
          titlu="Feedul de produse"
          randuri={[
            { eticheta: "Actualizare", valoare: "automată" },
            { eticheta: "Compari îl descarcă", valoare: "zilnic, la 17:00" },
            { eticheta: "Domeniu", valoare: hasCustomDomain ? "domeniul tău" : "edinio.com" },
          ]}
        />
        <CumFunctioneaza id="compari" puncte={[
          { Icon: RefreshCw, text: "Feedul îl ținem noi la zi: tu lipești adresa o singură dată în contul tău Compari." },
          { Icon: Tag, text: "Un produs pleacă o singură dată, cu cel mai mic preț la care se poate cumpăra, chiar dacă are mărimi sau culori." },
          { Icon: Fingerprint, text: "Fiecare produs își păstrează același identificator cât timp există, deci nu își pierde locul în Compari." },
          { Icon: Globe, text: hasCustomDomain
            ? "Linkurile din feed duc pe domeniul tău."
            : "Linkurile din feed duc pe adresa edinio.com a magazinului. Pentru domeniul tău, conectează-l din Setări, Domeniu." },
        ]} />
      </>}
    >
      {!publicat && (
        <Callout variant="warning" icon={AlertTriangle} title="Magazinul nu e publicat">
          Adresa feedului răspunde doar pentru un magazin publicat. Până atunci, Compari nu are ce descărca.
        </Callout>
      )}

      <Sectiune pas={1} titlu="Adresa feedului" descriere="Se actualizează singură. O lipești o singură dată în contul tău Compari.">
        <RezumatFeed />
        <div className="flex flex-wrap items-center gap-2">
          <input readOnly aria-label="Adresa feedului" value={feedUrl} onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded-lg border border-input bg-muted/30 px-3 py-2 font-mono text-xs text-foreground" />
          <Button type="button" variant="outline" size="sm" onClick={() => copy(feedUrl)}><Copy /> Copiază</Button>
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="Cum o adaugi în Compari (o singură dată)">
        <ol className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
          <li><span className="font-semibold text-foreground">1.</span> Intră în <span className="font-medium text-foreground">Centrul de clienți</span> Compari, cu contul tău de magazin partener.</li>
          <li><span className="font-semibold text-foreground">2.</span> La Datele magazinului, <span className="font-medium text-foreground">Sursa listei produselor</span>, lipește adresa de mai sus și salvează.</li>
          <li><span className="font-semibold text-foreground">3.</span> Compari descarcă lista <span className="font-medium text-foreground">zilnic, la ora 17:00</span>. Produsele noi apar complet după 3-7 zile lucrătoare, cât durează procesarea lor.</li>
        </ol>
        <div>
          <a href="https://www.compari.ro/admin/" target="_blank" rel="noreferrer" className="inline-flex">
            <Button size="sm"><ExternalLink /> Deschide Centrul de clienți</Button>
          </a>
        </div>
      </Sectiune>

      <Sectiune pas={3} titlu="Ce spune feedul în numele tău" descriere="Prețul și livrarea se iau din setările magazinului. Le schimbi acolo, iar feedul le urmează.">
        {eroareCitire || !livrare ? (
          <p className="text-xs text-muted-foreground">N-am putut citi setările magazinului. Reîmprospătează pagina.</p>
        ) : (
          <dl className="divide-y divide-border text-xs">
            <Rand eticheta="Preț">
              {tvaAdaugat !== null
                ? `Cu TVA inclus: peste prețul din magazin se adaugă ${tvaAdaugat.toLocaleString("ro-RO")}%, fiindcă Compari cere prețul final.`
                : "Prețul din magazin, care are deja toate taxele incluse."}
            </Rand>
            <Rand eticheta="Termen de livrare">
              {livrare.zile !== null
                ? `${pluralRo(Math.max(1, livrare.zile), "zi lucrătoare", "zile lucrătoare")}, din termenul declarat în Setări.`
                : "Nedeclarat, deci câmpul lipsește din feed. Declară termenul în Setări, la Livrare."}
            </Rand>
            <Rand eticheta="Cost de livrare">
              {costulInCuvinte(livrare)}
            </Rand>
            <Rand eticheta="Produse epuizate">
              Rămân în feed, marcate ca indisponibile. Compari le ascunde singur și le arată din nou când revin în stoc.
            </Rand>
          </dl>
        )}
        <div>
          <Link href="/dashboard/settings?sectiune=livrare" className="inline-flex">
            <Button type="button" variant="outline" size="sm">Deschide Setări, Livrare</Button>
          </Link>
        </div>
      </Sectiune>
    </PaginaIntegrare>
  );
}

function Rand({ eticheta, children }: { eticheta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
      <dt className="shrink-0 font-medium text-foreground sm:w-36">{eticheta}</dt>
      <dd className="leading-relaxed text-muted-foreground">{children}</dd>
    </div>
  );
}

/** Costul livrarii, spus cum il scrie feedul. */
function costulInCuvinte(l: LivrareCompari): string {
  if (!l.activa) return "Livrarea e oprită în magazin, deci câmpul lipsește din feed.";
  const prag = l.pragGratuit !== null ? ` Gratuit la produsele de la ${formatPrice(l.pragGratuit)} în sus.` : "";
  if (l.cost === null) return `Tariful de livrare nu e scris, deci câmpul lipsește din feed.${prag}`;
  if (l.cost === 0) return "Gratuit.";
  return `${formatPrice(l.cost)}.${prag}`;
}

/**
 * Cate produse pleaca in feed, cate ascunde Compari si cate raman afara, cu motivul fiecaruia.
 *
 * ⚠ CAND NU E NIMIC DE SPUS DESPRE CELE LASATE AFARA, CASETA NU EXISTA. Un panou care striga si cand totul e in
 * regula se invata pe dinafara, iar atunci nu mai spune nimic nici in ziua in care chiar are ceva de spus.
 * ⚠ O citire cazuta se SPUNE: tacerea de aici s-ar citi „pleaca toate”.
 */
function RezumatFeed() {
  const [raspuns, setRaspuns] = useState<RezumatCompari | { error: string } | null>(null);
  const [aratate, setAratate] = useState(false);

  useEffect(() => {
    let viu = true;
    rezumatulFeeduluiCompariAlMeu()
      .then((r) => { if (viu) setRaspuns(r); })
      /* Si cererea CAZUTA se spune (retea, sesiune expirata, livrare noua): altfel randul ar lipsi pentru totdeauna. */
      .catch(() => { if (viu) setRaspuns({ error: "cererea a cazut" }); });
    return () => { viu = false; };
  }, []);

  /* Inca se numara. Nicio linie, niciun schelet: ecranul nu tresare la fiecare deschidere. */
  if (!raspuns) return null;
  if ("error" in raspuns) {
    return <p className="text-xs text-muted-foreground">N-am putut verifica ce produse pleacă în feed.</p>;
  }

  const { inFeed, epuizate, lasate, exemple } = raspuns;
  const grupe = (Object.keys(MOTIVE_COMPARI) as MotivLipsaCompari[])
    .map((motiv) => ({ motiv, produse: exemple.filter((p) => p.motiv === motiv) }))
    .filter((g) => g.produse.length > 0);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{pluralRo(inFeed)} în feed</span>
        {epuizate > 0 && `, din care ${pluralRo(epuizate, "epuizat", "epuizate")} (ascunse de Compari până revin în stoc)`}.
      </p>

      {lasate > 0 && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
              {lasate === 1 ? "Un produs activ nu ajunge în feed." : `${pluralRo(lasate, "produs activ", "produse active")} nu ajung în feed.`}
            </p>
            <Button type="button" variant="ghost" size="sm" aria-expanded={aratate} onClick={() => setAratate((v) => !v)}>
              {aratate ? "Ascunde" : "Arată care"}
            </Button>
          </div>

          {aratate && (
            <div className="mt-3 space-y-3">
              {grupe.map((g) => (
                <div key={g.motiv}>
                  <p className="text-xs font-medium text-foreground">{MOTIVE_COMPARI[g.motiv].eticheta}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{MOTIVE_COMPARI[g.motiv].explicatie}</p>
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
              {lasate > exemple.length && (
                <p className="text-[11px] text-muted-foreground">Sunt arătate primele {exemple.length}, din {lasate.toLocaleString("ro-RO")}.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
