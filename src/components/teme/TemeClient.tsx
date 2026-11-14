"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Database, Loader2, Palette, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLucru } from "@/components/dashboard/useLucru";
import { aplicaTema, puneLaLocDesignulDeDinainte, stergeDateleDemo } from "@/lib/actions/store-design.actions";

export interface TemaPeCard {
  cheie: string;
  nume: string;
  descriere: string;
  /** „Vezi demo”: subdomeniul temei (etapa 19). */
  adresaDemo: string;
  /**
   * Captura primei pagini a demo-ului, intreaga (`scripts/teme/capturi-teme.mjs`); `null` cand lipseste. Din 08.11.2026
   * in locul demo-ului viu din iframe (cerut de el: o poza care se deruleaza cand tii mouse-ul pe ea).
   */
  captura: { adresa: string; latime: number; inaltime: number } | null;
  /** Datele demo ale temei (etapa 18): cate sunt si daca incap in planul lui. */
  demo: {
    produse: number;
    bannere: number;
    randuri: number;
    /** Limita de produse a planului; `null` = fara limita sau necitita. */
    limita: number | null;
    /** De ce nu incap; `null` = bifa se poate alege. */
    motivOprit: string | null;
  };
}

/**
 * Pagina „Teme” (etapa 17 din `docs/editor-magazin/PLAN.md`). „Aplică tema” pune tema direct in magazin, cu designul
 * de acum pastrat in Istoric, iar din etapa 18, la cerere, si cu datele demo ale temei; „Pune la loc designul de
 * dinainte” il readuce; „Șterge datele demo” scoate ce a adaugat importul. Toate intreaba intai, cu ce se intampla.
 *
 * Refacuta pe 08.11.2026 (cererea lui: mai moderna, mai multe teme pe rand, carduri premium, fara bulina de culoare,
 * poza care se deruleaza in loc de demo-ul viu, fereastra „Aplică tema” mai premium).
 */
