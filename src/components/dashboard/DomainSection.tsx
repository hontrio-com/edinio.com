"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { OPTIUNI_TLD } from "@/lib/domains/preturi";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Globe, Loader2, Copy, Check, X,
  AlertCircle, AlertTriangle, ShoppingCart, ExternalLink, Clock,
  CheckCircle2, XCircle, Search, RefreshCw, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

type DomainRow = {
  id: string;
  domain: string;
  status: string;
  expiry_date: string | null;
  auto_renew: boolean;
  source: string;
  created_at: string;
};

type DomainOrder = {
  id: string;
  domain: string;
  tld: string;
  period: number;
  total_price: number;
  status: string;
  created_at: string;
};

type EntityType = "pf" | "pj";

/**
 * Ce intoarce `/api/domains/lookup` pentru fiecare TLD. Ruta are TREI verdicte,
 * nu doua: `necunoscut` inseamna „registrul nu ne-a raspuns clar" (timeout WHOIS,
 * limitare de rata la ROTLD), NU „indisponibil" si nici „inca n-am cerut".
 * Textul gata scris vine in `mesaj` si trebuie aratat ca atare.
 */
type StareDisponibilitate = {
  available: boolean | null;
  stare: "liber" | "ocupat" | "necunoscut";
  mesaj?: string;
};

type ContactForm = {
  entityType: EntityType;
  fullname: string;      // Persoana fizica: nume complet
  cnp: string;           // Persoana fizica
  cui: string;           // Persoana juridica
  companyname: string;   // Persoana juridica: denumire firma
  email: string;
  phonenumber: string;
  address1: string;
  city: string;
  state: string;
  postcode: string;
};

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  businessId: string | null;
  businessName: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  profileFullName: string;
  email: string;
  initialCustomDomain: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 " +
  "focus:ring-primary/20 transition-colors";

function splitName(fullName: string): [string, string] {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return [parts[0], parts[0]];
  return [parts[0], parts.slice(1).join(" ")];
}

// Extrage eticheta domeniului din ce tasteaza utilizatorul. Scoate un TLD tastat
// (.ro/.com/...) INAINTE de a elimina punctele, ca "suplio.ro" si "suplio" sa dea
// amandoua eticheta "suplio" (altfel "suplio.ro" devenea "suplioro").
function cleanDomainLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/\.[a-z]{2,}$/, "")   // scoate TLD-ul tastat, daca exista
    .replace(/[^a-z0-9-]/g, "");    // apoi curata restul caracterelor nepermise
}

// ─── Starea domeniului, asa cum o trimite /api/domains/status ─────────────────

type Verdict = true | false | null;
type MetodaConectare = "nameservere" | "inregistrari";

/**
 * Oglinda campurilor din `DomainStatus` (src/lib/vercel.ts) pe care le citeste
 * ecranul. Tipul nu se importa de acolo fiindca modulul acela e cod de server,
 * cu jetoanele platformei in el.
 *
 * `Verdict` are TREI stari, si diferenta conteaza: `null` inseamna „nu stim",
 * niciodata „e rau". Interfata nu are voie sa traga concluzii dintr-un `null`.
 */
type StareDomeniu = {
  zone: Verdict;
  inProject: Verdict;
  wwwInProject: Verdict;
  verified: boolean;
  misconfigured: boolean;
  intendedNameservers: string[];
  currentNameservers: string[];
  delegated: boolean;
  recommendedIPv4: string[];
  recommendedCNAME: string[];
  metoda: MetodaConectare | null;
  dnsRaspunde: Verdict;
  zoneMissing: boolean;
  healthy: boolean;
  error?: string;
};

/**
 * `poateRepara` spune daca butonul „Repara" are ce face. Se randa pe `!ok`, deci
 * starea „merge, dar fara www" (care e `ok: true`) trimitea comerciantul catre un
 * buton care nu exista in pagina.
 */
type Diagnostic = {
  ok: boolean;
  title: string;
  detail: string;
  poateRepara?: boolean;
};

type RaspunsStatus = {
  diagnosis?: Diagnostic;
  status?: StareDomeniu;
  error?: string;
  repaired?: boolean;
  repairError?: string;
  repairWarning?: string;
};

/**
 * Dupa conectare, propagarea DNS dureaza minute (la esafe.ro ~19). Fara
 * reverificare periodica, comerciantul nu afla niciodata singur ca s-a rezolvat:
 * ramane cu ultimul mesaj rosu pe ecran si suna suportul.
 */
const PAUZA_REVERIFICARE_MS = 30_000;
const MAX_REVERIFICARI = 30; // ~15 minute, apoi se opreste si cere apasare

const METODE: {
  id: MetodaConectare;
  titlu: string;
  insigna: string | null;
  rezumat: string;
  compromis: string;
}[] = [
  {
    id: "inregistrari",
    titlu: "Inregistrari A/CNAME",
    insigna: "Recomandat",
    rezumat: "Lasi DNS-ul unde e si adaugi doua inregistrari la registrarul tau.",
    compromis: "Emailul si toate celelalte inregistrari raman neatinse.",
  },
  {
    id: "nameservere",
    titlu: "Nameservere Vercel",
    insigna: null,
    rezumat: "Delegi tot domeniul catre noi, dintr-un singur loc la registrar.",
    compromis: "Muta TOT DNS-ul la noi: emailul se opreste pana readaugi MX-urile.",
  },
];

// Preturile vin din sursa comuna cu serverul (lib/domains/preturi.ts). Cand
// tabelul traia doar aici, ruta de checkout calcula suma din `pricePerYear`
// primit de la browser — deci afisajul si incasarea puteau spune lucruri diferite.
const TLD_OPTIONS = OPTIUNI_TLD;

