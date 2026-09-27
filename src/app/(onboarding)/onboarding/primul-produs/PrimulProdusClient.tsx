"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { UrmaPasOnboarding } from "@/components/edinio-marketing/UrmaPalnie";
import { CadruPas } from "@/components/onboarding/CadruPas";
import { ButonContinua, campCls } from "@/components/onboarding/campuri";
import { createProduct } from "@/lib/actions/product.actions";
import { updateBusiness } from "@/lib/actions/business.actions";
import { urmareste } from "@/lib/edinio-marketing/magistrala";
import { uploadImage } from "@/lib/upload";

/* „129,99", „129.99", „1.299,50" sau „1299" → numar; altfel null. */
function citestePret(brut: string): number | null {
  let t = brut.trim().replace(/\s|lei/gi, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null;
}

export function PrimulProdusClient({
  businessId,
  slug,
  numeMagazin,
  publicat,
  areProduse,
}: {
  businessId: string;
  slug: string;
  numeMagazin: string;
  publicat: boolean;
  areProduse: boolean;
}) {
  const [etapa, setEtapa] = useState<"produs" | "gata">(areProduse ? "gata" : "produs");
  const [produsAdaugat, setProdusAdaugat] = useState(areProduse);
  const [nume, setNume] = useState("");
  const [pret, setPret] = useState("");
  const [imagine, setImagine] = useState<{ local: string; url: string | null } | null>(null);
  const [seIncarcaImaginea, setSeIncarcaImaginea] = useState(false);
  const [seSalveaza, setSeSalveaza] = useState(false);
  const [erori, setErori] = useState<{ nume?: string; pret?: string }>({});
  const [ePublicat, setEPublicat] = useState(publicat);
  const [sePublica, setSePublica] = useState(false);
  const fisierRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (imagine?.local) URL.revokeObjectURL(imagine.local); }, [imagine?.local]);

  async function alegeImagine(fisier: File | undefined) {
    if (!fisier) return;
    if (!fisier.type.startsWith("image/")) {
      toast.error("Alege o imagine (JPG, PNG sau WebP).");
      return;
    }
    const local = URL.createObjectURL(fisier);
    setImagine({ local, url: null });
    setSeIncarcaImaginea(true);
    const r = await uploadImage(fisier, "products");
    setSeIncarcaImaginea(false);
    if ("error" in r) {
      toast.error(r.error);
      setImagine(null);
      return;
    }
    setImagine({ local, url: r.url });
  }

  async function adauga(ev: React.FormEvent) {
    ev.preventDefault();
    const e: typeof erori = {};
    const n = nume.trim();
    const p = citestePret(pret);
    if (n.length < 2) e.nume = "Scrie numele produsului.";
    if (p === null) e.pret = "Scrie prețul în lei, de exemplu 129,99.";
    setErori(e);
    if (Object.keys(e).length > 0 || p === null) return;

    setSeSalveaza(true);
    const r = await createProduct(businessId, {
      name: n,
      price: p,
      images: imagine?.url ? [imagine.url] : [],
      track_inventory: false,
      /* NU „recomandat": pe singurul produs al unui magazin nou, eticheta „Popular" ar fi o afirmatie falsa. */
      is_featured: false,
      is_active: true,
    });
    setSeSalveaza(false);
    if ("error" in r && r.error) {
      toast.error(r.error);
      return;
    }
    urmareste({ name: "onboarding_step_complete", onboarding_step: "primul_produs", onboarding_step_index: 4 });
    setProdusAdaugat(true);
    setEtapa("gata");
  }

  async function publica() {
    setSePublica(true);
    const r = await updateBusiness(businessId, { is_published: true });
    setSePublica(false);
    if ("error" in r && r.error) {
      toast.error(r.error);
      return;
    }
    setEPublicat(true);
    toast.success("Magazinul e public.");
  }

  const adresa = `edinio.com/${slug}`;

  if (etapa === "gata") {
    return (
      <>
        <UrmaPasOnboarding pas="gata" index={5} />
        <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6 sm:py-16">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check className="h-6 w-6" strokeWidth={2.5} />
          </span>
          <h1 className="mt-6 text-[28px] font-semibold leading-tight tracking-tight text-foreground sm:text-[32px]">
            {numeMagazin ? `${numeMagazin} e gata` : "Magazinul tău e gata"}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            {ePublicat
              ? "Magazinul e public. Trimite adresa clienților tăi și primește prima comandă."
              : "Acum îl poți face public. Până atunci îl vezi doar tu."}
          </p>

          <ul className="mt-8 divide-y divide-border rounded-xl border border-border bg-surface">
            <Rand gata titlu="Magazinul creat" detaliu={adresa} />
            <Rand gata={produsAdaugat} titlu="Primul produs" detaliu={produsAdaugat ? "Adăugat" : "Îl adaugi din panou, la Produse"} />
            <Rand gata={ePublicat} titlu="Magazin public" detaliu={ePublicat ? "Oricine îl poate vedea" : "Încă ascuns"} />
          </ul>

          <div className="mt-8 space-y-3">
            {!ePublicat ? (
              <ButonContinua type="button" onClick={publica} seIncarca={sePublica}>Publică magazinul</ButonContinua>
            ) : (
              <a
                href={`/${slug}`}
                target="_blank"
                rel="noopener"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Vezi magazinul <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <Link
              href="/dashboard"
              className="flex h-12 w-full items-center justify-center rounded-lg border border-border bg-surface text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              Mergi în panou
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <UrmaPasOnboarding pas="primul_produs" index={4} />
      <CadruPas
        pas={4}
        titlu="Adaugă primul produs"
        descriere="Magazinul tău există. Un produs cu poză și preț e tot ce-i mai trebuie ca să poată primi comenzi."
      >
        <form onSubmit={adauga} noValidate className="space-y-6">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-foreground">Poza produsului</span>
            <input
              ref={fisierRef}
              type="file"
              accept="image/*"
              className="sr-only"
              id="poza"
              onChange={(e) => { void alegeImagine(e.target.files?.[0]); e.target.value = ""; }}
            />
            {imagine ? (
              <div className="relative h-40 w-40 overflow-hidden rounded-xl border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- previzualizare locala (blob:), nu trece prin optimizator */}
                <img src={imagine.local} alt="" className="h-full w-full object-cover" />
                {seIncarcaImaginea && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                    <Loader2 className="h-5 w-5 animate-spin text-foreground" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setImagine(null)}
                  aria-label="Scoate poza"
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-foreground shadow-sm hover:bg-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label
                htmlFor="poza"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void alegeImagine(e.dataTransfer.files?.[0]); }}
                className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.03]"
              >
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Alege o poză</span>
                <span className="text-xs text-muted-foreground">sau trage-o aici</span>
              </label>
            )}
          </div>

          <div>
            <label htmlFor="nume-produs" className="mb-1.5 block text-sm font-medium text-foreground">Numele produsului</label>
            <input
              id="nume-produs"
              type="text"
              placeholder="De exemplu: Buchet de trandafiri roșii"
              value={nume}
              onChange={(e) => { setNume(e.target.value); if (erori.nume) setErori((x) => ({ ...x, nume: undefined })); }}
              aria-invalid={!!erori.nume}
              className={campCls(!!erori.nume)}
            />
            {erori.nume && <p className="mt-1.5 text-xs text-destructive">{erori.nume}</p>}
          </div>

          <div>
            <label htmlFor="pret-produs" className="mb-1.5 block text-sm font-medium text-foreground">Prețul</label>
            <div className="relative">
              <input
                id="pret-produs"
                type="text"
                inputMode="decimal"
                placeholder="129,99"
                value={pret}
                onChange={(e) => { setPret(e.target.value); if (erori.pret) setErori((x) => ({ ...x, pret: undefined })); }}
                aria-invalid={!!erori.pret}
                className={campCls(!!erori.pret) + " pr-12"}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">lei</span>
            </div>
            {erori.pret && <p className="mt-1.5 text-xs text-destructive">{erori.pret}</p>}
          </div>

          <ButonContinua seIncarca={seSalveaza} dezactivat={seIncarcaImaginea}>
            {seIncarcaImaginea ? "Se încarcă poza…" : "Adaugă produsul"}
          </ButonContinua>
        </form>

        <div className="mt-6 space-y-3 text-center text-sm">
          <p className="text-muted-foreground">
            Ai deja produsele într-un fișier sau în alt magazin?{" "}
            <Link href="/dashboard/products/import" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              Importă-le
            </Link>
          </p>
          <button
            type="button"
            onClick={() => setEtapa("gata")}
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            Sar peste, adaug mai târziu
          </button>
        </div>
      </CadruPas>
    </>
  );
}

function Rand({ gata, titlu, detaliu }: { gata: boolean; titlu: string; detaliu: string }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <span
        className={
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full " +
          (gata ? "bg-primary text-primary-foreground" : "border border-border text-transparent")
        }
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{titlu}</span>
        <span className="block truncate text-xs text-muted-foreground">{detaliu}</span>
      </span>
    </li>
  );
}