export function TemeClient({ businessId, teme, aplicata, aplicataLa, poatePuneLaLoc, laLocDemoInainte, laLocTemaDupa, dateDemo, areProduseProprii, areCiorna, public: estePublic }: {
  businessId: string;
  teme: TemaPeCard[];
  aplicata: { cheie: string } | null;
  /** Data aplicarii, scrisa pe server (fusul orar al Romaniei). */
  aplicataLa: string | null;
  poatePuneLaLoc: boolean;
  /**
   * Etapa 25.3: tema ale carei date demo revin la „Pune la loc” (`null` = niciuna); `undefined` = versiune de dinainte de
   * 11.11.2026, care readuce doar designul.
   */
  laLocDemoInainte?: string | null;
  /**
   * 14.11.2026: tema dinaintea careia e designul pe care il readuce „Pune la loc” (peste temele doar incercate la rand);
   * `null` = nu se stie, si atunci textele spun doar „de dinainte de temă”.
   */
  laLocTemaDupa: string | null;
  /** Datele demo din magazin acum (etapa 18.4) si tema lor, dupa urma (`null` = necunoscuta); `null` = niciunele. */
  dateDemo: { produse: number; tema: string | null } | null;
  /** Magazinul are produse care nu sunt demo (etapa 25.5): atunci bifa datelor demo porneste OPRITA. */
  areProduseProprii: boolean;
  areCiorna: boolean;
  public: boolean;
}) {
  const router = useRouter();
  const [deAplicat, setDeAplicat] = useState<TemaPeCard | null>(null);
  /*
   * Bifa „Importă și datele demo”: PORNITA la fiecare deschidere a ferestrei (cerut de el, 08.11.2026; pana atunci
   * oprita, „in caz ca vrea”), dar din 11.11.2026 (etapa 25.5) doar la un magazin FARA produse proprii: la unul care vinde
   * deja, un clic grabit punea produse demo pe care clientii le puteau comanda. Cand planul n-o incape (`motivOprit`),
   * comutatorul doar SE VEDE oprit si stins. Ce conteaza e `cuDate && motivOprit === null`, calculat o data in `aplica`.
   */
  const bifaImplicita = !areProduseProprii;
  const [cuDate, setCuDate] = useState(bifaImplicita);
  const [laLoc, setLaLoc] = useState(false);
  const [deSters, setDeSters] = useState(false);
  const [lucreaza, porneste] = useLucru();
  const temaActiva = aplicata ? teme.find((t) => t.cheie === aplicata.cheie) ?? null : null;

  const deschideAplicarea = (t: TemaPeCard) => {
    setCuDate(bifaImplicita);
    setDeAplicat(t);
  };
  const numeTema = (cheie: string | null | undefined) => (cheie ? teme.find((t) => t.cheie === cheie)?.nume ?? null : null);
  const temaDemoAcum = numeTema(dateDemo?.tema);
  // 14.11.2026: „de dinainte de tema Saturn”, nu doar „de temă”: dupa mai multe teme incercate, omul stie ce revine.
  const temaLaLoc = numeTema(laLocTemaDupa);
  const deDinainteDeTema = temaLaLoc ? `de dinainte de tema ${temaLaLoc}` : "de dinainte de temă";

  const aplica = (t: TemaPeCard) => porneste(async () => {
    /*
     * Ce pleaca spre server si ce spune mesajul vin din ACEEASI valoare. Cu `cuDate` singur in mesaj (gasit la
     * recitirea din 09.11), un magazin al carui plan nu incape datele primea tema fara ele, dar citea „cu datele demo”.
     */
    const cuDateDemo = cuDate && t.demo.motivOprit === null;
    const r = await aplicaTema(businessId, t.cheie, cuDateDemo);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    setDeAplicat(null);
    toast.success(cuDateDemo
      ? `Tema ${t.nume} e în magazin, cu datele demo. O reglezi în editor, ca orice design.`
      : `Tema ${t.nume} e în magazin. O reglezi în editor, ca orice design.`);
    router.refresh();
  });

  const stergeDemo = () => porneste(async () => {
    const r = await stergeDateleDemo(businessId);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    setDeSters(false);
    toast.success("Datele demo s-au șters din magazin.");
    router.refresh();
  });

  const puneLaLoc = () => porneste(async () => {
    const r = await puneLaLocDesignulDeDinainte(businessId);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    setLaLoc(false);
    toast.success("Designul de dinainte e din nou în magazin.");
    if ("nota" in r) toast.message(r.nota);
    router.refresh();
  });

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Capul paginii */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Teme</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Un design întreg pentru magazinul tău: antetul, prima pagină, paginile de categorie și de produs, cardul de produs,
            culoarea și fonturile. Produsele și textele tale rămân neatinse.
          </p>
        </div>
      </header>

      {/* Tema din magazin si uneltele ei, intr-o singura caseta */}
      {(temaActiva || poatePuneLaLoc || dateDemo) && (
        <section className="mb-10 overflow-hidden rounded-2xl border border-border bg-surface">
          {temaActiva && (
            <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
              <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border">
                {temaActiva.captura && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={temaActiva.captura.adresa} alt="" className="h-full w-full object-cover object-top" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Tema din magazin</p>
                <p className="text-base font-semibold text-foreground">{temaActiva.nume}</p>
                {aplicataLa && <p className="text-xs text-muted-foreground">Aplicată pe {aplicataLa}.</p>}
              </div>
              <Link href="/dashboard/editor" className={cn(buttonVariants())}>
                <Palette /> Deschide editorul
              </Link>
            </div>
          )}
          {poatePuneLaLoc && (
            <div className={cn("flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5", temaActiva && "border-t border-border")}>
              <RotateCcw className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="min-w-[16rem] flex-1 text-sm text-muted-foreground">
                Designul {deDinainteDeTema} e păstrat în Istoric. Îl pui la loc într-un clic, cu culoarea și fonturile lui.
              </p>
              <Button variant="outline" size="sm" disabled={lucreaza} onClick={() => setLaLoc(true)}>
                Pune la loc designul de dinainte
              </Button>
            </div>
          )}
          {dateDemo && (
            <div className={cn("flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5", (temaActiva || poatePuneLaLoc) && "border-t border-border")}>
              <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="min-w-[16rem] flex-1 text-sm text-muted-foreground">
                În magazin sunt datele demo ale temei{temaDemoAcum ? ` ${temaDemoAcum}` : ""}: {pluralRo(dateDemo.produse, "produs demo", "produse demo")}, cu categoriile,
                bannerele și rândurile lor. Le ștergi într-un clic, când nu mai ai nevoie de ele.
              </p>
              <Button variant="outline" size="sm" disabled={lucreaza} onClick={() => setDeSters(true)}>
                <Trash2 /> Șterge datele demo
              </Button>
            </div>
          )}
        </section>
      )}

      <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4">
        {teme.map((t) => (
          <CardTema key={t.cheie} tema={t} esteAplicata={aplicata?.cheie === t.cheie} lucreaza={lucreaza} onAplica={() => deschideAplicarea(t)} />
        ))}
      </ul>

      {/* „Aplică tema”: captura temei in stanga, ce se intampla si datele demo in dreapta */}
      <Dialog open={deAplicat !== null} onOpenChange={(deschis) => { if (!deschis && !lucreaza) setDeAplicat(null); }}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[860px]">
          {deAplicat && (
            <div className="grid max-h-[calc(100dvh-2rem)] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <div className="relative hidden overflow-hidden bg-muted md:block">
                {deAplicat.captura && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={deAplicat.captura.adresa} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <p className="text-[11px] font-semibold tracking-wider text-white/70 uppercase">Tema</p>
                  <p className="text-2xl font-semibold tracking-tight">{deAplicat.nume}</p>
                </div>
              </div>

              <div className="flex min-h-0 flex-col">
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
                  <DialogHeader className="space-y-1.5">
                    <DialogTitle className="text-xl font-semibold tracking-tight">Aplici tema {deAplicat.nume}?</DialogTitle>
                    <DialogDescription>Tema intră direct în magazin.</DialogDescription>
                  </DialogHeader>

                  <ul className="space-y-2.5 text-sm text-foreground">
                    <Punct>Magazinul primește designul temei: antetul, subsolul, prima pagină, paginile de categorie și de produs, cardul de produs, culoarea principală și fonturile.</Punct>
                    <Punct>Produsele, textele, bannerele, setările și domeniul rămân ale tale.</Punct>
                    <Punct>Designul de acum se păstrează în Istoric. Îl pui la loc oricând, de aici.</Punct>
                    {areCiorna && <Punct>Modificările nepublicate din editor se păstrează și ele în Istoric, ca ciornă.</Punct>}
                    {estePublic && <Punct>Magazinul e vizibil, deci clienții văd tema imediat.</Punct>}
                  </ul>

                  <div className={cn("rounded-xl border border-border bg-muted/40 p-4", deAplicat.demo.motivOprit && "opacity-70")}>
                    <label className={cn("flex items-start gap-3", !deAplicat.demo.motivOprit && "cursor-pointer")}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">Importă și datele demo</span>
                        {deAplicat.demo.motivOprit ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">{deAplicat.demo.motivOprit} Aplici tema fără ele și vezi cum arată în demo.</span>
                        ) : (
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            Ca magazinul să arate ca în demo: {pluralRo(deAplicat.demo.produse, "produs", "produse")} cu categoriile lor,{" "}
                            {pluralRo(deAplicat.demo.bannere, "banner", "bannere")}, {pluralRo(deAplicat.demo.randuri, "rând", "rânduri")} pe prima pagină
                            și textele de exemplu ale temei.
                            {areProduseProprii && " Magazinul tău are deja produse, de aceea pornește oprită."}
                          </span>
                        )}
                      </span>
                      <Switch
                        checked={cuDate && deAplicat.demo.motivOprit === null}
                        onCheckedChange={(v) => setCuDate(v)}
                        disabled={lucreaza || deAplicat.demo.motivOprit !== null}
                        className="mt-0.5"
                      />
                    </label>
                    {cuDate && deAplicat.demo.motivOprit === null && (
                      <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-foreground list-disc pl-5">
                        <li>Se adaugă lângă ale tale, marcate demo; nu se șterge și nu se suprascrie nimic din ce e al tău.</li>
                        {dateDemo && dateDemo.tema !== deAplicat.cheie && (
                          <li>
                            Datele demo de acum{temaDemoAcum ? ` (ale temei ${temaDemoAcum})` : ""} pleacă întâi: în magazin rămân doar cele ale temei {deAplicat.nume}.
                          </li>
                        )}
                        <li>Produsele demo nu pleacă în Google, Meta, marketplace-uri sau newsletter și nu apar în căutările Google.</li>
                        {deAplicat.demo.limita !== null && (
                          <li>Cele {pluralRo(deAplicat.demo.produse)} intră în limita planului tău, de {pluralRo(deAplicat.demo.limita)}, până le ștergi.</li>
                        )}
                        {estePublic && <li>Magazinul e vizibil: clienții văd produsele demo și le pot comanda până le ștergi.</li>}
                        <li>Le ștergi oricând de aici, cu „Șterge datele demo”.</li>
                      </ul>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-4">
                  <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                    <ShieldCheck className="h-3.5 w-3.5" /> Revii oricând la designul de acum.
                  </p>
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" disabled={lucreaza} onClick={() => setDeAplicat(null)}>Renunță</Button>
                    <Button disabled={lucreaza} onClick={() => deAplicat && aplica(deAplicat)}>
                      {lucreaza && <Loader2 className="animate-spin" />} Aplică tema
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={laLoc} onOpenChange={(deschis) => { if (!deschis && !lucreaza) setLaLoc(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pui la loc designul de dinainte?</DialogTitle>
            <DialogDescription>
              Magazinul revine la designul, culoarea și fonturile {deDinainteDeTema}. Ce ai publicat după aplicare rămâne în Istoric.
            </DialogDescription>
          </DialogHeader>
          {laLocDemoInainte === undefined ? (dateDemo && (
            <p className="text-sm text-foreground">
              Bannerele și rândurile demo pleacă odată cu designul, dar produsele și categoriile demo rămân în magazin până le ștergi cu „Șterge datele demo”.
            </p>
          )) : (dateDemo?.tema ?? null) !== laLocDemoInainte && (
            /* Etapa 25.3: versiunile din 11.11.2026 readuc magazinul intocmai, cu datele demo de atunci. */
            <p className="text-sm text-foreground">
              {dateDemo
                ? `Datele demo de acum${temaDemoAcum ? ` (ale temei ${temaDemoAcum})` : ""} pleacă${laLocDemoInainte ? `, iar cele ale temei ${numeTema(laLocDemoInainte) ?? laLocDemoInainte} revin` : ""}.`
                : `Revin și datele demo ale temei ${numeTema(laLocDemoInainte) ?? laLocDemoInainte}, ca înainte.`}
            </p>
          )}
          {areCiorna && (
            <p className="text-sm text-foreground">Ai modificări nepublicate în editor. Publică-le sau renunță la ele, apoi revino aici.</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={lucreaza} onClick={() => setLaLoc(false)}>Renunță</Button>
            <Button disabled={lucreaza || areCiorna} onClick={puneLaLoc}>
              {lucreaza && <Loader2 className="animate-spin" />} Pune la loc
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deSters} onOpenChange={(deschis) => { if (!deschis && !lucreaza) setDeSters(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ștergi datele demo?</DialogTitle>
            <DialogDescription>Iese din magazin doar ce a adăugat importul. Ce ai adăugat sau ai schimbat tu rămâne.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-foreground list-disc pl-5">
            {dateDemo && dateDemo.produse > 0 && <li>{pluralRo(dateDemo.produse, "produs demo", "produse demo")}, definitiv.</li>}
            <li>Categoriile create de import, dacă n-au rămas în ele produse de-ale tale.</li>
            <li>Bannerele și rândurile de produse adăugate pe prima pagină.</li>
            <li>Textele de exemplu ale temei pe care nu le-ai schimbat: cardurile de lângă banner, plăcile de recomandare, mesajul din bara de sus.</li>
            <li>Designul de acum se păstrează în Istoric.</li>
          </ul>
          {areCiorna && (
            <p className="text-sm text-foreground">Ai modificări nepublicate în editor. Publică-le sau renunță la ele, apoi revino aici.</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={lucreaza} onClick={() => setDeSters(false)}>Renunță</Button>
            <Button variant="destructive" disabled={lucreaza || areCiorna} onClick={stergeDemo}>
              {lucreaza && <Loader2 className="animate-spin" />} Șterge datele demo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Un rand din lista ferestrei „Aplică tema”, cu bifa in cerc. */
function Punct({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

/** Cat ramane vizibil din captura in card: inaltimea ferestrei cardului fata de latime (`aspect-[4/3]`). */
const FEREASTRA = 3 / 4;

/**
 * Cardul unei teme: captura primei pagini, care se deruleaza pana jos cat tii mouse-ul pe ea (sau focusul, de la
 * tastatura), numele, descrierea si cele doua actiuni.
 */
function CardTema({ tema: t, esteAplicata, lucreaza, onAplica }: {
  tema: TemaPeCard;
  esteAplicata: boolean;
  lucreaza: boolean;
  onAplica: () => void;
}) {
  // Derularea tine cat pagina: ~3 s pe fiecare „ecran” al cardului, ca o pagina lunga sa nu treaca in fuga.
  const ecrane = t.captura ? Math.max(0, t.captura.inaltime / t.captura.latime - FEREASTRA) / FEREASTRA : 0;
  const durata = `${Math.max(2.5, ecrane * 3).toFixed(1)}s`;
  /*
   * Starea, nu `group-hover`: cu durata scrisa ca clasa arbitrara, Tailwind lasa tranzitia scurta de baza (0,7 s) si
   * poza sarea jos dintr-odata (vazut de el pe 08.11: „sa fie asa de sus in jos”). Stilul scris pe element se aplica sigur.
   */
  const [derulata, setDerulata] = useState(false);
  const stilDerulare: React.CSSProperties = derulata
    ? { top: "100%", transform: "translateY(-100%)", transition: `top ${durata} cubic-bezier(0.45, 0, 0.55, 1), transform ${durata} cubic-bezier(0.45, 0, 0.55, 1)` }
    : { top: 0, transform: "translateY(0)", transition: "top 0.8s cubic-bezier(0.22, 1, 0.36, 1), transform 0.8s cubic-bezier(0.22, 1, 0.36, 1)" };

  return (
    <li className="group/card flex flex-col">
      <a
        href={t.adresaDemo}
        target="_blank"
        rel="noopener noreferrer"
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setDerulata(true); }}
        onPointerLeave={() => setDerulata(false)}
        onFocus={(e) => setDerulata(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setDerulata(false)}
        aria-label={`Vezi demo-ul temei ${t.nume}, într-o filă nouă`}
        className={cn(
          "group/poza relative block aspect-[4/3] overflow-hidden rounded-2xl bg-muted outline-none",
          "shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_-12px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.06] dark:ring-white/10",
          "transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_24px_48px_-20px_rgba(15,23,42,0.35)]",
          "focus-visible:ring-2 focus-visible:ring-primary",
          esteAplicata && "ring-2 ring-primary",
        )}
      >
        {t.captura ? (
          /*
           * Derularea: invelisul pleaca de sus (top 0) pana la `top: 100%` si se trage in sus cu toata inaltimea lui,
           * deci josul pozei ajunge la josul cardului, oricat de lunga ar fi. Inapoi, mai repede.
           */
          <span
            className="absolute inset-x-0 block will-change-transform motion-reduce:transition-none!"
            style={stilDerulare}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={t.captura.adresa}
              width={t.captura.latime}
              height={t.captura.inaltime}
              alt={`Prima pagină a temei ${t.nume}`}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
          </span>
        ) : (
          <span className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{t.nume}</span>
        )}

        {esteAplicata && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm">
            <Check className="h-3 w-3" strokeWidth={3} /> În magazin
          </span>
        )}
        <span className="pointer-events-none absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover/poza:opacity-100 group-focus-visible/poza:opacity-100">
          Vezi demo <ArrowUpRight className="h-3 w-3" />
        </span>
      </a>

      <div className="flex flex-1 flex-col px-0.5 pt-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{t.nume}</h2>
        <p className="mt-1 line-clamp-2 flex-1 text-[13px] leading-relaxed text-muted-foreground" title={t.descriere}>{t.descriere}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={t.adresaDemo} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
            Previzualizare <ArrowUpRight />
          </a>
          {esteAplicata ? (
            <Link href="/dashboard/editor" className={cn(buttonVariants(), "w-full")}>
              <Palette /> Editează
            </Link>
          ) : (
            <Button className="w-full" disabled={lucreaza} onClick={onAplica}>Aplică tema</Button>
          )}
        </div>
      </div>
    </li>
  );
}
