"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Ban, BarChart3, ChevronDown, ChevronUp, Euro, FileText, Loader2, MapPin, MessageSquare,
  Pause, Plus, Send, Smartphone, Trash2, Users, Wallet, X,
} from "lucide-react";
import {
  creeazaCampanie, deleteSmsTemplate, getSmsoCredit, opresteCampania, previewSmsRecipients, reiaCampania,
  saveSmsTemplate, trimiteLot, trimiteTestCampanie, type ProgresCampanie, type RezumatPublic,
} from "@/lib/actions/sms.actions";
import type { SmsFilters, StatisticiSms } from "@/lib/sms/campanie";
import { costEstimatEurocenti, estimeazaMesaj, ETICHETA_DEZABONARE, MAX_PARTI, textDeTrimis, VARIABILE } from "@/lib/sms/mesaj";
import { formatDate } from "@/lib/utils/format";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { marimeaRandului } from "@/lib/dashboard/cifra-pe-un-rand";
import { useDialogAccesibil } from "./useDialogAccesibil";
import { PreviewTelefon } from "./sms/PreviewTelefon";
import { SertarCampanie } from "./sms/SertarCampanie";
import { DESPRE_STARE } from "./sms/stari";
import { cn } from "@/lib/utils/cn";

/*
  ═══════════════════════════════════════════════════════════════════════════
  SMS MARKETING, REFACUT                                           (27.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el („faci absolut tot”). Aceeasi linie ca celelalte sectiuni refacute:
  cifrele sus, apoi campania in trei pasi (Public, Mesaj, Trimite) cu telefonul
  alaturi, apoi istoricul, cu fisa fiecarei campanii intr-un sertar.

  ⚠ Trimiterea merge pe LOTURI (`trimiteLot`), chemate de aici pe rand, cu progres.
  O fila inchisa la mijloc nu pierde nimic: campania ramane „Se trimite” si se
  continua din istoric, fara ca cineva sa primeasca de doua ori.
*/

const JUDETE = [
  "Municipiul Bucuresti", "Alba", "Arad", "Arges", "Bacau", "Bihor", "Bistrita-Nasaud", "Botosani",
  "Braila", "Brasov", "Buzau", "Calarasi", "Cluj", "Constanta", "Covasna", "Dambovita", "Dolj",
  "Galati", "Giurgiu", "Gorj", "Harghita", "Hunedoara", "Ialomita", "Iasi", "Ilfov", "Maramures",
  "Mehedinti", "Mures", "Neamt", "Olt", "Prahova", "Salaj", "Satu Mare", "Sibiu", "Suceava",
  "Teleorman", "Timis", "Tulcea", "Vaslui", "Valcea", "Vrancea",
];

const STARI_COMANDA = [
  { value: "pending", label: "În așteptare" },
  { value: "confirmed", label: "Confirmată" },
  { value: "processing", label: "În procesare" },
  { value: "shipped", label: "Expediată" },
  { value: "delivered", label: "Livrată" },
  { value: "cancelled", label: "Anulată" },
  { value: "refunded", label: "Rambursată" },
];

export type Campanie = {
  id: string;
  message: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: "in_curs" | "sent" | "partial" | "failed" | "oprita";
  created_at: string;
  segmente: number | null;
  motiv_oprire: string | null;
  cheie: string | null;
  sariti: number;
  finalizata_la: string | null;
};

type Sablon = { id: string; name: string; message: string; created_at: string };

interface Props {
  businessId: string;
  numeMagazin: string;
  /** Numele expeditorului din SMSO, cand e text (altfel se arata numele magazinului). */
  expeditor: string | null;
  initialCampaigns: Campanie[];
  totalCampanii: number;
  initialTemplates: Sablon[];
  statistici: StatisticiSms;
  categorii: string[];
}

const campCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function cheieNoua(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SMSMarketingClient({ businessId, numeMagazin, expeditor, initialCampaigns, totalCampanii, initialTemplates, statistici, categorii }: Props) {
  const [campanii, setCampanii] = useState<Campanie[]>(initialCampaigns);
  const [cateCampanii, setCateCampanii] = useState(totalCampanii);

  /* ─── Creditul, cerut singur la deschidere ─────────────────────────────── */
  const [credit, setCredit] = useState<number | null>(null);
  const [creditEroare, setCreditEroare] = useState<string | null>(null);
  useEffect(() => {
    let anulat = false;
    getSmsoCredit(businessId).then((r) => {
      if (anulat) return;
      if ("credit" in r) setCredit(r.credit); else setCreditEroare(r.error);
    }).catch(() => { if (!anulat) setCreditEroare("Creditul nu s-a putut citi."); });
    return () => { anulat = true; };
  }, [businessId]);

  /* ─── Pasul 1: publicul ──────────────────────────────────────────────── */
  const [filtre, setFiltre] = useState<SmsFilters>({});
  const [judeteDeschise, setJudeteDeschise] = useState(false);
  const [rezumat, setRezumat] = useState<RezumatPublic | null>(null);
  const [calculeaza, startCalcul] = useTransition();
  const cerereRef = useRef(0);
  useEffect(() => {
    // Publicul se recalculeaza singur, la o jumatate de secunda dupa ultima schimbare de filtru.
    const nr = ++cerereRef.current;
    const t = setTimeout(() => {
      startCalcul(async () => {
        try {
          const r = await previewSmsRecipients(businessId, filtre);
          if (nr !== cerereRef.current) return;
          if ("error" in r) { toast.error(r.error); setRezumat(null); } else setRezumat(r);
        } catch {
          if (nr === cerereRef.current) toast.error("Nu am putut calcula destinatarii. Nu s-a trimis nimic; încearcă din nou.");
        }
      });
    }, 500);
    return () => clearTimeout(t);
  }, [businessId, filtre]);

  const cateFiltre = Object.values(filtre).filter((v) => v !== undefined && !(Array.isArray(v) && v.length === 0)).length;
  const seteaza = (p: Partial<SmsFilters>) => setFiltre((f) => {
    const n = { ...f, ...p };
    (Object.keys(n) as (keyof SmsFilters)[]).forEach((k) => {
      const v = n[k];
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete n[k];
    });
    return n;
  });

  /* ─── Pasul 2: mesajul ───────────────────────────────────────────────── */
  const [mesaj, setMesaj] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const est = useMemo(() => estimeazaMesaj(mesaj, numeMagazin), [mesaj, numeMagazin]);
  const destinatari = rezumat?.primesc ?? 0;
  const costEur = costEstimatEurocenti(destinatari, est.parti, statistici.pretParteEurocenti) / 100;
  const creditInsuficient = credit !== null && destinatari > 0 && credit < costEur;

  function insereaza(bucata: string) {
    const el = textRef.current;
    if (!el) { setMesaj((m) => m + bucata); return; }
    const a = el.selectionStart ?? mesaj.length;
    const b = el.selectionEnd ?? mesaj.length;
    const nou = mesaj.slice(0, a) + bucata + mesaj.slice(b);
    setMesaj(nou);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + bucata.length, a + bucata.length); });
  }

  /* Test catre propriul telefon */
  const [telefonTest, setTelefonTest] = useState("");
  const [testeaza, startTest] = useTransition();
  function trimiteTest() {
    startTest(async () => {
      try {
        const r = await trimiteTestCampanie(businessId, mesaj, telefonTest);
        if ("error" in r) toast.error(r.error); else toast.success("Test trimis. Verifică telefonul în câteva secunde.");
      } catch {
        toast.error("Nu am primit răspuns de la server, deci nu știm dacă testul a plecat. Uită-te pe telefon înainte să retrimiți.");
      }
    });
  }

  /* Sabloane */
  const [sabloane, setSabloane] = useState<Sablon[]>(initialTemplates);
  const [sabloaneDeschise, setSabloaneDeschise] = useState(false);
  const [numeSablon, setNumeSablon] = useState("");
  const [salveazaSablon, startSablon] = useTransition();
  function salveazaCaSablon() {
    const nume = numeSablon.trim();
    if (!nume) { toast.error("Dă un nume șablonului."); return; }
    startSablon(async () => {
      try {
        const r = await saveSmsTemplate(businessId, nume, mesaj);
        if ("error" in r) { toast.error(r.error); return; }
        setSabloane((s) => [{ id: r.id, name: nume, message: mesaj.trim(), created_at: new Date().toISOString() }, ...s]);
        setNumeSablon("");
        toast.success("Șablon salvat.");
      } catch {
        toast.error("Nu am primit răspuns de la server. Reîmprospătează pagina și uită-te în listă înainte să salvezi din nou.");
      }
    });
  }
  function stergeSablon(id: string) {
    startSablon(async () => {
      try {
        const r = await deleteSmsTemplate(businessId, id);
        if ("error" in r) { toast.error(r.error); return; }
        setSabloane((s) => s.filter((x) => x.id !== id));
      } catch {
        toast.error("Nu am primit răspuns de la server. Reîmprospătează pagina ca să vezi dacă s-a șters.");
      }
    });
  }

  /* ─── Pasul 3: trimiterea, pe loturi ─────────────────────────────────── */
  const [confirmare, setConfirmare] = useState<null | { cheie: string; acceptaCostul: boolean }>(null);
  const [inLucru, setInLucru] = useState<{ id: string; progres: ProgresCampanie | null } | null>(null);
  const opritDeOm = useRef(false);
  const [sertar, setSertar] = useState<Campanie | null>(null);

  // O fila care se inchide in timpul trimiterii intreaba intai (campania se poate relua, dar omul trebuie sa stie).
  useEffect(() => {
    if (!inLucru) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [inLucru]);

  function actualizeazaRand(id: string, p: ProgresCampanie) {
    setCampanii((cs) => cs.map((c) => (c.id === id
      ? { ...c, status: p.status, sent_count: p.stare.trimis, failed_count: p.stare.esuat + p.stare.necunoscut, recipient_count: p.total || c.recipient_count, motiv_oprire: p.motiv }
      : c)));
  }

  async function ruleaza(id: string) {
    opritDeOm.current = false;
    setInLucru({ id, progres: null });
    try {
      for (;;) {
        const r = await trimiteLot(businessId, id);
        if ("error" in r) { toast.error(r.error); break; }
        setInLucru({ id, progres: r });
        actualizeazaRand(id, r);
        if (r.status !== "in_curs") {
          if (r.status === "oprita") toast.warning(r.motiv ?? "Campania s-a oprit.");
          else toast.success(`Campanie încheiată: ${r.stare.trimis.toLocaleString("ro-RO")} SMS-uri trimise${r.stare.esuat + r.stare.necunoscut > 0 ? `, ${r.stare.esuat + r.stare.necunoscut} eșuate` : ""}.`);
          break;
        }
        if (opritDeOm.current) break;
      }
    } catch {
      toast.error("Legătura cu serverul s-a întrerupt. Campania a rămas „Se trimite”: o continui din istoric și nimeni nu primește de două ori.", { duration: 15000 });
    } finally {
      setInLucru(null);
    }
  }

  const [porneste, startPornire] = useTransition();
  function pornesteCampania() {
    if (!confirmare) return;
    const { cheie, acceptaCostul } = confirmare;
    startPornire(async () => {
      let r: Awaited<ReturnType<typeof creeazaCampanie>>;
      try {
        r = await creeazaCampanie(businessId, { mesaj, filtre, cheie, acceptaCostul });
      } catch {
        /* Aceeasi cheie la reincercare: daca prima cerere a creat-o, a doua o gaseste, nu face alta. */
        toast.error("Nu am primit răspuns de la server. Apasă din nou „Trimite”: dacă a apucat să fie creată, o reluăm pe aceeași, nu facem alta.", { duration: 12000 });
        return;
      }
      if ("error" in r) {
        if (r.cod === "credit") { setConfirmare({ cheie, acceptaCostul: false }); toast.error(`${r.error} Credit: ${r.creditEur?.toFixed(2)} €, cost estimat: ${r.costEstimatEur?.toFixed(2)} €.`); return; }
        toast.error(r.error);
        return;
      }
      setConfirmare(null);
      if (!r.reluata) {
        setCampanii((cs) => [{
          id: r.campaignId, message: mesaj.trim(), recipient_count: r.destinatari, sent_count: 0, failed_count: 0, status: "in_curs",
          created_at: new Date().toISOString(), segmente: est.parti, motiv_oprire: null, cheie, sariti: rezumat?.dezabonati ?? 0, finalizata_la: null,
        }, ...cs]);
        setCateCampanii((n) => n + 1);
        setMesaj("");
      }
      void ruleaza(r.campaignId);
    });
  }

  async function opreste(id: string) {
    opritDeOm.current = true;
    try {
      const r = await opresteCampania(businessId, id);
      if ("error" in r) { toast.error(r.error); return; }
      setCampanii((cs) => cs.map((c) => (c.id === id ? { ...c, status: "oprita", motiv_oprire: "Oprită de tine." } : c)));
      setSertar((s) => (s && s.id === id ? { ...s, status: "oprita", motiv_oprire: "Oprită de tine." } : s));
      toast.success("Campania s-a oprit. O poți relua oricând din istoric.");
    } catch {
      toast.error("Nu am primit răspuns de la server. Reîmprospătează pagina ca să vezi starea campaniei.");
    }
  }

  async function reia(c: Campanie) {
    if (c.status === "oprita") {
      try {
        const r = await reiaCampania(businessId, c.id);
        if ("error" in r) { toast.error(r.error); return; }
      } catch {
        toast.error("Nu am primit răspuns de la server. Încearcă din nou.");
        return;
      }
    }
    setSertar(null);
    setCampanii((cs) => cs.map((x) => (x.id === c.id ? { ...x, status: "in_curs", motiv_oprire: null } : x)));
    void ruleaza(c.id);
  }

  const cutieConfirmare = useDialogAccesibil(!!confirmare, () => setConfirmare(null));
  const poateTrimite = !!mesaj.trim() && destinatari > 0 && est.parti <= MAX_PARTI && !inLucru && !calculeaza;

  /* ─── Cifrele de sus ─────────────────────────────────────────────────── */
  const raportate = statistici.livrate30 + statistici.nelivrate30;
  const rata = raportate > 0 ? Math.round((statistici.livrate30 / raportate) * 100) : null;
  const costLuna = (statistici.lunaCostEurocenti / 100).toFixed(2).replace(".", ",");
  const marime = marimeaRandului([
    statistici.lunaTrimise.toLocaleString("ro-RO"), rata !== null ? `${rata}` : "-",
    { valoare: costLuna, unitate: "€" }, statistici.dezabonati.toLocaleString("ro-RO"),
  ]);

  const exempluPrenume = rezumat?.exemple.find((e) => e.prenume)?.prenume ?? "Ana";
  const inLucruProgres = inLucru?.progres;
  const procent = inLucruProgres && inLucruProgres.total > 0
    ? Math.min(100, Math.round(((inLucruProgres.stare.trimis + inLucruProgres.stare.esuat + inLucruProgres.stare.sarit + inLucruProgres.stare.necunoscut) / inLucruProgres.total) * 100))
    : 0;

  return (
    <>
      {/* Antet */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">SMS Marketing</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Trimite campanii SMS clienților magazinului, prin contul tău SMSO.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-card px-4 py-2.5 ring-1 ring-foreground/10" title={creditEroare ? `Creditul nu s-a putut citi de la SMSO: ${creditEroare}` : "Creditul din contul tău SMSO, în euro"}>
          <Wallet className="h-4 w-4 flex-shrink-0 text-primary" />
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Credit SMSO</p>
            <p className="text-sm font-bold tabular-nums text-foreground">
              {credit !== null ? `${credit.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : creditEroare ? "Indisponibil" : "…"}
            </p>
          </div>
        </div>
      </div>

      {/* Cifre */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CardStatistica marime={marime} icon={Send} label="SMS-uri trimise luna aceasta" value={statistici.lunaTrimise.toLocaleString("ro-RO")}
          explicatie="SMS-urile din campanii acceptate de SMSO în luna curentă (ora României). Testele și mesajele automate nu intră aici." empty={statistici.lunaTrimise === 0} />
        <CardStatistica marime={marime} icon={BarChart3} label="Rata de livrare (30 de zile)" value={rata !== null ? `${rata}` : "-"} unit={rata !== null ? "%" : undefined}
          explicatie="Din SMS-urile pentru care operatorul a trimis raport, câte au ajuns pe telefon. Raportul vine de la SMSO, la câteva minute după trimitere."
          empty={rata === null} subsol={raportate > 0 ? `${statistici.livrate30.toLocaleString("ro-RO")} livrate din ${raportate.toLocaleString("ro-RO")} raportate` : undefined} />
        <CardStatistica marime={marime} icon={Euro} label="Cost luna aceasta" value={costLuna} unit="€"
          explicatie="Costul spus de SMSO pentru SMS-urile din campaniile lunii curente. Pentru campaniile mai vechi decât 27.09.2026 nu avem costul." empty={statistici.lunaCostEurocenti === 0} />
        <CardStatistica marime={marime} icon={Ban} label="Dezabonați" value={statistici.dezabonati.toLocaleString("ro-RO")}
          explicatie="Numerele care au cerut să nu mai primească mesaje de marketing (link de dezabonare, răspuns STOP sau refuz la SMSO). Nu le mai trimitem nimic promoțional." empty={statistici.dezabonati === 0} />
      </div>

      {/* Campania in lucru */}
      {inLucru && (
        <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Se trimite campania</p>
            <button type="button" onClick={() => opreste(inLucru.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Pause className="h-3.5 w-3.5" /> Oprește
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={procent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${procent}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {inLucruProgres
              ? `${inLucruProgres.stare.trimis.toLocaleString("ro-RO")} trimise din ${inLucruProgres.total.toLocaleString("ro-RO")}${inLucruProgres.stare.esuat + inLucruProgres.stare.necunoscut > 0 ? ` · ${inLucruProgres.stare.esuat + inLucruProgres.stare.necunoscut} eșuate` : ""} · poți închide pagina, campania se continuă din istoric`
              : "Pregătim primul lot…"}
          </p>
        </div>
      )}

      {/* Campanie noua */}
      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {/* 1. Publicul */}
          <section className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
            <Pas nr={1} titlu="Cine primește" sub="Clienții direcți ai magazinului. Comenzile din eMAG, Trendyol și celelalte piețe nu intră niciodată: acolo telefonul a fost dat doar pentru livrare." />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Camp eticheta="Comenzi de la">
                <input type="date" value={filtre.date_from ?? ""} onChange={(e) => seteaza({ date_from: e.target.value || undefined })} className={campCls} />
              </Camp>
              <Camp eticheta="Până la">
                <input type="date" value={filtre.date_to ?? ""} onChange={(e) => seteaza({ date_to: e.target.value || undefined })} className={campCls} />
              </Camp>
              <Camp eticheta="Comandă de minimum (lei)">
                <input type="number" min={0} inputMode="decimal" value={filtre.min_amount ?? ""} placeholder="ex: 100"
                  onChange={(e) => seteaza({ min_amount: e.target.value ? Number(e.target.value) : undefined })} className={campCls} />
              </Camp>
              <Camp eticheta="Au cumpărat din categoria">
                <select value={filtre.categorie ?? ""} onChange={(e) => seteaza({ categorie: e.target.value || undefined })} className={campCls}>
                  <option value="">Oricare</option>
                  {categorii.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Camp>
              <Camp eticheta="Clienți fideli: cel puțin">
                <select value={filtre.min_comenzi ?? ""} onChange={(e) => seteaza({ min_comenzi: e.target.value ? Number(e.target.value) : undefined })} className={campCls}>
                  <option value="">Orice număr de comenzi</option>
                  {[2, 3, 5, 10].map((n) => <option key={n} value={n}>{n} comenzi</option>)}
                </select>
              </Camp>
              <Camp eticheta="De recâștigat: nicio comandă de">
                <select value={filtre.inactivi_zile ?? ""} onChange={(e) => seteaza({ inactivi_zile: e.target.value ? Number(e.target.value) : undefined })} className={campCls}>
                  <option value="">Oricând</option>
                  {[30, 60, 90, 180, 365].map((n) => <option key={n} value={n}>{n} de zile</option>)}
                </select>
              </Camp>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Starea comenzii <span className="font-normal">(fără nicio alegere: toate, în afară de anulate și rambursate)</span></p>
              <div className="flex flex-wrap gap-2">
                {STARI_COMANDA.map((s) => {
                  const activ = (filtre.order_statuses ?? []).includes(s.value);
                  return (
                    <button key={s.value} type="button" aria-pressed={activ}
                      onClick={() => seteaza({ order_statuses: activ ? (filtre.order_statuses ?? []).filter((v) => v !== s.value) : [...(filtre.order_statuses ?? []), s.value] })}
                      className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors", activ ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/40")}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <button type="button" onClick={() => setJudeteDeschise((o) => !o)} aria-expanded={judeteDeschise}
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                <MapPin className="h-3.5 w-3.5" /> Județe
                {(filtre.counties?.length ?? 0) > 0 && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{filtre.counties!.length} alese</span>}
                {judeteDeschise ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {judeteDeschise && (
                <div className="mt-2 grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-3">
                  {JUDETE.map((j) => {
                    const activ = (filtre.counties ?? []).includes(j);
                    return (
                      <button key={j} type="button" aria-pressed={activ}
                        onClick={() => seteaza({ counties: activ ? (filtre.counties ?? []).filter((c) => c !== j) : [...(filtre.counties ?? []), j] })}
                        className={cn("rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium", activ ? "border-primary bg-primary text-primary-foreground" : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground")}>
                        {j}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Rezultatul */}
            <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  {!rezumat ? "Calculăm…" : `${destinatari.toLocaleString("ro-RO")} ${destinatari === 1 ? "client primește" : "clienți primesc"}`}
                  {calculeaza && rezumat && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </p>
                {cateFiltre > 0 && (
                  <button type="button" onClick={() => { setFiltre({}); setJudeteDeschise(false); }} className="text-xs text-muted-foreground hover:text-foreground">Șterge filtrele</button>
                )}
              </div>
              {rezumat && (rezumat.dezabonati > 0 || rezumat.invalide > 0) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nu primesc: {[rezumat.dezabonati > 0 && `${rezumat.dezabonati} dezabonați`, rezumat.invalide > 0 && `${rezumat.invalide} numere care nu sunt mobile din România`].filter(Boolean).join(" · ")}
                </p>
              )}
              {rezumat && rezumat.exemple.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {rezumat.exemple.map((e, i) => (
                    <li key={i} className="rounded-md bg-background px-2 py-1 text-[11px] text-muted-foreground ring-1 ring-foreground/5">
                      <span className="font-medium text-foreground">{e.prenume ?? "Fără nume"}</span> · {e.telefon} · {e.comenzi} {e.comenzi === 1 ? "comandă" : "comenzi"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* 2. Mesajul */}
          <section className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
            <Pas nr={2} titlu="Mesajul" sub="Diacriticele se transformă automat (ș devine s). Legătura de dezabonare se adaugă singură la final, dacă nu o pui tu." />
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {VARIABILE.map((v) => (
                <button key={v.cheie} type="button" onClick={() => insereaza(v.cheie)} title={v.descriere}
                  className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground hover:border-primary/40">
                  + {v.cheie}
                </button>
              ))}
              <button type="button" onClick={() => insereaza(ETICHETA_DEZABONARE)} title="Locul unde apare legătura de dezabonare"
                className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground hover:border-primary/40">
                + {ETICHETA_DEZABONARE}
              </button>
              <button type="button" onClick={() => setSabloaneDeschise((o) => !o)} aria-expanded={sabloaneDeschise}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                <FileText className="h-3.5 w-3.5" /> Șabloane{sabloane.length > 0 ? ` (${sabloane.length})` : ""}
                {sabloaneDeschise ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>

            {sabloaneDeschise && (
              <div className="mt-3 rounded-xl border border-border">
                {sabloane.length === 0 ? (
                  <p className="px-4 py-5 text-center text-xs text-muted-foreground">Niciun șablon încă. Scrie un mesaj și salvează-l mai jos.</p>
                ) : (
                  <ul className="max-h-60 divide-y divide-border overflow-y-auto">
                    {sabloane.map((t) => (
                      <li key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                        <button type="button" onClick={() => { setMesaj(t.message); setSabloaneDeschise(false); }} className="min-w-0 flex-1 text-left">
                          <p className="text-sm font-medium text-foreground">{t.name}</p>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.message}</p>
                        </button>
                        <button type="button" onClick={() => stergeSablon(t.id)} disabled={salveazaSablon} aria-label={`Șterge șablonul ${t.name}`}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/5 hover:text-destructive disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <textarea ref={textRef} value={mesaj} onChange={(e) => setMesaj(e.target.value)} rows={5} maxLength={1000}
              aria-label="Textul SMS-ului" placeholder="Ex: Salut {prenume}! Ai 20% reducere la toată colecția de toamnă, doar până duminică, pe {magazin}."
              className={cn(campCls, "mt-3 resize-y")} />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className={cn("tabular-nums", est.parti > 1 ? "font-semibold text-warning" : "text-muted-foreground")}>
                {est.unitati} caractere · {est.parti} SMS {est.parti === 1 ? "pe destinatar" : "pe destinatar (se plătesc toate)"}
              </span>
              {mesaj.trim() && (
                <div className="flex items-center gap-1.5">
                  <input value={numeSablon} onChange={(e) => setNumeSablon(e.target.value)} maxLength={60} placeholder="Nume șablon"
                    aria-label="Numele șablonului" className="w-32 rounded-md border border-border bg-background px-2 py-1 text-xs" />
                  <button type="button" onClick={salveazaCaSablon} disabled={salveazaSablon}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50">
                    <Plus className="h-3 w-3" /> Salvează
                  </button>
                </div>
              )}
            </div>

            {est.parti > 1 && (
              <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                Peste {est.ucs2 ? 70 : 160} de caractere mesajul se împarte în {est.parti} SMS-uri ({est.perParte} caractere fiecare), și fiecare se plătește. Legătura de dezabonare ia cam 40 de caractere.
              </p>
            )}
            {est.faraGsm.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>Caracterele {est.faraGsm.map((c) => `„${c}”`).join(" ")} nu există în alfabetul SMS: mesajul trece pe alt alfabet, cu doar 70 de caractere pe SMS (de peste două ori mai scump).</span>
              </p>
            )}
            {est.parti > MAX_PARTI && <p className="mt-2 text-xs text-destructive">Mesajul e prea lung: cel mult {MAX_PARTI} SMS-uri pe destinatar.</p>}

            <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
              <Camp eticheta="Trimite-mi un test" className="flex-1 min-w-[180px]">
                <input value={telefonTest} onChange={(e) => setTelefonTest(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="07xx xxx xxx" className={campCls} />
              </Camp>
              <button type="button" onClick={trimiteTest} disabled={testeaza || !mesaj.trim() || !telefonTest.trim()}
                className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
                {testeaza ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />} Test
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Testul pleacă exact ca în campanie, cu „Ana” în loc de prenume. E un SMS real, plătit din credit.</p>
          </section>

          {/* 3. Trimiterea */}
          <section className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
            <Pas nr={3} titlu="Trimite" />
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <Rezumat eticheta="Destinatari" valoare={destinatari.toLocaleString("ro-RO")} />
              <Rezumat eticheta="SMS-uri în total" valoare={(destinatari * est.parti).toLocaleString("ro-RO")} />
              <Rezumat eticheta="Cost estimat" valoare={`${costEur.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`} />
            </div>
            {creditInsuficient && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                Creditul tău ({credit?.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €) pare să nu ajungă. Campania se oprește singură când se termină creditul și o poți relua după ce încarci contul.
              </p>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              Estimarea folosește {statistici.pretParteEurocenti ? `prețul tău real de până acum (${statistici.pretParteEurocenti.toFixed(2)} eurocenți pe SMS)` : "prețul public SMSO (3,5 eurocenți pe SMS)"}; costul exact îl spune SMSO.
            </p>
            <button type="button" disabled={!poateTrimite} onClick={() => setConfirmare({ cheie: cheieNoua(), acceptaCostul: false })}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" />
              {destinatari > 0 ? `Trimite la ${destinatari.toLocaleString("ro-RO")} ${destinatari === 1 ? "client" : "clienți"}` : "Trimite campania"}
            </button>
          </section>
        </div>

        {/* Telefonul */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-3 text-center text-xs font-medium text-muted-foreground">Cum arată pe telefon</p>
          <PreviewTelefon mesaj={mesaj} prenume={exempluPrenume} magazin={numeMagazin} expeditor={expeditor} />
          {/* Numai cand mesajul foloseste {prenume}: altfel nota n-are ce explica. */}
          {/\{prenume\}/i.test(mesaj) && (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Exemplu: în loc de {"{prenume}"} am pus „{exempluPrenume}”. Fiecare client primește mesajul cu prenumele lui.
            </p>
          )}
        </div>
      </div>

      {/* Istoric */}
      <section className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Istoric campanii</h2>
            {cateCampanii > campanii.length && <p className="mt-0.5 text-xs text-muted-foreground">Cele mai noi {campanii.length} din {cateCampanii} campanii.</p>}
          </div>
        </div>
        {campanii.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <MessageSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nicio campanie trimisă încă.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {campanii.map((c) => {
              const s = DESPRE_STARE[c.status] ?? DESPRE_STARE.failed;
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => setSertar(c)} className="flex w-full flex-col gap-2 px-5 py-4 text-left transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-4">
                    <p className="line-clamp-2 min-w-0 flex-1 text-sm text-foreground">{c.message}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:flex-nowrap">
                      <EtichetaStare ton={s.ton} marime="mic">{s.text}</EtichetaStare>
                      <span className="tabular-nums"><Users className="mr-1 inline h-3 w-3" />{c.recipient_count.toLocaleString("ro-RO")}</span>
                      <span className="tabular-nums">{c.sent_count.toLocaleString("ro-RO")} trimise</span>
                      {c.failed_count > 0 && <span className="tabular-nums text-destructive">{c.failed_count} eșuate</span>}
                      <span className="whitespace-nowrap">{formatDate(c.created_at)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {sertar && (
        <SertarCampanie businessId={businessId} campanie={campanii.find((c) => c.id === sertar.id) ?? sertar} lucreaza={!!inLucru}
          onClose={() => setSertar(null)} onReia={() => reia(campanii.find((c) => c.id === sertar.id) ?? sertar)} onOpreste={() => opreste(sertar.id)}
          onDuplica={() => { setMesaj(sertar.message); setSertar(null); textRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); toast.success("Mesajul e în editor. Alege publicul și trimite."); }} />
      )}

      {/* Confirmarea */}
      {confirmare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setConfirmare(null)}>
          <div ref={cutieConfirmare} role="dialog" aria-modal="true" aria-labelledby="titlu-confirmare-sms" tabIndex={-1} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h3 id="titlu-confirmare-sms" className="text-base font-semibold text-foreground">Trimiți campania?</h3>
              <button type="button" onClick={() => setConfirmare(null)} aria-label="Închide" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{destinatari.toLocaleString("ro-RO")} clienți</strong> primesc câte {est.parti} SMS
              ({(destinatari * est.parti).toLocaleString("ro-RO")} în total), cost estimat <strong className="text-foreground">{costEur.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</strong>.
              Ce a plecat nu se mai poate retrage.
            </p>
            {/* Textul EXACT care pleaca (exemplu: primul destinatar), nu ce scrie in camp. */}
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/40 p-3 text-xs text-foreground">
              {textDeTrimis(mesaj, { prenume: exempluPrenume, magazin: numeMagazin }).replace(ETICHETA_DEZABONARE, "smso.ro/u/…")}
            </div>
            {creditInsuficient && (
              <label className="flex items-start gap-2 text-xs text-foreground">
                <input type="checkbox" checked={confirmare.acceptaCostul} onChange={(e) => setConfirmare({ ...confirmare, acceptaCostul: e.target.checked })} className="mt-0.5 h-4 w-4 accent-green-600" />
                Știu că creditul pare să nu ajungă. Trimite cât se poate; campania se oprește singură și o reiau după ce încarc.
              </label>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmare(null)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-semibold hover:bg-muted">Renunță</button>
              <button type="button" onClick={pornesteCampania} disabled={porneste || (creditInsuficient && !confirmare.acceptaCostul)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {porneste ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Trimite
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Pas({ nr, titlu, sub }: { nr: number; titlu: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{nr}</span>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{titlu}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function Camp({ eticheta, children, className }: { eticheta: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{eticheta}</span>
      {children}
    </label>
  );
}

function Rezumat({ eticheta, valoare }: { eticheta: string; valoare: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-2 py-3">
      <p className="text-base font-semibold tabular-nums text-foreground">{valoare}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{eticheta}</p>
    </div>
  );
}
