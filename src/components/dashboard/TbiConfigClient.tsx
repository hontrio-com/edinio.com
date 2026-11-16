"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, BadgeCheck, BellRing, Check, CheckCircle, ChevronDown, ChevronRight, Loader2, RefreshCw, ShoppingCart, Undo2,
} from "lucide-react";
import {
  AlegereCarduri, BaraSalvare, CardCifre, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune,
  ZonaDeconectare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Field } from "@/components/ui/field";
import { PLACEHOLDER_SECRET_SALVAT, secretulEsteSalvat } from "@/lib/integrari/secrete";
import {
  deconecteazaTbi, produseleTbiAleMagazinului, salveazaConfigTbi, verificaLegaturaTbi, type VerificareTbi,
} from "@/lib/actions/tbi.actions";
import { intervalulProduselor, TBI_CONFIG_IMPLICITA, type FormaBannerTbi, type ProdusFinantareTbi, type TbiConfig } from "@/lib/tbi/config";
import { RandRateTbi } from "@/components/storefront/RandRateTbi";
import { BannerRateTbi } from "@/components/storefront/BannerRateTbi";
import { VideoRateTbi } from "@/components/storefront/VideoRateTbi";
import { cn } from "@/lib/utils";

/**
 * Panoul tbi bank (plata in rate, API-ul Fusion Pay). Textele sunt pentru COMERCIANT, deci cu diacritice.
 *
 * Asezarea (15.11.2026, la cererea proprietarului: „totul la gramada, cu mult text"): antet cu starea si
 * comutatorul principal, apoi doua coloane. In stanga, pasii numerotati, scurti; in dreapta, o coloana care sta pe
 * loc la derulare: lista de configurare, cifrele pe 30 de zile, „cum functioneaza" si ghidul complet din Ajutor.
 * Explicatiile lungi stau in semne de intrebare (`ExplicatieCard`), nu in paragrafe. Salvarea e o bara lipita jos,
 * care apare doar cand exista modificari nesalvate (acelasi tipar ca la Permalink-uri).
 *
 * 16.11.2026: pasul cu cheile RSA (API-ul vechi) a plecat. Datele de acces sunt cele trei valori din emailul tbi,
 * verificate la banca fara sa se atinga nimic acolo („Verifica legatura"), iar al doilea pas arata produsele de
 * finantare pe care tbi le-a pus magazinului.
 *
 * ⚠ Secretele NU coboara niciodata in pagina: dupa salvare campurile raman goale, cu „(salvat)". Orice DECIZIE pe un
 * secret trece prin `secretulEsteSalvat`, nu prin campul gol din formular (lectia din
 * `credentiale-write-only-mascare`): altfel un magazin deja configurat n-ar mai putea salva nici macar un comutator.
 */

export type StareTbiPanou = {
  gata: boolean;
  ultimaVeste: string | null;
  ultimaCerere: string | null;
  cereri30: number;
  aprobate30: number;
  respinse30: number;
  deschise30: number;
};

type Config = TbiConfig & { _completate?: Record<string, boolean> };

const lei = (n: number) => `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(n)} lei`;
const procent = (n: number) => `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(n)}%`;

function data(iso: string | null): string {
  if (!iso) return "niciodată";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "necunoscut" : d.toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
}

/** Formele mesajului de pe pagina produsului, in ordinea din panou. Previzualizarea foloseste chiar componentele vitrinei. */
const FORME_PE_PRODUS: { forma: FormaBannerTbi; titlu: string; text: string; legenda: string }[] = [
  {
    forma: "rand",
    titlu: "Rând discret",
    text: "Un rând mic, sub butonul de comandă.",
    legenda: "Așa apare pe pagina produsului, sub butonul de comandă.",
  },
  {
    forma: "banner",
    titlu: "Banner",
    text: "Card cu sigla tbi bank și cei trei pași.",
    legenda: "Cardul rămâne deschis la culoare și pe temele închise, ca sigla tbi bank să se vadă.",
  },
  {
    forma: "video",
    titlu: "Banner video",
    text: "Același card, cu un clip cu cumpărături.",
    legenda: "Clipul, fără sonor, se încarcă doar când bannerul ajunge în ecran. Cu mișcare redusă rămâne pe primul cadru.",
  },
  {
    forma: "ascuns",
    titlu: "Nimic",
    text: "Plata în rate apare doar la comandă.",
    legenda: "Sub butonul de comandă nu apare nimic despre plata în rate.",
  },
];

