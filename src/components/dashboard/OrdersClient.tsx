"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X, ShoppingCart, ChevronRight, ChevronLeft, FileText, FileCheck, XCircle, Loader2, Download, Package, CheckSquare } from "lucide-react";
import { WootBulkModal } from "./WootBulkModal";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { claseSursa, deriveOrigin, monedaComenzii, MARKETPLACE_ORIGINI } from "@/lib/orders/origin";
import { awburiDinRand, deCeNuSePoateAwbPropriu } from "@/lib/orders/awb-propriu";
import {
  bulkGenerateInvoices, bulkGenerateAwbs, bulkUpdateOrderStatus,
  type BulkResult, type InvoiceProvider, type BulkCourier,
} from "@/lib/actions/bulk-orders.actions";
import { generateOrderInvoice } from "@/lib/actions/smartbill.actions";
import { generateOblioInvoice, generateOblioProforma, stornoOblioInvoice } from "@/lib/actions/oblio.actions";
import { generateFgoInvoice, stornoFgoInvoiceAction } from "@/lib/actions/fgo.actions";
import { CargusAwbModal } from "@/components/dashboard/CargusAwbModal";
import { DpdAwbModal } from "@/components/dashboard/DpdAwbModal";
import { GlsAwbModal } from "@/components/dashboard/GlsAwbModal";
import { PallexAwbModal } from "@/components/dashboard/PallexAwbModal";
import { EcoletAwbModal } from "@/components/dashboard/EcoletAwbModal";
import { FanCourierAwbModal } from "@/components/dashboard/FanCourierAwbModal";
import { FanCourierPickupModal } from "@/components/dashboard/FanCourierPickupModal";
import { DpdPickupModal } from "@/components/dashboard/DpdPickupModal";
import { CargusPickupModal } from "@/components/dashboard/CargusPickupModal";
import { SamedayAwbModal } from "@/components/dashboard/SamedayAwbModal";
import { WootAwbModal } from "@/components/dashboard/WootAwbModal";
import { ColeteAwbModal } from "@/components/dashboard/ColeteAwbModal";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS, orderStatus, type OrderStatus } from "@/lib/orders/status";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { ORDERS_PAGE_SIZE } from "@/lib/orders/pagination";
import { readBillingCompany } from "@/lib/billing/company";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

/**
 * Apasarea pe „Creeaza AWB" cand serverul ar refuza oricum.
 *
 * ⚠ BUTONUL NU MAI E STINS, si e o hotarare luata pe 13.09.2026, nu o scapare.
 *
 * Stins, singura explicatie era atributul nativ `title`, iar pe un element `disabled`
 * nu se poate conta pe el: pe telefon si pe tableta nu exista hover deloc, deci acolo
 * motivul nu aparea NICIODATA. Masurat in baza: 101 comenzi anulate si 20 restituite.
 * Omul vedea un rand de butoane gri, fara niciun cuvant, si deschidea comenzile una
 * cate una ca sa afle ce-i lipseste.
 *
 * `refuz` e deja o propozitie intreaga, si e CHIAR cea pe care o da poarta de pe server
 * (`deCeNuSePoateAwbPropriu`, acelasi modul). Pagina comenzii o arata de mult intr-un
 * panou; lista o arata acum la apasare. Doua ecrane, acelasi adevar, si niciunul nu-si
 * face copia lui.
 *
 * ⚠ `aria-disabled`, nu `disabled`: cititorul de ecran afla ca butonul e refuzat, dar
 * apasarea tot ajunge la noi, ca sa avem unde spune de ce.
 */
function apasaAwb(refuz: string | null, deschide: () => void): void {
  if (refuz) {
    toast.error(refuz);
    return;
  }
  deschide();
}

const STATUS_TABS = [
  { key: "all",        label: "Toate" },
  { key: "pending",    label: "In asteptare" },
  { key: "confirmed",  label: "Confirmate" },
  { key: "processing", label: "In procesare" },
  { key: "shipped",    label: "Expediate" },
  { key: "delivered",  label: "Livrate" },
  { key: "cancelled",  label: "Anulate" },
  { key: "refunded",   label: "Rambursate" },
];

/**
 * Numele sub care serverul a trimis fisierul.
 *
 * ⚠ Se ia din antet, nu se compune in browser: serverul stie cate etichete au intrat
 * cu adevarat in document, iar browserul stie doar cate au fost cerute. Compus aici,
 * numele ar fi spus „etichete-18" despre un fisier cu cincisprezece pagini.
 */