const ORDER_STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  pending:    { label: "In asteptare",  icon: Clock,        color: "bg-warning/10 text-warning border-warning/20" },
  processing: { label: "Se proceseaza", icon: Loader2,      color: "bg-info/10 text-info border-info/20" },
  completed:  { label: "Finalizata",    icon: CheckCircle2, color: "bg-success/10 text-success border-success/20" },
  cancelled:  { label: "Anulata",       icon: XCircle,      color: "bg-destructive/10 text-destructive border-destructive/20" },
  refunded:   { label: "Rambursata",    icon: XCircle,      color: "bg-muted text-muted-foreground border-border" },
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function DomainSection({
  businessId,
  businessName,
  phone,
  address,
  city,
  county,
  profileFullName,
  email,
  initialCustomDomain,
}: Props) {
  // Cu un domeniu deja conectat, ecranul se deschidea pe „Cumpara domeniu", iar
  // starea acelui domeniu si instructiunile lui erau in cealalta fila. Cine avea
  // domeniul cazut vedea intai un formular de cautare.
  const [tab, setTab] = useState<"buy" | "connect">(initialCustomDomain ? "connect" : "buy");

  // Domain search + availability
  const [domainName, setDomainName] = useState("");
  const [selectedTld, setSelectedTld] = useState<typeof TLD_OPTIONS[number] | null>(null);
  const [checking, setChecking] = useState(false);
  // Cheia e TLD-ul. Lipsa cheii inseamna „inca n-am intrebat" si e o stare
  // DIFERITA de `stare: "necunoscut"`, care inseamna „am intrebat si nu stim".
  const [availability, setAvailability] = useState<Record<string, StareDisponibilitate>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Domains list
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(true);

  // Domain orders
  const [orders, setOrders] = useState<DomainOrder[]>([]);

  // Connected domain
  const [customDomain, setCustomDomain] = useState<string | null>(initialCustomDomain);

  // Buy modal
  const [buyPeriod, setBuyPeriod] = useState(1);
  const [buying, setBuying] = useState(false);
  const [contact, setContact] = useState<ContactForm>(() => ({
    entityType:  "pf",
    fullname:    profileFullName,
    cnp:         "",
    cui:         "",
    companyname: businessName,
    email,
    phonenumber: phone?.replace(/\s+/g, "") ?? "",
    address1:    address ?? "",
    city:        city ?? "",
    state:       county ?? "",
    postcode:    "",
  }));
  // Autocompletare ANAF pentru persoana juridica (identic cu Setari).
  const [anafLoading, setAnafLoading] = useState(false);
  async function lookupCui() {
    if (!contact.cui.trim()) { toast.error("Introdu CUI-ul mai intai."); return; }
    setAnafLoading(true);
    try {
      const res = await fetch("/api/anaf/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cui: contact.cui }),
      });
      const data = await res.json() as { business_name?: string; county?: string; city?: string; address?: string; error?: string };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "CUI negasit in ANAF.");
      } else {
        setContact((c) => ({
          ...c,
          companyname: data.business_name ?? c.companyname,
          state:       data.county ?? c.state,
          city:        data.city ?? c.city,
          address1:    data.address ?? c.address1,
        }));
        toast.success("Date completate automat din ANAF.");
      }
    } catch {
      toast.error("Eroare la interogarea ANAF.");
    } finally {
      setAnafLoading(false);
    }
  }

  // Connect external domain
  const [externalInput, setExternalInput] = useState("");
  const [savingExternal, setSavingExternal] = useState(false);
  const [confirmDeconectare, setConfirmDeconectare] = useState(false);

  // Metoda cu care se conecteaza domeniul. Implicit INREGISTRARI, nu nameservere:
  // delegarea merge doar daca Vercel gazduieste chiar zona domeniului, iar cand
  // n-o gazduieste muta domeniul din „nu merge site-ul" in mort complet, si site
  // si email. Alegerea pleaca mai departe catre server, care stie ce sa faca
  // pentru fiecare: „inregistrari" nu atinge deloc zona.
  const [metodaConectare, setMetodaConectare] = useState<MetodaConectare>("inregistrari");
  // Delegarea porneste cu zona GOALA. Cine are email pe domeniu trebuie sa spuna
  // explicit ca a inteles, altfel butonul de salvare ramane blocat.
  const [confirmatEmail, setConfirmatEmail] = useState(false);

  // Fila de instructiuni pentru domeniul DEJA conectat. E separata de alegerea de
  // mai sus: aici conteaza ce foloseste clientul DE FAPT, citit din DNS-ul real.
  const [metodaInstructiuni, setMetodaInstructiuni] = useState<MetodaConectare>("inregistrari");
  /*
   * Alegerea explicita a comerciantului, retinuta IMPREUNA cu domeniul pentru
   * care a facut-o. Un simplu `boolean` nu era de ajuns: `setCustomDomain` din
   * conectare declanseaza efectul de resetare, care rula DUPA commit si stergea
   * steagul pus sincron cu o linie mai devreme — deci cine tocmai alesese
   * „nameservere" era aruncat inapoi pe instructiunile A/CNAME si nu apuca sa
   * vada nameserverele. Legand alegerea de domeniu, ea supravietuieste commit-ului
   * si expira singura cand domeniul se schimba.
   */
  const alegereManualaRef = useRef<{ domeniu: string; metoda: MetodaConectare } | null>(null);

  // Starea REALA a domeniului, ceruta de la Vercel si din DNS-ul public. Bulina
  // „conectat" se aprindea pana acum doar pentru ca `custom_domain` era nenul —
  // asa a putut sta un magazin zile intregi cazut, cu tot verde in interfata.
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [stare, setStare] = useState<StareDomeniu | null>(null);
  // O verificare care NU a reusit se raporteaza ca atare. Pana acum esecul era
  // inghitit (`.catch(() => {})`), iar butonul de reverificare chiar STERGEA
  // diagnosticul pe eroare — deci o eroare lasa ecranul mai optimist decat era.
  const [eroareVerificare, setEroareVerificare] = useState<string | null>(null);
  // Porneste pe „verific" cand chiar avem ce verifica: altfel prima randare, de
  // dinaintea efectului, ar arata o clipa „Nu am putut verifica domeniul".
  const [checkingDomain, setCheckingDomain] = useState(!!(businessId && initialCustomDomain));
  const [repairingDomain, setRepairingDomain] = useState(false);
  // Rezultatul repararii ramane in pagina. Ca toast traia 1,8 secunde si bannerul
  // nu se schimba, deci cine apasa „Repara" nu afla ce s-a intamplat.
  const [rezultatReparare, setRezultatReparare] = useState<{ ok: boolean; mesaj: string } | null>(null);
  const [reverificareOprita, setReverificareOprita] = useState(false);
  const incercariRef = useRef(0);

  /*
   * Numarul cererii curente. `verificaDomeniu` e chemata din TREI locuri (efectul
   * de montare, butonul de reverificare si cronometrul de 30s), iar o citire
   * completa face mai multe apeluri la Vercel plus sonde DNS cu timeout de 8s,
   * deci depaseste usor pauza dintre tick-uri si cererile se suprapun. Fara
   * numar, raspunsul intarziat pentru domeniul VECHI ateriza dupa ce clientul
   * conectase deja altul si scria diagnosticul lui A peste ecranul lui B —
   * inclusiv „Domeniul functioneaza", verde, pentru un domeniu neconfigurat.
   */
  const cerereRef = useRef(0);
  // Steag separat de `checkingDomain`: cronometrul trebuie sa poata sari peste un
  // tick fara sa depinda de o valoare de stare prinsa in inchiderea intervalului.
  const verificareInCursRef = useRef(false);

  // Diagnosticul nu are voie sa dispara pe eroare: pastram ultimul verdict si
  // aratam separat ca ultima citire a esuat.
  const verificaDomeniu = useCallback(async (idAfacere: string) => {
    const id = ++cerereRef.current;
    verificareInCursRef.current = true;
    setCheckingDomain(true);
    try {
      const res = await fetch(`/api/domains/status?businessId=${encodeURIComponent(idAfacere)}`);
      const data = (await res.json()) as RaspunsStatus;
      // Raspunsul unei cereri depasite se ARUNCA: intre timp poate fi alt domeniu
      // pe ecran, iar scrierea lui ar fi o minciuna afisata comerciantului.
      if (id !== cerereRef.current) return;
      if (!res.ok || !data.diagnosis) {
        setEroareVerificare(data.error ?? "Nu am putut verifica domeniul acum.");
        return;
      }
      setDiagnostic(data.diagnosis);
      if (data.status) setStare(data.status);
      setEroareVerificare(data.status?.error ?? null);
    } catch {
      if (id !== cerereRef.current) return;
      setEroareVerificare("Nu am putut verifica domeniul acum (eroare de retea).");
    } finally {
      // Cererea depasita nu stinge rotita: peste ea ruleaza deja alta, mai noua.
      if (id === cerereRef.current) {
        verificareInCursRef.current = false;
        setCheckingDomain(false);
      }
    }
  }, []);

  // ── Data loading ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!businessId) { setLoadingDomains(false); return; }

    const supabase = createClient();

    supabase
      .from("domains")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setDomains(data ?? []);
        setLoadingDomains(false);
      });

    supabase
      .from("domain_orders")
      .select("id, domain, tld, period, total_price, status, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders(data ?? []);
      });

    supabase
      .from("businesses")
      .select("custom_domain")
      .eq("id", businessId)
      .single()
      .then(({ data }) => {
        if (data?.custom_domain) setCustomDomain(data.custom_domain);
      });
  }, [businessId]);

  // Intrebam Vercel de fiecare data cand se deschide sectiunea cu un domeniu
  // conectat. Fara asta, singura „dovada" ca domeniul merge ramane randul din
  // baza noastra — care poate fi vechi de zile si complet fals.
  useEffect(() => {
    if (!businessId || !customDomain) {
      setDiagnostic(null);
      setStare(null);
      setEroareVerificare(null);
      // Daca deconectarea prinde o verificare in zbor, curatenia rulei anterioare
      // i-a invalidat deja raspunsul, deci acela nu mai stinge rotita. O stingem aici.
      verificareInCursRef.current = false;
      setCheckingDomain(false);
      return;
    }
    void verificaDomeniu(businessId);
    // Schimbarea domeniului (sau a afacerii) invalideaza orice cerere plecata
    // pentru cel dinainte, exact cazul care scria diagnosticul lui A peste B.
    return () => {
      cerereRef.current += 1;
    };
  }, [businessId, customDomain, verificaDomeniu]);

  // Domeniu nou (sau schimbat) inseamna alt sir de incercari. Alegerea manuala de
  // fila NU se sterge aici: e legata de domeniu prin `alegereManualaRef` si
  // stergerea ei in acest efect anula tocmai alegerea facuta la conectare.
  useEffect(() => {
    incercariRef.current = 0;
    setReverificareOprita(false);
    setRezultatReparare(null);
  }, [customDomain]);

  const sanatos = diagnostic?.ok === true;

  // Reverificare periodica cat timp starea nu e buna. Se opreste singura cand
  // domeniul devine sanatos sau dupa un numar rezonabil de incercari, ca sa nu
  // batem endpointul la nesfarsit intr-o fila uitata deschisa.
  useEffect(() => {
    if (!businessId || !customDomain || sanatos || reverificareOprita) return;
    const cronometru = setInterval(() => {
      // O verificare inca neintoarsa nu se dubleaza: o citire completa trece des
      // de 30 de secunde, iar cererile suprapuse se calcau reciproc pe raspuns.
      if (verificareInCursRef.current) return;
      incercariRef.current += 1;
      if (incercariRef.current > MAX_REVERIFICARI) {
        setReverificareOprita(true);
        return;
      }
      void verificaDomeniu(businessId);
    }, PAUZA_REVERIFICARE_MS);
    return () => clearInterval(cronometru);
  }, [businessId, customDomain, sanatos, reverificareOprita, verificaDomeniu]);

  // Deschidem fila metodei pe care o foloseste clientul DE FAPT (citita din DNS),
  // dar nu ne batem cu el daca a apasat el insusi pe cealalta.
  useEffect(() => {
    const metodaReala = stare?.metoda;
    if (!metodaReala || !customDomain) return;
    const manual = alegereManualaRef.current;
    if (manual && manual.domeniu === customDomain) {
      // Alegerea lui ramane pe ecran pana o schimba singur. Singura exceptie:
      // serverul confirma ca domeniul MERGE deja pe cealalta metoda, caz in care
      // pasii pe care ii citeste nu mai au ce sa repare si l-ar deruta.
      if (manual.metoda === metodaReala || diagnostic?.ok !== true) return;
      alegereManualaRef.current = null;
    }
    setMetodaInstructiuni(metodaReala);
  }, [stare?.metoda, customDomain, diagnostic?.ok]);

  function alegeMetodaInstructiuni(m: MetodaConectare) {
    if (customDomain) alegereManualaRef.current = { domeniu: customDomain, metoda: m };
    setMetodaInstructiuni(m);
  }

  // ── Cleaned domain name ────────────────────────────────────────────────────

  const cleanName = cleanDomainLabel(domainName);

  const isValidName = cleanName.length >= 2;

  // ── Availability check (debounced) ─────────────────────────────────────────

  // Un raspuns care nu e lista (limitare de rata, retea picata) nu inseamna „inca
  // n-am cerut": il aratam ca stare necunoscuta, cu motivul lui, si lasam butonul
  // de comanda la locul lui.
  function marcheazaNecunoscut(mesaj: string) {
    const map: Record<string, StareDisponibilitate> = {};
    for (const opt of TLD_OPTIONS) map[opt.tld] = { available: null, stare: "necunoscut", mesaj };
    setAvailability(map);
  }

  function handleDomainInput(value: string) {
    setDomainName(value);
    setAvailability({});
    if (searchTimer.current) clearTimeout(searchTimer.current);

    const clean = cleanDomainLabel(value);

    if (clean.length < 2) return;

    searchTimer.current = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch("/api/domains/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ searchTerm: clean }),
        });
        const raspuns = await res.json() as unknown;
        if (Array.isArray(raspuns)) {
          const date = raspuns as {
            domain: string; tld: string; available: boolean | null;
            stare?: StareDisponibilitate["stare"]; mesaj?: string;
          }[];
          const map: Record<string, StareDisponibilitate> = {};
          for (const r of date) {
            map[r.tld] = {
              available: r.available ?? null,
              // Daca raspunsul vine dintr-un cache mai vechi, fara `stare`, o
              // derivam din `available` ca sa nu ramana randul fara verdict.
              stare:
                r.stare ??
                (r.available === true ? "liber" : r.available === false ? "ocupat" : "necunoscut"),
              mesaj: r.mesaj,
            };
          }
          setAvailability(map);
        } else {
          marcheazaNecunoscut(
            (raspuns as { error?: string } | null)?.error ??
            "Nu am putut verifica acum disponibilitatea. Poti plasa comanda oricum: verificam manual inainte de inregistrare."
          );
        }
      } catch {
        marcheazaNecunoscut("Nu am putut ajunge la serviciul de verificare. Poti plasa comanda oricum: verificam manual inainte de inregistrare.");
      } finally {
        setChecking(false);
      }
    }, 800);
  }

  // ── Buy flow ──────────────────────────────────────────────────────────────────

  async function handleBuy() {
    if (!selectedTld || !businessId || !isValidName) return;

    // Campuri comune, necesare pentru inregistrare indiferent de tipul titularului.
    // Codul postal e optional.
    const commonRequired: (keyof ContactForm)[] = [
      "email", "phonenumber", "address1", "city", "state",
    ];
    for (const f of commonRequired) {
      if (!String(contact[f]).trim()) {
        toast.error("Completeaza toate campurile marcate cu *.");
        return;
      }
    }
    // Campuri specifice tipului de titular.
    if (contact.entityType === "pf") {
      if (!contact.fullname.trim()) { toast.error("Completeaza numele complet."); return; }
      if (!/^\d{13}$/.test(contact.cnp.trim())) { toast.error("CNP invalid: trebuie sa aiba 13 cifre."); return; }
    } else {
      if (!contact.cui.trim()) { toast.error("Completeaza CUI-ul firmei."); return; }
      if (!contact.companyname.trim()) { toast.error("Completeaza denumirea firmei (sau apasa Completeaza automat)."); return; }
    }

    const fullDomain = `${cleanName}${selectedTld.tld}`;
    // Registrarul are nevoie de prenume/nume — le derivam din numele complet (PF).
    const [firstname, lastname] = splitName(contact.entityType === "pf" ? contact.fullname : contact.companyname);

    /*
     * Butonul se deblocheaza pe ORICE iesire care nu duce la Stripe. Fara asta,
     * ramura „raspuns fara url" iesea cu `buying` ramas adevarat: modalul nu are
     * buton de inchidere, iar „Anuleaza" e dezactivat cat timp `buying` e pornit,
     * deci singura scapare era reincarcarea paginii si recompletarea intregului
     * formular, inclusiv CNP-ul si cautarea ANAF.
     */
    let seRedirecteaza = false;
    setBuying(true);
    try {
      const res = await fetch("/api/stripe/domain-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain:       fullDomain,
          tld:          selectedTld.tld,
          period:       buyPeriod,
          pricePerYear: selectedTld.price,
          businessId,
          contact: {
            entityType:  contact.entityType,
            firstname:   contact.entityType === "pf" ? firstname : "",
            lastname:    contact.entityType === "pf" ? lastname : "",
            fullname:    contact.entityType === "pf" ? contact.fullname.trim() : "",
            companyname: contact.entityType === "pj" ? contact.companyname.trim() : "",
            cnp:         contact.entityType === "pf" ? contact.cnp.trim() : "",
            cui:         contact.entityType === "pj" ? contact.cui.trim() : "",
            email:       contact.email.trim(),
            phonenumber: contact.phonenumber.trim(),
            address1:    contact.address1.trim(),
            city:        contact.city.trim(),
            state:       contact.state.trim(),
            postcode:    contact.postcode.trim(),
            country:     "RO",
          },
        }),
      });
      const data = await res.json() as { url?: string; error?: string };

      if (!data.url) {
        toast.error(data.error ?? "Nu am putut initia plata.");
        return;
      }

      // Redirect to Stripe Checkout
      seRedirecteaza = true;
      window.location.href = data.url;
    } catch {
      toast.error("Eroare de retea. Incearca din nou.");
    } finally {
      // Pe redirectare lasam butonul blocat: pagina oricum pleaca, iar deblocarea
      // ar arata o clipa formularul ca si cum nu s-ar fi intamplat nimic.
      if (!seRedirecteaza) setBuying(false);
    }
  }

  // ── Connect external domain ───────────────────────────────────────────────────

  async function handleConnectExternal() {
    if (!externalInput.trim() || !businessId) return;
    // Delegarea fara confirmarea de email nu pleaca de aici. Vezi avertismentul.
    if (metodaConectare === "nameservere" && !confirmatEmail) return;
    setSavingExternal(true);

    try {
      const res = await fetch("/api/domains/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Metoda merge la server: „inregistrari" nu atinge deloc zona DNS, deci
        // domeniul nu poate ajunge in starea in care nu raspunde nimeni pentru el.
        body: JSON.stringify({ domain: externalInput.trim(), businessId, metoda: metodaConectare }),
      });
      const data = await res.json() as { success?: boolean; domain?: string; error?: string; warning?: string };

      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Nu am putut conecta domeniul.");
      } else {
        const domeniuNou = data.domain ?? externalInput.trim();
        setCustomDomain(domeniuNou);
        setExternalInput("");
        setConfirmatEmail(false);
        // Instructiunile se deschid pe metoda aleasa, nu pe alta. Alegerea se
        // leaga de domeniul NOU (nu de `customDomain`, care inca nu s-a comis),
        // ca sa treaca peste efectul care ruleaza dupa `setCustomDomain`.
        alegereManualaRef.current = { domeniu: domeniuNou, metoda: metodaConectare };
        setMetodaInstructiuni(metodaConectare);
        if (data.warning) toast.warning(data.warning, { duration: 10000 });
        else toast.success("Domeniu conectat. Aplica acum pasii de mai jos la registrarul tau.");
      }
    } catch {
      toast.error("Eroare de retea. Incearca din nou.");
    }
    setSavingExternal(false);
  }

  // ── Verificare reala la Vercel ────────────────────────────────────────────────

  // Apasarea manuala reporneste si sirul de reverificari automate: daca omul e
  // in pagina si asteapta propagarea, e exact momentul sa ne uitam mai des.
  function checkDomain() {
    if (!businessId) return;
    incercariRef.current = 0;
    setReverificareOprita(false);
    setEroareVerificare(null);
    void verificaDomeniu(businessId);
  }

  async function repairDomain() {
    if (!businessId) return;
    setRepairingDomain(true);
    setRezultatReparare(null);
    try {
      const res = await fetch("/api/domains/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const data = (await res.json()) as RaspunsStatus;

      if (data.diagnosis) setDiagnostic(data.diagnosis);
      if (data.status) setStare(data.status);

      /*
       * Doua intrebari diferite, tinute pana acum una in locul celeilalte:
       *  - `repaired` = „am facut ce aveam de facut la Vercel";
       *  - `diagnosis.ok` = „domeniul chiar merge ACUM".
       * Verdictul se lua doar pe a doua, deci o reparare reusita cu DNS-ul inca
       * in propagare aparea drept esec si trimitea omul sa mai schimbe ceva.
       */
      const aReparat = res.ok && !data.repairError && data.repaired === true;
      const chiarMerge = data.diagnosis?.ok === true;

      if (aReparat || chiarMerge) {
        setRezultatReparare({
          ok: true,
          mesaj:
            data.repairWarning ??
            (chiarMerge
              ? data.diagnosis?.detail ?? "Domeniul a fost reparat."
              : "Am aplicat reparatia la Vercel. DNS-ul se propaga inca; reverificam automat."),
        });
      } else {
        // Mesajul serverului ajunge INTREG la comerciant si ramane pe ecran.
        setRezultatReparare({
          ok: false,
          mesaj:
            data.repairError ??
            data.error ??
            data.diagnosis?.detail ??
            "Nu am putut repara domeniul automat.",
        });
        /*
         * Indrumarea catre A/CNAME are sens DOAR pe un domeniu nedelegat. Pe unul
         * delegat la Vercel, registrarul nu mai e autoritativ pentru zona, deci
         * inregistrarile adaugate acolo nu produc niciun efect: comerciantul le-ar
         * pune, n-ar vedea nicio schimbare si ar crede ca l-am mintit. Citim
         * `data.status`, nu starea din componenta: aceasta inca nu s-a comis.
         */
        if (data.status?.delegated === false) alegeMetodaInstructiuni("inregistrari");
      }
      setEroareVerificare(data.status?.error ?? null);
    } catch {
      setRezultatReparare({ ok: false, mesaj: "Eroare de retea. Incearca din nou." });
    }
    setRepairingDomain(false);
  }

  async function handleDisconnectDomain() {
    if (!businessId || !customDomain) return;
    setSavingExternal(true);

    try {
      const res = await fetch("/api/domains/connect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const data = await res.json() as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Nu am putut deconecta domeniul.");
      } else {
        setCustomDomain(null);
        setDiagnostic(null);
        setStare(null);
        setEroareVerificare(null);
        setRezultatReparare(null);
        setConfirmDeconectare(false);
        toast.success("Domeniu deconectat.");
      }
    } catch {
      toast.error("Eroare de retea.");
    }
    setSavingExternal(false);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copiat!")).catch(() => {});
  }

  const activeOrders = orders.filter((o) => o.status === "pending" || o.status === "processing");

  /*
   * Verde NUMAI cu dovada. Pana acum orice esec de verificare cadea pe „unknown",
   * iar „unknown" afisa „Domeniu conectat" pe fundal pozitiv: un domeniu mort si
   * o retea picata aratau la fel de bine ca unul care chiar merge.
   */
  const stareDomeniu: "verific" | "ok" | "stricat" | "necunoscut" = diagnostic
    ? (diagnostic.ok ? "ok" : "stricat")
    : checkingDomain
      ? "verific"
      : "necunoscut";

  const tonDomeniu = {
    ok:         "bg-success/5 border-success/20",
    stricat:    "bg-destructive/5 border-destructive/20",
    verific:    "bg-muted/40 border-border",
    necunoscut: "bg-muted/40 border-border",
  }[stareDomeniu];

  const titluDomeniu =
    stareDomeniu === "verific"    ? "Verific domeniul..." :
    stareDomeniu === "necunoscut" ? "Nu am putut verifica domeniul" :
    diagnostic?.title ?? "";

  // Butonul se randa pe `poateRepara`, nu pe `!ok`: „Functioneaza, dar fara www"
  // e `ok: true` si totusi are ce repara. Cat timp ruta veche nu trimite campul,
  // cadem inapoi pe vechea regula ca sa nu dispara butonul cu totul.
  const poateRepara = diagnostic ? (diagnostic.poateRepara ?? !diagnostic.ok) : false;

  const nsRecomandate = stare?.intendedNameservers ?? [];
  const aRecomandariDns =
    (stare?.recommendedIPv4?.length ?? 0) > 0 || (stare?.recommendedCNAME?.length ?? 0) > 0;

  /*
   * AMANDOUA randurile se construiesc mereu, cu `value: null` cand valoarea
   * lipseste. Inainte fiecare rand era un spread conditionat, iar poarta de
   * deasupra e un SAU: exista starea in care se randa antetul si DOAR randul A,
   * fara niciun cuvant ca lipseste ceva. Comerciantul adauga A-ul, crede ca a
   * terminat, si www ramane neconfigurat la nesfarsit — eroare de certificat
   * pentru oricine tasteaza adresa cu www.
   */
  const inregistrariRecomandate: {
    type: string; name: string; eticheta: string; value: string | null;
  }[] = [
    { type: "A", name: "@", eticheta: "domeniul principal", value: stare?.recommendedIPv4?.[0] ?? null },
    { type: "CNAME", name: "www", eticheta: "www", value: stare?.recommendedCNAME?.[0] ?? null },
  ];
  const lipsesteInregistrare = inregistrariRecomandate.some((r) => !r.value);
  // Delegarea se recomanda DOAR cu zona dovedita si cu nameservere primite de la
  // Vercel. Orice altceva (`false` sau `null`) inseamna „nu inca".
  const delegareaEPregatita = stare?.zone === true && nsRecomandate.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* No business warning */}
      {!businessId && (
        <div className="p-4 bg-warning/5 border border-warning/20 rounded-xl">
          <p className="text-sm text-warning">
            Nu ai un magazin activ. Finalizeaza onboarding-ul mai intai.
          </p>
        </div>
      )}

      {/* Banner de domeniu: starea vine de la Vercel si din DNS-ul public */}
      {customDomain && (
        <div className={cn("p-4 border rounded-xl", tonDomeniu)}>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                stareDomeniu === "ok" ? "bg-success/10" : stareDomeniu === "stricat" ? "bg-destructive/10" : "bg-muted"
              )}
            >
              {stareDomeniu === "verific" ? (
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
              ) : stareDomeniu === "ok" ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : stareDomeniu === "stricat" ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : (
                <Globe className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">{titluDomeniu}</p>
              <p
                className={cn(
                  "text-sm font-semibold font-mono truncate",
                  stareDomeniu === "ok" ? "text-success" : stareDomeniu === "stricat" ? "text-destructive" : "text-foreground"
                )}
              >
                {customDomain}
              </p>
            </div>
            <button
              type="button"
              onClick={checkDomain}
              disabled={checkingDomain || repairingDomain}
              className="flex-shrink-0 hover:text-primary transition-colors disabled:opacity-40"
              title="Verifica din nou"
            >
              <RefreshCw className={cn("h-4 w-4 text-muted-foreground", checkingDomain && "animate-spin")} />
            </button>
            <a
              href={`https://${customDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 hover:text-primary transition-colors"
              title="Deschide domeniul"
            >
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
            <button
              type="button"
              onClick={() => setConfirmDeconectare(true)}
              disabled={savingExternal}
              className="flex-shrink-0 hover:text-destructive transition-colors"
              title="Deconecteaza domeniul"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="mt-3 pl-11 space-y-2">
            {diagnostic && (
              <p className="text-xs text-muted-foreground leading-relaxed">{diagnostic.detail}</p>
            )}

            {stareDomeniu === "necunoscut" && !eroareVerificare && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Nu avem inca un raspuns despre acest domeniu. Apasa butonul de reverificare.
              </p>
            )}

            {/* Un esec de citire e o stare in sine, nu un motiv de a sterge alarma. */}
            {eroareVerificare && (
              <p className="text-xs text-warning leading-relaxed">
                Ultima verificare nu a reusit: {eroareVerificare}
                {diagnostic && " Mai sus vezi ultimul rezultat cunoscut, care poate fi invechit."}
              </p>
            )}

            {rezultatReparare && (
              <div
                className={cn(
                  "flex items-start gap-2 p-3 rounded-lg border",
                  rezultatReparare.ok
                    ? "bg-success/5 border-success/20"
                    : "bg-destructive/5 border-destructive/20"
                )}
              >
                {rezultatReparare.ok
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 flex-shrink-0" />
                  : <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" />}
                <div className="min-w-0">
                  <p className={cn("text-[11px] font-semibold", rezultatReparare.ok ? "text-success" : "text-destructive")}>
                    {rezultatReparare.ok ? "Reparare reusita" : "Repararea automata nu a reusit"}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    {rezultatReparare.mesaj}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {poateRepara && (
                <button
                  type="button"
                  onClick={repairDomain}
                  disabled={repairingDomain || checkingDomain}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/15 transition-colors disabled:opacity-50"
                >
                  {repairingDomain ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                  {repairingDomain ? "Repar..." : "Repara"}
                </button>
              )}
              {!sanatos && (
                <button
                  type="button"
                  onClick={() => { setTab("connect"); alegeMetodaInstructiuni("inregistrari"); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors text-foreground"
                >
                  Vezi ce ai de facut la registrar
                </button>
              )}
            </div>

            {!sanatos && (
              <p className="text-[11px] text-muted-foreground">
                {reverificareOprita
                  ? "Am oprit reverificarea automata. Apasa sageata de reincarcare cand ai terminat modificarile la registrar."
                  : "Reverificam automat la fiecare 30 de secunde. Modificarile DNS se propaga de obicei in cateva minute."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Confirmarea deconectarii: pana acum pleca dintr-un singur click. */}
      {confirmDeconectare && customDomain && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => { if (!savingExternal) setConfirmDeconectare(false); }}
        >
          <div
            className="w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center mb-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-2">
              Deconectezi <span className="font-mono">{customDomain}</span>?
            </h3>
            <ul className="text-sm text-muted-foreground space-y-2 mb-5 list-disc pl-4">
              <li>Magazinul revine pe adresa de platforma si ramane accesibil acolo.</li>
              <li>
                <span className="font-medium text-foreground">{customDomain}</span> nu va mai
                deschide magazinul.
              </li>
              <li>
                Daca ai mutat nameserverele domeniului la noi, muta-le inapoi la registrarul tau
                (sau catre alt furnizor DNS) si readauga inregistrarile. Altfel domeniul ramane
                mort dupa deconectare: si site, si email.
              </li>
            </ul>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeconectare(false)}
                disabled={savingExternal}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Pastreaza domeniul
              </button>
              <button
                type="button"
                onClick={handleDisconnectDomain}
                disabled={savingExternal}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors disabled:opacity-60"
              >
                {savingExternal && <Loader2 className="h-4 w-4 animate-spin" />}
                Deconecteaza
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex bg-muted rounded-xl p-1 gap-1">
        {(["buy", "connect"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "buy" ? "Cumpara domeniu" : "Conecteaza domeniu"}
          </button>
        ))}
      </div>

      {/* ── Tab: Cumpara ── */}
      {tab === "buy" && (
        <div className="space-y-4">
          {/* Domain name input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={domainName}
              onChange={(e) => handleDomainInput(e.target.value)}
              placeholder="Cauta un domeniu (ex: magazinul-meu)"
              className={cn(inputCls, "pl-10 pr-10")}
              disabled={!businessId}
            />
            {checking && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {domainName && !isValidName && (
            <p className="text-xs text-destructive -mt-2">Minim 2 caractere (litere, cifre, cratima).</p>
          )}

          {/* TLD options with availability */}
          {isValidName && (
            <div className="space-y-2">
              {TLD_OPTIONS.map((opt) => {
                const info = availability[opt.tld];
                // Lipsa intrarii = „inca n-am intrebat". `stare: "necunoscut"` =
                // „am intrebat si registrul nu a raspuns clar". A doua are text
                // propriu de la server si NU are voie sa arate ca prima.
                const isAvailable = info?.stare === "liber";
                const isUnavailable = info?.stare === "ocupat";
                const eNecunoscut = info?.stare === "necunoscut";

                return (
                  <div
                    key={opt.tld}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-xl border transition-colors",
                      isUnavailable
                        ? "bg-muted/40 border-border opacity-55"
                        : "bg-surface border-border"
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
                        isAvailable ? "bg-primary/10" :
                        eNecunoscut && !checking ? "bg-warning/10" : "bg-muted"
                      )}
                    >
                      {checking ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : isAvailable ? (
                        <Check className="h-3 w-3 text-primary" />
                      ) : isUnavailable ? (
                        <X className="h-3 w-3 text-muted-foreground" />
                      ) : eNecunoscut ? (
                        <AlertCircle className="h-3 w-3 text-warning" />
                      ) : (
                        <Globe className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground font-mono">
                        {cleanName}{opt.tld}
                      </p>
                      <p className={cn(
                        "text-xs",
                        !checking && isAvailable ? "text-primary" :
                        !checking && eNecunoscut ? "text-warning" :
                        "text-muted-foreground"
                      )}>
                        {checking ? "Se verifica..." :
                         isAvailable ? "Disponibil" :
                         isUnavailable ? "Indisponibil" :
                         eNecunoscut ? "Disponibilitate neconfirmata" :
                         "Verifica disponibilitatea"}
                      </p>
                      {/* Textul e scris de server (timeout WHOIS, limitare la ROTLD)
                          si e singurul care explica de ce nu avem un verdict. */}
                      {!checking && eNecunoscut && info?.mesaj && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                          {info.mesaj}
                        </p>
                      )}
                    </div>

                    {!isUnavailable && (
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-sm font-semibold text-foreground">
                          {opt.price} lei<span className="text-xs font-normal text-muted-foreground">/an</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => { setSelectedTld(opt); setBuyPeriod(1); }}
                          disabled={checking}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <ShoppingCart className="h-3 w-3" />
                          Comanda
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending orders */}
          {activeOrders.length > 0 && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Comenzi in curs</p>
              </div>
              <div className="divide-y divide-border">
                {activeOrders.map((o) => {
                  const cfg = ORDER_STATUS_CONFIG[o.status] ?? ORDER_STATUS_CONFIG.pending;
                  const Icon = cfg.icon;
                  return (
                    <div key={o.id} className="flex items-center gap-3 px-5 py-3.5">
                      <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground font-mono">
                          {o.domain}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {o.period} {o.period === 1 ? "an" : "ani"} &middot; {o.total_price} lei
                          &middot; {new Date(o.created_at).toLocaleDateString("ro-RO")}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                          cfg.color
                        )}
                      >
                        <Icon className={cn("h-3 w-3", o.status === "processing" && "animate-spin")} />
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  Domeniul va fi activat in maximum 24 de ore de la plasarea comenzii.
                </p>
              </div>
            </div>
          )}

          {/* Owned domains list */}
          {!loadingDomains && domains.length > 0 && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Domeniile tale</p>
              </div>
              <div className="divide-y divide-border">
                {domains.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-3.5">
                    <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground font-mono">
                        {d.domain}
                      </p>
                      {d.expiry_date && (
                        <p className="text-xs text-muted-foreground">
                          Expira:{" "}
                          {new Date(d.expiry_date).toLocaleDateString("ro-RO")}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                        d.status === "active"
                          ? "bg-success/10 text-success border-success/20"
                          : "bg-muted text-muted-foreground border-border"
                      )}
                    >
                      {d.status === "active" ? "Activ" : d.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed/cancelled orders history */}
          {orders.filter((o) => o.status !== "pending" && o.status !== "processing").length > 0 && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Istoric comenzi domenii</p>
              </div>
              <div className="divide-y divide-border">
                {orders
                  .filter((o) => o.status !== "pending" && o.status !== "processing")
                  .map((o) => {
                    const cfg = ORDER_STATUS_CONFIG[o.status] ?? ORDER_STATUS_CONFIG.pending;
                    return (
                      <div key={o.id} className="flex items-center gap-3 px-5 py-3.5">
                        <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground font-mono">{o.domain}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(o.created_at).toLocaleDateString("ro-RO")}
                          </p>
                        </div>
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold border", cfg.color)}>
                          {cfg.label}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loadingDomains && domains.length === 0 && activeOrders.length === 0 && !isValidName && (
            <div className="text-center py-10">
              <Globe className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">
                Nu ai niciun domeniu
              </p>
              <p className="text-xs text-muted-foreground">
                Introdu numele domeniului dorit mai sus pentru a plasa o comanda.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Conecteaza ── */}
      {tab === "connect" && (
        <div className="space-y-5">
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ai deja un domeniu cumparat de la alt registrar? Introdu-l mai jos si
              alege cum vrei sa il conectezi. Ambele metode duc la acelasi rezultat;
              difera doar ce se intampla cu restul DNS-ului tau.
            </p>
          </div>

          <input
            type="text"
            value={externalInput}
            onChange={(e) => setExternalInput(e.target.value)}
            placeholder="ex: magazinul-tau.ro"
            className={inputCls}
            disabled={!businessId}
          />

          {/* Alegerea metodei, cu compromisul spus pe fata. Nu alegem noi tacit. */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Cum vrei sa il conectezi?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {METODE.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMetodaConectare(m.id)}
                  aria-pressed={metodaConectare === m.id}
                  className={cn(
                    "text-left p-4 rounded-xl border transition-colors",
                    metodaConectare === m.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-surface hover:border-primary/40"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">{m.titlu}</span>
                    {m.insigna && (
                      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {m.insigna}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
                    {m.rezumat}
                  </span>
                  <span
                    className={cn(
                      "block text-[11px] mt-1.5 leading-relaxed",
                      m.id === "nameservere" ? "text-warning" : "text-success"
                    )}
                  >
                    {m.compromis}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/*
            Avertismentul de email, pe calea de delegare. Zona pe care o creeaza
            Vercel porneste GOALA: din secunda in care nameserverele arata catre
            noi, MX-urile clientului nu mai exista pentru nimeni. eSafe a ramas
            fara email exact asa, si e cazut si acum. De aceea e blocant, nu nota.
          */}
          {metodaConectare === "nameservere" && (
            <div className="p-4 bg-warning/5 border-2 border-warning/40 rounded-xl">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-warning">
                    Emailul de pe domeniu se opreste pana readaugi MX-urile
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">
                    Cand delegi nameserverele, zona DNS pe care o pornim noi este{" "}
                    <span className="font-semibold text-foreground">complet goala</span>. Tot ce ai
                    azi in DNS dispare pentru restul lumii: adresele de email de pe domeniu
                    (contact@...), SPF/DKIM, subdomeniile si verificarile. Emailul nu mai ajunge la
                    tine pana cand nu readaugi manual fiecare inregistrare.
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Noteaza-ti acum toate inregistrarile din panoul registrarului, ca sa le poti
                    pune la loc. Daca nu vrei riscul asta, alege{" "}
                    <span className="font-semibold text-foreground">Inregistrari A/CNAME</span>:
                    magazinul merge la fel, iar emailul tau ramane neatins.
                  </p>
                  <label className="flex items-start gap-2 mt-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmatEmail}
                      onChange={(e) => setConfirmatEmail(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-warning flex-shrink-0"
                    />
                    <span className="text-xs text-foreground leading-relaxed">
                      Am inteles: imi notez inregistrarile MX si le readaug dupa delegare, altfel
                      nu mai primesc email pe acest domeniu.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleConnectExternal}
              // Bifa de email conditioneaza NUMAI delegarea. Cine a bifat pe
              // „nameservere" si apoi trece pe „inregistrari" gaseste butonul
              // activ: pe calea A/CNAME nu se atinge nicio inregistrare MX, deci
              // nu are ce confirma. Conditia trebuie sa ramana legata de metoda.
              disabled={
                !externalInput.trim() ||
                savingExternal ||
                !businessId ||
                (metodaConectare === "nameservere" && !confirmatEmail)
              }
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingExternal && <Loader2 className="h-4 w-4 animate-spin" />}
              Conecteaza domeniul
            </button>
            {metodaConectare === "nameservere" && !confirmatEmail && (
              <span className="text-xs text-muted-foreground">
                Bifeaza confirmarea de mai sus ca sa poti continua.
              </span>
            )}
          </div>

          {/* DNS instructions */}
          {customDomain && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <p className="text-sm font-semibold text-foreground">
                  Configureaza domeniul
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Alege una dintre metode si aplic-o la registrarul tau pentru{" "}
                  <span className="font-mono font-semibold">{customDomain}</span>
                </p>
              </div>

              {/* Method switcher */}
              <div className="px-5 pt-4">
                <div className="flex bg-muted rounded-xl p-1 gap-1">
                  {METODE.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => alegeMetodaInstructiuni(m.id)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        metodaInstructiuni === m.id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {m.titlu}
                      {m.insigna && (
                        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          {m.insigna}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {stare?.metoda && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Acum domeniul foloseste{" "}
                    <span className="font-medium text-foreground">
                      {stare.metoda === "nameservere" ? "nameserverele Vercel" : "inregistrari A/CNAME"}
                    </span>
                    {stare.currentNameservers.length > 0 && (
                      <> (nameservere: <span className="font-mono">{stare.currentNameservers.join(", ")}</span>)</>
                    )}
                    .
                  </p>
                )}
              </div>

              {/* ── Metoda: nameservere (cere ca Vercel sa gazduiasca zona) ── */}
              {metodaInstructiuni === "nameservere" && (
                <>
                  {/*
                    Delegarea se recomanda DOAR cand zona chiar exista la noi si
                    Vercel ne-a spus ce nameservere sa punem. Fara asta, mutarea
                    nameserverelor nu e o imbunatatire: scoate domeniul complet
                    din functiune, si site si email. Asta a facut incidentul eSafe.
                  */}
                  {!delegareaEPregatita && !stare && checkingDomain ? (
                    <div className="px-5 pt-3 pb-1">
                      <div className="flex items-center gap-2 p-3 bg-muted/40 border border-border rounded-lg">
                        <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin flex-shrink-0" />
                        <p className="text-[11px] text-muted-foreground">
                          Verificam daca zona DNS e pregatita pentru acest domeniu. Nu muta
                          nameserverele pana nu confirmam.
                        </p>
                      </div>
                    </div>
                  ) : !delegareaEPregatita ? (
                    <div className="px-5 pt-3 pb-1">
                      <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-warning">
                            {stare?.zone === false
                              ? "Nu muta nameserverele acum"
                              : "Metoda cu nameservere nu e pregatita inca"}
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                            {stare?.zone === false
                              ? `Zona DNS pentru ${customDomain} nu exista la noi. Daca muti nameserverele acum, nu mai raspunde nimeni pentru domeniu: se opreste si site-ul, si emailul.`
                              : stare?.zone === true
                                ? "Zona exista, dar Vercel nu ne-a trimis inca nameserverele pentru ea. Reincearca in cateva minute."
                                : "Nu am putut confirma ca zona DNS e pregatita la noi. Pana confirmam, nu muta nameserverele: daca zona lipseste, domeniul ramane fara nimic, nici site, nici email."}
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">
                            Metoda cu inregistrari A/CNAME functioneaza indiferent de asta si iti
                            lasa emailul neatins.
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => alegeMetodaInstructiuni("inregistrari")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
                            >
                              Foloseste inregistrari A/CNAME
                            </button>
                            {poateRepara && (
                              <button
                                type="button"
                                onClick={repairDomain}
                                disabled={repairingDomain || checkingDomain}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border border-border hover:bg-muted transition-colors text-foreground disabled:opacity-50"
                              >
                                {repairingDomain ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                                {repairingDomain ? "Repar..." : "Repara"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="px-5 pt-3 pb-1">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Inlocuieste nameserverele domeniului la registrar cu cele de mai jos.
                          Dupa delegare, DNS-ul domeniului se administreaza de la noi.
                        </p>
                      </div>
                      <div className="px-5 py-3 space-y-2">
                        <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-3 mb-1">
                          Nameservere
                        </span>
                        {/* Valorile vin de la Vercel, pentru ACEST domeniu. */}
                        {nsRecomandate.map((ns) => (
                          <div
                            key={ns}
                            className="grid grid-cols-[1fr_32px] gap-2 items-center p-3 bg-muted/50 rounded-lg"
                          >
                            <span className="text-xs font-mono text-foreground truncate">{ns}</span>
                            <button
                              type="button"
                              onClick={() => copy(ns)}
                              className="flex items-center justify-center hover:text-primary transition-colors"
                            >
                              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="px-5 pb-1">
                        <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-lg">
                          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-warning">
                              Zona porneste goala: readauga MX-urile de email
                            </p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                              Din momentul in care nameserverele arata catre noi, inregistrarile pe
                              care le ai azi (MX pentru email, SPF/DKIM, subdomenii) nu mai exista
                              pentru nimeni pana cand le pui la loc. Daca folosesti email pe{" "}
                              <span className="font-mono">{customDomain}</span>, noteaza-ti
                              MX-urile inainte si readauga-le imediat dupa delegare, sau ramai pe
                              metoda cu inregistrari A/CNAME, care nu atinge nimic.
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Metoda: inregistrari A/CNAME ── */}
              {metodaInstructiuni === "inregistrari" && (
                <>
                  <div className="px-5 pt-3 pb-1">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Pastreaza nameserverele actuale si adauga doar inregistrarile de mai jos in
                      panoul DNS al registrarului. Emailul si restul setarilor raman neatinse.
                    </p>
                  </div>
                  {aRecomandariDns ? (
                    <div className="px-5 py-3 space-y-2">
                      <div className="grid grid-cols-[64px_64px_1fr_32px] gap-2 px-3 mb-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tip</span>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Nume</span>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Valoare</span>
                      </div>
                      {/*
                        Valorile vin de la Vercel pentru ACEST proiect. Nu tinem
                        rezerve scrise de mana: Vercel da tinte per-proiect, iar o
                        valoare generica poate fi pur si simplu gresita aici. Ce
                        lipseste se arata ca LIPSA, nu se omite din tabel.
                      */}
                      {inregistrariRecomandate.map((rec) => {
                        const valoare = rec.value;
                        return (
                          <div
                            key={rec.type + rec.name}
                            className={cn(
                              "grid grid-cols-[64px_64px_1fr_32px] gap-2 items-center p-3 rounded-lg",
                              valoare ? "bg-muted/50" : "bg-warning/5 border border-warning/30"
                            )}
                          >
                            <span
                              className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded font-mono text-center",
                                valoare ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"
                              )}
                            >
                              {rec.type}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {rec.name}
                            </span>
                            {valoare ? (
                              <span className="text-xs font-mono text-foreground truncate">
                                {valoare}
                              </span>
                            ) : (
                              <span className="text-[11px] text-warning leading-snug">
                                Vercel nu ne-a dat inca valoarea pentru {rec.eticheta} &mdash; apasa
                                &bdquo;Verifica din nou&rdquo;. Nu o inventam: o valoare gresita in
                                DNS tine magazinul jos ore intregi.
                              </span>
                            )}
                            {valoare ? (
                              <button
                                type="button"
                                onClick={() => copy(valoare)}
                                className="flex items-center justify-center hover:text-primary transition-colors"
                              >
                                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            ) : (
                              <span className="flex items-center justify-center">
                                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {/*
                        Randul incomplet nu e o nota de subsol: fara www adaugat,
                        oricine tasteaza adresa cu www primeste eroare de certificat.
                      */}
                      {lipsesteInregistrare && (
                        <div className="px-3 pt-1">
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Adauga si randul marcat mai sus inainte sa consideri domeniul gata:
                            cu unul singur pus, jumatate din adrese raman neconfigurate.
                          </p>
                          <button
                            type="button"
                            onClick={checkDomain}
                            disabled={checkingDomain}
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border border-border hover:bg-muted transition-colors text-foreground disabled:opacity-50"
                          >
                            <RefreshCw className={cn("h-3 w-3", checkingDomain && "animate-spin")} />
                            {checkingDomain ? "Verific..." : "Verifica din nou"}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-5 py-3">
                      <div className="flex items-start gap-2 p-3 bg-muted/40 border border-border rounded-lg">
                        <AlertCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Inca nu avem de la Vercel valorile pentru acest domeniu. Nu le ghicim:
                            o valoare gresita in DNS tine magazinul jos ore intregi.
                          </p>
                          <button
                            type="button"
                            onClick={checkDomain}
                            disabled={checkingDomain}
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border border-border hover:bg-muted transition-colors text-foreground disabled:opacity-50"
                          >
                            <RefreshCw className={cn("h-3 w-3", checkingDomain && "animate-spin")} />
                            {checkingDomain ? "Verific..." : "Incearca din nou"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="px-5 py-3 border-t border-border bg-muted/20 mt-2">
                <p className="text-xs text-muted-foreground">
                  Propagarea dureaza de obicei cateva minute, dar poate ajunge la 48 de ore.
                  Verifica statusul pe{" "}
                  <a
                    href={`https://dnschecker.org/#${metodaInstructiuni === "nameservere" ? "NS" : "A"}/${customDomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    DNSChecker
                  </a>
                  .
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Buy modal ── */}
      {selectedTld && isValidName && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full sm:max-w-lg bg-background border border-border sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95dvh]">
            {/* Header */}
            <div className="px-6 py-5 border-b border-border flex-shrink-0">
              <p className="text-base font-semibold text-foreground font-mono">
                {cleanName}{selectedTld.tld}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Completeaza datele titularului. Domeniul va fi activat in max. 24h.
              </p>
            </div>

            {/* Scrollable body */}
            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
              {/* Info banner */}
              <div className="p-3 bg-info/5 border border-info/20 rounded-xl flex items-start gap-2.5">
                <Clock className="h-4 w-4 text-info mt-0.5 flex-shrink-0" />
                <p className="text-xs text-info leading-relaxed">
                  Dupa finalizarea platii, domeniul va fi inregistrat si conectat automat
                  la magazinul tau in maximum 24 de ore. Plata se proceseaza securizat prin Stripe.
                </p>
              </div>

              {/* Period picker */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-2">
                  Perioada de inregistrare
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setBuyPeriod(p)}
                      className={cn(
                        "py-2.5 rounded-xl text-sm font-semibold border transition-all",
                        buyPeriod === p
                          ? "bg-primary text-white border-primary"
                          : "border-border text-muted-foreground hover:border-primary/40 bg-background"
                      )}
                    >
                      {p} {p === 1 ? "an" : "ani"}
                      <span className="block text-[11px] font-normal opacity-80 mt-0.5">
                        {selectedTld.price * p} lei
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact form */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Date titular
                </p>

                {/* Tip titular — obligatoriu de ales */}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: "pf", label: "Persoana fizica" },
                    { id: "pj", label: "Persoana juridica" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setContact((c) => ({ ...c, entityType: opt.id }))}
                      className={cn(
                        "py-2.5 rounded-xl text-sm font-semibold border transition-all",
                        contact.entityType === opt.id
                          ? "bg-primary text-white border-primary"
                          : "border-border text-muted-foreground hover:border-primary/40 bg-background"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* ── Persoana fizica ── */}
                  {contact.entityType === "pf" && (
                    <>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-foreground mb-1.5">
                          Nume complet <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="text"
                          value={contact.fullname}
                          onChange={(e) => setContact((c) => ({ ...c, fullname: e.target.value }))}
                          className={inputCls}
                          placeholder="ex: Ion Popescu"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-foreground mb-1.5">
                          CNP <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={contact.cnp}
                          onChange={(e) => setContact((c) => ({ ...c, cnp: e.target.value.replace(/\D/g, "").slice(0, 13) }))}
                          className={inputCls}
                          placeholder="13 cifre"
                        />
                      </div>
                    </>
                  )}

                  {/* ── Persoana juridica ── */}
                  {contact.entityType === "pj" && (
                    <>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-foreground mb-1.5">
                          CUI <span className="text-destructive">*</span>
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={contact.cui}
                            onChange={(e) => setContact((c) => ({ ...c, cui: e.target.value }))}
                            className={cn(inputCls, "flex-1")}
                            placeholder="ex: RO12345678"
                          />
                          <button
                            type="button"
                            onClick={lookupCui}
                            disabled={anafLoading || !contact.cui.trim()}
                            className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            {anafLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                            {anafLoading ? "Se cauta..." : "Completeaza automat"}
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Introdu CUI-ul si apasa &bdquo;Completeaza automat&rdquo; pentru a prelua datele firmei din ANAF.
                        </p>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-foreground mb-1.5">
                          Denumire firma <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="text"
                          value={contact.companyname}
                          onChange={(e) => setContact((c) => ({ ...c, companyname: e.target.value }))}
                          className={inputCls}
                        />
                      </div>
                    </>
                  )}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Email <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Telefon <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="tel"
                      value={contact.phonenumber}
                      onChange={(e) => setContact((c) => ({ ...c, phonenumber: e.target.value }))}
                      className={inputCls}
                      placeholder="07XXXXXXXX"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Adresa <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.address1}
                      onChange={(e) => setContact((c) => ({ ...c, address1: e.target.value }))}
                      className={inputCls}
                      placeholder="Strada, nr."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Oras <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.city}
                      onChange={(e) => setContact((c) => ({ ...c, city: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Judet <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.state}
                      onChange={(e) => setContact((c) => ({ ...c, state: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Cod postal <span className="text-muted-foreground font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={contact.postcode}
                      onChange={(e) => setContact((c) => ({ ...c, postcode: e.target.value }))}
                      className={inputCls}
                      placeholder="ex: 010101"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Tara
                    </label>
                    <input
                      type="text"
                      value="Romania"
                      disabled
                      className={cn(inputCls, "opacity-60 cursor-not-allowed")}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex items-center gap-3 bg-muted/20 flex-shrink-0">
              <div className="flex-shrink-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
                <p className="text-base font-bold text-foreground">
                  {selectedTld.price * buyPeriod} lei
                </p>
              </div>
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setSelectedTld(null)}
                  disabled={buying}
                  className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Anuleaza
                </button>
                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={buying}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-60"
                >
                  {buying && <Loader2 className="h-4 w-4 animate-spin" />}
                  {buying
                    ? "Redirectare la plata..."
                    : `Plateste ${selectedTld.price * buyPeriod} lei`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