/** Schita mica din cardul fiecarei forme: butonul de comanda (gri) si, sub el, forma aleasa. */
function SchitaForma({ forma }: { forma: FormaBannerTbi }) {
  return (
    <div aria-hidden="true" className="flex h-16 w-full flex-col justify-center gap-1.5 rounded-lg bg-muted/60 px-3">
      <span className="h-2.5 w-full rounded-[3px] bg-foreground/70" />
      {forma === "rand" && <span className="mx-auto h-1.5 w-1/2 rounded-full bg-foreground/20" />}
      {forma === "banner" && (
        <span className="flex h-5 w-full items-center gap-1 rounded-[4px] bg-background px-1 ring-1 ring-foreground/15">
          <span className="h-2 w-3 rounded-[2px] bg-[#FF6600]" />
          <span className="h-1 flex-1 rounded-full bg-foreground/20" />
        </span>
      )}
      {forma === "video" && (
        <span className="flex h-5 w-full items-center gap-1 rounded-[4px] bg-background p-0.5 pl-1 ring-1 ring-foreground/15">
          <span className="h-2 w-3 rounded-[2px] bg-[#FF6600]" />
          <span className="h-1 flex-1 rounded-full bg-foreground/20" />
          <span className="h-full w-5 rounded-[3px] bg-[#FF6600]/80" />
        </span>
      )}
      {forma === "ascuns" && <span className="h-5 w-full rounded-[4px] border border-dashed border-foreground/20" />}
    </div>
  );
}

/**
 * Perioadele unui produs, scrise scurt: „6 luni”, „între 6 și 12 luni” (sir continuu), „3, 6 și 12 luni”.
 */
function perioadele(luni: number[]): string {
  const l = [...new Set(luni)].sort((a, b) => a - b);
  if (l.length === 1) return `${l[0]} ${l[0] === 1 ? "lună" : "luni"}`;
  const continuu = l.every((x, i) => i === 0 || x === l[i - 1] + 1);
  if (continuu && l.length > 2) return `între ${l[0]} și ${l[l.length - 1]} luni`;
  return `${l.slice(0, -1).join(", ")} și ${l[l.length - 1]} luni`;
}

/**
 * Produsele de finantare ale magazinului, cum le-a pus tbi in contract.
 *
 * ⚠ tbi intoarce cate un produs pe FIECARE perioada (masurat pe serverul lor de test: „Promo 0” de sapte ori,
 * de la 6 la 12 luni, cu aceeasi dobanda si aceleasi sume). Se strang pe un rand cele care difera doar prin
 * perioada, altfel lista ar fi avut zeci de randuri aproape identice.
 */
function ListaProduse({ produse }: { produse: ProdusFinantareTbi[] }) {
  if (produse.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
        tbi bank nu are încă niciun produs de finanțare pentru magazinul tău. Cere-le echipei tbi să le configureze.
      </p>
    );
  }
  const grupuri = new Map<string, { p: ProdusFinantareTbi; luni: number[] }>();
  for (const p of produse) {
    const cheie = [p.nume, p.dobanda, p.comision, p.sumaMin, p.sumaMax].join("|");
    const g = grupuri.get(cheie);
    if (g) g.luni.push(p.luni);
    else grupuri.set(cheie, { p, luni: [p.luni] });
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {[...grupuri.entries()].map(([cheie, { p, luni }]) => (
        <li key={cheie} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3.5 py-2.5">
          <span className="text-sm font-medium text-foreground">{p.nume || `Produsul ${p.id}`}</span>
          <span className="text-xs text-muted-foreground">
            {perioadele(luni)} · dobândă {procent(p.dobanda)}
            {p.comision > 0 && <> · comision de analiză {lei(p.comision)}</>}
            {" · "}comenzi între {lei(p.sumaMin)} și {lei(p.sumaMax)}
          </span>
        </li>
      ))}
    </ul>
  );
}

