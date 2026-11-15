"use client";

import { useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, BadgeCheck, BellRing, Check, ChevronDown, FileUp, KeyRound, ShieldCheck, ShoppingCart, Undo2,
} from "lucide-react";
import {
  AlegereCarduri, BaraSalvare, CardCifre, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune,
  ZonaDeconectare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/ui/field";
import { secretulEsteSalvat } from "@/lib/integrari/secrete";
import { deconecteazaTbi, salveazaConfigTbi } from "@/lib/actions/tbi.actions";
import { TBI_CONFIG_IMPLICITA, type FormaBannerTbi, type TbiConfig } from "@/lib/tbi/config";
import { RandRateTbi } from "@/components/storefront/RandRateTbi";
import { BannerRateTbi } from "@/components/storefront/BannerRateTbi";
import { VideoRateTbi } from "@/components/storefront/VideoRateTbi";
import { cn } from "@/lib/utils";

/**
 * Panoul tbi bank (plata in rate). Textele sunt pentru COMERCIANT, deci cu diacritice.
 *
 * Asezarea (refacuta 15.11.2026, la cererea proprietarului: „totul la gramada, cu mult text"): antet cu starea si
 * comutatorul principal, apoi doua coloane. In stanga, pasii numerotati, scurti; in dreapta, o coloana care sta pe
 * loc la derulare: lista de configurare, cifrele pe 30 de zile, „cum functioneaza" si ghidul complet din Ajutor.
 * Explicatiile lungi stau in semne de intrebare (`ExplicatieCard`), nu in paragrafe. Salvarea e o bara lipita jos,
 * care apare doar cand exista modificari nesalvate (acelasi tipar ca la Permalink-uri).
 *
 * ⚠ Cheia privata NU coboara niciodata in pagina: dupa salvare campul ramane gol, iar ce se vede e AMPRENTA ei,
 * socotita pe server. Omul o compara cu ce are, fara ca valoarea sa mai circule.
 *
 * ⚠ Orice DECIZIE pe un secret trece prin `secretulEsteSalvat`, nu prin campul gol din formular (lectia din
 * `credentiale-write-only-mascare`): altfel un magazin deja configurat n-ar mai putea salva nici macar un comutator.
 */

export type StareTbiPanou = {
  gata: boolean;
  amprentaPublica: string | null;
  amprentaPrivata: string | null;
  ultimaVeste: string | null;
  ultimaCerere: string | null;
  cereri30: number;
  aprobate30: number;
  respinse30: number;
  deschise30: number;
  /** IP-ul fix al releului (`TBI_PROXY_IP`), daca e pus: tbi il aproba pentru serverul de test. */
  ipDeAprobat: string | null;
};

type Config = TbiConfig & { _completate?: Record<string, boolean> };

const lei = (n: number) => `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(n)} lei`;

function data(iso: string | null): string {
  if (!iso) return "niciodată";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "necunoscut" : d.toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
}

/** Un fisier de cheie, citit ca text. `.pfx` e binar si nu se foloseste aici. */
async function citesteFisier(f: File): Promise<string> {
  if (f.size > 32 * 1024) throw new Error("Fișierul e prea mare pentru o cheie. Alege pub.pem sau priv_key.pem.");
  if (/\.(pfx|p12)$/i.test(f.name)) throw new Error("Fișierele .pfx nu se folosesc aici. Alege fișierul .pem din aceeași arhivă.");
  const text = await f.text();
  if (!text.includes("-----BEGIN")) throw new Error("Fișierul nu pare să fie o cheie (.pem). Alege pub.pem sau priv_key.pem.");
  return text;
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

type StareCheie = "salvata" | "noua" | "lipsa";

/**
 * Cardul unei chei: arata starea (salvata cu amprenta / noua, nesalvata / lipsa), primeste fisierul tras peste el
 * sau ales, iar textul se lipeste doar la cerere. Inlocuieste cele doua campuri mari de text de dinainte.
 */
function CardCheie({
  titlu, sursa, icon: Icon, stare, amprenta, numeFisier, valoare, eroare, nota,
  onText, onFisier, onInlocuieste, onRenunta, onPastreaza,
}: {
  titlu: string;
  sursa: string;
  icon: typeof KeyRound;
  stare: StareCheie;
  amprenta: string | null;
  numeFisier: string | null;
  valoare: string;
  eroare?: string;
  nota?: string;
  onText: (v: string) => void;
  onFisier: (f: File) => void;
  onInlocuieste: () => void;
  onRenunta: () => void;
  /** Doar cand exista o cheie salvata pe care omul a inceput s-o inlocuiasca: o pastreaza pe cea veche. */
  onPastreaza?: () => void;
}) {
  const fisier = useRef<HTMLInputElement>(null);
  const [lipire, setLipire] = useState(false);
  const [peste, setPeste] = useState(false);

  function laCadere(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setPeste(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFisier(f);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setPeste(true); }}
      onDragLeave={() => setPeste(false)}
      onDrop={laCadere}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 transition-colors",
        eroare ? "border-destructive/60" : peste ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{titlu}</p>
          <p className="text-xs text-muted-foreground">{sursa}</p>
        </div>
      </div>

      {stare === "salvata" && !lipire && (
        <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-foreground">
          <Check className="h-3.5 w-3.5 shrink-0 text-success" />
          <span className="min-w-0">Salvată{amprenta && <> · <span className="font-mono">{amprenta}</span></>}</span>
        </div>
      )}
      {stare === "noua" && !lipire && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs text-foreground">
          <FileUp className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 truncate">{numeFisier ? `${numeFisier} citit` : "Text lipit"}: se verifică la salvare</span>
        </div>
      )}
      {stare === "lipsa" && !lipire && (
        <button
          type="button"
          onClick={() => fisier.current?.click()}
          className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <FileUp className="h-4 w-4" />
          <span><span className="font-medium text-foreground">Alege fișierul</span> sau trage-l aici</span>
        </button>
      )}
      {lipire && (
        <Textarea
          value={valoare}
          onChange={(e) => onText(e.target.value)}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          aria-label={titlu}
          className="font-mono text-[11px]"
          placeholder={"-----BEGIN ... KEY-----\n...\n-----END ... KEY-----"}
        />
      )}

      {eroare && <p className="text-xs text-destructive">{eroare}</p>}
      {nota && !eroare && <p className="text-xs text-muted-foreground">{nota}</p>}

      <input ref={fisier} type="file" accept=".pem,.crt,.cer,.key,.txt" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setLipire(false); onFisier(f); } }} />
      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {stare !== "lipsa" && (
          <button type="button" className="font-medium text-foreground hover:underline" onClick={() => fisier.current?.click()}>
            {stare === "salvata" ? "Înlocuiește cu alt fișier" : "Alege alt fișier"}
          </button>
        )}
        <button type="button" className="text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => { if (!lipire && stare === "salvata") onInlocuieste(); setLipire((v) => !v); }}>
          {lipire ? "Gata" : "Lipește textul"}
        </button>
        {stare === "noua" && (
          <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => { setLipire(false); onRenunta(); }}>
            Renunță la ea
          </button>
        )}
        {onPastreaza && stare === "lipsa" && (
          <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => { setLipire(false); onPastreaza(); }}>
            Păstrează cheia salvată
          </button>
        )}
      </div>
    </div>
  );
}