function numeDinAntet(raspuns: Response): string | null {
  const brut = raspuns.headers.get("Content-Disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(brut);
  return m ? m[1] : null;
}

export function OrdersClient({ orders, totalCount, statusCounts, page, searchQuery, statusFilter, sourceFilter, sourceCounts, pendingCount, smartbillEnabled, wootEnabled, coleteEnabled, oblioEnabled, fgoEnabled, cargusEnabled, dpdEnabled, glsEnabled, pallexEnabled, pallexZile, ecoletEnabled, postaEnabled, packetaEnabled, smartshipEnabled, shipoEnabled, fedexEnabled, upsEnabled, dhlEnabled, innoshipEnabled, fanCourierEnabled, samedayEnabled, businessId, fanPickup }: {
  /** Pagina curenta de comenzi (max ORDERS_PAGE_SIZE), gata filtrata pe server. */
  orders: Order[];
  /** Total comenzi pentru filtrul+cautarea curenta (count exact din DB). */
  totalCount: number;
  /** Comenzi per status, pe tot magazinul (pentru tab-uri). */
  statusCounts: Record<string, number>;
  page: number;
  searchQuery: string;
  statusFilter: string;
  sourceFilter: string;
  sourceCounts: Record<string, number>;
  pendingCount: number;
  smartbillEnabled?: boolean;
  wootEnabled?: boolean;
  coleteEnabled?: boolean;
  oblioEnabled?: boolean;
  fgoEnabled?: boolean;
  cargusEnabled?: boolean;
  dpdEnabled?: boolean;
  glsEnabled?: boolean;
  pallexEnabled?: boolean;
  postaEnabled?: boolean;
  packetaEnabled?: boolean;
  smartshipEnabled?: boolean;
  shipoEnabled?: boolean;
  fedexEnabled?: boolean;
  upsEnabled?: boolean;
  dhlEnabled?: boolean;
  innoshipEnabled?: boolean;
  pallexZile?: { ridicare: number; livrare: number };
  ecoletEnabled?: boolean;
  fanCourierEnabled?: boolean;
  samedayEnabled?: boolean;
  businessId?: string;
  fanPickup?: { lastDate: string | null; lastId: string | null };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startNavTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(searchQuery);
  const lastNavQ = useRef(searchQuery);
  const [generatingOrderId, setGeneratingOrderId] = useState<string | null>(null);
  const [, startGenerateTransition] = useTransition();
  const [wootModalOrder, setWootModalOrder] = useState<Order | null>(null);
  const [coleteModalOrder, setColeteModalOrder] = useState<Order | null>(null);
  const [oblioActionOrderId, setOblioActionOrderId] = useState<string | null>(null);
  const [oblioAction, setOblioAction] = useState<"invoice" | "proforma" | "storno" | null>(null);
  const [, startOblioTransition] = useTransition();
  const [cargusModalOrder, setCargusModalOrder] = useState<Order | null>(null);
  const [dpdModalOrder, setDpdModalOrder] = useState<Order | null>(null);
  const [glsModalOrder, setGlsModalOrder] = useState<Order | null>(null);
  const [pallexModalOrder, setPallexModalOrder] = useState<Order | null>(null);
  const [ecoletModalOrder, setEcoletModalOrder] = useState<Order | null>(null);
  const [fanCourierModalOrder, setFanCourierModalOrder] = useState<Order | null>(null);
  const [fanPickupOpen, setFanPickupOpen] = useState(false);
  const [dpdPickupOpen, setDpdPickupOpen] = useState(false);
  const [cargusPickupOpen, setCargusPickupOpen] = useState(false);
  const [samedayModalOrder, setSamedayModalOrder] = useState<Order | null>(null);
  const [fgoActionOrderId, setFgoActionOrderId] = useState<string | null>(null);
  const [fgoAction, setFgoAction] = useState<"invoice" | "storno" | null>(null);
  const [, startFgoTransition] = useTransition();

  // ── Bulk selection ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ title: string; result: BulkResult } | null>(null);
  const [invoiceProvider, setInvoiceProvider] = useState<InvoiceProvider>("auto");
  const [awbCourier, setAwbCourier] = useState<BulkCourier>("auto");
  /*
   * ⚠ Descarcarea etichetelor isi tine starea ei, separat de `bulkBusy`.
   *
   * Cele doua nu sunt acelasi fel de lucru: emiterea SCHIMBA la curier si costa bani,
   * descarcarea e o citire. Pe acelasi steag, un lot de AWB-uri pornit ar fi blocat si
   * descarcarea etichetelor deja emise — tocmai lucrul pe care omul il vrea imediat dupa.
   */
  const [eticheteBusy, setEticheteBusy] = useState(false);
  const [eticheteFormat, setEticheteFormat] = useState<"A4" | "A6">("A4");
  const [eticheteSarite, setEticheteSarite] = useState<{ comanda: string; motiv: string }[]>([]);
  const [eticheteInPlus, setEticheteInPlus] = useState(0);
  /*
    ⚠ Lotul Woot are fereastra LUI, nu intra in „Generează AWB-uri".

    Woot e broker: serviciul vine dintr-o cotatie live si nu se poate deduce din
    comanda. Bagat in acelasi buton, ar fi cerut o intrebare in mijlocul unui lot
    care pana acum n-a intrebat nimic — sau, mai rau, ar fi ghicit. Vezi
    `@/lib/woot/lot.ts`.
  */
  const [lotWootDeschis, setLotWootDeschis] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [, startStatusTransition] = useTransition();

  /*
   * Doar schimbarea de status merge optimist: valoarea noua e aleasa din lista, deci
   * o stim inainte sa raspunda serverul si eticheta din tabel se poate misca imediat.
   * Facturile si AWB-urile NU intra aici — numarul documentului vine de la furnizor,
   * nu avem ce afisa pana nu raspunde.
   *
   * DOUA EXCEPTII, si nu sunt cosmetice. „Anulata" si „Rambursata" nu sunt simple
   * etichete: pe server declanseaza emiterea automata a unui document fiscal si
   * eliberarea cuponului folosit (bulk-orders.actions.ts). Nu aratam „Rambursata"
   * inainte sa stim ca s-a intamplat.
   */
  const STATUSURI_CU_EFECTE = new Set(["cancelled", "refunded"]);
  const [comenzi, aplicaOptimistStatus] = useOptimistic(
    orders,
    (stare: Order[], a: { ids: string[]; status: string }) => {
      if (STATUSURI_CU_EFECTE.has(a.status)) return stare;
      const vizate = new Set(a.ids);
      return stare.map((o) => (vizate.has(o.id) ? { ...o, status: a.status } : o));
    },
  );

  const invoiceProviders = useMemo(() => {
    const list: { key: InvoiceProvider; label: string }[] = [];
    if (smartbillEnabled) list.push({ key: "smartbill", label: "SmartBill" });
    if (oblioEnabled) list.push({ key: "oblio", label: "Oblio" });
    if (fgoEnabled) list.push({ key: "fgo", label: "fGO" });
    return list;
  }, [smartbillEnabled, oblioEnabled, fgoEnabled]);
  const anyInvoice = invoiceProviders.length > 0;

  const awbCouriers = useMemo(() => {
    const list: { key: BulkCourier; label: string }[] = [];
    if (cargusEnabled) list.push({ key: "cargus", label: "Cargus" });
    if (samedayEnabled) list.push({ key: "sameday", label: "Sameday" });
    if (fanCourierEnabled) list.push({ key: "fancourier", label: "FAN Courier" });
    if (dpdEnabled) list.push({ key: "dpd", label: "DPD" });
    if (glsEnabled) list.push({ key: "gls", label: "GLS" });
    if (pallexEnabled) list.push({ key: "pallex", label: "Pall-Ex" });
    if (postaEnabled) list.push({ key: "posta", label: "Poșta Română" });
    if (packetaEnabled) list.push({ key: "packeta", label: "Packeta" });
    if (smartshipEnabled) list.push({ key: "smartship", label: "SmartShip" });
    if (shipoEnabled) list.push({ key: "shipo", label: "Shipo.ro" });
    if (fedexEnabled) list.push({ key: "fedex", label: "FedEx" });
    if (upsEnabled) list.push({ key: "ups", label: "UPS" });
    if (dhlEnabled) list.push({ key: "dhl", label: "DHL Express" });
    if (innoshipEnabled) list.push({ key: "innoship", label: "Innoship" });
    return list;
    /* ⚠ Steagul nou TREBUIE trecut si in vectorul de dependinte. Lipsa lui nu produce
       nicio eroare: `useMemo` pastreaza lista veche, deci meniul „Genereaza AWB" pe lot
       ramane fara DHL pana la urmatoarea rerandare care schimba altceva din vector.
       Comerciantul vede o optiune care lipseste fara motiv si crede ca nu e configurat. */
  }, [cargusEnabled, samedayEnabled, fanCourierEnabled, dpdEnabled, glsEnabled, pallexEnabled, postaEnabled, packetaEnabled, smartshipEnabled, shipoEnabled, fedexEnabled, upsEnabled, dhlEnabled, innoshipEnabled]);
  const anyAwb = awbCouriers.length > 0;

  const pageOrderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const selectedOnPage = pageOrderIds.filter((id) => selected.has(id));
  const allPageSelected = pageOrderIds.length > 0 && selectedOnPage.length === pageOrderIds.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageOrderIds.forEach((id) => next.delete(id));
      else pageOrderIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function clearSelection() { setSelected(new Set()); setBulkResult(null); }

  async function runBulk(title: string, fn: () => Promise<BulkResult | { error: string }>) {
    if (selected.size === 0) return;
    /*
     * ⚠ `try/catch/finally`, nu o stingere pe randul de dupa apel.
     *
     * Actiunea de server nu raspunde intotdeauna cu `{ error }`: taiata de platforma la
     * `maxDuration` (300s, `dashboard/orders/page.tsx:27`) sau cu reteaua cazuta, ea
     * RESPINGE. Atunci `setBulkBusy(false)` nu se mai executa, bara de lot ramane cu toate
     * butoanele stinse pana la o reincarcare, si nu apare niciun mesaj.
     *
     * Ce facea omul: credea ca lotul inca lucreaza, reincarca, apasa din nou, si pornea un
     * al doilea lot peste primul. Comenzile deja emise se sar corect, dar cele lasate
     * `in_curs` raspund „deja in lucru", deci al doilea lot arata ca unul care esueaza fara
     * motiv.
     */
    setBulkBusy(true);
    setBulkResult(null);
    let res: BulkResult | { error: string };
    try {
      res = await fn();
    } catch (e) {
      /* ⚠ Mesajul spune ca NU STIM: o parte din comenzi pot fi deja emise la curier. */
      toast.error(
        `${title}: nu stim cate s-au facut, cererea nu a ajuns la capat`
        + `${e instanceof Error && e.message ? ` (${e.message})` : ""}. `
        + "Reincarca pagina si uita-te pe comenzi inainte sa incerci din nou.",
      );
      router.refresh();
      return;
    } finally {
      setBulkBusy(false);
    }
    if ("error" in res) { toast.error(res.error); return; }
    setBulkResult({ title, result: res });
    const parts = [`${res.done} reușite`];
    if (res.skipped) parts.push(`${res.skipped} sărite`);
    if (res.failed) parts.push(`${res.failed} eșuate`);
    /*
     * ⚠ LOTUL OPRIT LA TIMP NU E UN ESEC, SI NICI UN SUCCES (13.09.2026).
     *
     * Serverul are acum un buget propriu sub `maxDuration` si se opreste singur in loc sa fie
     * taiat fara raspuns. Comenzile ramase n-au fost NICI MACAR incercate, deci se pot relua in
     * siguranta, dar asta trebuie SPUS. Fara randul de fata, o selectie de 50 din care s-au
     * apucat 12 ar fi aratat „12 reușite" si atât, iar omul ar fi crezut ca celelalte 38 au
     * disparut sau, mai rau, ca s-au facut.
     */
    if (res.oprit) {
      const ramase = res.total - res.done - res.skipped - res.failed;
      toast.warning(
        `${title}: ${parts.join(", ")}. Lotul s-a oprit la timp, iar ${ramase} `
        + `${ramase === 1 ? "comandă nu a fost încercată" : "comenzi nu au fost încercate"}. `
        + "Selectează-le din nou si reia: nimic nu s-a trimis de două ori.",
      );
    } else if (res.failed > 0) toast.error(`${title}: ${parts.join(", ")}`);
    else toast.success(`${title}: ${parts.join(", ")}`);
    router.refresh();
  }

  /**
   * Etichetele comenzilor alese, intr-un singur PDF.
   *
   * ⚠ NU TRECE PRIN `runBulk`. Acela asteapta un `BulkResult` de la o actiune de
   * server; aici raspunsul e un FISIER, iar ce s-a sarit vine intr-un antet. Fortata
   * in aceeasi forma, descarcarea ar fi trebuit sa intoarca octetii printr-o actiune
   * de server, adica un corp base64 peste pragul de 4,5 MB al Vercel la optsprezece
   * etichete. Vezi nota din `api/etichete/route.ts`.
   *
   * ⚠ E o CITIRE: nu creeaza nimic la curier si nu cheltuie nimic, deci nu cere
   * confirmare si se poate relua oricand. Fix pe dos fata de butonul de alaturi.
   */
  async function descarcaEtichetele() {
    const ids = [...selected];
    setEticheteBusy(true);
    let raspuns: Response;
    try {
      raspuns = await fetch("/api/etichete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, orderIds: ids, format: eticheteFormat }),
      });
    } catch {
      setEticheteBusy(false);
      toast.error("Nu am primit răspuns de la server. Încearcă din nou.");
      return;
    }
    setEticheteBusy(false);

    if (!raspuns.ok) {
      /* Raspunsul de refuz e JSON si poarta si motivele, cand le are. */
      const date = await raspuns.json().catch(() => null) as
        { error?: string; sarite?: { comanda: string; motiv: string }[]; inPlus?: number } | null;
      toast.error(date?.error ?? "Etichetele nu au putut fi descărcate.", { duration: 12000 });
      if (date?.sarite?.length) { setEticheteSarite(date.sarite); setEticheteInPlus(date.inPlus ?? 0); }
      return;
    }

    /*
     * ⚠ Antetul se citeste INAINTE de a atinge corpul: dupa `blob()` raspunsul e
     * consumat, iar o ordine gresita ar fi pierdut tacut lista celor sarite.
     */
    let rezumat: { incluse?: number; sarite?: { comanda: string; motiv: string }[]; inPlus?: number; oprit?: boolean } = {};
    try {
      const brut = raspuns.headers.get("X-Etichete");
      if (brut) rezumat = JSON.parse(decodeURIComponent(brut));
    } catch { /* Fisierul e bun si fara rezumat; nu se opreste descarcarea pentru el. */ }

    const blob = await raspuns.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = numeDinAntet(raspuns) ?? "etichete.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* ⚠ Se elibereaza, altfel fiecare lot lasa in memorie un PDF pana la reincarcare. */
    URL.revokeObjectURL(url);

    setEticheteSarite(rezumat.sarite ?? []);
    setEticheteInPlus(rezumat.inPlus ?? 0);
    const cate = rezumat.incluse ?? 0;
    if (rezumat.oprit) {
      toast.warning(
        `${cate} etichete descărcate. Lotul s-a oprit la timp, restul nu au fost cerute: `
        + "selectează-le din nou și reia. E o citire, nu se întâmplă nimic de două ori.",
        { duration: 12000 },
      );
    } else if ((rezumat.sarite?.length ?? 0) > 0) {
      const sarite = (rezumat.sarite?.length ?? 0) + (rezumat.inPlus ?? 0);
      toast.warning(`${cate} etichete în document, ${sarite} sărite.`, { duration: 10000 });
    } else {
      toast.success(`${cate} ${cate === 1 ? "etichetă descărcată" : "etichete descărcate"}.`);
    }
  }

  function runBulkInvoices() {
    const n = selected.size;
    if (!window.confirm(`Generezi facturi pentru ${n} ${n === 1 ? "comandă" : "comenzi"}? Se emit documente fiscale reale (nu pot fi șterse, doar stornate).`)) return;
    void runBulk("Facturi", () => bulkGenerateInvoices(businessId!, [...selected], invoiceProvider));
  }
  function runBulkAwbs() {
    /*
     * ⚠ SE CERE CONFIRMARE, CA LA FACTURI (14.09.2026).
     *
     * O singura apasare emitea pana la 50 de expedieri REALE, platite la curier, fara nicio
     * intrebare, in timp ce butonul de alaturi cere confirmare pentru facturi. Iar aici
     * greseala e mai greu de desfacut decat o factura: o factura se storneaza, un colet emis
     * la Packeta sau DHL NU se poate anula prin API. Vezi `bulk-orders.actions.ts` la Packeta
     * („API-ul lor nu are anulare, deci fiecare colet creat din greseala trebuie sters de mana
     * din contul lor") si `dhl.actions.ts` („DHL nu are anulare de expediere").
     *
     * ⚠ Textul spune CE se intampla, nu doar „esti sigur?": numarul de expedieri, ca sunt
     * platite, si care sunt curierii fara drum inapoi.
     */
    const n = selected.size;
    if (!window.confirm(
      `Emiti AWB-uri pentru ${n} ${n === 1 ? "comandă" : "comenzi"}? `
      + "Sunt expedieri REALE, plătite la curier. La Packeta și DHL nu există anulare prin API: "
      + "un colet emis din greșeală se șterge doar de mână din contul lor, sau deloc.",
    )) return;
    // With a single connected courier, target it directly; otherwise honor the
    // dropdown ("după client" = each order's checkout courier).
    const courier: BulkCourier = awbCouriers.length === 1 ? awbCouriers[0].key : awbCourier;
    void runBulk("AWB-uri", () => bulkGenerateAwbs(businessId!, [...selected], courier));
  }
  function runBulkStatus() {
    if (!bulkStatus) { toast.error("Alege un status."); return; }
    const label = ORDER_STATUS[bulkStatus as OrderStatus]?.label ?? bulkStatus;
    const ids = [...selected];
    setBulkBusy(true);
    setBulkResult(null);
    startStatusTransition(async () => {
      aplicaOptimistStatus({ ids, status: bulkStatus });
      /* ⚠ In `try` DOAR apelul; ramificarea si mesajele raman afara. Vezi
         `callbackul-de-tranzitie-prinde-caderea`. */
      let res: Awaited<ReturnType<typeof bulkUpdateOrderStatus>>;
      try {
        res = await bulkUpdateOrderStatus(businessId!, ids, bulkStatus);
      } catch {
        /*
         * ⚠ Aici nu ajunge sa spunem „nu stim”. Randurile sunt DEJA colorate de
         * `aplicaOptimistStatus`, iar `useOptimistic` da starea aceea inapoi cand
         * tranzitia se incheie, deci ar arata statusul VECHI. Amandoua mint, doar
         * in directii opuse: una spune ca s-a mutat, cealalta ca nu s-a mutat, si
         * nici una nu stie. Adevarul se cere de pe server.
         */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim cate comenzi s-au mutat. "
          + "Lista se reincarca: uita-te la statusuri inainte sa incerci din nou.",
        );
        router.refresh();
        return;
      } finally {
        setBulkBusy(false);
      }
      if ("error" in res) { toast.error(res.error); return; }
      /*
       * Cate au picat se SPUNE, nu se tace.
       *
       * Actualizarea optimista de mai sus a colorat deja TOATE randurile, iar
       * mesajul vechi numara doar reusitele — deci un lot in care doua comenzi
       * n-au fost mutate deloc arata pe ecran ca mutat complet. `router.refresh()`
       * readuce adevarul din server, dar nimeni nu se uita la un rand care
       * „tocmai a mers".
       */
      /*
       * ⚠ SI CATE AU FOST SARITE. Comenzile ținute de un marketplace nu se mută de aici —
       * starea lor vine de la ei. Fără vorba asta, o selecție de 30 din care 10 sunt eMAG
       * ar fi arătat „20 comenzi → Livrat" și atât, iar omul ar fi căutat celelalte zece
       * prin filtre.
       */
      const sarite = res.sarite ? ` ${res.sarite} sunt din marketplace și se schimbă din contul de acolo.` : "";
      if (res.esuate) {
        toast.error(`${res.updated} comenzi → ${label}. ${res.esuate} NU s-au putut muta — vezi Jurnalul.${sarite}`);
      } else if (res.sarite) {
        toast.warning(`${res.updated} comenzi → ${label}.${sarite}`);
      } else {
        toast.success(`${res.updated} comenzi → ${label}`);
      }
      clearSelection();
      router.refresh();
    });
  }

  // Datele vin gata filtrate si paginate de pe server; interactiunile devin
  // parametri de URL (q, status, page), deci functioneaza la orice volum.
  const totalPages = Math.max(1, Math.ceil(totalCount / ORDERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const allCount = Object.values(statusCounts).reduce((s, n) => s + n, 0);

  const buildUrl = useCallback((next: { q?: string; status?: string; source?: string; page?: number }) => {
    const params = new URLSearchParams();
    const nq = next.q ?? searchQuery;
    const nstatus = next.status ?? statusFilter;
    const nsource = next.source ?? sourceFilter;
    const npage = next.page ?? page;
    if (nq) params.set("q", nq);
    if (nstatus !== "all") params.set("status", nstatus);
    if (nsource !== "all") params.set("source", nsource);
    if (npage > 1) params.set("page", String(npage));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchQuery, statusFilter, sourceFilter, page]);

  // Navigare externa (back/forward, link cu ?q=) → resincronizeaza inputul.
  useEffect(() => {
    if (searchQuery !== lastNavQ.current) {
      lastNavQ.current = searchQuery;
      setSearchInput(searchQuery);
    }
  }, [searchQuery]);

  // Cautarea e debounced si dusa in URL; filtrarea o face serverul, in SQL.
  useEffect(() => {
    if (searchInput === searchQuery) return;
    const t = setTimeout(() => {
      lastNavQ.current = searchInput;
      setSelected(new Set());
      setBulkResult(null);
      startNavTransition(() => router.replace(buildUrl({ q: searchInput, page: 1 }), { scroll: false }));
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, searchQuery, buildUrl, router]);

  function goTo(next: { q?: string; status?: string; source?: string; page?: number }) {
    // Selection is per-view — reset it when changing page / filter so a bulk
    // action never spans invisible orders on other pages.
    setSelected(new Set());
    setBulkResult(null);
    startNavTransition(() => router.push(buildUrl(next), { scroll: false }));
  }

  function handleFilterChange(key: string) {
    goTo({ status: key, page: 1 });
  }

  function handleSourceChange(key: string) {
    goTo({ source: key, page: 1 });
  }

  // Sursele care chiar au comenzi in magazinul asta. „Magazin" intra in lista
  // doar daca exista si un marketplace de deosebit de el.
  const marketplacePrezent = Object.keys(MARKETPLACE_ORIGINI).filter((k) => (sourceCounts[k] ?? 0) > 0);
  // Coloana „Sursă" are rost doar unde exista mai multe surse. Intr-un magazin
  // fara marketplace ar fi o coloana cu aceeasi valoare pe fiecare rand.
  const arataSursa = marketplacePrezent.length > 0;
  const sursePrezente = marketplacePrezent.length === 0 ? [] : [
    { key: "store", label: "Magazin" },
    ...marketplacePrezent.map((k) => ({ key: k, label: MARKETPLACE_ORIGINI[k].label })),
  ];

  function handleSearch(q: string) {
    setSearchInput(q);
  }

  function handleOblioAction(e: React.MouseEvent, orderId: string, action: "invoice" | "proforma" | "storno") {
    e.stopPropagation();
    if (!businessId) return;
    setOblioActionOrderId(orderId);
    setOblioAction(action);
    startOblioTransition(async () => {
      let result: { error: string } | { number: string; series: string } | { success: true };
      try {
        if (action === "invoice") result = await generateOblioInvoice(businessId, orderId);
        else if (action === "proforma") result = await generateOblioProforma(businessId, orderId);
        else result = await stornoOblioInvoice(businessId, orderId);
      } catch {
        /*
         * ⚠⚠ AICI MESAJUL NU ARE VOIE SA INVITE LA REINCERCARE.
         *
         * `generateOblioInvoice` trece prin `slotFacturare`, care tine slotul ocupat
         * cat timp exista o factura FARA storno, deci o a doua apasare dupa o emitere
         * REUSITA e refuzata. Dar garda aceea citeste `orders.oblio_invoice_number`,
         * scris DUPA ce raspunde Oblio. Cand actiunea arunca, documentul poate sa
         * existe la ei fara ca numarul sa fi ajuns la noi: slotul e liber, si o
         * reincercare emite un AL DOILEA document fiscal real.
         */
        const ce = action === "invoice" ? "factura" : action === "proforma" ? "proforma" : "stornarea";
        toast.error(
          `Nu am primit raspuns de la Oblio, deci nu stim daca ${ce} s-a emis. Verifica in contul Oblio INAINTE sa incerci din nou: daca documentul e acolo, dar numarul nu s-a scris pe comanda, o a doua apasare emite inca unul.`,
          { duration: 12000 },
        );
        router.refresh();
        return;
      } finally {
        setOblioActionOrderId(null);
        setOblioAction(null);
      }
      if ("error" in result) {
        toast.error(result.error);
      } else if ("number" in result) {
        const labels = { invoice: "Factura", proforma: "Proforma", storno: "Storno" };
        toast.success(`${labels[action]} Oblio ${result.series}${result.number} generata`);
        router.refresh();
      }
    });
  }

  function handleFgoAction(e: React.MouseEvent, orderId: string, action: "invoice" | "storno") {
    e.stopPropagation();
    if (!businessId) return;
    setFgoActionOrderId(orderId);
    setFgoAction(action);
    startFgoTransition(async () => {
      let result:
        | Awaited<ReturnType<typeof generateFgoInvoice>>
        | Awaited<ReturnType<typeof stornoFgoInvoiceAction>>;
      try {
        result = action === "invoice"
          ? await generateFgoInvoice(businessId, orderId)
          : await stornoFgoInvoiceAction(businessId, orderId);
      } catch {
        /* ⚠⚠ Aceeasi fereastra ca la Oblio, cu `orders.fgo_invoice_number`: slotul
           se ocupa abia dupa ce raspunde fGO, deci o reincercare oarba poate emite
           un al doilea document fiscal real. */
        const ce = action === "invoice" ? "factura" : "stornarea";
        toast.error(
          `Nu am primit raspuns de la fGO, deci nu stim daca ${ce} s-a emis. Verifica in contul fGO INAINTE sa incerci din nou: daca documentul e acolo, dar numarul nu s-a scris pe comanda, o a doua apasare emite inca unul.`,
          { duration: 12000 },
        );
        router.refresh();
        return;
      } finally {
        setFgoActionOrderId(null);
        setFgoAction(null);
      }
      if ("error" in result) {
        toast.error(result.error);
      } else if ("number" in result) {
        const label = action === "invoice" ? "Factura fGO" : "Storno fGO";
        toast.success(`${label} ${result.series}${result.number} generata`);
        router.refresh();
      }
    });
  }

  function handleGenerateInvoice(e: React.MouseEvent, orderId: string) {
    e.stopPropagation();
    if (!businessId) return;
    setGeneratingOrderId(orderId);
    startGenerateTransition(async () => {
      let result: Awaited<ReturnType<typeof generateOrderInvoice>>;
      try {
        result = await generateOrderInvoice(businessId, orderId);
      } catch {
        /* ⚠⚠ `generateOrderInvoice` sta in `smartbill.actions.ts` si isi ia slotul cu
           `casa: "SmartBill"`. Aceeasi fereastra ca la Oblio si fGO. */
        toast.error(
          "Nu am primit raspuns de la SmartBill, deci nu stim daca factura s-a emis. "
          + "Verifica in contul SmartBill INAINTE sa incerci din nou: daca documentul e "
          + "acolo, dar numarul nu s-a scris pe comanda, o a doua apasare emite inca una.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      } finally {
        setGeneratingOrderId(null);
      }
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`Factura ${result.series}${result.number} generata.`);
        router.refresh();
      }
    });
  }

  return (
    <>
      {lotWootDeschis && businessId && (
        <WootBulkModal
          open={lotWootDeschis}
          onClose={() => setLotWootDeschis(false)}
          businessId={businessId}
          /*
            ⚠ Selectia se citeste LA DESCHIDERE si ramane fixa cat sta fereastra:
            altfel o schimbare in tabel ar muta lotul sub ochii omului, intre ce a
            vazut in lista celor sarite si ce apasa pe buton.
          */
          orderIds={[...selected]}
          onDone={() => router.refresh()}
        />
      )}
      {wootModalOrder && businessId && (
        <WootAwbModal
          open={!!wootModalOrder}
          onClose={() => setWootModalOrder(null)}
          order={wootModalOrder}
          businessId={businessId}
          onSuccess={() => { setWootModalOrder(null); router.refresh(); }}
        />
      )}
      {cargusModalOrder && businessId && (
        <CargusAwbModal
          open={!!cargusModalOrder}
          onClose={() => setCargusModalOrder(null)}
          order={cargusModalOrder}
          businessId={businessId}
          onSuccess={() => { setCargusModalOrder(null); router.refresh(); }}
        />
      )}
      {dpdModalOrder && businessId && (
        <DpdAwbModal
          open={!!dpdModalOrder}
          onClose={() => setDpdModalOrder(null)}
          order={dpdModalOrder}
          businessId={businessId}
          onSuccess={() => { setDpdModalOrder(null); router.refresh(); }}
        />
      )}
      {glsModalOrder && businessId && (
        <GlsAwbModal
          open={!!glsModalOrder}
          onClose={() => setGlsModalOrder(null)}
          order={glsModalOrder}
          businessId={businessId}
          onSuccess={() => { setGlsModalOrder(null); router.refresh(); }}
        />
      )}
      {pallexModalOrder && businessId && (
        <PallexAwbModal
          zile={pallexZile}
          open={!!pallexModalOrder}
          onClose={() => setPallexModalOrder(null)}
          order={pallexModalOrder}
          businessId={businessId}
          onSuccess={() => { setPallexModalOrder(null); router.refresh(); }}
        />
      )}
      {ecoletModalOrder && businessId && (
        <EcoletAwbModal
          open={!!ecoletModalOrder}
          onClose={() => setEcoletModalOrder(null)}
          order={ecoletModalOrder}
          businessId={businessId}
          onSuccess={() => { setEcoletModalOrder(null); router.refresh(); }}
        />
      )}
      {fanCourierModalOrder && businessId && (
        <FanCourierAwbModal
          open={!!fanCourierModalOrder}
          onClose={() => setFanCourierModalOrder(null)}
          order={fanCourierModalOrder}
          businessId={businessId}
          onSuccess={() => { setFanCourierModalOrder(null); router.refresh(); }}
        />
      )}
      {fanPickupOpen && businessId && (
        <FanCourierPickupModal
          open={fanPickupOpen}
          onClose={() => setFanPickupOpen(false)}
          businessId={businessId}
          lastPickupDate={fanPickup?.lastDate}
          lastPickupId={fanPickup?.lastId}
          onChanged={() => router.refresh()}
        />
      )}
      {dpdPickupOpen && businessId && (
        <DpdPickupModal
          open={dpdPickupOpen}
          onClose={() => setDpdPickupOpen(false)}
          businessId={businessId}
        />
      )}
      {cargusPickupOpen && businessId && (
        <CargusPickupModal
          open={cargusPickupOpen}
          onClose={() => setCargusPickupOpen(false)}
          businessId={businessId}
        />
      )}
      {coleteModalOrder && businessId && (
        <ColeteAwbModal
          open={!!coleteModalOrder}
          onClose={() => setColeteModalOrder(null)}
          order={coleteModalOrder}
          businessId={businessId}
          onSuccess={() => { setColeteModalOrder(null); router.refresh(); }}
        />
      )}
      {samedayModalOrder && businessId && (
        <SamedayAwbModal
          open={!!samedayModalOrder}
          onClose={() => setSamedayModalOrder(null)}
          order={samedayModalOrder}
          businessId={businessId}
          onSuccess={() => { setSamedayModalOrder(null); router.refresh(); }}
        />
      )}
      {/* Header */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Comenzi</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Toate comenzile primite</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {fanCourierEnabled && businessId && (
              <button
                type="button"
                onClick={() => setFanPickupOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full ring-1 ring-foreground/10 bg-card text-foreground hover:bg-muted transition-colors"
              >
                Cheama curierul FAN
              </button>
            )}
            {dpdEnabled && businessId && (
              <button
                type="button"
                onClick={() => setDpdPickupOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full ring-1 ring-foreground/10 bg-card text-foreground hover:bg-muted transition-colors"
              >
                Cheama curierul DPD
              </button>
            )}
            {cargusEnabled && businessId && (
              <button
                type="button"
                onClick={() => setCargusPickupOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full ring-1 ring-foreground/10 bg-card text-foreground hover:bg-muted transition-colors"
              >
                Cheama curierul Cargus
              </button>
            )}
            {pendingCount > 0 && (
              <span className="px-3 py-1.5 bg-warning/10 text-warning text-xs font-semibold rounded-full border border-warning/20">
                {pendingCount} in asteptare
              </span>
            )}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Cauta comanda, client..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-xl bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => handleSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-4 scrollbar-hide">
        {STATUS_TABS.map(tab => {
          const count = tab.key === "all" ? allCount : (statusCounts[tab.key] ?? 0);
          if (count === 0 && tab.key !== "all") return null;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleFilterChange(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                statusFilter === tab.key
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                statusFilter === tab.key ? "bg-white/20 text-white" : "bg-background text-muted-foreground"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        * Filtrele de sursa apar DOAR daca magazinul chiar vinde si pe un
        * marketplace. Pentru cei care vand doar prin magazinul propriu, un rand
        * de filtre cu un singur buton n-ar spune nimic si ar incarca ecranul.
        */}
      {sursePrezente.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-4 scrollbar-hide">
          {[{ key: "all", label: "Toate sursele" }, ...sursePrezente].map((tab) => {
            const count = tab.key === "all"
              ? Object.values(sourceCounts).reduce((s, n) => s + n, 0)
              : (sourceCounts[tab.key] ?? 0);
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleSourceChange(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  sourceFilter === tab.key
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                  sourceFilter === tab.key ? "bg-background/20 text-background" : "bg-background text-muted-foreground"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search result info */}
      {searchQuery.trim() && (
        <p className="text-sm text-muted-foreground mb-3">
          {totalCount === 0
            ? `Niciun rezultat pentru "${searchQuery}"`
            : `${totalCount} ${totalCount === 1 ? "rezultat" : "rezultate"} pentru "${searchQuery}"`}
        </p>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-20 mb-3 rounded-xl border border-primary/30 bg-surface shadow-sm">
          <div className="flex flex-wrap items-center gap-2 p-3">
            <div className="mr-auto flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <CheckSquare className="h-4 w-4 text-primary" />
                {selected.size} {selected.size === 1 ? "selectată" : "selectate"}
              </span>
              <button type="button" onClick={clearSelection} className="text-xs text-muted-foreground underline hover:text-foreground">
                Deselectează
              </button>
            </div>

            {/* Status change */}
            <div className="flex items-center gap-1.5">
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                disabled={bulkBusy}
                aria-label="Schimbă statusul"
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg ring-1 ring-foreground/10 bg-card text-foreground disabled:opacity-50"
              >
                <option value="">Schimbă status…</option>
                {STATUS_TABS.filter((t) => t.key !== "all").map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={runBulkStatus}
                disabled={bulkBusy || !bulkStatus}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ring-1 ring-foreground/10 bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                Aplică
              </button>
            </div>

            {/* Bulk invoices */}
            {anyInvoice && businessId && (
              <div className="flex items-center gap-1.5">
                {invoiceProviders.length > 1 && (
                  <select
                    value={invoiceProvider}
                    onChange={(e) => setInvoiceProvider(e.target.value as InvoiceProvider)}
                    disabled={bulkBusy}
                    aria-label="Furnizor factură"
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg ring-1 ring-foreground/10 bg-card text-foreground disabled:opacity-50"
                  >
                    <option value="auto">Factură: automat</option>
                    {invoiceProviders.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                )}
                <button
                  type="button"
                  onClick={runBulkInvoices}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ring-1 ring-foreground/10 bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <FileCheck className="h-3.5 w-3.5" /> Generează facturi
                </button>
              </div>
            )}

            {/* Bulk AWBs */}
            {anyAwb && businessId && (
              <div className="flex items-center gap-1.5">
                {awbCouriers.length > 1 && (
                  <select
                    value={awbCourier}
                    onChange={(e) => setAwbCourier(e.target.value as BulkCourier)}
                    disabled={bulkBusy}
                    aria-label="Curier AWB"
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg ring-1 ring-foreground/10 bg-card text-foreground disabled:opacity-50"
                  >
                    <option value="auto">AWB: după client</option>
                    {awbCouriers.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                )}
                <button
                  type="button"
                  onClick={runBulkAwbs}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ring-1 ring-foreground/10 bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <Package className="h-3.5 w-3.5" /> Generează AWB{awbCouriers.length === 1 ? ` ${awbCouriers[0].label}` : "-uri"}
                </button>
              </div>
            )}

            {/*
              Lotul Woot, separat fiindca cere o alegere.

              ⚠ Apare doar cand Woot e pornit pe magazin: un buton care deschide o
              fereastra ce raspunde „Woot nu este configurat" e mai rau decat lipsa lui.
            */}
            {wootEnabled && businessId && (
              <button
                type="button"
                onClick={() => setLotWootDeschis(true)}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ring-1 ring-foreground/10 bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Package className="h-3.5 w-3.5" /> AWB-uri Woot
              </button>
            )}

            {/*
              Descarcarea etichetelor deja emise.

              ⚠ Nu cere confirmare, spre deosebire de butonul de alaturi: e o CITIRE
              la curier, nu creeaza nimic si nu costa nimic. Se poate relua oricand.
            */}
            {businessId && (
              <div className="flex items-center gap-1.5">
                <select
                  value={eticheteFormat}
                  onChange={(e) => setEticheteFormat(e.target.value as "A4" | "A6")}
                  disabled={eticheteBusy}
                  aria-label="Formatul etichetelor"
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg ring-1 ring-foreground/10 bg-card text-foreground disabled:opacity-50"
                >
                  <option value="A4">A4</option>
                  <option value="A6">Etichetă mică</option>
                </select>
                <button
                  type="button"
                  onClick={() => void descarcaEtichetele()}
                  disabled={eticheteBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ring-1 ring-foreground/10 bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {eticheteBusy
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Download className="h-3.5 w-3.5" />}
                  Descarcă etichetele
                </button>
              </div>
            )}

            {bulkBusy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </div>

          {/*
            ⚠ CE S-A SARIT SE VEDE PE ECRAN, nu doar intr-un mesaj care trece.
            Fisierul se descarca singur, deci fara lista asta comerciantul ar fi
            ramas cu un document de cincisprezece pagini dintr-o selectie de
            optsprezece si fara nicio cale sa afle care trei lipsesc.
          */}
          {eticheteSarite.length > 0 && (
            <div className="border-t border-border px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">
                  Etichete nedescărcate: {eticheteSarite.length + eticheteInPlus}
                </p>
                <button
                  type="button"
                  onClick={() => { setEticheteSarite([]); setEticheteInPlus(0); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Închide
                </button>
              </div>
              <ul className="mt-1.5 space-y-1">
                {eticheteSarite.map((x) => (
                  <li key={x.comanda} className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{x.comanda}</span>: {x.motiv}
                  </li>
                ))}
                {eticheteInPlus > 0 && (
                  /* ⚠ Se SPUNE ca lista e taiata: altfel numarul de sus si randurile de
                     jos s-ar contrazice, si omul ar crede ca ecranul se inseala. */
                  <li className="text-[11px] text-muted-foreground">
                    și încă {eticheteInPlus} {eticheteInPlus === 1 ? "comandă" : "comenzi"}.
                    Descarcă-le pe rând, din tabel.
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Results (esp. failures) */}
          {bulkResult && (
            <div className="border-t border-border px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{bulkResult.title}:</span>{" "}
                  <span className="text-success">{bulkResult.result.done} reușite</span>
                  {bulkResult.result.skipped > 0 && <span> · {bulkResult.result.skipped} sărite</span>}
                  {bulkResult.result.failed > 0 && <span className="text-destructive"> · {bulkResult.result.failed} eșuate</span>}
                </p>
                <button type="button" onClick={() => setBulkResult(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {bulkResult.result.errors.length > 0 && (
                <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto">
                  {bulkResult.result.errors.slice(0, 20).map((er, i) => (
                    <li key={i} className="text-[11px] text-destructive">
                      <span className="font-mono font-semibold">{er.order}</span>: {er.message}
                    </li>
                  ))}
                  {/* ⚠ TAIEREA SE SPUNE. Lista arata primele douazeci de motive; peste atat,
                      omul repara ce vede, apasa din nou si cade iar, fara sa afle ca restul
                      aveau ALT motiv. Randul asta nu rezolva taierea, dar o face vizibila. */}
                  {bulkResult.result.errors.length > 20 && (
                    <li className="text-[11px] font-semibold text-destructive">
                      si inca {bulkResult.result.errors.length - 20}
                      {bulkResult.result.errors.length - 20 === 1 ? " motiv nearatat" : " motive nearatate"}
                      {" "}(pot fi altele decat cele de mai sus)
                    </li>
                  )}
                </ul>
              )}
              {/*
                ⚠ „SARITE" SE DESFACE PE MOTIVE (14.09.2026).
                Randul de dinainte spunea o singura propozitie peste trei motive care cer
                miscari OPUSE, si numea doi curieri anume („Woot / Colete") desi lista era mai
                lunga. Comerciantul citea „7 sărite" si nu avea cum sa stie daca mai are ceva de
                facut. Acum fiecare motiv isi spune numarul, iar cel care CERE o miscare e
                singurul scris apasat.
              */}
              {bulkResult.result.motiveSarite && bulkResult.result.skipped > 0 && (
                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  {bulkResult.result.motiveSarite.dejaAreAwb > 0 && (
                    <li>{bulkResult.result.motiveSarite.dejaAreAwb} aveau deja AWB la acest curier. Nimic de făcut.</li>
                  )}
                  {bulkResult.result.motiveSarite.duseDeMarketplace > 0 && (
                    <li>{bulkResult.result.motiveSarite.duseDeMarketplace} au transportul în fluxul marketplace-ului. Eticheta o face el.</li>
                  )}
                  {bulkResult.result.motiveSarite.faraCurierPotrivit > 0 && (
                    <li className="text-foreground">
                      <span className="font-semibold">{bulkResult.result.motiveSarite.faraCurierPotrivit}</span>
                      {" "}au un curier care nu intră în generarea în masă sau nu e conectat:
                      {" "}acelea cer emitere individuală, din rândul comenzii. Numerele lor sunt în lista de mai sus.
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className={cn("bg-surface border border-border rounded-xl overflow-hidden transition-opacity", isPending && "opacity-60")}>
        {comenzi.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        ref={(el) => { if (el) el.indeterminate = selectedOnPage.length > 0 && !allPageSelected; }}
                        onChange={toggleAllPage}
                        aria-label="Selectează toate comenzile de pe pagină"
                        className="h-4 w-4 rounded border-border accent-primary cursor-pointer align-middle"
                      />
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Comanda</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Client</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    {arataSursa && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Sursă</th>
                    )}
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Data</th>
                    {wootEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB Woot</th>
                    )}
                    {cargusEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB Cargus</th>
                    )}
                    {dpdEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB DPD</th>
                    )}
                    {glsEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB GLS</th>
                    )}
                    {/* ⚠ Ordinea coloanelor din <thead> si din <tbody> trebuie sa fie
                        ACEEASI: gardate de acelasi steag dar asezate altfel, tabelul
                        se decaleaza pe latime si nimic nu semnaleaza asta. */}
                    {pallexEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Partida Pall-Ex</th>
                    )}
                    {ecoletEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB eColet</th>
                    )}
                    {fanCourierEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB FAN Courier</th>
                    )}
                    {samedayEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB Sameday</th>
                    )}
                    {coleteEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AWB Colete</th>
                    )}
                    {oblioEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Oblio</th>
                    )}
                    {fgoEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">fGO</th>
                    )}
                    {smartbillEnabled && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Documente</th>
                    )}
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {comenzi.map((order) => {
                    const status = orderStatus(order.status);
                    const origine = deriveOrigin(order.order_source);
                    const moneda = monedaComenzii(order.order_source);
                    /*
                     * ⚠ ACELASI ADEVAR CA PE PAGINA COMENZII.
                     *
                     * Lista arata „Creeaza AWB" pe orice comanda fara numar, deci si pe
                     * cele pe care serverul le refuza INTOTDEAUNA: livrare dusa de
                     * marketplace, plata in avans neconfirmata, comanda anulata, sau un
                     * colet dus deja de alt curier. Omul apasa, primeste eroare, si nu
                     * intelege de ce, mai ales in lot, unde apasa pe multe deodata.
                     *
                     * Se cheama chiar functia pe care o cheama si poarta de pe server,
                     * cu aceeasi harta de coloane: doua adevaruri despre aceeasi comanda
                     * s-ar fi despartit la primul curier nou.
                     */
                    const randComanda = order as unknown as Record<string, unknown>;
                    const refuzAwbLista = deCeNuSePoateAwbPropriu({
                      order_source: randComanda["order_source"] ?? null,
                      payment_status: (order.payment_status as string | null) ?? null,
                      status: (order.status as string | null) ?? null,
                      awburi: awburiDinRand(randComanda),
                    });
                    return (
                      <tr
                        key={order.id}
                        className={cn("hover:bg-muted/30 transition-colors cursor-pointer group", selected.has(order.id) && "bg-primary/5")}
                        onClick={() => window.location.href = `/dashboard/orders/${order.id}`}
                      >
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(order.id)}
                            onChange={() => toggleOne(order.id)}
                            aria-label={`Selectează comanda ${order.order_number}`}
                            className="h-4 w-4 rounded border-border accent-primary cursor-pointer align-middle"
                          />
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm font-semibold text-foreground">{order.order_number}</td>
                        <td className="px-5 py-3.5 text-muted-foreground hidden sm:table-cell">
                          <div className="font-medium text-foreground">{order.customer_name}</div>
                          {/* Numele ramane al persoanei de contact; denumirea firmei
                              e pe randul de sub el, ca sa se vada dintr-o privire
                              pe ce se emite factura. */}
                          {(() => {
                            const firma = readBillingCompany(order.billing_company);
                            return firma ? (
                              <div className="text-xs text-foreground/80">
                                {firma.company_name}
                                <span className="ml-1.5 px-1 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary align-middle">PJ</span>
                              </div>
                            ) : null;
                          })()}
                          <div className="text-xs">{order.customer_phone}</div>
                        </td>
                        <td
                          className={cn(
                            "px-5 py-3.5 font-medium whitespace-nowrap",
                            moneda === "?" ? "text-warning" : "text-foreground",
                          )}
                          /*
                            ⚠ „?" INSEAMNA CA NU STIM IN CE MONEDA E. Marketplace-ul a trimis un cod
                            pe care nu l-am putut citi; rambursul si factura automata refuza deja pe
                            comanda asta, iar fara semnul de aici comerciantul ar fi cautat degeaba
                            de ce nu merg.
                          */
                          title={moneda === "?" ? "Moneda comenzii nu a putut fi citită. Verific-o înainte de a emite AWB cu ramburs sau factură." : undefined}
                        >
                          {/* Comenzile de marketplace vin in moneda lor: „40 lei"
                              pe o comanda de 40 EUR ar fi mai putin de jumatate. */}
                          {moneda ? `${Number(order.total).toFixed(2)} ${moneda}` : formatPrice(Number(order.total))}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <EtichetaStare ton={status.ton}>{status.label}</EtichetaStare>
                        </td>
                        {arataSursa && (
                          <td className="px-5 py-3.5 hidden sm:table-cell">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium whitespace-nowrap",
                              claseSursa(origine),
                            )}>
                              {origine.label}
                            </span>
                          </td>
                        )}
                        <td className="px-5 py-3.5 text-muted-foreground hidden md:table-cell">
                          {formatDate(new Date(order.created_at))}
                        </td>
                        {wootEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {order.woot_awb_number ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setWootModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {order.woot_awb_number}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); apasaAwb(refuzAwbLista, () => setWootModalOrder(order)); }}
                                aria-disabled={!!refuzAwbLista}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                                  refuzAwbLista
                                    ? "border-border/60 bg-muted/20 text-muted-foreground cursor-pointer"
                                    : "border-border bg-muted/40 hover:bg-muted text-foreground",
                                )}
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {cargusEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {order.cargus_awb_number ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setCargusModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {order.cargus_awb_number}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); apasaAwb(refuzAwbLista, () => setCargusModalOrder(order)); }}
                                aria-disabled={!!refuzAwbLista}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                                  refuzAwbLista
                                    ? "border-border/60 bg-muted/20 text-muted-foreground cursor-pointer"
                                    : "border-border bg-muted/40 hover:bg-muted text-foreground",
                                )}
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {dpdEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {(order as unknown as Record<string, unknown>)["dpd_awb_number"] ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setDpdModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {(order as unknown as Record<string, unknown>)["dpd_awb_number"] as string}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); apasaAwb(refuzAwbLista, () => setDpdModalOrder(order)); }}
                                aria-disabled={!!refuzAwbLista}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                                  refuzAwbLista
                                    ? "border-border/60 bg-muted/20 text-muted-foreground cursor-pointer"
                                    : "border-border bg-muted/40 hover:bg-muted text-foreground",
                                )}
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {glsEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {(order as unknown as Record<string, unknown>)["gls_awb_number"] ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setGlsModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {(order as unknown as Record<string, unknown>)["gls_awb_number"] as string}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); apasaAwb(refuzAwbLista, () => setGlsModalOrder(order)); }}
                                aria-disabled={!!refuzAwbLista}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                                  refuzAwbLista
                                    ? "border-border/60 bg-muted/20 text-muted-foreground cursor-pointer"
                                    : "border-border bg-muted/40 hover:bg-muted text-foreground",
                                )}
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {pallexEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {(order as unknown as Record<string, unknown>)["pallex_awb_number"] ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setPallexModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {(order as unknown as Record<string, unknown>)["pallex_awb_number"] as string}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); apasaAwb(refuzAwbLista, () => setPallexModalOrder(order)); }}
                                aria-disabled={!!refuzAwbLista}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                                  refuzAwbLista
                                    ? "border-border/60 bg-muted/20 text-muted-foreground cursor-pointer"
                                    : "border-border bg-muted/40 hover:bg-muted text-foreground",
                                )}
                              >
                                <Package className="h-3 w-3" />
                                Creeaza partida
                              </button>
                            )}
                          </td>
                        )}
                        {ecoletEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {(order as unknown as Record<string, unknown>)["ecolet_awb_number"] ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setEcoletModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {(order as unknown as Record<string, unknown>)["ecolet_awb_number"] as string}
                              </button>
                            ) : (order as unknown as Record<string, unknown>)["ecolet_order_to_send_id"] ? (
                              /* Starea proprie eColet: expedierea a plecat, AWB-ul inca nu exista.
                                 Fara randul asta comerciantul ar vedea „Creeaza AWB" pe o comanda
                                 care are deja un transport real in curs — si ar apasa. */
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setEcoletModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                se emite...
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); apasaAwb(refuzAwbLista, () => setEcoletModalOrder(order)); }}
                                aria-disabled={!!refuzAwbLista}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                                  refuzAwbLista
                                    ? "border-border/60 bg-muted/20 text-muted-foreground cursor-pointer"
                                    : "border-border bg-muted/40 hover:bg-muted text-foreground",
                                )}
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {fanCourierEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {(order as unknown as Record<string, unknown>)["fan_courier_awb_number"] ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setFanCourierModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {(order as unknown as Record<string, unknown>)["fan_courier_awb_number"] as string}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); apasaAwb(refuzAwbLista, () => setFanCourierModalOrder(order)); }}
                                aria-disabled={!!refuzAwbLista}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                                  refuzAwbLista
                                    ? "border-border/60 bg-muted/20 text-muted-foreground cursor-pointer"
                                    : "border-border bg-muted/40 hover:bg-muted text-foreground",
                                )}
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {samedayEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {(order as unknown as Record<string, unknown>)["sameday_awb_number"] ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setSamedayModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {(order as unknown as Record<string, unknown>)["sameday_awb_number"] as string}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); apasaAwb(refuzAwbLista, () => setSamedayModalOrder(order)); }}
                                aria-disabled={!!refuzAwbLista}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                                  refuzAwbLista
                                    ? "border-border/60 bg-muted/20 text-muted-foreground cursor-pointer"
                                    : "border-border bg-muted/40 hover:bg-muted text-foreground",
                                )}
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {coleteEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {(order as unknown as Record<string, unknown>)["colete_awb_number"] ? (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setColeteModalOrder(order); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info hover:bg-info/20 transition-colors"
                              >
                                <Package className="h-3 w-3" />
                                {(order as unknown as Record<string, unknown>)["colete_awb_number"] as string}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); apasaAwb(refuzAwbLista, () => setColeteModalOrder(order)); }}
                                aria-disabled={!!refuzAwbLista}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                                  refuzAwbLista
                                    ? "border-border/60 bg-muted/20 text-muted-foreground cursor-pointer"
                                    : "border-border bg-muted/40 hover:bg-muted text-foreground",
                                )}
                              >
                                <Package className="h-3 w-3" />
                                Creeaza AWB
                              </button>
                            )}
                          </td>
                        )}
                        {oblioEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {order.oblio_storno_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive">
                                  <XCircle className="h-3 w-3" />
                                  Storno {order.oblio_storno_series}{order.oblio_storno_number}
                                </span>
                              ) : order.oblio_invoice_number ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success">
                                    <FileCheck className="h-3 w-3" />
                                    Factura {order.oblio_invoice_series}{order.oblio_invoice_number}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={e => handleOblioAction(e, order.id, "storno")}
                                    disabled={oblioActionOrderId === order.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                                  >
                                    {oblioActionOrderId === order.id && oblioAction === "storno" ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                                    Storno
                                  </button>
                                </>
                              ) : order.oblio_proforma_number ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info">
                                    <FileText className="h-3 w-3" />
                                    Proforma {order.oblio_proforma_series}{order.oblio_proforma_number}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={e => handleOblioAction(e, order.id, "invoice")}
                                    disabled={oblioActionOrderId === order.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-success/20 bg-success/5 text-success hover:bg-success/10 transition-colors disabled:opacity-50"
                                  >
                                    {oblioActionOrderId === order.id && oblioAction === "invoice" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
                                    Factura
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={e => handleOblioAction(e, order.id, "invoice")}
                                    disabled={oblioActionOrderId === order.id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
                                  >
                                    {oblioActionOrderId === order.id && oblioAction === "invoice" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
                                    Factura
                                  </button>
                                  <button
                                    type="button"
                                    onClick={e => handleOblioAction(e, order.id, "proforma")}
                                    disabled={oblioActionOrderId === order.id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
                                  >
                                    {oblioActionOrderId === order.id && oblioAction === "proforma" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                                    Proforma
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                        {fgoEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(order as unknown as Record<string, unknown>)["fgo_storno_number"] ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive">
                                  <XCircle className="h-3 w-3" />
                                  Storno {(order as unknown as Record<string, unknown>)["fgo_storno_series"] as string}{(order as unknown as Record<string, unknown>)["fgo_storno_number"] as string}
                                </span>
                              ) : (order as unknown as Record<string, unknown>)["fgo_invoice_number"] ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success">
                                    <FileCheck className="h-3 w-3" />
                                    {(order as unknown as Record<string, unknown>)["fgo_invoice_series"] as string}{(order as unknown as Record<string, unknown>)["fgo_invoice_number"] as string}
                                  </span>
                                  {(order as unknown as Record<string, unknown>)["fgo_invoice_link"] && (
                                    <a
                                      href={(order as unknown as Record<string, unknown>)["fgo_invoice_link"] as string}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                                    >
                                      <FileText className="h-3 w-3" />
                                      PDF
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={e => handleFgoAction(e, order.id, "storno")}
                                    disabled={fgoActionOrderId === order.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                                  >
                                    {fgoActionOrderId === order.id && fgoAction === "storno" ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                                    Storno
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={e => handleFgoAction(e, order.id, "invoice")}
                                  disabled={fgoActionOrderId === order.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
                                >
                                  {fgoActionOrderId === order.id && fgoAction === "invoice" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
                                  Factura
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                        {smartbillEnabled && (
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            <div className="flex items-center gap-1.5">
                              {order.smartbill_storno_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive">
                                  <XCircle className="h-3 w-3" />
                                  Storno
                                </span>
                              ) : order.smartbill_invoice_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success">
                                  <FileCheck className="h-3 w-3" />
                                  Factura
                                </span>
                              ) : order.smartbill_estimate_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info">
                                  <FileText className="h-3 w-3" />
                                  Proforma
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={e => handleGenerateInvoice(e, order.id)}
                                  disabled={generatingOrderId === order.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
                                >
                                  {generatingOrderId === order.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <img src="/integrations/smartbill.webp" alt="SmartBill" className="h-3.5 w-auto" style={{ maxWidth: 14, objectFit: "contain" }} />
                                  )}
                                  Factura
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="px-5 py-3.5">
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  {(currentPage - 1) * ORDERS_PAGE_SIZE + 1}–{Math.min(currentPage * ORDERS_PAGE_SIZE, totalCount)} din {totalCount} comenzi
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => goTo({ page: Math.max(1, currentPage - 1) })}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === "..." ? (
                        <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">...</span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          onClick={() => goTo({ page: item as number })}
                          className={cn(
                            "min-w-[28px] h-7 px-2 rounded-lg text-xs font-medium border transition-colors",
                            currentPage === item
                              ? "bg-primary text-white border-primary"
                              : "border-border hover:bg-muted text-muted-foreground"
                          )}
                        >
                          {item}
                        </button>
                      )
                    )}
                  <button
                    type="button"
                    onClick={() => goTo({ page: Math.min(totalPages, currentPage + 1) })}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-16 text-center">
            {searchQuery.trim() ? (
              <>
                <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">Niciun rezultat</p>
                <p className="text-xs text-muted-foreground mb-4">Incearca un alt termen de cautare</p>
                <Button variant="outline" onClick={() => handleSearch("")}>
                  <X />
                  Sterge cautarea
                </Button>
              </>
            ) : (
              <>
                <ShoppingCart className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">
                  {statusFilter === "all" ? "Nicio comanda inca" : `Nicio comanda cu statusul "${ORDER_STATUS[statusFilter as OrderStatus]?.label}"`}
                </p>
                <p className="text-xs text-muted-foreground">Comenzile clientilor vor aparea aici</p>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
