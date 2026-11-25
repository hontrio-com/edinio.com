"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { numeleFisierului, sePoateRandaCaImagine } from "@/lib/customization/adresa";
import { toast } from "sonner";
import {
  ArrowLeft, Phone, Package, FileText, Loader2, Download, Mail, MessageSquare,
  RotateCcw, AlertTriangle, XCircle, ArrowRight, FileCheck, Trash2,
  ExternalLink, Pencil, Check, ChevronDown, Info, X,
} from "lucide-react";
import { marketplaceCareTineComanda, cineTineComanda, mementoulMarketplace, procesataInEasySales, MESAJ_STAREA_IN_EASYSALES } from "@/lib/orders/origin";
import { EasySalesComandaPanel } from "@/components/dashboard/easysales/EasySalesComandaPanel";
import { TbiComandaPanel } from "@/components/dashboard/tbi/TbiComandaPanel";
import { PAYMENT_METHOD_DEFAULT_LABELS, type PaymentMethodType } from "@/lib/payment-methods";
import { awburiDinRand, deCeNuSePoateAwbPropriu, numarDeUrmarire } from "@/lib/orders/awb-propriu";
import { deCeNuSeStergeComanda } from "@/lib/orders/stergerea-comenzii";
import { readBillingCompany } from "@/lib/billing/company";
import { formatDate, formatPrice, pluralRo, unitarSeInchide } from "@/lib/utils/format";
import { deriveOrigin, MARKETPLACE_ORIGINI } from "@/lib/orders/origin";
import { pozaLiniei } from "@/lib/orders/miniaturi-produse";
import { MiniaturaProdus } from "@/components/dashboard/MiniaturaProdus";
import { ORDER_STATUS, type OrderStatus } from "@/lib/orders/status";
import type { TonEticheta } from "@/components/ui/eticheta-stare";
import { totaluriComanda, type SetariTvaMagazin } from "@/lib/orders/totals-box";
import {
  citesteDefalcarea, suprafataDeAratat, caM2, type DefalcareCitita,
} from "@/lib/orders/defalcare-personalizare";
import { updateOrder, deleteOrder, sendCustomerNotification, sendCustomerSms } from "@/lib/actions/order.actions";
import {
  generateOrderInvoice,
  generateOrderEstimate,
  convertEstimateToInvoice,
  stornoOrderInvoice,
  resendSmartbillEmail,
} from "@/lib/actions/smartbill.actions";
import { generateOblioInvoice, generateOblioProforma, stornoOblioInvoice } from "@/lib/actions/oblio.actions";
import { generateFgoInvoice, stornoFgoInvoiceAction } from "@/lib/actions/fgo.actions";
import { generateFacturisInvoice, refreshFacturisDocuments, stornoFacturisInvoiceAction } from "@/lib/actions/facturis.actions";
import { generateFactureazaInvoice, refreshFactureazaDocuments, stornoFactureazaInvoiceAction } from "@/lib/actions/factureaza.actions";
import { generateEasybillInvoice, refreshEasybillDocuments } from "@/lib/actions/easybill.actions";
import { eDocumentDeTestFactureaza } from "@/lib/factureaza/config";
import { FilaCaseiCuCheie } from "@/components/dashboard/facturare/FilaCaseiCuCheie";
import { EasybillStornareManuala } from "@/components/dashboard/easybill/EasybillStornareManuala";
import { SagaComandaPanel } from "@/components/dashboard/saga/SagaComandaPanel";
import type { StarePanouSaga } from "@/lib/saga/config";
import { rambourseazaPrinNetopia } from "@/lib/actions/netopia.actions";
import { rambourseazaPrinIpay } from "@/lib/actions/ipay.actions";
import { rambourseazaPrinKlarna } from "@/lib/actions/klarna.actions";
import { rambourseazaPrinRevolut } from "@/lib/actions/revolut.actions";
import { WootAwbModal } from "@/components/dashboard/WootAwbModal";
import { CargusAwbModal } from "@/components/dashboard/CargusAwbModal";
import { DpdAwbModal } from "@/components/dashboard/DpdAwbModal";
import { FanCourierAwbModal } from "@/components/dashboard/FanCourierAwbModal";
import { euCountryByIso2 } from "@/lib/eu-countries";
import { SamedayAwbModal } from "@/components/dashboard/SamedayAwbModal";
import { ColeteAwbModal } from "@/components/dashboard/ColeteAwbModal";
import { GlsAwbModal } from "@/components/dashboard/GlsAwbModal";
import { PallexAwbModal } from "@/components/dashboard/PallexAwbModal";
import { EcoletAwbModal } from "@/components/dashboard/EcoletAwbModal";
import { PostaAwbModal } from "@/components/dashboard/PostaAwbModal";
import { CurieraAwbModal, type OptiuniAwbCuriera } from "@/components/dashboard/CurieraAwbModal";
import { EpacketAwbModal, type OptiuniAwbEpacket } from "@/components/dashboard/EpacketAwbModal";
import { NUME_CURIER_EPACKET } from "@/lib/epacket/client";
import { curierulReal, urmareste } from "@/lib/cont/urmarire";
import { PacketaAwbModal } from "@/components/dashboard/PacketaAwbModal";
import { SmartshipAwbModal } from "@/components/dashboard/SmartshipAwbModal";
import { ShipoAwbModal } from "@/components/dashboard/ShipoAwbModal";
import { FedexAwbModal } from "@/components/dashboard/FedexAwbModal";
import { UpsAwbModal } from "@/components/dashboard/UpsAwbModal";
import { DhlAwbModal } from "@/components/dashboard/DhlAwbModal";
import { InnoshipAwbModal } from "@/components/dashboard/InnoshipAwbModal";
import { EmagFulfillmentPanel } from "@/components/dashboard/EmagFulfillmentPanel";
import { OrderEditModal } from "@/components/dashboard/OrderEditModal";
import TrendyolFulfillmentPanel from "@/components/dashboard/TrendyolFulfillmentPanel";
import { OperatiiAtarnate } from "@/components/dashboard/OperatiiAtarnate";
import { ReturDePrimit } from "@/components/dashboard/ReturDePrimit";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { etichetaRambursWoot } from "@/lib/shipping/ramburs-woot";
import { useCampuriCheckout } from "@/components/dashboard/DetaliiCheckoutAwb";
import { detaliileDeLaCheckout } from "@/lib/cont/detalii-checkout";
import type { Database } from "@/types/database.types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";
import { ATINGERE, ButonSigla, INEL, PunctStare } from "@/components/dashboard/atomi-panou";
import { siglaMica, type Sigla } from "@/lib/integrari/sigle";
import { legaturaLiniei } from "@/lib/orders/legaturi-produse";

type Order = Database["public"]["Tables"]["orders"]["Row"];

/** Casele de facturare care pot avea o fila in cardul „Facturare” al comenzii. */
type CasaDeFacturare = "smartbill" | "oblio" | "fgo" | "facturis" | "factureaza" | "easybill";

interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  customization?: Record<string, { type: string; label: string; value: string | string[] }>;
  /**
   * Din ce se compune pretul liniei, scris de server odata cu `customization`.
   *
   * ⚠ Ramane `unknown` dinadins. E jsonb vechi, iar liniile trecute prin editarea din panou isi
   * pastreaza cheile necunoscute printr-un spread: o forma DECLARATA aici ar fi fost o promisiune
   * pe care baza n-o tine. Se verifica la citire, in `citesteDefalcarea`.
   */
  personalizare?: unknown;
}

interface ShippingAddress {
  county: string;
  city: string;
  address: string;
  country?: string;
  postal_code?: string;
  courier?: string;
  courier_label?: string;
  delivery_type?: string;
  locker_id?: string;
  locker_name?: string;
}

/*
  ⚠ NUMELE STARILOR NU SE MAI SCRIU AICI: vin din `ORDER_STATUS`.

  Erau scrise a doua oara, cuvant cu cuvant, desi exista deja un singur loc
  pentru ele. Doua copii inseamna ca o redenumire („In asteptare" -> „Neconfirmata")
  se face intr-una si se uita in cealalta, iar aceeasi comanda ajunge sa se
  numeasca altfel in lista si altfel cand o deschizi.

  Pagina foloseste `nume`, forma cu diacritice si acordata cu „comanda" („Confirmată"):
  starea se citeste ca punct si cuvant, nu ca pastila colorata.
*/
const STATUS_OPTIONS = (Object.keys(ORDER_STATUS) as OrderStatus[]).map((value) => ({
  value,
  label: ORDER_STATUS[value].nume,
  ton: ORDER_STATUS[value].ton,
}));

const PAYMENT_OPTIONS: { value: string; label: string; ton: TonEticheta }[] = [
  { value: "unpaid",   label: "Neplătită",  ton: "rau" },
  { value: "paid",     label: "Plătită",    ton: "bun" },
  { value: "refunded", label: "Rambursată", ton: "neutru" },
];

/* ── Clasele paginii: suprafete albe cu contur fin, fara fonduri colorate ─── */

const SECTIUNE = "rounded-xl bg-surface ring-1 ring-black/10";
const TITLU = "text-sm font-semibold text-foreground";
const ETICHETA = "text-xs font-medium text-muted-foreground";
/* Sub `lg` butoanele au 40 px inaltime, cat cere degetul. */
const BUTON = "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 max-lg:h-10";
const BUTON_CONTUR = `${BUTON} bg-surface text-foreground ring-1 ring-black/10 hover:ring-black/25 ${INEL}`;
const BUTON_PLIN = `${BUTON} bg-foreground text-background hover:bg-foreground/85 ${INEL}`;
const BUTON_PERICOL = `${BUTON} bg-surface text-destructive ring-1 ring-destructive/30 hover:ring-destructive/60 ${INEL}`;
const BUTON_PERICOL_PLIN = `${BUTON} bg-destructive text-white hover:bg-destructive/90 ${INEL}`;
const BUTON_MIC = `inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-surface px-2.5 text-xs font-medium text-foreground ring-1 ring-black/10 transition hover:ring-black/25 disabled:opacity-50 max-lg:h-10 ${INEL}`;
const LEGATURA = "rounded-sm text-foreground underline-offset-2 hover:underline";
/* O legatura de contact: sub `lg` e inalta cat cere degetul, nu cat randul ei de text. */
const LEGATURA_CONTACT = "flex w-fit max-w-full items-center gap-1.5 rounded-sm hover:text-foreground max-lg:min-h-10";
/* O atentionare: cutie alba cu contur, iar culoarea o poarta doar pictograma. */
const NOTA = "flex items-start gap-2.5 rounded-lg bg-surface p-3 text-xs leading-relaxed text-foreground ring-1 ring-black/10";
const NOTA_PERICOL = "flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3 ring-1 ring-destructive/30";

/**
 * Pasii comenzii, legati printr-o linie: confirmata, factura, expediata, livrata. Un cerc plin
 * cu bifa pentru ce s-a facut, unul conturat pentru pasul care urmeaza, restul stinse.
 *
 * „Factura" apare doar la magazinele cu o casa de facturare conectata: altfel pasul n-ar avea
 * cum sa se implineasca vreodata.
 */