const CUM_FUNCTIONEAZA = [
  { Icon: ShoppingCart, text: "Clientul alege plata în rate, iar pe pagina tbi bank își alege numărul de rate și completează cererea." },
  { Icon: BadgeCheck, text: "La aprobare, comanda devine plătită și confirmată, cu factură dacă o ai automată." },
  { Icon: BellRing, text: "Respinsă sau abandonată: primești o notificare, comanda rămâne neplătită." },
  { Icon: Undo2, text: "Anulezi comanda: cererea încă deschisă se anulează automat și la tbi bank. După aprobare, banii se întorc prin rambursare, din pagina comenzii." },
] as const;

export default function TbiConfigClient({
  businessId,
  initialConfig,
  stare,
}: {
  businessId: string;
  initialConfig: Config | null;
  stare: StareTbiPanou;
}) {
  const router = useRouter();
  /* Starea salvata, fara secrete: fata de ea se masoara „ai modificari nesalvate". */
  const baza = useMemo<Config>(() => ({ ...TBI_CONFIG_IMPLICITA, ...initialConfig, reseller_key: "", cheie_criptare: "" }), [initialConfig]);
  const [cfg, setCfg] = useState<Config>(baza);
  const [eroare, setEroare] = useState<{ camp?: keyof TbiConfig; mesaj: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [verificand, startVerificare] = useTransition();
  const cheieSalvata = secretulEsteSalvat(initialConfig, "reseller_key");
  const criptareSalvata = secretulEsteSalvat(initialConfig, "cheie_criptare");
  const configurat = !!initialConfig && !!initialConfig.reseller_code && cheieSalvata;

  const [verificare, setVerificare] = useState<VerificareTbi | null>(null);
  const [produse, setProduse] = useState<ProdusFinantareTbi[] | null>(null);
  const [eroareProduse, setEroareProduse] = useState<string | null>(null);
  /* Porneste „se incarca" chiar de la montare, la un magazin configurat: efectul doar cere, nu seteaza nimic pe loc. */
  const [incarcaProduse, setIncarcaProduse] = useState(configurat);

  function citesteProdusele(viu: () => boolean = () => true) {
    produseleTbiAleMagazinului(businessId)
      .then((r) => {
        if (!viu()) return;
        setProduse(r.produse);
        setEroareProduse(r.produse ? null : r.mesaj);
      })
      .catch(() => { if (viu()) setEroareProduse("Nu am primit răspuns de la server."); })
      .finally(() => { if (viu()) setIncarcaProduse(false); });
  }
  /* Butonul „Citeste din nou de la tbi". */
  function cereProdusele() {
    setIncarcaProduse(true);
    setEroareProduse(null);
    citesteProdusele();
  }
  /* Produsele de finantare se cer dupa montare (vezi `features/tbi/page.tsx`), numai pentru un magazin configurat. */
  useEffect(() => {
    if (!configurat) return;
    let montat = true;
    citesteProdusele(() => montat);
    return () => { montat = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const comparabil = (c: Config) => {
    const { _completate: _, ...rest } = c;
    void _;
    return JSON.stringify(rest);
  };
  const modificat = comparabil(cfg) !== comparabil(baza);

  function set<K extends keyof Config>(k: K, v: Config[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
    if (k === "reseller_code" || k === "reseller_key" || k === "cheie_criptare" || k === "sandbox") setVerificare(null);
    if (eroare?.camp === k || !eroare?.camp) setEroare(null);
  }

  function renunta() {
    setCfg(baza);
    setEroare(null);
    setVerificare(null);
  }

  function verifica() {
    setVerificare(null);
    startVerificare(async () => {
      try {
        const r = await verificaLegaturaTbi(businessId, {
          sandbox: cfg.sandbox, reseller_code: cfg.reseller_code, reseller_key: cfg.reseller_key, cheie_criptare: cfg.cheie_criptare,
        });
        setVerificare(r);
        if (r.fel === "buna") { setProduse(r.produse); setEroareProduse(null); }
      } catch {
        setVerificare({ fel: "necunoscut", mesaj: "Nu am primit răspuns de la server. Reîncearcă." });
      }
    });
  }

  function salveaza() {
    setEroare(null);
    if (cfg.enabled) {
      const lipsa: string[] = [];
      if (!cfg.reseller_code.trim()) lipsa.push("codul de reseller");
      if (!cfg.reseller_key.trim() && !cheieSalvata) lipsa.push("cheia de reseller");
      if (!cfg.cheie_criptare.trim() && !criptareSalvata) lipsa.push("cheia de criptare");
      if (lipsa.length) { setEroare({ mesaj: `Ca să activezi plata în rate lipsește: ${lipsa.join(", ")}.` }); return; }
    }
    startSave(async () => {
      let r: Awaited<ReturnType<typeof salveazaConfigTbi>>;
      try {
        const { _completate: _, ...deTrimis } = cfg;
        void _;
        r = await salveazaConfigTbi(businessId, deTrimis);
      } catch {
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă s-a salvat configurarea tbi bank. "
          + "Reîmprospătează pagina ca să vezi cum a rămas, înainte să salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if (!r.success) {
        setEroare({ camp: r.camp, mesaj: r.error });
        toast.error(r.error, { duration: 10000 });
        return;
      }
      if (r.avertisment) toast.warning(r.avertisment, { duration: 12000 });
      else toast.success(cfg.enabled ? "Salvat. Plata în rate prin tbi bank e activă." : "Configurarea tbi bank a fost salvată.");
      if (r.produse) { setProduse(r.produse); setEroareProduse(null); setVerificare({ fel: "buna", produse: r.produse }); }
      setCfg((c) => ({ ...c, reseller_key: "", cheie_criptare: "" }));
      router.refresh();
    });
  }

  function deconecteaza() {
    startDisconnect(async () => {
      let r: Awaited<ReturnType<typeof deconecteazaTbi>>;
      try {
        r = await deconecteazaTbi(businessId);
      } catch {
        toast.error("Nu am primit răspuns de la server. Reîmprospătează pagina și verifică dacă tbi bank mai apare conectat.", { duration: 12000 });
        router.refresh();
        return;
      }
      if (!r.success) { toast.error(r.error ?? "Eroare la ștergere"); return; }
      toast.success("tbi bank a fost deconectat.");
      setCfg({ ...TBI_CONFIG_IMPLICITA });
      setProduse(null);
      setVerificare(null);
      router.refresh();
    });
  }

  const eroareCamp = (camp: keyof TbiConfig) => (eroare?.camp === camp ? eroare.mesaj : undefined);

  const dateleDeAcces = !!(cfg.reseller_code.trim() && (cfg.reseller_key.trim() || cheieSalvata) && (cfg.cheie_criptare.trim() || criptareSalvata));
  const legaturaBuna = verificare?.fel === "buna" || (!verificare && configurat && !!produse);
  const interval = produse ? intervalulProduselor(produse) : null;
  const limiteleDifera = !!interval && (cfg.suma_minima !== interval.min || cfg.suma_maxima !== interval.max);

  /* Limitele de acum din formular (se schimba odata cu campurile), nu cele salvate. */
  const intreLimite = Number.isFinite(cfg.suma_minima) && Number.isFinite(cfg.suma_maxima) && cfg.suma_minima <= cfg.suma_maxima
    ? `între ${lei(cfg.suma_minima)} și ${lei(cfg.suma_maxima)}`
    : "între suma minimă și cea maximă";

  const stariAntet: StareAntet[] = [
    !configurat ? { ton: "neutru", text: "Neconfigurată" } : stare.gata ? { ton: "bun", text: "Activă" } : { ton: "neutru", text: "Oprită" },
    ...(configurat ? [{ ton: initialConfig?.sandbox ? "asteptare" : "info", text: initialConfig?.sandbox ? "Mod test" : "Credite reale" } satisfies StareAntet] : []),
  ];

  return (
    <PaginaIntegrare
      id="tbi"
      titlu="Plată în rate"
      descriere="Clientul completează cererea de credit online, iar comanda se confirmă la aprobare."
      stari={stariAntet}
      actiune={<ComutatorPrincipal eticheta="Plata în rate la comandă" activ={cfg.enabled} onChange={(v) => set("enabled", v)}
        ariaLabel="Activează plata în rate prin tbi bank" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Datele de acces", facut: dateleDeAcces },
          { text: "Legătura cu tbi verificată", facut: legaturaBuna },
          { text: "Plata în rate activă", facut: stare.gata },
        ]} />
        {configurat && (
          <CardCifre
            titlu="Ultimele 30 de zile"
            cifre={[
              { eticheta: "Cereri", valoare: stare.cereri30 },
              { eticheta: "Aprobate", valoare: stare.aprobate30 },
              { eticheta: "Respinse", valoare: stare.respinse30 },
              { eticheta: "În lucru", valoare: stare.deschise30 },
            ]}
            randuri={[
              { eticheta: "Ultima cerere", valoare: data(stare.ultimaCerere) },
              {
                eticheta: <>Ultima veste de la tbi<ExplicatieCard marime="mic" intrebare="Ce înseamnă" eticheta="Ultima veste de la tbi"
                  text="tbi bank ne trimite singur fiecare schimbare a cererii: în analiză, aprobată, respinsă sau anulată. Adresa se pune automat în fiecare cerere, deci nu ai nimic de configurat la ei. Dacă o veste nu ajunge, o cerere deschisă se verifică singură la tbi, din oră în oră." /></>,
                valoare: data(stare.ultimaVeste),
              },
            ]}
          />
        )}
        <CumFunctioneaza id="tbi" puncte={[...CUM_FUNCTIONEAZA]} />
      </>}
    >
          <Sectiune pas={1} titlu="Datele de acces" descriere="Cele trei valori din emailul primit de la tbi bank după semnarea contractului (Fusion Pay).">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Cod reseller" htmlFor="tbi-cod" error={eroareCamp("reseller_code")}
                ajutor={<ExplicatieCard marime="mic" intrebare="Ce se scrie aici" eticheta="Cod reseller"
                  text="În email apare ca reseller_code, de forma magazin_ro. Contează literele mari și mici." />}>
                <Input id="tbi-cod" value={cfg.reseller_code} onChange={(e) => set("reseller_code", e.target.value)} placeholder="magazin_ro" spellCheck={false} autoComplete="off" />
              </Field>
              <Field label="Cheie reseller" htmlFor="tbi-cheie" error={eroareCamp("reseller_key")}
                ajutor={<ExplicatieCard marime="mic" intrebare="Ce se scrie aici" eticheta="Cheie reseller"
                  text="În email apare ca reseller_key. Se păstrează criptată și nu se mai afișează după salvare." />}>
                <Input id="tbi-cheie" type="password" value={cfg.reseller_key} onChange={(e) => set("reseller_key", e.target.value)}
                  placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : ""} autoComplete="new-password" spellCheck={false} />
              </Field>
              <Field label="Cheie de criptare" htmlFor="tbi-criptare" error={eroareCamp("cheie_criptare")}
                ajutor={<ExplicatieCard marime="mic" intrebare="Ce se scrie aici" eticheta="Cheie de criptare"
                  text="În email apare ca encryption key: un șir lung de litere, cifre și semne. Copiaz-o întreagă, fără spații. Cu ea se criptează cererile și se citesc veștile băncii; se păstrează criptată." />}>
                <Input id="tbi-criptare" type="password" value={cfg.cheie_criptare} onChange={(e) => set("cheie_criptare", e.target.value)}
                  placeholder={criptareSalvata ? PLACEHOLDER_SECRET_SALVAT : ""} autoComplete="new-password" spellCheck={false} />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={verifica} disabled={verificand || !dateleDeAcces}>
                {verificand ? <Loader2 className="animate-spin" /> : <ChevronRight />}
                {verificand ? "Se verifică..." : "Verifică legătura"}
              </Button>
              <span className="text-xs text-muted-foreground">Nu salvează nimic și nu trimite nicio cerere de credit.</span>
            </div>

            {verificare?.fel === "buna" && (
              <Callout variant="success" icon={CheckCircle} title="Legătura cu tbi bank e bună">
                Codul, cheia de reseller și cheia de criptare se potrivesc{cfg.sandbox ? ", pe serverul de test" : ", pe serverul real"}.
                {modificat && " Salvează ca să le păstrezi."}
              </Callout>
            )}
            {verificare && verificare.fel !== "buna" && (
              <Callout variant={verificare.fel === "necunoscut" ? "warning" : "danger"} icon={AlertTriangle}
                title={verificare.fel === "credentiale" ? "Codul sau cheia de reseller nu sunt bune"
                  : verificare.fel === "cheie" ? "Cheia de criptare nu se potrivește" : "Nu am putut verifica"}>
                {verificare.mesaj}
                {verificare.fel === "credentiale" && " Verifică și mediul ales la pasul 5: datele de test nu merg pe serverul real, și invers."}
              </Callout>
            )}
          </Sectiune>

          <Sectiune pas={2} titlu="Produsele tale de finanțare"
            descriere="Ce ți-a pus tbi bank în contract: perioadele, dobânda și sumele. Clientul alege dintre ele pe pagina tbi.">
            {!configurat && !produse && (
              <p className="text-sm text-muted-foreground">Apar aici după ce salvezi datele de acces sau apeși „Verifică legătura”.</p>
            )}
            {incarcaProduse && !produse && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Se citesc de la tbi bank...</p>
            )}
            {eroareProduse && !produse && !incarcaProduse && (
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>Nu am putut citi produsele de la tbi bank: {eroareProduse}</span>
              </p>
            )}
            {produse && <ListaProduse produse={produse} />}
            {configurat && (
              <div>
                <Button type="button" variant="ghost" size="sm" onClick={cereProdusele} disabled={incarcaProduse}>
                  <RefreshCw className={cn(incarcaProduse && "animate-spin")} />
                  Citește din nou de la tbi
                </Button>
              </div>
            )}
          </Sectiune>

          <Sectiune pas={3} titlu="Sumele acceptate"
            descriere={interval
              ? <>În afara lor, plata în rate nu apare la comandă. Produsele tale tbi acoperă comenzi între {lei(interval.min)} și {lei(interval.max)}.</>
              : "În afara lor, plata în rate nu apare la comandă. Fusion Pay finanțează între 100 și 65.000 de lei, după produsele din contract."}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Suma minimă a comenzii" htmlFor="tbi-min" error={eroareCamp("suma_minima")}>
                <InputGroup>
                  <InputGroupInput id="tbi-min" type="number" min={0} step="0.01" value={Number.isFinite(cfg.suma_minima) ? cfg.suma_minima : ""}
                    onChange={(e) => set("suma_minima", e.target.value === "" ? Number.NaN : Number(e.target.value))} />
                  <InputGroupAddon align="inline-end"><InputGroupText>lei</InputGroupText></InputGroupAddon>
                </InputGroup>
              </Field>
              <Field label="Suma maximă a comenzii" htmlFor="tbi-max" error={eroareCamp("suma_maxima")}>
                <InputGroup>
                  <InputGroupInput id="tbi-max" type="number" min={1} step="0.01" value={Number.isFinite(cfg.suma_maxima) ? cfg.suma_maxima : ""}
                    onChange={(e) => set("suma_maxima", e.target.value === "" ? Number.NaN : Number(e.target.value))} />
                  <InputGroupAddon align="inline-end"><InputGroupText>lei</InputGroupText></InputGroupAddon>
                </InputGroup>
              </Field>
            </div>
            {interval && limiteleDifera && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                {(cfg.suma_minima < interval.min || cfg.suma_maxima > interval.max) && (
                  <span className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                    Peste limitele produselor tale, tbi bank refuză cererea după ce clientul a plasat comanda.
                  </span>
                )}
                <button type="button" className="font-medium text-foreground hover:underline"
                  onClick={() => { set("suma_minima", interval.min); set("suma_maxima", interval.max); }}>
                  Folosește limitele tbi ({lei(interval.min)} și {lei(interval.max)})
                </button>
              </div>
            )}
          </Sectiune>

          <Sectiune pas={4} titlu="Pe pagina produsului" descriere={<>Sub butonul de comandă, la produsele cu prețul {intreLimite}.</>}>
            <fieldset>
              <legend className="sr-only">Ce apare pe pagina produsului</legend>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {FORME_PE_PRODUS.map((f) => {
                  const ales = cfg.banner_produs === f.forma;
                  return (
                    <label
                      key={f.forma}
                      className={cn(
                        "relative flex cursor-pointer flex-col gap-2.5 rounded-xl border p-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        ales ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                      )}
                    >
                      <input type="radio" name="tbi-banner-produs" value={f.forma} checked={ales}
                        onChange={() => set("banner_produs", f.forma)} className="sr-only" />
                      <SchitaForma forma={f.forma} />
                      <span className="px-0.5">
                        <span className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                          {f.titlu}
                          <span aria-hidden="true" className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                            ales ? "bg-primary text-white" : "ring-1 ring-inset ring-foreground/25",
                          )}>
                            {ales && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{f.text}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="-mx-1.5 rounded-xl border border-dashed border-border bg-muted/30 px-2 py-4 sm:mx-0 sm:px-4 sm:py-5" aria-hidden="true">
              <div className="mx-auto max-w-[420px] space-y-2.5">
                <div className="mx-auto h-2.5 w-20 rounded-full bg-foreground/15" />
                <div className="h-9 rounded-md bg-foreground/80" />
                {cfg.banner_produs === "rand" && <RandRateTbi />}
                {cfg.banner_produs === "banner" && <BannerRateTbi />}
                {cfg.banner_produs === "video" && <VideoRateTbi />}
              </div>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                {FORME_PE_PRODUS.find((f) => f.forma === cfg.banner_produs)?.legenda}
              </p>
            </div>
          </Sectiune>

          <Sectiune pas={5} titlu="Mediul de lucru">
            <AlegereCarduri
              eticheta="Mediul de lucru"
              valoare={cfg.sandbox}
              onChange={(v) => set("sandbox", v)}
              optiuni={[
                { valoare: true, titlu: "Test", text: "Serverul de test tbi. Nu se acordă credite reale.", avertizare: true },
                { valoare: false, titlu: "Real", text: "Clienții primesc credite reale." },
              ]}
            />
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
              <span>Datele din emailul tbi sunt pentru un singur mediu. Cele pentru credite reale nu merg pe serverul de test, și invers: „Verifică legătura” îți spune pe loc.</span>
            </p>
            <details className="group rounded-lg border border-border px-3 py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                <span>Setări avansate <span className="text-xs font-normal text-muted-foreground">(doar dacă ți le cere tbi)</span></span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-4">
                <Field label="Codul de categorie" htmlFor="tbi-cat" error={eroareCamp("categorie")} hint="Un număr întreg, trimis la fiecare produs din cerere. Lasă 1 dacă tbi nu ți-a dat alt cod.">
                  <Input id="tbi-cat" inputMode="numeric" value={cfg.categorie} onChange={(e) => set("categorie", e.target.value)} className="max-w-[140px]" />
                </Field>
              </div>
            </details>
          </Sectiune>

          {configurat && (
            <ZonaDeconectare descriere="Șterge datele de acces. Cererile deja trimise rămân în comenzi.">
              <ButonDeconectare
                nume="tbi bank"
                cePierzi="Codul, cheia de reseller și cheia de criptare se șterg din Edinio, iar clienții nu mai pot alege plata în rate. Cererile deja trimise rămân în istoricul comenzilor; veștile care mai vin pentru ele nu mai pot fi citite. Ca să revii, pui din nou datele primite de la tbi."
                pending={disconnecting}
                marime="default"
                onConfirma={deconecteaza}
              />
            </ZonaDeconectare>
          )}

          <BaraSalvare
            modificat={modificat}
            eroare={eroare?.mesaj ?? null}
            saving={saving}
            onSalveaza={salveaza}
            onRenunta={renunta}
          />
    </PaginaIntegrare>
  );
}