const CUM_FUNCTIONEAZA = [
  { Icon: ShoppingCart, text: "Clientul alege plata în rate și completează cererea pe pagina tbi bank." },
  { Icon: BadgeCheck, text: "La aprobare, comanda devine plătită și confirmată, cu factură dacă o ai automată." },
  { Icon: BellRing, text: "Respinsă sau abandonată: primești o notificare, comanda rămâne neplătită." },
  { Icon: Undo2, text: "Anulezi comanda: cererea încă deschisă se anulează automat și la tbi bank." },
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
  const baza = useMemo<Config>(() => ({ ...TBI_CONFIG_IMPLICITA, ...initialConfig, password: "", cheie_privata: "" }), [initialConfig]);
  const [cfg, setCfg] = useState<Config>(baza);
  const [eroare, setEroare] = useState<{ camp?: keyof TbiConfig; mesaj: string } | null>(null);
  const [inlocuiestePrivata, setInlocuiestePrivata] = useState(false);
  const [fisiere, setFisiere] = useState<{ publica: string | null; privata: string | null }>({ publica: null, privata: null });
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  /*
   * ⚠ Dupa salvare, serverul scrie cheia publica in forma CANONICA, deci textul din formular nu mai seamana cu cel
   * salvat si „ai modificari nesalvate" n-ar mai pleca. Pagina monteaza din nou componenta cand se schimba ce e
   * salvat (`key` din `features/tbi/page.tsx`); pana atunci, bara se ascunde.
   */
  const [tocmaiSalvat, setTocmaiSalvat] = useState(false);

  const parolaSalvata = secretulEsteSalvat(initialConfig, "password");
  const privataSalvata = secretulEsteSalvat(initialConfig, "cheie_privata");
  const configurat = !!initialConfig && (parolaSalvata || !!initialConfig.store_id);

  const comparabil = (c: Config) => {
    const { _completate: _, ...rest } = c;
    void _;
    return JSON.stringify(rest);
  };
  const modificat = comparabil(cfg) !== comparabil(baza) || inlocuiestePrivata;

  function set<K extends keyof Config>(k: K, v: Config[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
    setTocmaiSalvat(false);
    if (eroare?.camp === k || !eroare?.camp) setEroare(null);
  }

  async function incarca(f: File, camp: "cheie_publica_tbi" | "cheie_privata") {
    try {
      const text = await citesteFisier(f);
      set(camp, text);
      setFisiere((x) => ({ ...x, [camp === "cheie_privata" ? "privata" : "publica"]: f.name }));
      if (camp === "cheie_privata") setInlocuiestePrivata(true);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function renunta() {
    setCfg(baza);
    setEroare(null);
    setInlocuiestePrivata(false);
    setFisiere({ publica: null, privata: null });
  }

  function salveaza() {
    setEroare(null);
    if (cfg.enabled) {
      const lipsa: string[] = [];
      if (!cfg.store_id.trim()) lipsa.push("codul magazinului");
      if (!cfg.username.trim()) lipsa.push("utilizatorul");
      if (!cfg.password.trim() && !parolaSalvata) lipsa.push("parola");
      if (!cfg.cheie_publica_tbi.trim()) lipsa.push("cheia publică tbi");
      if (!cfg.cheie_privata.trim() && !privataSalvata) lipsa.push("cheia privată a magazinului");
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
      toast.success(cfg.enabled ? "Salvat. Plata în rate prin tbi bank e activă." : "Configurarea tbi bank a fost salvată.");
      setTocmaiSalvat(true);
      setCfg((c) => ({ ...c, password: "", cheie_privata: "" }));
      setInlocuiestePrivata(false);
      setFisiere({ publica: null, privata: null });
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
      setFisiere({ publica: null, privata: null });
      router.refresh();
    });
  }

  const eroareCamp = (camp: keyof TbiConfig) => (eroare?.camp === camp ? eroare.mesaj : undefined);

  const starePublica: StareCheie = !cfg.cheie_publica_tbi.trim()
    ? "lipsa"
    : cfg.cheie_publica_tbi === baza.cheie_publica_tbi ? "salvata" : "noua";
  const starePrivata: StareCheie = cfg.cheie_privata.trim()
    ? "noua"
    : privataSalvata && !inlocuiestePrivata ? "salvata" : "lipsa";

  const dateleDeAcces = !!(cfg.store_id.trim() && cfg.username.trim() && (cfg.password.trim() || parolaSalvata));
  const cheile = starePublica !== "lipsa" && starePrivata !== "lipsa";

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
          { text: "Cele două chei", facut: cheile },
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
                  text="tbi bank ne trimite singur fiecare schimbare a cererii: în analiză, aprobată, respinsă sau anulată. Adresa se pune automat în fiecare cerere, deci nu ai nimic de configurat la ei." /></>,
                valoare: data(stare.ultimaVeste),
              },
            ]}
          />
        )}
        <CumFunctioneaza id="tbi" puncte={[...CUM_FUNCTIONEAZA]} />
      </>}
    >
          <Sectiune pas={1} titlu="Datele de acces" descriere="Din emailul primit de la echipa de integrare tbi, după semnarea contractului.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Codul magazinului" htmlFor="tbi-store" error={eroareCamp("store_id")}
                ajutor={<ExplicatieCard marime="mic" intrebare="Ce se scrie aici" eticheta="Codul magazinului"
                  text="Codul magazinului tău la tbi, de forma magazin_ro. Același cod se trimite și ca providerCode. Contează literele mari și mici." />}>
                <Input id="tbi-store" value={cfg.store_id} onChange={(e) => set("store_id", e.target.value)} placeholder="magazin_ro" spellCheck={false} />
              </Field>
              <Field label="Utilizator" htmlFor="tbi-user" error={eroareCamp("username")}>
                <Input id="tbi-user" value={cfg.username} onChange={(e) => set("username", e.target.value)} spellCheck={false} autoComplete="off" />
              </Field>
              <Field label="Parolă" htmlFor="tbi-parola" error={eroareCamp("password")}>
                {/* Textul comun („salvat, completeaza doar ca sa schimbi") nu incape pe o coloana de trei: unul scurt. */}
                <Input id="tbi-parola" type="password" value={cfg.password} onChange={(e) => set("password", e.target.value)}
                  placeholder={parolaSalvata ? "••••••••  salvată" : ""} autoComplete="new-password" />
              </Field>
            </div>
          </Sectiune>

          <Sectiune pas={2} titlu="Cheile de criptare" descriere="Două fișiere .pem, din cele două arhive primite de la tbi. Le verificăm la salvare.">
            <div className="grid gap-3 sm:grid-cols-2">
              <CardCheie
                titlu="Cheia publică tbi"
                sursa="pub.pem, din arhiva Chei_SFTL_"
                icon={KeyRound}
                stare={starePublica}
                amprenta={starePublica === "salvata" ? stare.amprentaPublica : null}
                numeFisier={fisiere.publica}
                valoare={cfg.cheie_publica_tbi}
                eroare={eroareCamp("cheie_publica_tbi")}
                onText={(v) => { set("cheie_publica_tbi", v); setFisiere((x) => ({ ...x, publica: null })); }}
                onFisier={(f) => incarca(f, "cheie_publica_tbi")}
                onInlocuieste={() => {}}
                onRenunta={() => { set("cheie_publica_tbi", baza.cheie_publica_tbi); setFisiere((x) => ({ ...x, publica: null })); }}
              />
              <CardCheie
                titlu="Cheia privată a magazinului"
                sursa="priv_key.pem, din arhiva Chei_Comerciant_"
                icon={ShieldCheck}
                stare={starePrivata}
                amprenta={starePrivata === "salvata" ? stare.amprentaPrivata : null}
                numeFisier={fisiere.privata}
                valoare={cfg.cheie_privata}
                eroare={eroareCamp("cheie_privata")}
                nota="Se păstrează criptată, doar pe server, și nu se mai afișează."
                onText={(v) => { set("cheie_privata", v); setInlocuiestePrivata(true); setFisiere((x) => ({ ...x, privata: null })); }}
                onFisier={(f) => incarca(f, "cheie_privata")}
                onInlocuieste={() => setInlocuiestePrivata(true)}
                onRenunta={() => { set("cheie_privata", ""); setInlocuiestePrivata(false); setFisiere((x) => ({ ...x, privata: null })); }}
                onPastreaza={privataSalvata && inlocuiestePrivata ? () => setInlocuiestePrivata(false) : undefined}
              />
            </div>
          </Sectiune>

          <Sectiune pas={3} titlu="Sumele acceptate" descriere="În afara lor, plata în rate nu apare la comandă. tbi bank finanțează între 300 și 30.000 de lei.">
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
            {cfg.sandbox && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                <span>
                  Serverul de test tbi primește doar adresele aprobate de echipa lor.{" "}
                  {stare.ipDeAprobat
                    ? <>Cere-le să aprobe IP-ul <span className="font-mono font-medium text-foreground">{stare.ipDeAprobat}</span>.</>
                    : "Dacă la o comandă de probă serverul nu răspunde, cere-le acces sau fă proba pe real, cu o sumă mică."}
                </span>
              </p>
            )}
            <details className="group rounded-lg border border-border px-3 py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                <span>Setări avansate <span className="text-xs font-normal text-muted-foreground">(doar dacă ți le cere tbi)</span></span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-foreground">Campanie promoțională</p>
                    <p className="text-xs text-muted-foreground">De exemplu rate fără dobândă, confirmate de tbi bank.</p>
                  </div>
                  <Switch checked={cfg.promo} onCheckedChange={(v) => set("promo", v)} aria-label="Campanie promoțională" />
                </div>
                <Field label="Codul de categorie" htmlFor="tbi-cat" error={eroareCamp("categorie")} hint="Un număr întreg. Lasă 1 dacă tbi nu ți-a dat alt cod.">
                  <Input id="tbi-cat" inputMode="numeric" value={cfg.categorie} onChange={(e) => set("categorie", e.target.value)} className="max-w-[140px]" />
                </Field>
              </div>
            </details>
          </Sectiune>

          {configurat && (
            <ZonaDeconectare descriere="Șterge datele de acces și cheile. Cererile deja trimise rămân în comenzi.">
              <ButonDeconectare
                nume="tbi bank"
                cePierzi="Datele de acces și cheile se șterg din Edinio, iar clienții nu mai pot alege plata în rate. Cererile deja trimise rămân în istoricul comenzilor; vestile care mai vin pentru ele nu mai pot fi citite. Ca să revii, pui din nou datele primite de la tbi."
                pending={disconnecting}
                marime="default"
                onConfirma={deconecteaza}
              />
            </ZonaDeconectare>
          )}

          <BaraSalvare
            modificat={modificat && !tocmaiSalvat}
            eroare={eroare?.mesaj ?? null}
            saving={saving}
            onSalveaza={salveaza}
            onRenunta={renunta}
          />
    </PaginaIntegrare>
  );
}