function PasiComanda({ status, cuFactura, facturaEmisa, areAwb, className }: {
  status: string;
  cuFactura: boolean;
  facturaEmisa: boolean;
  areAwb: boolean;
  className?: string;
}) {
  if (status === "cancelled" || status === "refunded") {
    return (
      <p className={cn("flex items-center gap-2 text-[13px] font-medium text-muted-foreground", className)}>
        <XCircle className="h-4 w-4 flex-shrink-0" />
        {status === "cancelled" ? "Comandă anulată" : "Comandă rambursată"}
      </p>
    );
  }
  const pasi = [
    { nume: "Confirmată", gata: status !== "pending" },
    ...(cuFactura ? [{ nume: "Factură", gata: facturaEmisa }] : []),
    { nume: "Expediată", gata: areAwb || status === "shipped" || status === "delivered" },
    { nume: "Livrată", gata: status === "delivered" },
  ];
  const urmatorul = pasi.findIndex((p) => !p.gata);
  return (
    <ol className={cn("flex items-start", className)}>
      {pasi.map((p, i) => (
        <li key={p.nume} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
          {i > 0 && (
            <span aria-hidden="true" className={cn("absolute right-1/2 top-[9px] h-px w-full", pasi[i - 1].gata && p.gata ? "bg-foreground" : "bg-border")} />
          )}
          <span className={cn(
            "relative z-[1] grid h-[19px] w-[19px] place-items-center rounded-full",
            p.gata ? "bg-foreground text-background"
              : i === urmatorul ? "bg-surface ring-2 ring-foreground"
                : "bg-surface ring-1 ring-border",
          )}>
            {p.gata && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
          <span className={cn(
            "mt-1.5 max-w-full truncate px-1 text-xs",
            p.gata ? "text-foreground" : i === urmatorul ? "font-medium text-foreground" : "text-muted-foreground",
          )}>
            {p.nume}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Adresa prin care comerciantul vede un fisier incarcat de client.
 *
 * ⚠ NU MAI E ADRESA PUBLICA DIN DEPOZIT. Valoarea din comanda e o CHEIE semnata, iar continutul
 * se serveste printr-o ruta care cere sesiune, proprietatea magazinului, si ca fisierul sa fie
 * chiar pe o comanda a lui. Vezi `customization/fisiere-private.ts`.
 *
 * ⚠ SE TRIMITE SI COMANDA, fiindca ruta cere cheia sa fie chiar pe ea. Panoul o stie oricum:
 * fisierul se arata din interiorul unei comenzi deschise, niciodata singur.
 *
 * ═══ ⚠ NU MAI EXISTA O RAMURA DE ADRESA, SI ASTA S-A MASURAT ═══
 *
 * Aici a stat un `if (/^https?:\/\//.test(valoare)) return valoare;` — pentru comenzile de
 * dinaintea cheilor, si pentru fereastra de desfasurare in care ruta mai intorcea `url`. Fereastra
 * s-a inchis pe 07.09.2026, iar intrebarea „mai exista randuri vechi?" s-a pus BAZEI, nu memoriei:
 * din 384 de comenzi, ZERO poarta vreo personalizare — nici macar cheia `customization` pe vreo
 * linie, si niciun `r2.dev` sau `customizations/` in tot `items`.
 *
 * ⚠ DE CE S-A SCOS, si nu doar s-a lasat acolo: ramura intorcea `valoare` NEATINSA drept `href`,
 * iar `href` cu un sir din formularul public e chiar defectul reparat in runda P0 (`javascript:`
 * rulat in sesiunea comerciantului). Poarta comenzii nu mai lasa nicio adresa sa se scrie, deci
 * ramura era de-acum de neatins — dar cod mort de felul asta invie prin prima „compatibilitate"
 * adaugata la loc, si atunci invie fara poarta care il facea sigur.
 *
 * ⚠ CE SE INTAMPLA DACA TOTUSI APARE UN ASEMENEA RAND: se cere prin ruta cu sesiune, care il
 * refuza fiindca nu e o cheie a noastra. Adica o legatura care nu se deschide — vizibil, si nu o
 * poarta ocolita in tacere.
 */
function adresaFisierului(
  valoare: string,
  businessId: string,
  comandaId: string,
  mic = false,
): string {
  return `/api/customization-file?cheie=${encodeURIComponent(valoare)}`
    + `&businessId=${encodeURIComponent(businessId)}`
    + `&comanda=${encodeURIComponent(comandaId)}`
    + (mic ? "&mic=1" : "");
}

/*
 * ⚠ NUMELE FISIERULUI NU SE MAI SCRIE AICI — se importa din `@/lib/customization/adresa`.
 *
 * Panoul avea o copie proprie, care facea `new URL(url).pathname`. Valoarea din comanda nu mai e
 * o adresa, e o CHEIE relativa: `new URL` arunca pe ea la fiecare apel, deci FIECARE fisier iesea
 * „Fisierul N”, fara terminatie. Un atelier de tipar vedea trei randuri identice si nu mai putea
 * spune care e macheta si care e poza — pe chiar hartia dupa care se produce marfa.
 *
 * ⚠ SI NU SE FACE A TREIA COPIE. Regula era scrisa de doua ori — aici si in vitrina — si cele
 * doua copii S-AU DEPARTAT la trecerea pe chei: una cadea pe „Fisierul N”, cealalta scria 65 de
 * caractere de hexazecimal. De acum e una singura, folosita de amandoua ecranele.
 */

/**
 * Din ce se compune pretul unei linii personalizate.
 *
 * ⚠ SE AFISEAZA CE A SCRIS SERVERUL cand a incasat — nimic nu se resocoteste aici. Doua socoteli
 * s-ar fi departat, si atunci panoul ar fi contrazis factura emisa din aceleasi date.
 *
 * ⚠ SUMELE SUNT PE BUCATA, ca si `price` de pe linie; pretul din dreapta randului de produs e
 * inmultit cu cantitatea. La cantitate mai mare de una se scrie pe ecran, altfel randurile n-ar da
 * numarul de deasupra lor si comerciantul ar cauta o diferenta care nu exista.
 */
function DefalcareaPersonalizarii({ d, cantitate }: { d: DefalcareCitita; cantitate: number }) {
  const suprafata = suprafataDeAratat(d);
  return (
    <div className="mt-2 space-y-1 border-t border-border/70 pt-2">
      <p className="text-xs font-medium text-muted-foreground">
        Prețul personalizării{cantitate > 1 ? " · pe bucată" : ""}
      </p>
      {d.randuri.map((r, ri) => (
        <div key={ri} className="flex items-start justify-between gap-3 text-xs">
          <span className="min-w-0 break-words text-muted-foreground">
            {r.eticheta}
            {r.detaliu ? <span className="ml-1.5">{r.detaliu}</span> : null}
          </span>
          <span className="font-medium text-foreground flex-shrink-0">{formatPrice(r.suma)}</span>
        </div>
      ))}
      {/*
        ⚠ Suprafata facturata se arata DOAR cand difera de cea masurata: atunci a intrat suprafata
        minima facturabila sau rotunjirea in sus, si asta e chiar intrebarea pe care o pune
        clientul — de ce plateste mai mult decat masura pe care a dat-o.
      */}
      {suprafata && (
        <p className="text-xs text-muted-foreground">
          Măsurat {caM2(suprafata.masurat)}, facturat {caM2(suprafata.facturat)} (minim sau rotunjire)
        </p>
      )}
    </div>
  );
}

/** Un document emis: pictograma, numarul lui si ce fel de document e. */
function DocText({ pictograma, numar, fel }: { pictograma: React.ReactNode; numar: string; fel: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {pictograma}
      <div className="min-w-0">
        <p className="break-all font-mono text-sm font-medium text-foreground">{numar}</p>
        <p className="text-xs text-muted-foreground">{fel}</p>
      </div>
    </div>
  );
}

function DocRow({
  label,
  docNumber,
  onDownload,
  downloading,
  stornare = false,
  children,
}: {
  label: string;
  docNumber: string;
  onDownload: () => void;
  downloading: boolean;
  /** Documentul e o stornare: semnul ei e cel de anulare, nu bifa unei facturi emise. */
  stornare?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <DocText
        pictograma={stornare
          ? <XCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
          : <FileCheck className="h-4 w-4 flex-shrink-0 text-success" />}
        numar={docNumber}
        fel={label}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onDownload} disabled={downloading} className={BUTON_MIC}>
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          PDF
        </button>
        {children}
      </div>
    </div>
  );
}

function ResendEmailForm({
  defaultEmail,
  onSend,
  sending,
}: {
  defaultEmail: string;
  onSend: (email: string) => void;
  sending: boolean;
}) {
  const [email, setEmail] = useState(defaultEmail);
  return (
    <div className="flex items-center gap-2">
      <Input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="email@client.ro"
        aria-label="Adresa la care se retrimite documentul"
        className="flex-1"
      />
      <button type="button" onClick={() => onSend(email)} disabled={sending || !email.trim()} className={BUTON_CONTUR}>
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        Trimite
      </button>
    </div>
  );
}

/**
 * Rambursul Woot, asa cum il tin EI: „Incasat de curier · 150 lei".
 *
 * ⚠ Eticheta vine din lista LOR documentata (`0=Cancelled … 4=External`), nu dintr-o talmacire de-a
 * noastra, si `null` inseamna ca nu stim inca nimic, deci nu se arata niciun rand. Suma e a lor,
 * pusa langa: cand difera de ce asteptam noi, tocmai diferenta e intrebarea.
 */
function rambursulWoot(order: Order): string | null {
  const eticheta = etichetaRambursWoot(order.woot_cod_status_id as number | null);
  if (!eticheta) return null;
  const suma = Number(order.woot_cod_value);
  return Number.isFinite(suma) && suma > 0 ? `${eticheta} · ${formatPrice(suma)}` : eticheta;
}

export function OrderDetailClient({
  order,
  businessId,
  miniaturi = {},
  legaturiProduse = {},
  areEtichetaPepita = false,
  stareEtichetaPepita = null,
  expediere = null,
  setariTva,
  smartbillEnabled,
  hasEstimateSeries,
  wootEnabled,
  coleteEnabled,
  oblioEnabled,
  fgoEnabled,
  facturisEnabled,
  factureazaEnabled,
  factureazaTest,
  easybillEnabled,
  saga,
  cargusEnabled,
  dpdEnabled,
  glsEnabled,
  pallexEnabled,
  pallexZile,
  ecoletEnabled,
  postaEnabled,
  curieraEnabled,
  curieraOptiuni,
  epacketEnabled,
  epacketOptiuni,
  packetaEnabled,
  smartshipEnabled,
  shipoEnabled,
  fedexEnabled,
  upsEnabled,
  dhlEnabled,
  postaZilePrezentare,
  innoshipEnabled,
  fanCourierEnabled,
  samedayEnabled,
  smsoEnabled,
  adresaListei = "/dashboard/orders",
}: {
  order: Order;
  businessId: string;
  /**
   * Pozele din „Produse comandate”: id-ul produsului -> prima poza din catalog (`miniaturileProduselor`,
   * pe server). Liniile comenzii nu poarta imaginea. Implicit goala: fiecare linie isi pastreaza
   * pictograma, ca paginile si probele care randeaza componenta sa nu trebuiasca sa stie de ea.
   */
  miniaturi?: Record<string, string>;
  /**
   * Pagina din magazin a fiecarui produs din comanda: id-ul produsului -> adresa publica
   * (`legaturileProduselor`, pe server). Doar produsele care mai sunt in catalog si sunt active;
   * celelalte linii isi arata numele ca text. Implicit goala.
   */
  legaturiProduse?: Record<string, string>;
  /**
   * Pepita a trimis eticheta de colet pentru comanda asta?
   *
   * ⚠ Se afla din DEPOZIT, pe server (vezi pagina), fiindca eticheta n-are nicio coloana in baza:
   * cheia ei se deriva din magazin si comanda. Implicit `false`, ca vechile pagini si probele care
   * randeaza componenta sa nu trebuiasca sa stie de ea.
   */
  areEtichetaPepita?: boolean;
  /** `lipsa` | `salvata` | `nevalida` | `depozit-cazut` | null (comanda veche). */
  stareEtichetaPepita?: string | null;
  /**
   * Ce spune REGISTRUL despre expedierea comenzii. Se afla pe server (vezi pagina).
   *
   * ⚠ Componenta asta e de CLIENT, deci n-are cum sa citeasca `operatii_externe`. Fara valoarea
   * coborata de pe server, cartea de stergere ar fi aratat „se poate" pe o comanda pe care
   * serverul o refuza: doua adevaruri despre aceeasi comanda, si cel de pe ecran ar fi fost crezut.
   *
   * Implicit `null`, ca paginile si probele care randeaza componenta sa nu trebuiasca sa stie de el.
   */
  expediere?: "in_zbor" | "reusita" | null;
  /*
   * OBLIGATORIU, nu optional cu implicit: fara el, caseta de totaluri nu poate
   * sti daca `orders.vat_amount` e o suma de adunat sau una deja continuta in
   * total, si a ghicit gresit pe 20 din 96 de comenzi. Un camp optional s-ar
   * putea uita din nou la urmatoarea pagina care randeaza componenta.
   */
  setariTva: SetariTvaMagazin;
  smartbillEnabled: boolean;
  hasEstimateSeries: boolean;
  wootEnabled?: boolean;
  coleteEnabled?: boolean;
  oblioEnabled?: boolean;
  fgoEnabled?: boolean;
  facturisEnabled?: boolean;
  factureazaEnabled?: boolean;
  /** Factureaza.ro e ACUM in modul de test (documentele emise de aici nu sunt fiscale). */
  factureazaTest?: boolean;
  easybillEnabled?: boolean;
  /** Panoul SAGA (contabilitatea); `null` = SAGA nu e conectat. */
  saga?: StarePanouSaga | null;
  cargusEnabled?: boolean;
  dpdEnabled?: boolean;
  glsEnabled?: boolean;
  pallexEnabled?: boolean;
  pallexZile?: { ridicare: number; livrare: number };
  ecoletEnabled?: boolean;
  postaEnabled?: boolean;
  curieraEnabled?: boolean;
  /** Ce precompleteaza fereastra AWB Curiera. Fara cheia API: vezi pagina. */
  curieraOptiuni?: OptiuniAwbCuriera;
  epacketEnabled?: boolean;
  /** Ce precompleteaza fereastra AWB e-packet. Fara cheia API: vezi pagina. */
  epacketOptiuni?: OptiuniAwbEpacket;
  packetaEnabled?: boolean;
  smartshipEnabled?: boolean;
  shipoEnabled?: boolean;
  fedexEnabled?: boolean;
  upsEnabled?: boolean;
  dhlEnabled?: boolean;
  postaZilePrezentare?: number;
  innoshipEnabled?: boolean;
  fanCourierEnabled?: boolean;
  samedayEnabled?: boolean;
  smsoEnabled?: boolean;
  /** Lista de comenzi cu pagina si filtrele de unde s-a venit (vezi `adresaListeiDeComenzi`). */
  adresaListei?: string;
}) {
  const router = useRouter();
  /*
   * ⚠ STAREA ARATATA SE DERIVA DIN COMANDA, nu se tine intr-un `useState` pornit din ea.
   *
   * Tinuta in stare locala, ramanea cea de la incarcarea paginii: dupa un AWB emis sau o plata
   * confirmata, `router.refresh()` aducea comanda noua, iar antetul arata mai departe starea veche
   * (`router.refresh()` nu demonteaza o componenta de client).
   *
   * Ce tine starea locala e doar ALEGEREA omului, cat asteapta confirmarea. Ea poarta si starea
   * peste care a fost facuta: in clipa in care comanda de pe server se schimba (salvarea a reusit,
   * sau altcineva a mutat-o), alegerea nu mai e despre comanda asta si nu se mai ia in seama.
   */
  const [alegere, setAlegere] = useState<{ status: string; plata: string; pesteStatus: string; pestePlata: string } | null>(null);
  const alegereVie = alegere && alegere.pesteStatus === order.status && alegere.pestePlata === order.payment_status ? alegere : null;
  const status = alegereVie?.status ?? (order.status as string);
  const paymentStatus = alegereVie?.plata ?? (order.payment_status as string);
  /** Compunerea unui mesaj catre client sta stransa pana e ceruta. */
  const [mesajDeschis, setMesajDeschis] = useState(false);
  /** Toti ceilalti curieri la vedere, nu doar primii. */
  const [totiCurierii, setTotiCurierii] = useState(false);
  const [isPending, startTransition] = useTransition();

  const items = (order.items as unknown as OrderItem[]) ?? [];
  const totaluri = totaluriComanda({
    items,
    subtotal: order.subtotal,
    shippingCost: order.shipping_cost,
    discountAmount: order.discount_amount,
    cardDiscount: order.card_discount_amount,
    codDiscount: order.cod_discount_amount,
    codFee: order.cod_fee_amount,
    vatAmount: order.vat_amount,
    vatRate: order.vat_rate,
    regimInghetat: order.prices_include_vat,
    total: order.total,
    setariTva,
  });
  const address = (order.shipping_address as unknown as ShippingAddress) ?? {};
  const firma = readBillingCompany(order.billing_company);
  /*
   * ⚠ `orders.notes` E O COLOANA TEXT: tine un JSON cheiat pe id-ul campului de checkout
   * (`{"cf_1791731508493":"30"}`), iar la comenzile vechi un text simplu. Pana pe 12.10.2026 se
   * citea ca obiect, deci `Object.entries` pe SIR afisa un rand pe fiecare CARACTER („0 {", „1 "",
   * „2 c"…), la toate cele 100 de comenzi cu campuri. Acum trece prin aceeasi regula ca contul
   * clientului si exportul (`detaliileDeLaCheckout`), cu etichetele din configurarea magazinului.
   */
  const campuriCheckout = useCampuriCheckout();
  const notaBruta = order.notes as unknown;
  const detaliiCheckout = useMemo(
    () => detaliileDeLaCheckout(
      typeof notaBruta === "string" ? notaBruta : notaBruta && typeof notaBruta === "object" ? JSON.stringify(notaBruta) : null,
      campuriCheckout,
    ),
    [notaBruta, campuriCheckout],
  );
  /*
   * ⚠ NOTA INTERNA SE VEDE, si pana pe 08.09.2026 nu se vedea NICAIERI.
   *
   * Ingestul de marketplace scrie in `internal_notes` tocmai lucrurile de care atarna banii:
   * cine incaseaza rambursul la o comanda Pepita Delivery, ca totalul e in alta moneda, ca
   * moneda n-a putut fi citita, ca liniile au cote de TVA diferite. Codul care le scrie spunea
   * in comentarii „aici afla cine intra pe lista obisnuita de comenzi" — dar niciun ecran nu le
   * randa, deci comerciantul apasa pe factura sau pe AWB fara sa fi avut cum sa afle.
   */
  const noteInterne = typeof (order as unknown as { internal_notes?: unknown }).internal_notes === "string"
    ? ((order as unknown as { internal_notes: string }).internal_notes).trim()
    : "";
  const ord = order as unknown as Record<string, unknown>;
  // Trendyol ships with its own cargo (no courier AWB) — swap the shipping panel.
  const isTrendyol = (order.order_source as { marketplace?: string } | null)?.marketplace === "trendyol";
  /*
   * eMAG e altfel decat Trendyol: ingaduie SI AWB prin contul lor de curier, SI
   * curierul comerciantului. Deci cartea lui se ADAUGA deasupra, nu ia locul
   * curierilor — un comerciant cu contract propriu mai bun n-are de ce sa fie silit
   * sa plateasca transportul lor.
   */
  const isEmag = (order.order_source as { marketplace?: string } | null)?.marketplace === "emag";

  /* ⚠ Aceeasi regula ca pe server, din acelasi loc — nu o a doua copie. Vezi
     `marketplaceCareTineComanda`: cine tine ciclul comenzii, tine si starea. */
  const cineTine = marketplaceCareTineComanda(order.order_source);
  const tinutaDeEi = cineTine != null;
  /* ⚠ Alta intrebare decat cea de mai sus: „mai trebuie facut ceva si la ei?". Vezi
     `MEMENTO_LA_MARKETPLACE`. */
  const memento = mementoulMarketplace(order.order_source);
  /* easySales: comanda vitrinei stampilata la plasare. Panoul ei se arata si dupa preluarea in
     Edinio (spune unde a fost); nota de stare, numai cat e a lor. */
  const areStampilaEasySales = !!(order.order_source as { easysales?: unknown } | null)?.easysales;
  const inEasySales = procesataInEasySales(order.order_source);

  const currentStatus = STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0];
  const currentPayment = PAYMENT_OPTIONS.find(p => p.value === paymentStatus) ?? PAYMENT_OPTIONS[0];
  const hasChanges = status !== order.status || paymentStatus !== order.payment_status;

  // SmartBill state
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(order.smartbill_invoice_number as string | null ?? null);
  const [invoiceSeries, setInvoiceSeries] = useState<string | null>(order.smartbill_invoice_series as string | null ?? null);
  const [estimateNumber, setEstimateNumber] = useState<string | null>(order.smartbill_estimate_number as string | null ?? null);
  const [estimateSeries, setEstimateSeries] = useState<string | null>(order.smartbill_estimate_series as string | null ?? null);
  const [stornoNumber, setStornoNumber] = useState<string | null>(order.smartbill_storno_number as string | null ?? null);
  const [stornoSeries, setStornoSeries] = useState<string | null>(order.smartbill_storno_series as string | null ?? null);

  const [generatingInvoice, startInvoiceTransition] = useTransition();
  const [generatingEstimate, startEstimateTransition] = useTransition();
  const [converting, startConvertTransition] = useTransition();
  const [stornoing, startStornoTransition] = useTransition();
  const [resendingInvoice, startResendInvoiceTransition] = useTransition();
  const [resendingEstimate, startResendEstimateTransition] = useTransition();
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);

  const [showStornoConfirm, setShowStornoConfirm] = useState(false);
  const [showResendInvoice, setShowResendInvoice] = useState(false);
  const [showResendEstimate, setShowResendEstimate] = useState(false);
  const [showNetopiaRefund, setShowNetopiaRefund] = useState(false);
  const [showIpayRefund, setShowIpayRefund] = useState(false);
  const [showKlarnaRefund, setShowKlarnaRefund] = useState(false);
  const [showRevolutRefund, setShowRevolutRefund] = useState(false);
  const [refundingRevolut, startRevolutRefundTransition] = useTransition();
  const [refundingKlarna, startKlarnaRefundTransition] = useTransition();
  const [refundingIpay, startIpayRefundTransition] = useTransition();
  const [refundingNetopia, startNetopiaRefundTransition] = useTransition();

  // Status/payment change confirmation + delete + customer notifications
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, startDeleteTransition] = useTransition();
  const [notifChannel, setNotifChannel] = useState<"email" | "sms">("email");
  const [notifTemplate, setNotifTemplate] = useState("");
  const [notifSubject, setNotifSubject] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [sendingNotif, startNotifTransition] = useTransition();
  const [smsTemplate, setSmsTemplate] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [sendingSms, startSmsTransition] = useTransition();

  const customerEmail = (order.customer_email as string | null) ?? "";
  const customerPhone = (order.customer_phone as string | null) ?? "";
  const customerName = (order.customer_name as string | null) ?? "client";
  const orderNumber = order.order_number as string;
  const canStorno = !stornoNumber && (status === "cancelled" || status === "refunded");

  // Courier AWB modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [wootModalOpen, setWootModalOpen] = useState(false);
  const [cargusModalOpen, setCargusModalOpen] = useState(false);
  const [dpdModalOpen, setDpdModalOpen] = useState(false);
  const [glsModalOpen, setGlsModalOpen] = useState(false);
  const [pallexModalOpen, setPallexModalOpen] = useState(false);
  const [ecoletModalOpen, setEcoletModalOpen] = useState(false);
  const [postaModalOpen, setPostaModalOpen] = useState(false);
  const [curieraModalOpen, setCurieraModalOpen] = useState(false);
  const [epacketModalOpen, setEpacketModalOpen] = useState(false);
  const [packetaModalOpen, setPacketaModalOpen] = useState(false);
  const [smartshipModalOpen, setSmartshipModalOpen] = useState(false);
  const [shipoModalOpen, setShipoModalOpen] = useState(false);
  const [fedexModalOpen, setFedexModalOpen] = useState(false);
  const [upsModalOpen, setUpsModalOpen] = useState(false);
  const [dhlModalOpen, setDhlModalOpen] = useState(false);
  const [innoshipModalOpen, setInnoshipModalOpen] = useState(false);
  const [fanCourierModalOpen, setFanCourierModalOpen] = useState(false);
  const [samedayModalOpen, setSamedayModalOpen] = useState(false);
  const [coleteModalOpen, setColeteModalOpen] = useState(false);

  // Oblio state
  const [oblioActionPending, startOblioTransition] = useTransition();
  const [oblioAction, setOblioAction] = useState<"invoice" | "proforma" | "storno" | null>(null);

  // fGO state
  const [fgoActionPending, startFgoTransition] = useTransition();
  const [fgoAction, setFgoAction] = useState<"invoice" | "storno" | null>(null);

  // ── Invoicing providers (unified card) ──
  /* Siglele intregi ale caselor, in varianta mica unde exista; cele desenate in alb se inverseaza. */
  const invoicingProviders = ([
    smartbillEnabled && { id: "smartbill" as const, name: "SmartBill", logo: siglaMica("/integrations/smartbill.webp") },
    oblioEnabled && { id: "oblio" as const, name: "Oblio", logo: siglaMica("/integrations/oblio.webp"), inversat: true },
    fgoEnabled && { id: "fgo" as const, name: "fGO", logo: "/integrations/fgo.svg" },
    facturisEnabled && { id: "facturis" as const, name: "Facturis", logo: siglaMica("/integrations/facturis.png"), inversat: true },
    factureazaEnabled && { id: "factureaza" as const, name: "Factureaza.ro", logo: "/integrations/factureaza.ro.webp" },
    easybillEnabled && { id: "easybill" as const, name: "easybill", logo: siglaMica("/integrations/easybill.png") },
  ].filter(Boolean)) as { id: CasaDeFacturare; name: string; logo: string; inversat?: boolean }[];

  const smartbillHasDoc = !!(invoiceNumber || estimateNumber || stornoNumber);
  const oblioHasDoc = !!(order.oblio_invoice_number || order.oblio_proforma_number || order.oblio_storno_number);
  const fgoHasDoc = !!(ord["fgo_invoice_number"] || ord["fgo_storno_number"]);
  /* ⚠ Facturis: CHEIA spune ca documentul exista, chiar daca numarul nu s-a citit inca. */
  const facturisHasDoc = !!(order.facturis_invoice_key || order.facturis_storno_key);
  const factureazaHasDoc = !!(order.factureaza_invoice_key || order.factureaza_storno_key);
  const easybillHasDoc = !!(order.easybill_invoice_key || order.easybill_storno_key);
  const defaultProvider: CasaDeFacturare | undefined = smartbillHasDoc ? "smartbill" : oblioHasDoc ? "oblio" : fgoHasDoc ? "fgo"
    : facturisHasDoc ? "facturis" : factureazaHasDoc ? "factureaza" : easybillHasDoc ? "easybill" : invoicingProviders[0]?.id;
  const [activeProvider, setActiveProvider] = useState<CasaDeFacturare | undefined>(defaultProvider);

  // ── Couriers (Expediere card) ──
  /*
   * ⚠ `stare` E OPTIONALA, si azi o poarta TREI curieri: Woot, Curiera si e-packet.
   *
   * Cele paisprezece cronuri de urmarire scriu de mult coloane de stare pe comanda, dar niciuna
   * n-a fost VREODATA aratata comerciantului: ele hranesc doar tranzitia comenzii si semnalele
   * din jurnal. La Woot nu se poate face tranzitie, fiindca ei nu documenteaza nicaieri ce
   * inseamna numerele lor de stare (vezi `@/lib/shipping/statusuri-woot`), iar eticheta lor e
   * scrisa in romana. Deci aici se arata chiar propozitia LOR, fara sa-i dam vreun inteles.
   * La Curiera `curiera_status_label` e denumirea din `descriereStare`, scrisa de cronul ei.
   *
   * Tipul e scris pe fata, nu dedus: fara el, un singur camp pus la o singura intrare ar face
   * din lista o reuniune de forme, iar `shippedCourier.stare` n-ar mai exista pentru `tsc`.
   */
  /*
   * AWB-ul transportatorului partener (de ex. DPD), cand Curiera preda coletul mai departe: omul
   * il cauta la DPD, iar cumparatorul primeste SMS-ul de la DPD. Legatura numai catre o pagina
   * care chiar deschide coletul (`direct`), nu catre una de cautare.
   */
  const partenerCurieraAwb = (order.curiera_partener_awb ?? "").trim();
  const urmarirePartener = partenerCurieraAwb
    ? urmareste({ curier: curierulReal(order.curiera_partener) ?? "", awb: partenerCurieraAwb })
    : null;
  const partenerCurieraAfisat = partenerCurieraAwb
    ? {
        nume: (order.curiera_partener ?? "").trim() || "partener",
        awb: partenerCurieraAwb,
        href: urmarirePartener?.fel === "direct" ? urmarirePartener.href : null,
      }
    : null;

  const couriers: {
    id: string; name: string; logo: string; enabled: boolean;
    awb: string | null; stare?: string | null; ramburs?: string | null;
    /** AWB-ul la transportatorul partener, la brokerii care predau coletul (azi: Curiera). */
    partener?: { nume: string; awb: string; href: string | null } | null;
    open: () => void;
  }[] = [
    { id: "sameday", name: "Sameday", logo: "/integrations/sameday.webp", enabled: !!samedayEnabled, awb: (order.sameday_awb_number as string | null) ?? null, open: () => setSamedayModalOpen(true) },
    { id: "fan-courier", name: "FAN Courier", logo: "/integrations/fan-courier.svg", enabled: !!fanCourierEnabled, awb: (order.fan_courier_awb_number as string | null) ?? null, open: () => setFanCourierModalOpen(true) },
    { id: "cargus", name: "Cargus", logo: "/integrations/cargus.svg", enabled: !!cargusEnabled, awb: (order.cargus_awb_number as string | null) ?? null, open: () => setCargusModalOpen(true) },
    { id: "dpd", name: "DPD", logo: "/integrations/dpd.svg", enabled: !!dpdEnabled, awb: (order.dpd_awb_number as string | null) ?? null, open: () => setDpdModalOpen(true) },
    { id: "gls", name: "GLS", logo: "/integrations/gls.svg", enabled: !!glsEnabled, awb: (order.gls_awb_number as string | null) ?? null, open: () => setGlsModalOpen(true) },
    /* ⚠ `id` trebuie sa fie EXACT valoarea pe care checkout-ul o scrie in
       `shipping_address.courier` — altfel `chosenCourier` ramane nedefinit si
       panoul arata „Curier recomandat” in loc de „Clientul a ales”. */
    { id: "pallex", name: "Pall-Ex", logo: "/integrations/pallex.avif", enabled: !!pallexEnabled, awb: (order.pallex_awb_number as string | null) ?? null, open: () => setPallexModalOpen(true) },
    { id: "ecolet", name: "eColet", logo: "/integrations/ecolet.png", enabled: !!ecoletEnabled, awb: (order.ecolet_awb_number as string | null) ?? null, open: () => setEcoletModalOpen(true) },
    /* ⚠ `id` trebuie sa fie EXACT valoarea pe care checkout-ul o scrie in
       `shipping_address.courier` — vezi nota de la Pall-Ex. */
    { id: "posta", name: "Poșta Română", logo: "/integrations/posta_romana.svg", enabled: !!postaEnabled, awb: (order.posta_awb_number as string | null) ?? null, open: () => setPostaModalOpen(true) },
    /* ⚠ `id` trebuie sa fie sir-cu-sir ce scrie checkout-ul in `shipping_address.courier` (vezi
       nota de la Shipo). `stare` e ultima stare citita de cronul de urmarire. */
    { id: "curiera", name: "Curiera", logo: "/integrations/curiera.webp", enabled: !!curieraEnabled, awb: order.curiera_awb_number ?? null, stare: order.curiera_status_label ?? null, partener: partenerCurieraAfisat, open: () => setCurieraModalOpen(true) },
    /* ⚠ `id` sir-cu-sir ce scrie checkout-ul in `shipping_address.courier`. AWB-ul e chiar al
       curierului de dedesubt, deci starea spune si CINE duce coletul (si daca e de test). */
    { id: "epacket", name: "e-packet", logo: "/integrations/e-packet.svg", enabled: !!epacketEnabled, awb: order.epacket_awb_number ?? null,
      stare: [
        order.epacket_curier ? (NUME_CURIER_EPACKET[order.epacket_curier as keyof typeof NUME_CURIER_EPACKET] ?? order.epacket_curier) : null,
        order.epacket_test ? "AWB de test" : null,
        order.epacket_status_label ?? null,
      ].filter(Boolean).join(" · ") || null,
      open: () => setEpacketModalOpen(true) },
    { id: "innoship", name: "Innoship", logo: "/integrations/innoship.svg", enabled: !!innoshipEnabled, awb: (order.innoship_awb_number as string | null) ?? null, open: () => setInnoshipModalOpen(true) },
    /* ⚠ `id` trebuie sa fie EXACT valoarea pe care checkout-ul o scrie in
       `shipping_address.courier` — vezi nota de la Pall-Ex. */
    { id: "packeta", name: "Packeta", logo: "/integrations/packeta.png", enabled: !!packetaEnabled, awb: (order.packeta_packet_id as string | null) ?? null, open: () => setPacketaModalOpen(true) },
    /* ⚠ `id` trebuie sa fie EXACT valoarea pe care checkout-ul o scrie in
       `shipping_address.courier` — vezi nota de la Pall-Ex. */
    { id: "smartship", name: "SmartShip", logo: "/integrations/smartship.png", enabled: !!smartshipEnabled, awb: (order.smartship_awb_number as string | null) ?? null, open: () => setSmartshipModalOpen(true) },
    /* ⚠ `id` trebuie sa fie sir-cu-sir acelasi cu ce scrie checkout-ul in
       `shipping_address.courier`, cu `SHIPPING_METHODS`, cu `activeCourierIds` si
       cu `COURIER_LABELS`. „shipo” contra „shipo-ro” nu produce nicio eroare:
       `chosenCourier` ramane `undefined` si comerciantului i se propune butonul
       ALTUI curier decat cel platit de client. */
    { id: "shipo", name: "Shipo.ro", logo: "/integrations/shipo.ro.svg", enabled: !!shipoEnabled, awb: (order.shipo_awb_number as string | null) ?? null, open: () => setShipoModalOpen(true) },
    /* ⚠ `id` trebuie sa fie sir-cu-sir acelasi cu ce scrie checkout-ul in
       `shipping_address.courier` — vezi nota de la Shipo. */
    { id: "fedex", name: "FedEx", logo: "/integrations/fedex.svg", enabled: !!fedexEnabled, awb: (order.fedex_awb_number as string | null) ?? null, open: () => setFedexModalOpen(true) },
    /* ⚠ `id` trebuie sa fie sir-cu-sir acelasi cu ce scrie checkout-ul in
       `shipping_address.courier` — vezi nota de la Shipo. */
    { id: "ups", name: "UPS", logo: "/integrations/ups.svg", enabled: !!upsEnabled, awb: (order.ups_awb_number as string | null) ?? null, open: () => setUpsModalOpen(true) },
    /* ⚠ `id` trebuie sa fie sir-cu-sir acelasi cu ce scrie checkout-ul in
       `shipping_address.courier` — vezi nota de la Shipo. La DHL sirul e „dhl”, scurt si
       usor de confundat cu numele afisat „DHL Express”: numele e pentru om, `id`-ul e
       pentru `chosenCourier`. */
    { id: "dhl", name: "DHL Express", logo: "/integrations/dhl.svg", enabled: !!dhlEnabled, awb: (order.dhl_awb_number as string | null) ?? null, open: () => setDhlModalOpen(true) },
    { id: "colete", name: "Colete Online", logo: "/integrations/colete-online.svg", enabled: !!coleteEnabled, awb: (order.colete_awb_number as string | null) ?? null, open: () => setColeteModalOpen(true) },
    { id: "woot", name: "Woot", logo: "/integrations/woot.webp", enabled: !!wootEnabled, awb: (order.woot_awb_number as string | null) ?? null, stare: (order.woot_status_label as string | null) ?? null, ramburs: rambursulWoot(order), open: () => setWootModalOpen(true) },
  ];
  const enabledCouriers = couriers.filter(c => c.enabled);
  const shippedCourier = enabledCouriers.find(c => c.awb);
  const chosenCourier = enabledCouriers.find(c => c.id === address.courier);
  const primaryCourier = shippedCourier ?? chosenCourier ?? enabledCouriers[0];
  const otherCouriers = enabledCouriers.filter(c => c.id !== primaryCourier?.id);

  /*
   * ⚠ ACEEASI REGULA CA PE SERVER, DIN ACELASI FISIER (`@/lib/orders/awb-propriu`).
   *
   * Ecranul nu apara nimic — poarta adevarata e `poarta-awb.ts`, in fiecare actiune de
   * emitere. Ce face aici e sa nu arate un buton care oricum ar fi refuzat, si sa spuna DE CE.
   * Un buton care se apasa si da eroare e mai rau decat unul care lipseste cu explicatie.
   *
   * ⚠ SE CITESTE `order.payment_status`, adica valoarea SALVATA, nu `paymentStatus` din stare.
   * Cu starea locala, butonul s-ar fi aprins in clipa in care omul muta selectorul pe „platit",
   * inainte de a salva — iar serverul, care citeste din baza, l-ar fi refuzat oricum. Doua
   * adevaruri despre aceeasi comanda, si cel de pe ecran ar fi fost crezut.
   */
  /*
   * ⚠ SI COLOANELE DE AWB ALE TUTUROR CURIERILOR.
   *
   * Fara ele, ecranul ar fi spus „se poate" pe o comanda care are deja un colet
   * la alt curier, iar serverul ar fi refuzat-o, adica exact cele doua adevaruri
   * pe care nota de mai sus le tine despartite. `awburiDinRand` e chiar functia pe
   * care o cheama si poarta de pe server, deci un curier nou nu poate fi uitat
   * intr-un loc, si nici martorii expedierilor pornite si neconfirmate inca.
   */
  const awburiComenzii = awburiDinRand(ord);

  /**
   * Prima expediere activa de pe comanda, pentru notificarea catre cumparator.
   *
   * ⚠ ALTA HARTA DECAT A PORTII, dinadins. Poarta intreaba „exista deja un colet pe
   * comanda asta?" si vrea identitatea care apare PRIMA, la Packeta `packeta_packet_id`.
   * Emailul intreaba „ce numar ii dau omului?" si vrea numarul cu care se cauta la
   * curierul care chiar livreaza, adica `packeta_external_tracking`. Citite din aceeasi
   * harta, cumparatorul ar fi primit id-ul intern al Packetei si n-ar fi gasit nimic.
   */
  const expedierePeComanda = numarDeUrmarire(ord);

  const refuzAwbPropriu = deCeNuSePoateAwbPropriu({
    order_source: ord["order_source"] ?? null,
    payment_status: (order.payment_status as string | null) ?? null,
    status: (order.status as string | null) ?? null,
    awburi: awburiComenzii,
  });
  /*
   * ⚠ ACEEASI REGULA CA PE SERVER, DIN ACELASI LOC. `deleteOrder` refuza oricum, dar un
   * buton rosu care arata apasabil si da eroare abia dupa apasare e o cursa. Vezi nota de
   * la cartea de stergere.
   */
  const refuzStergere = deCeNuSeStergeComanda({
    status: (order.status as string | null) ?? null,
    awburi: awburiComenzii,
    /* ⚠ Martorul din registru, coborat de pe server: aici nu se poate socoti. Vezi `expediere`. */
    expediere,
  });
  const deliveryInfo = address.delivery_type === "locker" && address.locker_name ? address.locker_name : null;

  const NOTIF_TEMPLATES: Record<string, { label: string; subject: string; body: string }> = {
    confirmed: { label: "Comanda confirmata", subject: `Comanda ${orderNumber} a fost confirmata`, body: `Buna ${customerName},\n\nComanda ta ${orderNumber} a fost confirmata si intra in pregatire. Te anuntam imediat ce este expediata.\n\nMultumim pentru comanda!` },
    /*
     * ⚠ CU NUMARUL AWB, cand comanda are unul.
     *
     * Sablonul spunea doar „a fost predata curierului si este pe drum". Numarul
     * de urmarire exista pe comanda in clipa aceea, e chiar ce tocmai a emis
     * comerciantul, dar nu ajungea niciodata la cumparator, care ramanea sa-l
     * ceara inapoi pe email. `expedierePeComanda` il ia din aceeasi harta pe care
     * o citeste si poarta, deci un curier nou nu poate fi uitat aici.
     */
    shipped: {
      label: "Comanda expediata",
      subject: `Comanda ${orderNumber} a fost expediata`,
      body: `Buna ${customerName},\n\nComanda ta ${orderNumber} a fost predata curierului si este pe drum. O vei primi in cel mai scurt timp.`
        + (expedierePeComanda ? `\n\nCurier: ${expedierePeComanda.curier}\nNumar AWB: ${expedierePeComanda.awb}` : "")
        /* La broker (Curiera), numarul de sus e al curierului care livreaza; al brokerului ramane alaturi. */
        + (expedierePeComanda?.prin ? `\nAWB ${expedierePeComanda.prin.curier}: ${expedierePeComanda.prin.awb}` : "")
        + `\n\nMultumim!`,
    },
    delivered: { label: "Comanda livrata", subject: `Comanda ${orderNumber} a fost livrata`, body: `Buna ${customerName},\n\nComanda ta ${orderNumber} a fost livrata. Speram sa te bucuri de produse!\n\nDaca ai intrebari, suntem aici pentru tine.` },
    delay: { label: "Intarziere livrare", subject: `Update despre comanda ${orderNumber}`, body: `Buna ${customerName},\n\nIti scriem in legatura cu comanda ${orderNumber}. Din pacate intampinam o mica intarziere, dar lucram sa o expediem cat mai repede. Iti multumim pentru rabdare!` },
    info: { label: "Solicitare informatii", subject: `Avem nevoie de cateva detalii pentru comanda ${orderNumber}`, body: `Buna ${customerName},\n\nPentru a procesa comanda ${orderNumber} avem nevoie de cateva informatii suplimentare. Te rugam sa ne raspunzi la acest email.\n\nMultumim!` },
  };

  // Short SMS variants (kept under ~160 chars where possible).
  const SMS_TEMPLATES: Record<string, { label: string; body: string }> = {
    confirmed: { label: "Confirmata", body: `Comanda ${orderNumber} a fost confirmata. Multumim!` },
    shipped: { label: "Expediata", body: `Comanda ${orderNumber} a fost expediata si este pe drum. Multumim!` },
    delivered: { label: "Livrata", body: `Comanda ${orderNumber} a fost livrata. Iti multumim!` },
    delay: { label: "Intarziere", body: `Comanda ${orderNumber} are o mica intarziere. Multumim pentru rabdare!` },
  };

  function applyTemplate(key: string) {
    setNotifTemplate(key);
    const t = NOTIF_TEMPLATES[key];
    if (t) { setNotifSubject(t.subject); setNotifMessage(t.body); }
  }

  function applySmsTemplate(key: string) {
    setSmsTemplate(key);
    const t = SMS_TEMPLATES[key];
    if (t) setSmsMessage(t.body);
  }

  function confirmSave() {
    setShowSaveConfirm(false);
    startTransition(async () => {
      /* ⚠ In `try` DOAR apelul. Vezi `callbackul-de-tranzitie-prinde-caderea`. */
      let result: Awaited<ReturnType<typeof updateOrder>>;
      try {
        result = await updateOrder(order.id, { status, payment_status: paymentStatus });
      } catch {
        /*
         * ⚠⚠ ASTA NU E O SCRIERE LINISTITA LA NOI. `updateOrder` cheama
         * `aplica_tranzitia_comenzii`, care muta intr-o singura tranzactie statusul,
         * cuponul si stocul, iar mai jos trimite email si SMS catre cumparator.
         * Actiunea insasi se opreste la un raspuns ciudat tocmai ca sa nu plece
         * instiintari despre o schimbare care poate n-a avut loc. Cand arunca, noi
         * nu stim de care parte a acelei linii am ramas.
         */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca schimbarea s-a aplicat. "
          + "Daca s-a aplicat, clientul poate sa fi primit deja instiintarea, iar stocul si "
          + "cuponul s-au miscat odata cu ea. Reimprospateaza pagina si uita-te la stare "
          + "inainte sa incerci din nou.",
          { duration: 12000 },
        );
        setAlegere(null);
        router.refresh();
        return;
      }
      if ("error" in result) { toast.error(result.error); setAlegere(null); } else {
        toast.success("Comanda actualizata.");
        router.refresh();
      }
    });
  }

  /*
   * Starea si plata se schimba din meniul lor: alegerea deschide pe loc confirmarea (clientul e
   * anuntat la schimbarea starii, deci nu pleaca nimic dintr-o singura apasare), iar renuntarea
   * o uita si pagina arata din nou ce e salvat.
   */
  function alegeStarea(valoare: string) {
    if (valoare === status) return;
    setAlegere({ status: valoare, plata: paymentStatus, pesteStatus: order.status as string, pestePlata: order.payment_status as string });
    setShowSaveConfirm(true);
  }

  function alegePlata(valoare: string) {
    if (valoare === paymentStatus) return;
    setAlegere({ status, plata: valoare, pesteStatus: order.status as string, pestePlata: order.payment_status as string });
    setShowSaveConfirm(true);
  }

  function renuntaLaSchimbare() {
    setShowSaveConfirm(false);
    setAlegere(null);
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      let result: Awaited<ReturnType<typeof deleteOrder>>;
      try {
        result = await deleteOrder(order.id);
      } catch {
        /* ⚠ `deleteOrder` e curat inauntru: doua paze care refuza stergerea, apoi o
           singura tranzactie pentru cupon, stoc si rand, apoi eticheta AWB din
           depozit. Nimic catre curier, nimic catre client. Deci nu se pomeneste
           nimeni din afara: singurul lucru nestiut e daca randul mai exista. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca s-a sters comanda. "
          + "Deschide lista de comenzi si verifica acolo inainte sa incerci din nou.",
          { duration: 12000 },
        );
        return;
      }
      if (result.error) { toast.error(result.error); return; }
      toast.success("Comanda a fost stearsa.");
      router.push(adresaListei);
    });
  }

  function handleSendNotification() {
    startNotifTransition(async () => {
      let result: Awaited<ReturnType<typeof sendCustomerNotification>>;
      try {
        result = await sendCustomerNotification(order.id, notifSubject, notifMessage);
      } catch {
        /* ⚠⚠ Singura paza a actiunii e `rateLimit` pe cont, un limitator din MEMORIE,
           nu o paza impotriva dublarii. Mesajul pleaca spre un om adevarat, deci aici
           nu se spune „incearca din nou”. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca emailul a plecat spre "
          + "client. Nu exista o paza impotriva dublarii: o a doua apasare poate trimite "
          + "inca un mesaj aceluiasi om.",
          { duration: 12000 },
        );
        return;
      }
      if (result.error) { toast.error(result.error); return; }
      toast.success("Notificarea a fost trimisa clientului.");
    });
  }

  function handleSendSms() {
    startSmsTransition(async () => {
      let result: Awaited<ReturnType<typeof sendCustomerSms>>;
      try {
        result = await sendCustomerSms(order.id, smsMessage);
      } catch {
        /* ⚠⚠ Ca la email, plus ca fiecare SMS se plateste din creditul magazinului, pe
           cheia lui SMSO. Dublarea costa, nu doar incurca. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca SMS-ul a plecat spre "
          + "client. Nu exista o paza impotriva dublarii, iar fiecare SMS se plateste din "
          + "creditul magazinului: o a doua apasare poate trimite inca unul.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("SMS trimis clientului.");
    });
  }

  function handleGenerateInvoice() {
    startInvoiceTransition(async () => {
      let result: Awaited<ReturnType<typeof generateOrderInvoice>>;
      try {
        result = await generateOrderInvoice(businessId, order.id);
      } catch {
        /*
         * ⚠⚠ MESAJUL NU ARE VOIE SA INVITE LA REINCERCARE.
         *
         * Factura fiscala, emisa la SmartBill.
         *
         * `slotFacturare` refuza a doua emitere, dar citeste numarul scris pe comanda
         * DUPA ce raspunde furnizorul. Cand actiunea arunca, documentul poate sa existe
         * la ei fara ca numarul sa fi ajuns la noi: slotul e liber, si o reincercare
         * emite inca unul.
         */
        toast.error(
          "Nu am primit raspuns de la SmartBill, deci nu stim daca factura s-a emis. "
          + "Verifica in contul SmartBill INAINTE sa incerci din nou: daca documentul e acolo, "
          + "dar numarul nu s-a scris pe comanda, o a doua apasare emite inca unul.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in result) { toast.error(result.error); return; }
      setInvoiceNumber(result.number);
      setInvoiceSeries(result.series);
      toast.success(`Factura ${result.series}${result.number} generata.`);
      if (result.emailWarning) toast.warning(result.emailWarning);
    });
  }

  function handleGenerateEstimate() {
    startEstimateTransition(async () => {
      let result: Awaited<ReturnType<typeof generateOrderEstimate>>;
      try {
        result = await generateOrderEstimate(businessId, order.id);
      } catch {
        /*
         * ⚠⚠ MESAJUL NU ARE VOIE SA INVITE LA REINCERCARE.
         *
         * Proforma, emisa la SmartBill pe seria ei proprie.
         *
         * `slotFacturare` refuza a doua emitere, dar citeste numarul scris pe comanda
         * DUPA ce raspunde furnizorul. Cand actiunea arunca, documentul poate sa existe
         * la ei fara ca numarul sa fi ajuns la noi: slotul e liber, si o reincercare
         * emite inca unul.
         */
        toast.error(
          "Nu am primit raspuns de la SmartBill, deci nu stim daca proforma s-a emis. "
          + "Verifica in contul SmartBill INAINTE sa incerci din nou: daca documentul e acolo, "
          + "dar numarul nu s-a scris pe comanda, o a doua apasare emite inca unul.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in result) { toast.error(result.error); return; }
      setEstimateNumber(result.number);
      setEstimateSeries(result.series);
      toast.success(`Proforma ${result.series}${result.number} generata.`);
      if (result.emailWarning) toast.warning(result.emailWarning);
    });
  }

  function handleConvert() {
    startConvertTransition(async () => {
      let result: Awaited<ReturnType<typeof convertEstimateToInvoice>>;
      try {
        result = await convertEstimateToInvoice(businessId, order.id);
      } catch {
        /*
         * ⚠⚠ MESAJUL NU ARE VOIE SA INVITE LA REINCERCARE.
         *
         * Proforma devine factura fiscala. Emiterea e reala, chiar daca pleaca de la
         * un document care exista deja.
         *
         * `slotFacturare` refuza a doua emitere, dar citeste numarul scris pe comanda
         * DUPA ce raspunde furnizorul. Cand actiunea arunca, documentul poate sa existe
         * la ei fara ca numarul sa fi ajuns la noi: slotul e liber, si o reincercare
         * emite inca unul.
         */
        toast.error(
          "Nu am primit raspuns de la SmartBill, deci nu stim daca factura s-a emis. "
          + "Verifica in contul SmartBill INAINTE sa incerci din nou: daca documentul e acolo, "
          + "dar numarul nu s-a scris pe comanda, o a doua apasare emite inca unul.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in result) { toast.error(result.error); return; }
      setInvoiceNumber(result.number);
      setInvoiceSeries(result.series);
      toast.success(`Factura ${result.series}${result.number} emisa din proforma.`);
      if (result.emailWarning) toast.warning(result.emailWarning);
    });
  }

  function handleStorno() {
    setShowStornoConfirm(false);
    startStornoTransition(async () => {
      let result: Awaited<ReturnType<typeof stornoOrderInvoice>>;
      try {
        result = await stornoOrderInvoice(businessId, order.id);
      } catch {
        /*
         * ⚠⚠ MESAJUL NU ARE VOIE SA INVITE LA REINCERCARE.
         *
         * Stornarea e tot un document fiscal, nu o stergere.
         *
         * `slotFacturare` refuza a doua emitere, dar citeste numarul scris pe comanda
         * DUPA ce raspunde furnizorul. Cand actiunea arunca, documentul poate sa existe
         * la ei fara ca numarul sa fi ajuns la noi: slotul e liber, si o reincercare
         * emite inca unul.
         */
        toast.error(
          "Nu am primit raspuns de la SmartBill, deci nu stim daca stornarea s-a emis. "
          + "Verifica in contul SmartBill INAINTE sa incerci din nou: daca documentul e acolo, "
          + "dar numarul nu s-a scris pe comanda, o a doua apasare emite inca unul.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in result) { toast.error(result.error); return; }
      setStornoNumber(result.stornoNumber ?? invoiceNumber);
      setStornoSeries(result.stornoSeries ?? invoiceSeries);
      toast.success("Factura a fost stornata cu succes.");
    });
  }

  /**
   * ⚠ ASTA TRIMITE BANI INAPOI, si e singurul buton din panou care o face.
   *
   * Selectorul de status de alaturi ramane ce a fost mereu: o eticheta pusa de om dupa ce a dat
   * banii de mana. Doua carti care par sa faca acelasi lucru ar fi fost o capcana, de aceea
   * butonul asta isi spune pe fata ca miscarea e a banilor, nu a etichetei.
   */
  function handleNetopiaRefund() {
    setShowNetopiaRefund(false);
    startNetopiaRefundTransition(async () => {
      let result: Awaited<ReturnType<typeof rambourseazaPrinNetopia>>;
      try {
        result = await rambourseazaPrinNetopia(order.id);
      } catch {
        /*
         * ⚠ Aceeasi asimetrie ca la storno, dar cu bani: actiunea a plecat, raspunsul nu s-a
         * intors, deci NU stim daca rambursarea s-a inregistrat la ei. Registrul tine randul
         * blocat, deci a doua apasare nu poate trimite banii inca o data, dar omul trebuie sa
         * afle de ce, altfel crede ca n-a mers nimic.
         */
        toast.error(
          "Nu am primit raspuns, deci nu stim daca rambursarea a plecat. Verifica in contul "
          + "Netopia inainte de a incerca din nou. O a doua apasare va fi oprita pana se lamureste.",
          { duration: 14000 },
        );
        router.refresh();
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Rambursarea nu a putut fi trimisa."); return; }
      toast.success(result.mesaj ?? "Rambursarea a fost trimisa la Netopia.", { duration: 9000 });
      router.refresh();
    });
  }

  /** ⚠ Ca la Netopia: butonul asta muta BANI, selectorul de status de alaturi doar eticheta. */
  function handleIpayRefund() {
    setShowIpayRefund(false);
    startIpayRefundTransition(async () => {
      let result: Awaited<ReturnType<typeof rambourseazaPrinIpay>>;
      try {
        result = await rambourseazaPrinIpay(order.id);
      } catch {
        /* Registrul tine randul blocat, deci a doua apasare nu poate trimite banii inca o data, dar
           omul trebuie sa afle de ce, altfel crede ca n-a mers nimic. */
        toast.error(
          "Nu am primit raspuns, deci nu stim daca rambursarea a plecat. Verifica in consola iPay "
          + "inainte de a incerca din nou. O a doua apasare va fi oprita pana se lamureste.",
          { duration: 14000 },
        );
        router.refresh();
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Rambursarea nu a putut fi trimisa."); return; }
      toast.success(result.mesaj ?? "Rambursarea a fost trimisa la iPay.", { duration: 12000 });
      router.refresh();
    });
  }

  /** ⚠ Al treilea buton de acelasi fel. Muta BANI; selectorul de status de alaturi doar eticheta. */
  function handleKlarnaRefund() {
    setShowKlarnaRefund(false);
    startKlarnaRefundTransition(async () => {
      let result: Awaited<ReturnType<typeof rambourseazaPrinKlarna>>;
      try {
        result = await rambourseazaPrinKlarna(order.id);
      } catch {
        toast.error(
          "Nu am primit raspuns, deci nu stim daca rambursarea a plecat. Verifica in portalul Klarna "
          + "inainte de a incerca din nou. O a doua apasare va fi oprita pana se lamureste.",
          { duration: 14000 },
        );
        router.refresh();
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Rambursarea nu a putut fi trimisa."); return; }
      toast.success(result.mesaj ?? "Rambursarea a fost trimisa la Klarna.", { duration: 12000 });
      router.refresh();
    });
  }

  /** ⚠ Al patrulea buton de acelasi fel. Muta BANI; selectorul de status de alaturi doar eticheta. */
  function handleRevolutRefund() {
    setShowRevolutRefund(false);
    startRevolutRefundTransition(async () => {
      let result: Awaited<ReturnType<typeof rambourseazaPrinRevolut>>;
      try {
        result = await rambourseazaPrinRevolut(order.id);
      } catch {
        toast.error(
          "Nu am primit raspuns, deci nu stim daca rambursarea a plecat. Verifica in portalul Revolut "
          + "inainte de a incerca din nou. O a doua apasare va fi oprita pana se lamureste.",
          { duration: 14000 },
        );
        router.refresh();
        return;
      }
      if (!result.success) { toast.error(result.error ?? "Rambursarea nu a putut fi trimisa."); return; }
      toast.success(result.mesaj ?? "Rambursarea a fost trimisa la Revolut.", { duration: 12000 });
      router.refresh();
    });
  }

  function handleResendInvoice(email: string) {
    startResendInvoiceTransition(async () => {
      let result: Awaited<ReturnType<typeof resendSmartbillEmail>>;
      try {
        result = await resendSmartbillEmail(businessId, order.id, email, "invoice");
      } catch {
        /* ⚠ Pleaca un email cu documentul catre destinatarul scris in casuta. */
        toast.error(
          "Nu am primit raspuns de la SmartBill, deci nu stim daca factura a fost "
          + "retrimisa. O a doua apasare poate trimite inca un email aceluiasi destinatar.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Factura retrimisa pe email.");
      setShowResendInvoice(false);
    });
  }

  function handleResendEstimate(email: string) {
    startResendEstimateTransition(async () => {
      let result: Awaited<ReturnType<typeof resendSmartbillEmail>>;
      try {
        result = await resendSmartbillEmail(businessId, order.id, email, "estimate");
      } catch {
        /* ⚠ Acelasi drum ca la factura, cu alt document. */
        toast.error(
          "Nu am primit raspuns de la SmartBill, deci nu stim daca proforma a fost "
          + "retrimisa. O a doua apasare poate trimite inca un email aceluiasi destinatar.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Proforma retrimisa pe email.");
      setShowResendEstimate(false);
    });
  }

  async function handleDownloadPdf(docType: "invoice" | "estimate" | "storno") {
    setDownloadingPdf(docType);
    try {
      const res = await fetch(`/api/smartbill/pdf?orderId=${order.id}&type=${docType}`);
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        toast.error(data.error ?? "Eroare la descarcarea PDF-ului.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `document_${docType}.pdf`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Eroare la descarcarea PDF-ului.");
    } finally {
      setDownloadingPdf(null);
    }
  }

  function handleOblioAction(action: "invoice" | "proforma" | "storno") {
    setOblioAction(action);
    startOblioTransition(async () => {
      let result: { error: string } | { number: string; series: string } | { success: true };
      try {
        if (action === "invoice") result = await generateOblioInvoice(businessId, order.id);
        else if (action === "proforma") result = await generateOblioProforma(businessId, order.id);
        else result = await stornoOblioInvoice(businessId, order.id);
      } catch {
        /* ⚠⚠ Aceeasi fereastra ca la SmartBill, cu `orders.oblio_invoice_number`:
           slotul se ocupa abia dupa ce raspunde Oblio, deci o reincercare oarba poate
           emite un al doilea document real. */
        const ce = action === "invoice" ? "factura" : action === "proforma" ? "proforma" : "stornarea";
        toast.error(
          `Nu am primit raspuns de la Oblio, deci nu stim daca ${ce} s-a emis. Verifica in contul Oblio INAINTE sa incerci din nou: daca documentul e acolo, dar numarul nu s-a scris pe comanda, o a doua apasare emite inca unul.`,
          { duration: 12000 },
        );
        router.refresh();
        return;
      } finally {
        /* ⚠ Mutat aici din mijlocul callbackului: acopera si calea de cadere. */
        setOblioAction(null);
      }
      if ("error" in result) { toast.error(result.error); return; }
      if ("number" in result) {
        const labels = { invoice: "Factura", proforma: "Proforma", storno: "Storno" };
        toast.success(`${labels[action]} Oblio ${result.series}${result.number} generata`);
      }
      router.refresh();
    });
  }

  function handleFgoAction(action: "invoice" | "storno") {
    setFgoAction(action);
    startFgoTransition(async () => {
      let result:
        | Awaited<ReturnType<typeof generateFgoInvoice>>
        | Awaited<ReturnType<typeof stornoFgoInvoiceAction>>;
      try {
        result = action === "invoice"
          ? await generateFgoInvoice(businessId, order.id)
          : await stornoFgoInvoiceAction(businessId, order.id);
      } catch {
        /* ⚠⚠ Aceeasi fereastra, cu `orders.fgo_invoice_number`. */
        const ce = action === "invoice" ? "factura" : "stornarea";
        toast.error(
          `Nu am primit raspuns de la fGO, deci nu stim daca ${ce} s-a emis. Verifica in contul fGO INAINTE sa incerci din nou: daca documentul e acolo, dar numarul nu s-a scris pe comanda, o a doua apasare emite inca unul.`,
          { duration: 12000 },
        );
        router.refresh();
        return;
      } finally {
        setFgoAction(null);
      }
      if ("error" in result) { toast.error(result.error); return; }
      if ("number" in result) {
        const label = action === "invoice" ? "Factura fGO" : "Storno fGO";
        /*
         * ⚠⚠ UN DOCUMENT DE TEST SE SPUNE PE LOC (16.09.2026).
         *
         * Cu modul de testare pornit, fGO emite pe `api-testuat.fgo.ro` si intoarce un document
         * care arata exact ca unul adevarat: numar, serie, link, PDF valid. Pana acum ecranul
         * scria acelasi „generata" verde ca la o factura fiscala.
         *
         * ⚠ Masurat: magazinul `itp-blk` are trei astfel de facturi, toate cu link pe
         * `testuat.fgo.ro`, si le-a stornat pe toate trei. Se vede din LINK, nu din configurare,
         * fiindca configurarea spune ce e ACUM, iar documentul a fost emis candva.
         */
        /* ⚠ Stornarea nu intoarce link, factura da: se ia de unde exista, iar la storno se cade pe
           linkul facturii de pe comanda, care e al aceluiasi mediu. */
        const linkDoc = "link" in result && typeof result.link === "string"
          ? result.link
          : String(ord["fgo_invoice_link"] ?? "");
        const eTest = linkDoc.toLowerCase().includes("testuat.fgo.ro");
        if (eTest) {
          toast.warning(
            `${label} ${result.series}${result.number} a fost emisa in MODUL DE TESTARE, deci NU e `
            + "un document fiscal si nu se poate trimite la marketplace. Opreste modul de testare "
            + "din configurarea fGO si emite din nou.",
            { duration: 20000 },
          );
        } else {
          toast.success(`${label} ${result.series}${result.number} generata`);
        }
      }
      router.refresh();
    });
  }

  const smsLen = smsMessage.length;
  const smsSegments = smsLen === 0 ? 0 : Math.ceil(smsLen / 160);

  // Mobile sticky action bar: single most relevant next action.
  const mobileAction = hasChanges
    ? { label: isPending ? "Se salvează..." : "Salvează modificările", onClick: () => setShowSaveConfirm(true), disabled: isPending }
    /* ⚠ Si bara de jos: era a doua usa catre acelasi buton, si pe telefon e chiar cea
       apasata. Vezi `refuzAwbPropriu`. */
    : (!isTrendyol && !shippedCourier && !refuzAwbPropriu && primaryCourier)
      ? { label: `Creează AWB ${primaryCourier.name}`, onClick: primaryCourier.open, disabled: false }
      : null;

  /* Ce arata pasii din capul paginii: factura emisa (la oricare casa) si coletul plecat. */
  const facturaEmisa = !!(invoiceNumber || order.oblio_invoice_number || ord["fgo_invoice_number"]
    || order.facturis_invoice_key || order.factureaza_invoice_key || order.easybill_invoice_key);
  const origine = deriveOrigin(order.order_source);
  const bucati = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  /** Sigla unui curier, in varianta mica acolo unde exista. */
  const siglaCurier = (c: { id: string; name: string; logo: string }): Sigla => ({ cheie: c.id, nume: c.name, logo: siglaMica(c.logo) });
  /* Ceilalti curieri: primii la vedere, restul la cerere. Un magazin are de obicei unul pana la trei. */
  const ALTI_CURIERI_LA_VEDERE = 8;
  const altiCurieriAratati = totiCurierii ? otherCouriers : otherCouriers.slice(0, ALTI_CURIERI_LA_VEDERE);

  /* O rambursare prin procesator: aceeasi cutie pentru toate patru, cu vorbele fiecaruia. */
  const cutieRambursare = (o: {
    prin: string; deschisa: boolean; inCurs: boolean; deschide: () => void; renunta: () => void; confirma: () => void;
  }) => (
    o.deschisa ? (
      <div className={NOTA_PERICOL}>
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-destructive" />
        <p className="min-w-[12rem] flex-1 text-xs text-foreground">
          Se trimit {Number(order.total).toFixed(2)} lei înapoi cumpărătorului, prin {o.prin}.
          Banii pleacă acum și nu pot fi rechemați.
        </p>
        <button type="button" onClick={o.confirma} disabled={o.inCurs} className={BUTON_PERICOL_PLIN}>
          {o.inCurs ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Confirmă rambursarea
        </button>
        <button type="button" onClick={o.renunta} aria-label="Renunță la rambursare"
          className={cn("grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground", INEL, ATINGERE)}>
          <X className="h-4 w-4" />
        </button>
      </div>
    ) : (
      <button type="button" onClick={o.deschide} disabled={o.inCurs} className={BUTON_PERICOL}>
        <RotateCcw className="h-4 w-4" />Rambursează banii prin {o.prin}
      </button>
    )
  );

  // ── Provider bodies for the unified Facturare card ──
  function renderSmartbill() {
    // Link privat spre documentul din SmartBill Cloud (returnat la emitere);
    // editare -> vizualizare, ca in modulul oficial.
    /*
     * ⚠ Aici se facea `raw.replace("editare", "vizualizare")`, adica se incerca traducerea
     * adresei de EDITARE din SmartBill Cloud intr-una de vizualizare, prin potrivire de text pe o
     * adresa al carei format nu e documentat nicaieri.
     *
     * Nu mai e nevoie, si nici corect: de la 16.09.2026 coloana pastreaza chiar `documentViewUrl`,
     * adresa PUBLICA pe care o dau ei, iar adresa de editare nu se mai salveaza deloc. Vezi
     * `adresaPublica` din `smartbill.actions.ts`.
     */
    const sbViewLink = (raw: unknown) => (typeof raw === "string" && raw ? raw : null);
    const invoiceUrl = sbViewLink(ord["smartbill_invoice_url"]);
    const estimateUrl = sbViewLink(ord["smartbill_estimate_url"]);
    const sbLinkBtn = (href: string) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className={BUTON_MIC}>
        <ExternalLink className="h-3.5 w-3.5" />SmartBill
      </a>
    );
    /*
     * Proforma are rand doar cat exista una sau cat se mai poate emite (inca nu e factura). Cu
     * factura emisa si fara proforma, randul ramanea un titlu gol deasupra facturii.
     */
    const cuProforma = hasEstimateSeries && (!!estimateNumber || !invoiceNumber);
    return (
      <div className="space-y-5">
        {cuProforma && (
          <div className="space-y-3">
            <p className={ETICHETA}>Proformă</p>
            {estimateNumber && estimateSeries ? (
              <>
                <DocRow label="Proformă emisă" docNumber={`${estimateSeries}${estimateNumber}`}
                  onDownload={() => handleDownloadPdf("estimate")} downloading={downloadingPdf === "estimate"}>
                  <button type="button" onClick={() => setShowResendEstimate(o => !o)} className={BUTON_MIC}>
                    <Mail className="h-3.5 w-3.5" />Retrimite
                  </button>
                  {estimateUrl && sbLinkBtn(estimateUrl)}
                </DocRow>
                {showResendEstimate && (
                  <ResendEmailForm defaultEmail={customerEmail} onSend={handleResendEstimate} sending={resendingEstimate} />
                )}
                {!invoiceNumber && (
                  <button type="button" onClick={handleConvert} disabled={converting} className={BUTON_CONTUR}>
                    {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {converting ? "Se convertește..." : "Convertește în factură"}
                  </button>
                )}
              </>
            ) : (
              !invoiceNumber && (
                <button type="button" onClick={handleGenerateEstimate} disabled={generatingEstimate} className={BUTON_CONTUR}>
                  {generatingEstimate ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {generatingEstimate ? "Se emite..." : "Emite proforma"}
                </button>
              )
            )}
          </div>
        )}

        {cuProforma && <div className="border-t border-border/70" />}

        <div className="space-y-3">
          {cuProforma && <p className={ETICHETA}>Factură</p>}
          {invoiceNumber && invoiceSeries ? (
            <>
              <DocRow label="Factură emisă" docNumber={`${invoiceSeries}${invoiceNumber}`}
                onDownload={() => handleDownloadPdf("invoice")} downloading={downloadingPdf === "invoice"}>
                <button type="button" onClick={() => setShowResendInvoice(o => !o)} className={BUTON_MIC}>
                  <Mail className="h-3.5 w-3.5" />Retrimite
                </button>
                {invoiceUrl && sbLinkBtn(invoiceUrl)}
              </DocRow>
              {showResendInvoice && (
                <ResendEmailForm defaultEmail={customerEmail} onSend={handleResendInvoice} sending={resendingInvoice} />
              )}
              {stornoNumber && stornoSeries ? (
                // SmartBill /invoice/reverse nu returneaza mereu numarul stornoului;
                // in acel caz marcam factura originala ca stornata (fallback), fara
                // un PDF de storno propriu — asa ca nu oferim un download inselator.
                (stornoSeries === invoiceSeries && stornoNumber === invoiceNumber) ? (
                  <div className={NOTA}>
                    <RotateCcw className="mt-px h-4 w-4 flex-shrink-0 text-destructive" />
                    <p>Factura a fost stornată în SmartBill. Documentul de stornare este disponibil în contul tău SmartBill.</p>
                  </div>
                ) : (
                  <DocRow stornare label="Stornare emisă" docNumber={`${stornoSeries}${stornoNumber}`}
                    onDownload={() => handleDownloadPdf("storno")} downloading={downloadingPdf === "storno"} />
                )
              ) : canStorno ? (
                showStornoConfirm ? (
                  <div className={NOTA_PERICOL}>
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-destructive" />
                    <p className="min-w-[12rem] flex-1 text-xs text-foreground">Această acțiune stornează factura în SmartBill. Nu poate fi anulată.</p>
                    <button type="button" onClick={handleStorno} disabled={stornoing} className={BUTON_PERICOL_PLIN}>
                      {stornoing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Confirmă stornarea
                    </button>
                    <button type="button" onClick={() => setShowStornoConfirm(false)} aria-label="Renunță la stornare"
                      className={cn("grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground", INEL, ATINGERE)}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowStornoConfirm(true)} className={BUTON_PERICOL}>
                    <RotateCcw className="h-4 w-4" />Emite storno
                  </button>
                )
              ) : null}
            </>
          ) : (
            <button type="button" onClick={handleGenerateInvoice} disabled={generatingInvoice} className={BUTON_CONTUR}>
              {generatingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
              {generatingInvoice ? "Se emite..." : "Emite factura"}
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderOblio() {
    // Oblio returneaza un link public semnat = singurul acces la PDF (nu exista
    // endpoint PDF autentificat), deci deschidem direct link-ul stocat.
    const oblioPdfBtn = (link: string | null | undefined) => link ? (
      <a href={link} target="_blank" rel="noopener noreferrer" className={BUTON_MIC}>
        <Download className="h-3.5 w-3.5" /> PDF
      </a>
    ) : null;
    return order.oblio_storno_number ? (
      <div className="space-y-3">
        <DocText pictograma={<XCircle className="h-4 w-4 flex-shrink-0 text-destructive" />} numar={`${order.oblio_storno_series}${order.oblio_storno_number}`} fel="Factură stornată" />
        {oblioPdfBtn(order.oblio_storno_link)}
      </div>
    ) : order.oblio_invoice_number ? (
      <div className="space-y-3">
        <DocText pictograma={<FileCheck className="h-4 w-4 flex-shrink-0 text-success" />} numar={`${order.oblio_invoice_series}${order.oblio_invoice_number}`} fel="Factură emisă" />
        <div className="flex flex-wrap items-center gap-2">
          {oblioPdfBtn(order.oblio_invoice_link)}
          <button type="button" onClick={() => handleOblioAction("storno")} disabled={oblioActionPending} className={BUTON_PERICOL}>
            {oblioActionPending && oblioAction === "storno" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Emite storno
          </button>
        </div>
      </div>
    ) : order.oblio_proforma_number ? (
      <div className="space-y-3">
        <DocText pictograma={<FileText className="h-4 w-4 flex-shrink-0 text-info" />} numar={`${order.oblio_proforma_series}${order.oblio_proforma_number}`} fel="Proformă emisă" />
        <div className="flex flex-wrap items-center gap-2">
          {oblioPdfBtn(order.oblio_proforma_link)}
          <button type="button" onClick={() => handleOblioAction("invoice")} disabled={oblioActionPending} className={BUTON_CONTUR}>
            {oblioActionPending && oblioAction === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
            Emite factura
          </button>
        </div>
      </div>
    ) : (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => handleOblioAction("invoice")} disabled={oblioActionPending} className={BUTON_CONTUR}>
          {oblioActionPending && oblioAction === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
          Emite factura
        </button>
        <button type="button" onClick={() => handleOblioAction("proforma")} disabled={oblioActionPending} className={BUTON_CONTUR}>
          {oblioActionPending && oblioAction === "proforma" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Emite proforma
        </button>
      </div>
    );
  }

  function renderFgo() {
    /*
     * ⚠⚠ DOCUMENTUL DE TEST SE VEDE SI DUPA CE TOASTUL A DISPARUT (16.09.2026).
     *
     * Avertismentul de la emitere dureaza douazeci de secunde; documentul ramane pe comanda luni de
     * zile. Iar pe calea AUTOMATA nu exista niciun toast, fiindca nu e nimeni in fata.
     *
     * Se citeste din LINK, nu din configurarea de acum: configurarea spune ce e ACUM, iar
     * documentul a fost emis candva. Cine iese din modul de testare nu preface retroactiv in
     * documente fiscale facturile emise cat timp era in el.
     */
    const linkFgo = String(ord["fgo_invoice_link"] ?? "");
    const eDeTest = linkFgo.toLowerCase().includes("testuat.fgo.ro");
    const semnDeTest = eDeTest ? (
      <p className="flex items-start gap-1.5 text-xs font-medium text-warning">
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
        Emisă în modul de TESTARE: nu e document fiscal și nu se trimite la marketplace.
      </p>
    ) : null;

    return (ord["fgo_storno_number"]) ? (
      <DocText pictograma={<XCircle className="h-4 w-4 flex-shrink-0 text-destructive" />} numar={`${ord["fgo_storno_series"] as string}${ord["fgo_storno_number"] as string}`} fel="Factură stornată" />
    ) : (ord["fgo_invoice_number"]) ? (
      <div className="space-y-3">
        <DocText pictograma={<FileCheck className={`h-4 w-4 flex-shrink-0 ${eDeTest ? "text-warning" : "text-success"}`} />} numar={`${ord["fgo_invoice_series"] as string}${ord["fgo_invoice_number"] as string}`} fel="Factură emisă" />
        {semnDeTest}
        <div className="flex flex-wrap items-center gap-2">
          {!!(ord["fgo_invoice_link"]) && (
            <a href={ord["fgo_invoice_link"] as string} target="_blank" rel="noopener noreferrer" className={BUTON_MIC}>
              <Download className="h-3.5 w-3.5" /> PDF
            </a>
          )}
          <button type="button" onClick={() => handleFgoAction("storno")} disabled={fgoActionPending} className={BUTON_PERICOL}>
            {fgoActionPending && fgoAction === "storno" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Emite storno
          </button>
        </div>
      </div>
    ) : (
      <button type="button" onClick={() => handleFgoAction("invoice")} disabled={fgoActionPending} className={BUTON_CONTUR}>
        {fgoActionPending && fgoAction === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
        Emite factura
      </button>
    );
  }

  return (
    <div className="p-4 pb-24 text-sm sm:p-6 lg:pb-6">
      {/* ── Antet: numarul, starea (de unde se si schimba), cand si de unde a venit ── */}
      <header className="mb-5">
        <button type="button" onClick={() => router.push(adresaListei)}
          className={cn("inline-flex items-center gap-1.5 rounded-sm text-[13px] text-muted-foreground transition-colors hover:text-foreground max-lg:min-h-10", INEL)}>
          <ArrowLeft className="h-4 w-4" />Comenzi
        </button>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 lg:mt-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{order.order_number}</h1>
              {/*
                Starea, cu punctul ei, e si locul din care se schimba. La o comanda tinuta de un
                marketplace ramane la vedere, dar nu mai raspunde la apasare: starea e a lor.
              */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={tinutaDeEi}
                  aria-label={`Starea comenzii: ${currentStatus.label}. Schimbă starea`}
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-lg px-2 text-sm text-foreground transition max-lg:h-10",
                    tinutaDeEi ? "cursor-default" : "hover:bg-muted",
                    INEL,
                  )}
                >
                  <PunctStare ton={currentStatus.ton} />
                  {currentStatus.label}
                  {!tinutaDeEi && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Schimbă starea în</p>
                  {STATUS_OPTIONS.map(opt => (
                    <DropdownMenuItem key={opt.value} onClick={() => alegeStarea(opt.value)}>
                      <PunctStare ton={opt.ton} />
                      <span className="flex-1">{opt.label}</span>
                      {opt.value === status && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {formatDate(new Date(order.created_at))}
              <span aria-hidden="true"> · </span>{origine.label}
              {origine.detail && <><span aria-hidden="true"> · </span>{origine.detail}</>}
              {origine.device && <><span aria-hidden="true"> · </span>{origine.device}</>}
            </p>
          </div>
          <button type="button" onClick={() => setEditModalOpen(true)} className={cn(BUTON_CONTUR, "max-sm:w-full")}>
            <Pencil className="h-3.5 w-3.5" />Editează comanda
          </button>
        </div>

        <PasiComanda
          className="mt-5 max-w-xl"
          status={status}
          cuFactura={invoicingProviders.length > 0}
          facturaEmisa={facturaEmisa}
          areAwb={!!shippedCourier}
        />
      </header>

      {/*
        ⚠ LA O COMANDA DE MARKETPLACE STAREA E A LOR, SI SE VEDE CA ATARE (25.08.2026).

        ⚠ SI TEXTUL ISI IA NUMELE DIN COMANDA (26.08.2026). Scria „eMAG” oricare ar fi
        fost marketplace-ul, fiindca atunci eMAG era singurul din lista. Cand a intrat
        si Trendyol, o comanda Trendyol si-ar fi trimis comerciantul in contul eMAG sa
        caute o comanda care acolo nu exista.

        Serverul refuza schimbarea (`marketplaceCareTineComanda`), dar un meniu care
        arata apasabil si da eroare abia dupa apasare e o cursa. Aici se spune
        dinainte, si se spune UNDE se face, nu doar ca nu se poate.
      */}
      {(tinutaDeEi || memento || inEasySales) && (
        <div className="mb-5 space-y-2">
          {tinutaDeEi && (
            <p className={NOTA}>
              <Info className="mt-px h-4 w-4 flex-shrink-0 text-info" />
              <span>{cineTineComanda(cineTine!).titlu}{" "}{cineTineComanda(cineTine!).urmator}</span>
            </p>
          )}
          {/*
            ⚠ Memento, nu eroare. Starea ramane de schimbat de aici, fiindca la Pepita comanda chiar
            se administreaza de aici. Ce se aminteste e ca aceeasi miscare trebuie facuta si
            la ei, unde noi n-avem cum sa ajungem.
          */}
          {memento && (
            <p className={NOTA}>
              <Info className="mt-px h-4 w-4 flex-shrink-0 text-warning" />
              <span>{memento}</span>
            </p>
          )}
          {inEasySales && (
            <p className={NOTA}>
              <Info className="mt-px h-4 w-4 flex-shrink-0 text-info" />
              <span>{MESAJ_STAREA_IN_EASYSALES}</span>
            </p>
          )}
        </div>
      )}

      {/*
        Operatiile externe ramase atarnate. Nu se vede nimic in cazul normal —
        componenta intoarce `null` cand lista e goala. Sta SUS, inaintea celor doua
        coloane: cand exista, e primul lucru care trebuie citit, fiindca explica de
        ce un buton de AWB sau de factura refuza sa mai faca ceva.
      */}
      <OperatiiAtarnate businessId={businessId} orderId={order.id as string} />

      {/* Returul Curiera al carui stoc asteapta confirmarea primirii. Nimic in cazul normal. */}
      <ReturDePrimit order={order} />

      {/* ── Doua coloane: ce e comanda (stanga), ce se face cu ea (dreapta). Una singura pe telefon. ── */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* STANGA: continutul comenzii */}
        <div className="min-w-0 space-y-5 lg:flex-1">
          {/* Products */}
          <section className={cn(SECTIUNE, "overflow-hidden")}>
            <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
              <h2 className={TITLU}>Produse comandate</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{pluralRo(bucati, "bucată", "bucăți")}</span>
            </div>
            <ul className="mt-1 divide-y divide-border/70 px-5">
              {items.map((item, i) => {
                /*
                  Serverul scrie pe linia personalizata DOUA chei, si amandoua se citesc aici:
                  `customization` (ce a ales clientul) si `personalizare` (din ce se compune
                  pretul). Cat timp se citea doar prima, linia scria 910 lei pe un produs al carui
                  catalog zice 89 si nimic de pe ecran nu spunea de unde vin — desi platforma
                  salvase chiar explicatia.

                  ⚠ Comenzile de pana acum n-au niciuna dintre chei, si atunci blocul nu se
                  randeaza deloc: pentru ele panoul arata exact ca inainte.
                */
                const campuri = item.customization && typeof item.customization === "object"
                  ? Object.values(item.customization)
                  : [];
                const defalcare = citesteDefalcarea(item.personalizare);
                const poza = pozaLiniei(miniaturi, item.product_id);
                /* Pagina produsului din magazin, cat produsul mai e in catalog si e activ. */
                const legatura = legaturaLiniei(legaturiProduse, item.product_id);
                const cantitate = Number(item.quantity) || 1;
                return (
                  <li key={i} className="py-3">
                    {/*
                      Numele produsului se vede INTREG, pe cate randuri e nevoie.
                      Avea `truncate`, iar pe telefon taia exact partea care
                      deosebeste produsele intre ele: din zece randuri cu "Tulipan
                      Negro Gel Dus ..." nu se mai vedea care e care.
                      Alinierea e pe `items-start`, ca miniatura si pretul sa stea in
                      dreptul PRIMULUI rand, nu la mijlocul unui nume de trei randuri.

                      ⚠ Poza vine din CATALOG (`miniaturi`, de pe server): linia
                      comenzii n-o poarta. Fara poza, `MiniaturaProdus` pune
                      patratul cu pictograma, ca numele sa ramana aliniate.
                    */}
                    <div className="flex items-start gap-3">
                      <MiniaturaProdus poza={poza} />
                      <div className="min-w-0 flex-1">
                        {legatura ? (
                          <a href={legatura} target="_blank" rel="noopener noreferrer"
                            title="Deschide produsul în magazin"
                            className={cn("break-words font-medium", LEGATURA, INEL)}>
                            {item.name}
                          </a>
                        ) : (
                          <span className="break-words font-medium text-foreground">{item.name}</span>
                        )}
                        {/*
                          Pretul pe bucata se scrie doar cand, inmultit, da chiar totalul de alaturi
                          (`unitarSeInchide`): la un pachet de 250 lei pe 3 bucati, „3 × 83,33” ar
                          contrazice suma din dreapta.
                        */}
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          {unitarSeInchide(item.price, cantitate) ? `${cantitate} × ${formatPrice(item.price)}` : pluralRo(cantitate, "bucată", "bucăți")}
                        </p>
                      </div>
                      <span className="flex-shrink-0 font-medium tabular-nums text-foreground">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                    {(campuri.length > 0 || defalcare) && (
                      <div className="ml-13 mt-2 space-y-1.5 border-l border-border pl-3">
                        <p className="text-xs font-medium text-muted-foreground">Personalizare</p>
                        {campuri.map((field, fi) => (
                          <div key={fi}>
                            <p className="text-xs text-muted-foreground">{field.label}</p>
                            {field.type === "fisier" && Array.isArray(field.value) ? (
                              /*
                               * ⚠ UN DOCUMENT N-ARE MINIATURA. Randat ca imagine, un PDF da o
                               * poza rupta in dreptul fisierului de tipar — adica exact semnul
                               * „nu s-a incarcat”, pe hartia dupa care se produce marfa.
                               *
                               * ⚠ Se hotaraste dupa `type`, ca la `image` de mai jos, dar
                               * ADEVARUL despre ce e in fisier vine din alta parte: ruta de
                               * incarcare alege terminatia din OCTETI, iar comanda o verifica fata
                               * de tipul campului (`TERMINATII` din `customization/comanda.ts`).
                               */
                              <ul className="mt-1 space-y-0.5">
                                {(field.value as string[]).map((url, fiI) => (
                                  <li key={fiI}>
                                    <a href={adresaFisierului(url, order.business_id, order.id)} target="_blank" rel="noopener noreferrer"
                                      className="break-all text-sm text-foreground underline underline-offset-2 hover:no-underline">
                                      {numeleFisierului(url, fiI)}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            ) : field.type === "image" && Array.isArray(field.value) ? (
                              /*
                               * ⚠ SI AICI miniatura doar pentru ce se poate DESENA. O poza venita
                               * de pe iPhone e `.heic`, iar Chrome, Firefox si Edge n-au decodor
                               * pentru ea: desenata ca imagine, da un patrat rupt pe chiar hartia
                               * dupa care se produce marfa. Se arata deci ca legatura cu nume,
                               * dupa aceeasi regula in amandoua ecranele — doua reguli s-ar fi
                               * departat, si comerciantul ar fi vazut alta pagina decat clientul.
                               *
                               * ⚠ REGULA E A LUI `customization/adresa.ts`, NU A LUI `/api/img`.
                               * Panoul nu mai trece deloc prin optimizator, deci cine crede ca
                               * lipsa miniaturii atarna de `KEY_RE` de acolo si adauga `.heic` in
                               * ea nu repara nimic aici — si deschide o usa pe care `adresa.ts` o
                               * tine inchisa dinadins: octeti HEIF straini dusi la libheif.
                               */
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {(field.value as string[]).map((url, imgI) => (
                                  sePoateRandaCaImagine(url) ? (
                                    <a key={imgI} href={adresaFisierului(url, order.business_id, order.id)} target="_blank" rel="noopener noreferrer"
                                      className="relative block h-14 w-14 overflow-hidden rounded-lg ring-1 ring-black/10 transition hover:ring-black/30">
                                      {/*
                                        ⚠ `<img>`, nu `<Image>`: optimizatorul cere o adresa pe care
                                        o poate citi el, iar ruta noastra cere SESIUNEA
                                        comerciantului. Cu `<Image>` miniatura ar fi raspuns 401.

                                        ⚠ `mic` NU E DECOR. Fara el, patratul de 56px tragea
                                        ORIGINALUL: octetii de la incarcare, nemicsorati (plafonul
                                        e 10 MB pe imagine), si cu `private, no-store`, deci nici
                                        browserul nu-i tinea. O comanda cu cinci poze de telefon
                                        costa 40 MB la FIECARE deschidere a paginii. Acum ruta
                                        serveste miniatura facuta la incarcare, sub 20 KB.

                                        ⚠ LEGATURA DE DEASUPRA RAMANE PE ORIGINAL. Comerciantul
                                        apasa ca sa vada macheta la marimea ei; miniatura e doar
                                        pentru patrat, si nu e buna de tipar.

                                        ⚠ SI DACA MINIATURA LIPSESTE (fisier urcat inainte de
                                        schimbarea asta), ruta cade singura pe original: patratul
                                        arata mai departe, doar ca mai scump.

                                        ⚠ Dezactivarea de lint de mai jos e DOAR pe randul asta.
                                        Celelalte `<img>` din fisier sunt de dinainte si isi
                                        pastreaza avertismentul: regula nu e oprita pe fisier.
                                      */}
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={adresaFisierului(url, order.business_id, order.id, true)} alt={`Personalizare ${imgI + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                    </a>
                                  ) : (
                                    <a key={imgI} href={adresaFisierului(url, order.business_id, order.id)} target="_blank" rel="noopener noreferrer"
                                      className="break-all text-sm text-foreground underline underline-offset-2 hover:no-underline">
                                      {numeleFisierului(url, imgI)}
                                    </a>
                                  )
                                ))}
                              </div>
                            ) : field.type === "color" ? (
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="w-5 h-5 rounded border border-border" style={{ backgroundColor: field.value as string }} />
                                <span className="text-xs text-muted-foreground font-mono">{field.value}</span>
                              </div>
                            ) : (
                              <p className="text-sm text-foreground">{field.value as string}</p>
                            )}
                          </div>
                        ))}
                        {defalcare && (
                          <DefalcareaPersonalizarii d={defalcare} cantitate={Number(item.quantity) || 1} />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {/*
                Toate cifrele de aici vin din `totaluriComanda`, nu din coloane
                citite una cate una: randurile trebuie sa DEA totalul de sub ele,
                iar regula asta se tine intr-un singur loc, cu test. Vezi
                `lib/orders/totals-box.ts`.
            */}
            <div className="border-t border-border bg-muted/30 px-5 py-4">
              <dl className="ml-auto max-w-sm space-y-1.5 tabular-nums">
                <div className="flex justify-between gap-4 text-muted-foreground">
                  <dt>Subtotal</dt><dd>{formatPrice(totaluri.subtotal)}</dd>
                </div>
                {/* Extraoptiunile sunt listate sus, la produse, dar nu intra in
                    `orders.subtotal`. Fara randul asta, cei 5 lei de pe comanda
                    #0018 se vedeau in lista si dispareau din socoteala. Aceeasi
                    eticheta ca la finalizare (`CheckoutSummary`). */}
                {totaluri.extras > 0 && (
                  <div className="flex justify-between gap-4 text-muted-foreground">
                    <dt>Opțiuni extra</dt>
                    <dd>+{formatPrice(totaluri.extras)}</dd>
                  </div>
                )}
                {totaluri.reducere > 0 && (
                  <div className="flex justify-between gap-4 text-success">
                    <dt>Reducere {order.discount_code ? `(${order.discount_code})` : ""}</dt>
                    <dd>-{formatPrice(totaluri.reducere)}</dd>
                  </div>
                )}
                {/* Reducerile si taxa de plata lipseau din caseta asta, desi sunt
                    in `total`: subtotal + transport + TVA nu dadeau totalul, iar
                    diferenta nu avea nicio explicatie pe ecran. */}
                {totaluri.reducereCard > 0 && (
                  <div className="flex justify-between gap-4 text-success">
                    <dt>Reducere plată cu cardul</dt>
                    <dd>-{formatPrice(totaluri.reducereCard)}</dd>
                  </div>
                )}
                {totaluri.reducereRamburs > 0 && (
                  <div className="flex justify-between gap-4 text-success">
                    <dt>Reducere plată ramburs</dt>
                    <dd>-{formatPrice(totaluri.reducereRamburs)}</dd>
                  </div>
                )}
                {totaluri.taxaRamburs > 0 && (
                  <div className="flex justify-between gap-4 text-muted-foreground">
                    <dt>Taxă plată ramburs</dt>
                    <dd>{formatPrice(totaluri.taxaRamburs)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 text-muted-foreground">
                  <dt>Transport</dt>
                  <dd>{totaluri.transport === 0 ? "Gratuit" : formatPrice(totaluri.transport)}</dd>
                </div>
                {totaluri.tvaEticheta && (
                  <div className="flex justify-between gap-4 text-muted-foreground">
                    {/* La preturi cu TVA inclus eticheta poarta cuvantul „inclus” si
                        cifra NU se aduna: e portiunea extrasa din randurile de mai
                        sus, nu o suma in plus. Pe comanda #0074, adunata, ducea
                        coloana la 66,94 sub un Total de 60. */}
                    <dt>{totaluri.tvaEticheta}</dt>
                    <dd>{formatPrice(totaluri.tva)}</dd>
                  </div>
                )}
                {/* Cand socoteala tot nu se inchide, diferenta se SPUNE. Se intampla
                    azi pe 2 comenzi din 96, ambele din 9 iunie, unde `orders.total`
                    insusi a fost scris de codul de dinaintea reparatiei de TVA din
                    24 iulie. Un rand de umplutura ar fi ascuns tocmai comanda care
                    trebuie verificata pe factura. Reincarcarea paginii nu schimba
                    nimic, deci nici nu o cerem. */}
                {Math.abs(totaluri.diferenta) >= 0.01 && (
                  <div className="flex justify-between gap-4 text-warning">
                    {/* Cand diferenta e chiar cat TVA-ul, ea are un nume: caseta nu
                        mai tipareste acelasi numar de doua ori, o data ca „TVA
                        inclus” si o data ca „nejustificat”. */}
                    <dt>{totaluri.tvaAdunatPesteTotal ? "TVA adunat peste total la plasare" : "Diferență nejustificată"}</dt>
                    <dd className="font-medium">{totaluri.diferenta > 0 ? "-" : "+"}{formatPrice(Math.abs(totaluri.diferenta))}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold text-foreground">
                  <dt>Total</dt><dd>{formatPrice(totaluri.total)}</dd>
                </div>
              </dl>
              {Math.abs(totaluri.diferenta) >= 0.01 && (
                <p className="ml-auto mt-2 max-w-sm text-xs leading-snug text-warning">
                  {totaluri.tvaAdunatPesteTotal
                    ? "Comanda a fost plasată când TVA-ul se aduna peste prețuri, deși magazinul le are cu TVA inclus. Totalul încasat e cel de mai sus; factura trebuie să îl conțină pe el."
                    : "Totalul salvat pe comandă nu se explică din rândurile de mai sus. Compară-l cu factura înainte de a încasa sau storna."}
                </p>
              )}
            </div>
          </section>

          {/* Client, livrare si, la o comanda pe firma, datele care ajung pe factura. */}
          <section className={cn(SECTIUNE, "p-5")}>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <div className="min-w-0">
                <h2 className={TITLU}>Client</h2>
                <p className="mt-2 font-medium text-foreground">{order.customer_name}</p>
                <div className="mt-1 space-y-1 text-muted-foreground max-lg:mt-0 max-lg:space-y-0">
                  <a href={`tel:${order.customer_phone}`} className={cn(LEGATURA_CONTACT, INEL)}>
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />{order.customer_phone}
                  </a>
                  {customerEmail && (
                    <a href={`mailto:${customerEmail}`} className={cn(LEGATURA_CONTACT, INEL)}>
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" /><span className="truncate">{customerEmail}</span>
                    </a>
                  )}
                </div>
              </div>
              {(address.county || address.country) && (
                <div className="min-w-0">
                  <h2 className={TITLU}>Livrare</h2>
                  <div className="mt-2 leading-relaxed text-muted-foreground">
                    <p className="text-foreground">{address.address}</p>
                    <p>{[address.city, address.county, address.postal_code].filter(Boolean).join(", ")}</p>
                    {address.country && address.country !== "RO" && (
                      <p className="font-medium text-foreground">
                        {euCountryByIso2(address.country)?.name ?? address.country}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {/* Comanda pe firma. Numele de mai sus ramane persoana de contact;
                  aici sunt datele care ajung pe factura. */}
              {firma && (
                <div className="min-w-0 border-t border-border/70 pt-5 sm:col-span-2">
                  <h2 className={TITLU}>Date de facturare</h2>
                  <div className="mt-2 leading-relaxed">
                    <p className="font-medium text-foreground">
                      {firma.company_name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">persoană juridică</span>
                    </p>
                    <p className="text-muted-foreground">
                      CUI {firma.vat_payer ? `RO${firma.cui}` : firma.cui}
                      {firma.reg_com ? ` | ${firma.reg_com}` : ""}
                    </p>
                    {(firma.address || firma.city || firma.county) && (
                      <p className="text-muted-foreground">
                        Sediu: {[firma.address, firma.city, firma.county].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {/* Statutul de TVA se afirma doar cand ANAF l-a confirmat.
                        Cand serviciul n-a raspuns la plasarea comenzii, datele
                        sunt cele scrise de client si comerciantul trebuie sa le
                        verifice inainte de a emite factura. */}
                    {firma.verified && !firma.vat_payer && (
                      <p className="text-muted-foreground">Neplătitor de TVA</p>
                    )}
                    {!firma.verified && (
                      <p className="mt-1 flex items-start gap-1.5 text-warning">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>Date neconfirmate la ANAF. Verifică-le înainte de a emite factura.</span>
                      </p>
                    )}
                    {firma.inactive && (
                      <p className="mt-1 flex items-start gap-1.5 text-warning">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>Firma figurează ca inactivă fiscal în registrul ANAF.</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {noteInterne && (
            <section className={cn(SECTIUNE, "space-y-3 p-5")}>
              {/*
                ⚠ TRIUNGHI DOAR CAND CHIAR E UN AVERTISMENT. Nota se scrie pe FIECARE comandă de
                marketplace, iar cele mai multe conțin doar lucruri de știut (cine duce coletul,
                că statusul se operează la ei). Un semn de alarmă pe fiecare comandă curată se
                învață repede să fie ignorat, și atunci nu se mai vede nici pe cea care contează.
              */}
              <h2 className={cn(TITLU, "flex items-center gap-2")}>
                {noteInterne.includes("⚠")
                  ? <AlertTriangle className="h-4 w-4 text-warning" />
                  : <FileText className="h-4 w-4 text-muted-foreground" />}
                {noteInterne.includes("⚠") ? "De știut înainte să expediezi" : "Despre această comandă"}
              </h2>
              {/*
                ⚠ TEXT, NU HTML. Nota vine din codul nostru, dar contine si campuri primite de la
                marketplace (numele variantei, codul primit): randata ca marcaj, ar fi o usa.
                `whitespace-pre-line` pastreaza randurile, care sunt scrise anume cate unul.
              */}
              <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                {noteInterne}
              </p>
              {/*
                ⚠ SE SPUNE CAND A FOST SCRISA. Nota e o fotografie de la sosirea comenzii: dacă
                între timp ai reparat o linie sau ai completat adresa, propozițiile de mai sus pot
                fi depășite. Fără rândul ăsta, cineva ar putea crede că descriu starea de acum.
              */}
              <p className="text-xs text-muted-foreground">
                Scrisă la primirea comenzii; dacă ai reparat ceva între timp, poate fi depășită.
              </p>
            </section>
          )}

          {/* Custom fields / notes */}
          {detaliiCheckout.length > 0 && (
            <section className={cn(SECTIUNE, "p-5")}>
              <h2 className={TITLU}>Câmpuri adiționale</h2>
              <dl className="mt-2 divide-y divide-border/70">
                {detaliiCheckout.map((d, i) => (
                  <div key={i} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                    <dt className="shrink-0 text-xs font-medium text-muted-foreground">{d.eticheta}</dt>
                    <dd className="whitespace-pre-line break-words text-right text-foreground">{d.valoare}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* ── Mesaj catre client: strans pana e nevoie de el ── */}
          <section className={SECTIUNE}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <h2 className={TITLU}>Mesaj către client</h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[customerEmail, customerPhone].filter(Boolean).join(" · ") || "Clientul nu a lăsat nicio adresă de contact."}
                </p>
              </div>
              {mesajDeschis ? (
                <div className="flex items-center gap-2">
                  <div role="group" aria-label="Canalul mesajului" className="flex rounded-lg bg-muted/70 p-0.5">
                    <button type="button" aria-pressed={notifChannel === "email"} onClick={() => setNotifChannel("email")}
                      className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs transition max-lg:h-9", INEL,
                        notifChannel === "email" ? "bg-surface font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                      <Mail className="h-3.5 w-3.5" />E-mail
                    </button>
                    <button type="button" aria-pressed={notifChannel === "sms"} onClick={() => setNotifChannel("sms")}
                      className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs transition max-lg:h-9", INEL,
                        notifChannel === "sms" ? "bg-surface font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                      <MessageSquare className="h-3.5 w-3.5" />SMS
                    </button>
                  </div>
                  <button type="button" onClick={() => setMesajDeschis(false)} aria-label="Închide mesajul"
                    className={cn("grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground", INEL, ATINGERE)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setMesajDeschis(true)} className={cn(BUTON_CONTUR, "max-sm:w-full")}>
                  <Mail className="h-3.5 w-3.5" />Scrie un mesaj
                </button>
              )}
            </div>

            {mesajDeschis && (
              <div className="space-y-4 border-t border-border/70 p-5">
                {notifChannel === "email" ? (
                  customerEmail ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={ETICHETA}>Pornește de la</span>
                        {Object.entries(NOTIF_TEMPLATES).map(([key, t]) => (
                          <button key={key} type="button" aria-pressed={notifTemplate === key} onClick={() => applyTemplate(key)}
                            className={cn("h-8 rounded-lg px-2.5 text-xs transition max-lg:h-10", INEL,
                              notifTemplate === key ? "bg-foreground font-medium text-background" : "bg-surface text-foreground ring-1 ring-black/10 hover:ring-black/25")}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <div>
                        <label htmlFor="mesaj-subiect" className={cn(ETICHETA, "mb-1 block")}>Subiect</label>
                        <Input id="mesaj-subiect" type="text" value={notifSubject} onChange={e => setNotifSubject(e.target.value)} placeholder="Subiectul e-mailului" />
                      </div>
                      <div>
                        <label htmlFor="mesaj-text" className={cn(ETICHETA, "mb-1 block")}>Mesaj</label>
                        <Textarea id="mesaj-text" value={notifMessage} onChange={e => setNotifMessage(e.target.value)} rows={5} placeholder="Scrie mesajul pentru client..." className="resize-none" />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-xs text-muted-foreground">Către: <span className="font-medium text-foreground">{customerEmail}</span></p>
                        <button type="button" onClick={handleSendNotification} disabled={sendingNotif || !notifSubject.trim() || !notifMessage.trim()} className={cn(BUTON_PLIN, "max-sm:w-full")}>
                          {sendingNotif ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                          Trimite e-mailul
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Clientul nu a lăsat o adresă de e-mail, așa că nu îi poți scrie pe e-mail pentru această comandă.</p>
                  )
                ) : !smsoEnabled ? (
                  <p className="text-muted-foreground">
                    Conectează <Link href="/dashboard/features/smso" className={cn("font-medium", LEGATURA, INEL)}>SMSO</Link> ca să poți trimite SMS-uri clienților direct din comandă.
                  </p>
                ) : !customerPhone ? (
                  <p className="text-muted-foreground">Clientul nu a lăsat un număr de telefon, așa că nu îi poți trimite SMS pentru această comandă.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={ETICHETA}>Pornește de la</span>
                      {Object.entries(SMS_TEMPLATES).map(([key, t]) => (
                        <button key={key} type="button" aria-pressed={smsTemplate === key} onClick={() => applySmsTemplate(key)}
                          className={cn("h-8 rounded-lg px-2.5 text-xs transition max-lg:h-10", INEL,
                            smsTemplate === key ? "bg-foreground font-medium text-background" : "bg-surface text-foreground ring-1 ring-black/10 hover:ring-black/25")}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div>
                      <label htmlFor="mesaj-sms" className={cn(ETICHETA, "mb-1 block")}>Mesaj SMS</label>
                      <Textarea id="mesaj-sms" value={smsMessage} onChange={e => setSmsMessage(e.target.value)} rows={3} placeholder="Scrie mesajul SMS..." className="resize-none" />
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">{pluralRo(smsLen, "caracter", "caractere")}, {smsSegments} SMS</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-xs text-muted-foreground">Către: <span className="font-medium text-foreground">{customerPhone}</span></p>
                      <button type="button" onClick={handleSendSms} disabled={sendingSms || !smsMessage.trim()} className={cn(BUTON_PLIN, "max-sm:w-full")}>
                        {sendingSms ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                        Trimite SMS-ul
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        {/* DREAPTA: ce se face cu comanda (ramane la vedere cat derulezi, pe ecran lat) */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:w-[380px] lg:shrink-0">
          {areStampilaEasySales && <EasySalesComandaPanel businessId={businessId} orderId={order.id} />}
          {order.payment_method === "tbi" && (
            <TbiComandaPanel businessId={businessId} orderId={order.id} comandaAnulata={order.status === "cancelled"} />
          )}

          {/* Plata: cum s-a platit, in ce stare e (de unde se si schimba) si, unde se poate, banii inapoi. */}
          <section className={cn(SECTIUNE, "p-5")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className={TITLU}>Plată</h2>
                <p className="mt-1 text-muted-foreground">
                  {/*
                    Eticheta metodei, nu codul ei („tbi", „revolut"): omul citeste un cuvant, nu un
                    identificator. La o comanda de marketplace metoda e chiar marketplace-ul
                    („emag", „pepita"), deci se scrie cu numele lui.
                  */}
                  {order.payment_method === "cash_on_delivery"
                    ? "Plată la livrare"
                    : PAYMENT_METHOD_DEFAULT_LABELS[order.payment_method as PaymentMethodType]
                      ?? (MARKETPLACE_ORIGINI[order.payment_method as string]
                        ? `Prin ${MARKETPLACE_ORIGINI[order.payment_method as string].label}`
                        : order.payment_method)}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={tinutaDeEi}
                  aria-label={`Starea plății: ${currentPayment.label}. Schimbă starea plății`}
                  className={cn(
                    "-mr-2 inline-flex h-8 flex-shrink-0 items-center gap-2 rounded-lg px-2 text-[13px] text-foreground transition max-lg:h-10",
                    tinutaDeEi ? "cursor-default" : "hover:bg-muted",
                    INEL,
                  )}
                >
                  <PunctStare ton={currentPayment.ton} />
                  {currentPayment.label}
                  {!tinutaDeEi && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Schimbă plata în</p>
                  {PAYMENT_OPTIONS.map(opt => (
                    <DropdownMenuItem key={opt.value} onClick={() => alegePlata(opt.value)}>
                      <PunctStare ton={opt.ton} />
                      <span className="flex-1">{opt.label}</span>
                      {opt.value === paymentStatus && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {/*
              ⚠ SINGURUL LOC DIN PANOU CARE MISCA BANI INAPOI.
              Se arata doar cand chiar e ceva de rambursat: plata a intrat prin Netopia, e
              marcata platita, si avem identificatorul lor de tranzactie. Fara oricare dintre
              cele trei, butonul ar fi o promisiune pe care actiunea o refuza oricum.
            */}
            {order.payment_method === "netopia"
              && order.payment_status === "paid"
              && Boolean(order.netopia_ntp_id) && (
              <div className="mt-3">
                {cutieRambursare({
                  prin: "Netopia", deschisa: showNetopiaRefund, inCurs: refundingNetopia,
                  deschide: () => setShowNetopiaRefund(true), renunta: () => setShowNetopiaRefund(false), confirma: handleNetopiaRefund,
                })}
              </div>
            )}
            {/*
              ⚠ Acelasi buton, pentru iPay. Se arata doar cand chiar e ceva de rambursat: plata a
              intrat prin iPay, e marcata platita, si avem identificatorul LOR de tranzactie
              (`refund.do` il cere). Fara oricare dintre cele trei, actiunea refuza oricum.
            */}
            {order.payment_method === "ipay"
              && order.payment_status === "paid"
              && Boolean(order.ipay_order_id) && (
              <div className="mt-3">
                {cutieRambursare({
                  prin: "iPay", deschisa: showIpayRefund, inCurs: refundingIpay,
                  deschide: () => setShowIpayRefund(true), renunta: () => setShowIpayRefund(false), confirma: handleIpayRefund,
                })}
              </div>
            )}
            {order.payment_method === "klarna"
              && order.payment_status === "paid"
              && Boolean(order.klarna_order_id) && (
              <div className="mt-3">
                {cutieRambursare({
                  prin: "Klarna", deschisa: showKlarnaRefund, inCurs: refundingKlarna,
                  deschide: () => setShowKlarnaRefund(true), renunta: () => setShowKlarnaRefund(false), confirma: handleKlarnaRefund,
                })}
              </div>
            )}
            {order.payment_method === "revolut"
              && order.payment_status === "paid"
              && Boolean(order.revolut_order_id) && (
              <div className="mt-3">
                {cutieRambursare({
                  prin: "Revolut", deschisa: showRevolutRefund, inCurs: refundingRevolut,
                  deschide: () => setShowRevolutRefund(true), renunta: () => setShowRevolutRefund(false), confirma: handleRevolutRefund,
                })}
              </div>
            )}
          </section>

          {/* Facturare (unified) */}
          {invoicingProviders.length > 0 && (
            <section className={SECTIUNE}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-4">
                <h2 className={TITLU}>Factură</h2>
                {/*
                  Casele conectate, ca sigle. Cu una singura, sigla doar spune a cui e factura; cu mai
                  multe, sigla apasata alege casa cu care se lucreaza.
                */}
                <div role="group" aria-label="Casa de facturare" className="flex flex-wrap gap-1.5">
                  {invoicingProviders.map(p => (
                    invoicingProviders.length === 1 ? (
                      <span key={p.id} className="grid h-8 w-[68px] place-items-center" title={p.name}>
                        <span className="block h-[24px] w-[54px]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.logo} alt={p.name} className="h-full w-full object-contain object-right" style={p.inversat ? { filter: "invert(1)" } : undefined} />
                        </span>
                      </span>
                    ) : (
                      <button key={p.id} type="button" onClick={() => setActiveProvider(p.id)}
                        aria-pressed={activeProvider === p.id} aria-label={p.name} title={p.name}
                        className={cn(
                          "grid h-8 w-[68px] place-items-center rounded-lg bg-surface transition", INEL, ATINGERE,
                          activeProvider === p.id ? "ring-2 ring-foreground" : "opacity-60 ring-1 ring-black/10 hover:opacity-100 hover:ring-black/25",
                        )}>
                        <span className="block h-[24px] w-[54px]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.logo} alt="" className="h-full w-full object-contain" style={p.inversat ? { filter: "invert(1)" } : undefined} />
                        </span>
                      </button>
                    )
                  ))}
                </div>
              </div>
              <div className="p-5 pt-4">
                {activeProvider === "smartbill" && renderSmartbill()}
                {activeProvider === "oblio" && renderOblio()}
                {activeProvider === "fgo" && renderFgo()}
                {/*
                  Casele „cu cheie”: aceeasi fila (`FilaCaseiCuCheie`), cu actiunile fiecareia.
                  ⚠ RAMAN MONTATE si cand alta fila e aleasa (doar ascunse): starea „se emite” traieste
                  in fila, iar o fila demontata in timpul emiterii ar fi revenit cu butonul activ.
                */}
                {facturisEnabled && (
                  <div hidden={activeProvider !== "facturis"}>
                  <FilaCaseiCuCheie
                    casa="Facturis"
                    ruta="/api/facturis/pdf"
                    orderId={order.id}
                    factura={{ cheie: order.facturis_invoice_key, serie: order.facturis_invoice_series, numar: order.facturis_invoice_number }}
                    storno={{ cheie: order.facturis_storno_key, serie: order.facturis_storno_series, numar: order.facturis_storno_number }}
                    emite={() => generateFacturisInvoice(businessId, order.id)}
                    citeste={() => refreshFacturisDocuments(businessId, order.id)}
                    storneaza={() => stornoFacturisInvoiceAction(businessId, order.id)}
                  />
                  </div>
                )}
                {factureazaEnabled && (
                  <div hidden={activeProvider !== "factureaza"}>
                  <FilaCaseiCuCheie
                    casa="Factureaza.ro"
                    ruta="/api/factureaza/pdf"
                    orderId={order.id}
                    factura={{ cheie: order.factureaza_invoice_key, serie: order.factureaza_invoice_series, numar: order.factureaza_invoice_number }}
                    storno={{ cheie: order.factureaza_storno_key, serie: order.factureaza_storno_series, numar: order.factureaza_storno_number }}
                    deTest={eDocumentDeTestFactureaza(order.factureaza_storno_key ?? order.factureaza_invoice_key)}
                    modTest={factureazaTest}
                    emite={() => generateFactureazaInvoice(businessId, order.id)}
                    citeste={() => refreshFactureazaDocuments(businessId, order.id)}
                    storneaza={() => stornoFactureazaInvoiceAction(businessId, order.id)}
                  />
                  </div>
                )}
                {easybillEnabled && (
                  <div hidden={activeProvider !== "easybill"}>
                  <FilaCaseiCuCheie
                    casa="easybill"
                    ruta="/api/easybill/pdf"
                    orderId={order.id}
                    factura={{ cheie: order.easybill_invoice_key, serie: order.easybill_invoice_series, numar: order.easybill_invoice_number }}
                    storno={{ cheie: order.easybill_storno_key, serie: order.easybill_storno_series, numar: order.easybill_storno_number }}
                    emite={() => generateEasybillInvoice(businessId, order.id)}
                    citeste={() => refreshEasybillDocuments(businessId, order.id)}
                    /* easybill n-are stornare in API: se face in contul lor, apoi se inregistreaza aici. */
                    stornareInAfara={<EasybillStornareManuala businessId={businessId} orderId={order.id} />}
                  />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Contabilitatea: documentele emise (de oricare casa) pleaca in SAGA. */}
          {saga && <SagaComandaPanel businessId={businessId} orderId={order.id} stare={saga} />}

          {/* Expediere */}
          {isEmag && <EmagFulfillmentPanel businessId={businessId} order={order} />}
          {isTrendyol ? (
            <TrendyolFulfillmentPanel businessId={businessId} orderId={order.id} />
          ) : enabledCouriers.length > 0 ? (
            <section className={cn(SECTIUNE, "p-5")}>
              <h2 className={TITLU}>Expediere</h2>
              <div className="mt-3 space-y-3">
                {shippedCourier ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="inline-grid h-12 w-[140px] flex-shrink-0 place-items-center rounded-xl bg-surface ring-1 ring-black/10">
                        <span className="block h-[34px] w-[108px]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={siglaMica(shippedCourier.logo)} alt={shippedCourier.name} className="h-full w-full object-contain" />
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-all font-mono text-sm font-medium text-foreground">{shippedCourier.awb}</p>
                        <p className="text-xs text-muted-foreground">AWB emis cu {shippedCourier.name}</p>
                      </div>
                    </div>
                    {(shippedCourier.partener || shippedCourier.stare || shippedCourier.ramburs) && (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {shippedCourier.partener && (
                          <p>
                            AWB {shippedCourier.partener.nume}:{" "}
                            {shippedCourier.partener.href ? (
                              <a
                                href={shippedCourier.partener.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn("font-mono font-medium", LEGATURA, INEL)}
                              >
                                {shippedCourier.partener.awb}
                              </a>
                            ) : (
                              <span className="font-mono font-medium text-foreground">{shippedCourier.partener.awb}</span>
                            )}
                          </p>
                        )}
                        {/*
                          ⚠ CHIAR PROPOZITIA CURIERULUI, nu o talmacire de-a noastra. Vine din
                          cronul de urmarire si se arata doar cand el chiar a aflat ceva.
                        */}
                        {shippedCourier.stare && (
                          <p>Stare la curier: <span className="text-foreground">{shippedCourier.stare}</span></p>
                        )}
                        {/*
                          ⚠ Banii de ramburs, tot cu vorbele lor. Aici eticheta CHIAR e a unei liste
                          documentate de furnizor, spre deosebire de starea coletului de deasupra.
                        */}
                        {shippedCourier.ramburs && (
                          <p>Ramburs: <span className="text-foreground">{shippedCourier.ramburs}</span></p>
                        )}
                      </div>
                    )}
                    <button type="button" onClick={shippedCourier.open} className={cn(BUTON_CONTUR, "w-full")}>
                      <Package className="h-4 w-4" />Gestionează AWB-ul
                    </button>
                  </>
                ) : refuzAwbPropriu ? (
                  <>
                    {/* ⚠ Nu un buton stins, ci MOTIVUL. Un buton gri il pune pe om sa caute ce
                        reglaj ii lipseste; propozitia ii spune ce s-a intamplat si ce urmeaza. */}
                    <div className={NOTA}>
                      <AlertTriangle className="mt-px h-4 w-4 flex-shrink-0 text-warning" />
                      <p className="text-muted-foreground">{refuzAwbPropriu}</p>
                    </div>
                    {/*
                      ⚠ CAPATUL CELALALT AL ACELEIASI HOTARARI. Am inchis emiterea de AWB propriu
                      fiindca ar fi a doua eticheta pe acelasi colet; fara asta, comerciantul ramanea
                      cu un pachet pe care nu-l poate expedia. Eticheta LOR vine chiar in comanda.

                      ⚠ Se arata NUMAI cand chiar exista in depozit: un buton care duce la 404 e mai
                      rau decat lipsa lui.
                    */}
                    {areEtichetaPepita && (
                      <a
                        href={`/api/pepita/eticheta?business=${encodeURIComponent(businessId)}&comanda=${encodeURIComponent(order.id)}&numar=${encodeURIComponent(String(orderNumber))}`}
                        target="_blank" rel="noopener noreferrer"
                        className={cn(BUTON_PLIN, "w-full")}
                      >
                        <Download className="h-4 w-4" />Eticheta Pepita (PDF)
                      </a>
                    )}
                    {/*
                      ⚠ ETICHETA PRIMITA SI PIERDUTA ARE ALT RASPUNS DECAT ETICHETA NETRIMISA, si
                      pana pe 09.09.2026 amandoua aratau la fel: butonul lipsea, si atat. Aici e
                      singurul loc in care comerciantul poate afla ca mai are o miscare de facut.
                    */}
                    {!areEtichetaPepita && (stareEtichetaPepita === "depozit-cazut" || stareEtichetaPepita === "nevalida") && (
                      <div className={NOTA}>
                        <AlertTriangle className="mt-px h-4 w-4 flex-shrink-0 text-destructive" />
                        <p className="text-muted-foreground">
                          {stareEtichetaPepita === "nevalida"
                            ? "Pepita a trimis o etichetă, dar fișierul primit nu era un PDF valid și nu s-a putut păstra."
                            : "Pepita a trimis eticheta, dar nu am putut-o salva."}
                          {" "}Deschide comanda în Pepita Admin și apasă „Resend order”: eticheta vine din nou și o păstrăm.
                        </p>
                      </div>
                    )}
                  </>
                ) : primaryCourier ? (
                  <>
                    {/*
                      Curierul ales de client la comanda (sau primul conectat): butonul alb doar cu
                      sigla lui, mare. Ce face spune randul de alaturi si numele accesibil.
                    */}
                    <div>
                      <p className={ETICHETA}>{chosenCourier ? "Ales de client la comandă" : "Curier recomandat"}</p>
                      <p className="mt-1 font-medium text-foreground">{address.courier_label ?? primaryCourier.name}</p>
                      {deliveryInfo && <p className="text-xs text-muted-foreground">{deliveryInfo}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <ButonSigla sigla={siglaCurier(primaryCourier)} eticheta={`Creează AWB ${primaryCourier.name}`} marime="mare" onClick={primaryCourier.open} />
                      <p className="text-xs text-muted-foreground">
                        <span className="block font-medium text-foreground">Creează AWB</span>
                        Niciunul emis până acum.
                      </p>
                    </div>
                    {otherCouriers.length > 0 && (
                      <div className="border-t border-border/70 pt-3">
                        <p className={ETICHETA}>Sau cu alt curier</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {altiCurieriAratati.map(c => (
                            <ButonSigla key={c.id} sigla={siglaCurier(c)} eticheta={`Creează AWB ${c.name}`} marime="mic" onClick={c.open} />
                          ))}
                          {otherCouriers.length > ALTI_CURIERI_LA_VEDERE && (
                            <button type="button" onClick={() => setTotiCurierii(v => !v)} aria-expanded={totiCurierii}
                              className={cn("h-8 rounded-lg px-2.5 text-xs font-medium text-muted-foreground ring-1 ring-black/10 transition hover:text-foreground hover:ring-black/25", INEL, ATINGERE)}>
                              {totiCurierii ? "Mai puțini" : `Încă ${otherCouriers.length - ALTI_CURIERI_LA_VEDERE}`}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {/*
        ── Stergerea ──

        ⚠ NU SE ARATA DELOC LA O COMANDA TINUTA DE MARKETPLACE (25.08.2026).

        Serverul o refuza deja (`deleteOrder`), deci integritatea era in regula. Dar un
        buton rosu care arata apasabil si da eroare abia dupa apasare e o cursa: omul crede
        ca a facut o greseala, incearca din nou, si abia apoi citeste.

        ⚠ Se ascunde RANDUL intreg, nu doar butonul: un titlu „Șterge comanda” deasupra
        unui buton mort ar fi fost la fel de mincinos.
      */}
      {!tinutaDeEi && refuzStergere && (
        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Comanda nu se poate șterge.</span>{" "}{refuzStergere}
        </p>
      )}
      {!tinutaDeEi && !refuzStergere && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Ștergerea comenzii este definitivă și nu poate fi anulată.</p>
          <button type="button" onClick={() => setShowDeleteConfirm(true)} disabled={deleting} className={cn(BUTON_PERICOL, "max-sm:w-full")}>
            <Trash2 className="h-4 w-4" />Șterge definitiv
          </button>
        </div>
      )}

      {/* ── Bara lipita jos pe telefon (deasupra barei de navigare): pasul urmator ── */}
      {mobileAction && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background px-4 py-3 lg:hidden">
          <button type="button" onClick={mobileAction.onClick} disabled={mobileAction.disabled} className={cn(BUTON_PLIN, "h-11 w-full max-lg:h-11")}>
            <Package className="h-4 w-4" />{mobileAction.label}
          </button>
        </div>
      )}

      {/* ── Order edit modal ── */}
      <OrderEditModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        order={order}
        businessId={businessId}
        onSaved={() => { setEditModalOpen(false); router.refresh(); }}
      />

      {/* ── Courier AWB Modals ── */}
      {wootEnabled && (
        <WootAwbModal open={wootModalOpen} onClose={() => setWootModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setWootModalOpen(false); router.refresh(); }} />
      )}
      {cargusEnabled && (
        <CargusAwbModal open={cargusModalOpen} onClose={() => setCargusModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setCargusModalOpen(false); router.refresh(); }} />
      )}
      {dpdEnabled && (
        <DpdAwbModal open={dpdModalOpen} onClose={() => setDpdModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setDpdModalOpen(false); router.refresh(); }} />
      )}
      {fanCourierEnabled && (
        <FanCourierAwbModal open={fanCourierModalOpen} onClose={() => setFanCourierModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setFanCourierModalOpen(false); router.refresh(); }} />
      )}
      {samedayEnabled && (
        <SamedayAwbModal open={samedayModalOpen} onClose={() => setSamedayModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setSamedayModalOpen(false); router.refresh(); }} />
      )}
      {coleteEnabled && (
        <ColeteAwbModal open={coleteModalOpen} onClose={() => setColeteModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setColeteModalOpen(false); router.refresh(); }} />
      )}
      {glsEnabled && (
        <GlsAwbModal open={glsModalOpen} onClose={() => setGlsModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setGlsModalOpen(false); router.refresh(); }} />
      )}
      {pallexEnabled && (
        <PallexAwbModal zile={pallexZile} open={pallexModalOpen} onClose={() => setPallexModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setPallexModalOpen(false); router.refresh(); }} />
      )}
      {ecoletEnabled && (
        <EcoletAwbModal open={ecoletModalOpen} onClose={() => setEcoletModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setEcoletModalOpen(false); router.refresh(); }} />
      )}
      {postaEnabled && (
        <PostaAwbModal zilePrezentare={postaZilePrezentare} open={postaModalOpen} onClose={() => setPostaModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setPostaModalOpen(false); router.refresh(); }} />
      )}
      {/* ⚠ La reusita fereastra RAMANE deschisa, cu „Descarca eticheta”; pagina doar se
          reimprospateaza dedesubt, ca butonul de emitere sa dispara de pe comanda. */}
      {curieraEnabled && (
        <CurieraAwbModal optiuni={curieraOptiuni} open={curieraModalOpen} onClose={() => setCurieraModalOpen(false)} order={order} businessId={businessId} onSuccess={() => router.refresh()} />
      )}
      {/* La fel ca la Curiera: la reusita fereastra RAMANE deschisa, cu eticheta. */}
      {epacketEnabled && (
        <EpacketAwbModal optiuni={epacketOptiuni} open={epacketModalOpen} onClose={() => setEpacketModalOpen(false)} order={order} businessId={businessId} onSuccess={() => router.refresh()} />
      )}
      {shipoEnabled && (
        <ShipoAwbModal open={shipoModalOpen} onClose={() => setShipoModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setShipoModalOpen(false); router.refresh(); }} />
      )}
      {fedexEnabled && (
        <FedexAwbModal open={fedexModalOpen} onClose={() => setFedexModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setFedexModalOpen(false); router.refresh(); }} />
      )}
      {dhlEnabled && (
        <DhlAwbModal open={dhlModalOpen} onClose={() => setDhlModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setDhlModalOpen(false); router.refresh(); }} />
      )}
      {upsEnabled && (
        <UpsAwbModal open={upsModalOpen} onClose={() => setUpsModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setUpsModalOpen(false); router.refresh(); }} />
      )}
      {smartshipEnabled && (
        <SmartshipAwbModal open={smartshipModalOpen} onClose={() => setSmartshipModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setSmartshipModalOpen(false); router.refresh(); }} />
      )}
      {packetaEnabled && (
        <PacketaAwbModal open={packetaModalOpen} onClose={() => setPacketaModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setPacketaModalOpen(false); router.refresh(); }} />
      )}
      {innoshipEnabled && (
        <InnoshipAwbModal open={innoshipModalOpen} onClose={() => setInnoshipModalOpen(false)} order={order} businessId={businessId} onSuccess={() => { setInnoshipModalOpen(false); router.refresh(); }} />
      )}

      {/* ── Status/payment change confirmation ── */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={renuntaLaSchimbare}>
          <div role="dialog" aria-modal="true" aria-labelledby="titlu-confirmare-stare" className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl ring-1 ring-black/10" onClick={e => e.stopPropagation()}>
            <h3 id="titlu-confirmare-stare" className="mb-2 text-base font-semibold text-foreground">Confirmi schimbarea?</h3>
            <div className="mb-4 space-y-1.5 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">Starea comenzii: <PunctStare ton={currentStatus.ton} /><span className="font-medium text-foreground">{currentStatus.label}</span></p>
              <p className="flex items-center gap-2">Starea plății: <PunctStare ton={currentPayment.ton} /><span className="font-medium text-foreground">{currentPayment.label}</span></p>
              {status !== order.status && (customerEmail || customerPhone) && (
                <p className="pt-1 text-xs">Clientul va fi anunțat automat despre schimbarea stării.</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={renuntaLaSchimbare} className={BUTON_CONTUR}>Renunță</button>
              <button type="button" onClick={confirmSave} disabled={isPending} className={BUTON_PLIN}>Confirmă</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="titlu-confirmare-stergere" className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl ring-1 ring-black/10" onClick={e => e.stopPropagation()}>
            <h3 id="titlu-confirmare-stergere" className="mb-2 text-base font-semibold text-foreground">Ștergi comanda {orderNumber}?</h3>
            <p className="mb-4 text-sm text-muted-foreground">Ștergerea este definitivă și nu poate fi anulată.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowDeleteConfirm(false)} className={BUTON_CONTUR}>Renunță</button>
              <button type="button" onClick={handleDelete} disabled={deleting} className={BUTON_PERICOL_PLIN}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Șterge comanda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
