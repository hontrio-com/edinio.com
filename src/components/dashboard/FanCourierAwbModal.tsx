"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useDialogAccesibil } from "./useDialogAccesibil";
import { stradaDestinatarului } from "@/lib/orders/adresa";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import { X, Package, Loader2, Download, Trash2, MapPin } from "lucide-react";
import { createFanCourierAwbAction, deleteFanCourierAwbAction } from "@/lib/actions/fancourier.actions";
import { useGreutateaAwb, notaGreutate } from "./useGreutateaAwb";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type ShippingAddress = {
  name?: string;
  county?: string;
  city?: string;
  address?: string;
  street?: string;
  street_no?: string;
  postal_code?: string;
  courier?: string;
  delivery_type?: string;
  locker_id?: string;
  locker_name?: string;
  locker_address?: string;
  locker_city?: string;
  locker_county?: string;
  /* ⚠ Care retea FAN: `fanbox`, `paypoint` sau `office`. Lipsa inseamna FANbox, fiindca
     pana pe 13.09.2026 aia era singura oferita. */
  fan_point_type?: string;
};

// FANbox limits from the FAN Courier API docs ("FANbox particularities").
const FANBOX_MAX_WEIGHT_KG = 30;
const FANBOX_COMPARTMENT_CM = [40.4, 44.3, 45]; // sorted min→max
const FAN_MAX_COD = 10000;
/* Limitele PayPoint, din „PAYPOINT PARTICULARITIES" (pag. 28): mai STRANSE decat cele
   FANbox, deci nu se imprumuta. Tinute in sincron cu serverul de o proba, vezi
   `fancourier.test.ts`. */
const PAYPOINT_MAX_WEIGHT_KG = 10;
const PAYPOINT_LATURI_CM = [60, 60, 90]; // sorted min→max

type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
};

/**
 * Invelisul care MONTEAZA formularul abia la deschidere.
 *
 * ═══ ⚠ ASTA INLOCUIESTE „AMPRENTA DESTINATARULUI" (13.09.2026) ═══
 *
 * Fereastra statea montata permanent in pagina comenzii: se randa cand FAN e activ, nu
 * cand e deschis. Deci `useState(order....)` rula O SINGURA DATA, la incarcarea paginii,
 * si starea supravietuia peste `router.refresh()`. Comerciantul corecta adresa gresita a
 * unui client, panoul ii spunea „poti genera acum AWB-ul cu datele noi", si fereastra
 * trimitea mai departe ADRESA VECHE: un colet fizic, cu ramburs, la destinatia gresita.
 *
 * Leacul de atunci a fost o amprenta a destinatarului, comparata la fiecare randare, care
 * rescria campurile cand se schimba. Functiona, dar avea o gaura a ei: `setAmprentaAratata`
 * rula NECONDITIONAT, iar rescrierea campurilor sta sub `if (!hasAwb)`. Deci pe o comanda
 * cu AWB emis amprenta noua era CONSUMATA fara ca vreun camp sa se miste, si dupa stergerea
 * AWB-ului fereastra ramanea cu datele vechi, de-a binelea.
 *
 * Montand la deschidere, `useState` ruleaza din nou de fiecare data si nu mai e nevoie
 * nici de amprenta, nici de vreun efect care sa „resincronizeze". Acelasi tipar ca la
 * `GlsAwbModal.tsx:61-78` si la celelalte cincisprezece ferestre.
 */
export function FanCourierAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

function Formular({ onClose, order, businessId, onSuccess }: Props) {
  const orderData = order as typeof order & {
    fan_courier_awb_number?: string | null;
  };

  const hasAwb = !!orderData.fan_courier_awb_number;
  const addr = order.shipping_address as ShippingAddress | null;

  /*
   * Livrarea intr-un punct FAN cere id-ul punctului: AWB-ul poarta `pickupLocationId` si
   * judetul/localitatea PUNCTULUI, rezolvate pe server dupa id.
   *
   * ⚠ SI CARE RETEA, din 13.09.2026. Acelasi `locker_id` poate fi un FANbox, un PayPoint
   * sau un oficiu, iar cele trei se emit cu servicii si optiuni diferite si au limite
   * diferite. Lipsa tipului inseamna `fanbox`: comenzile de dinainte n-au campul, si
   * atunci FANbox era singura retea oferita.
   */
  const punctFan: "fanbox" | "paypoint" | "office" | null =
    (addr?.courier === "fan-courier" || addr?.courier === "fancourier") &&
    addr?.delivery_type === "locker" &&
    !!addr?.locker_id
      ? (addr.fan_point_type === "paypoint" || addr.fan_point_type === "office" ? addr.fan_point_type : "fanbox")
      : null;
  const laPunctFan = punctFan !== null;

  // Greutatea vine din produsele comenzii, nu de la un kilogram fix. Vezi
  // `useGreutateaAwb`.
  /* ⚠ `open: true`: formularul exista doar cat timp e deschis, vezi invelisul de mai sus. */
  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({ open: true, hasAwb, businessId, orderId: order.id });
  const [parcels, setParcels] = useState("1");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  /* ⚠ Rambursul se calculeaza la MONTARE, adica la deschidere, si dupa BANI, nu dupa
     metoda: o comanda cu plata online ramasa neplatita pleca altfel cu ramburs zero.
     Vezi `rambursDeIncasat`. */
  const [cod, setCod] = useState(
    () => rambursDeIncasat({ payment_status: order.payment_status, total: order.total, order_source: order.order_source }).toFixed(2),
  );
  const [content, setContent] = useState("");
  const [observation, setObservation] = useState("");

  const [recipientName, setRecipientName] = useState(order.customer_name);
  const [recipientPhone, setRecipientPhone] = useState(order.customer_phone);
  const [recipientEmail, setRecipientEmail] = useState(order.customer_email ?? "");
  const [recipientCounty, setRecipientCounty] = useState(
    laPunctFan ? (addr?.locker_county ?? addr?.county ?? "") : (addr?.county ?? ""),
  );
  const [recipientLocality, setRecipientLocality] = useState(
    laPunctFan ? (addr?.locker_city ?? addr?.city ?? "") : (addr?.city ?? ""),
  );
  const [recipientStreet, setRecipientStreet] = useState(stradaDestinatarului(addr));
  const [recipientStreetNo, setRecipientStreetNo] = useState(addr?.street_no ?? "");
  const [recipientZipCode, setRecipientZipCode] = useState(addr?.postal_code ?? "");

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const codNum = parseFloat(cod) || 0;
  /*
   * ⚠ DOAR PENTRU MESAJUL DE PE ECRAN. Serviciul adevarat il alege serverul, in
   * `serviciulPunctuluiFan`, din aceeasi pereche de reguli pe care le foloseste si
   * cotarea. Aici se scrie de mana fiindca fereastra e componenta de client si nu poate
   * importa biblioteca (ar trage `node:crypto` in pachetul din browser).
   */
  const autoService =
    punctFan === "fanbox" ? (codNum > 0 ? "FANbox Cont Colector" : "FANbox")
    : punctFan === "paypoint" ? (codNum > 0 ? "CollectPoint Cont Colector" : "CollectPoint")
    : (codNum > 0 ? "Cont Colector" : "Standard");

  /*
   * ⚠ AICI STATEAU DOUA OCOLIRI, si amandoua au disparut odata cu invelisul de sus:
   * efectul care resincroniza rambursul, si „amprenta destinatarului" care compara la
   * fiecare randare si rescria campurile. Existau amandoua din acelasi motiv: fereastra
   * era montata permanent, deci `useState` rula o singura data, la incarcarea paginii.
   *
   * Montata la deschidere, starea se deriva din comanda de ATUNCI, si nu mai are cine
   * s-o resincronizeze. Vezi nota lunga de la `FanCourierAwbModal`.
   */

  async function handleCreate() {
    if (!recipientName.trim()) return toast.error("Numele destinatarului este obligatoriu");
    if (!recipientPhone.trim()) return toast.error("Telefonul destinatarului este obligatoriu");
    if (!laPunctFan) {
      if (!recipientCounty.trim()) return toast.error("Judetul destinatarului este obligatoriu");
      if (!recipientLocality.trim()) return toast.error("Localitatea destinatarului este obligatorie");
      /* ⚠ Si strada. Serverul o cere de pe 09.09.2026, pana atunci o adresa goala
         pleca la FAN ca sirul „Strada", iar coletul se plimba si se intorcea. Aici
         omul o poate completa; codul ar putea doar sa o inventeze. */
      if (!recipientStreet.trim()) return toast.error("Adresa destinatarului (strada) este obligatorie");
    }
    const weightNum = parseFloat(weight) || 0;
    if (weightNum <= 0) return toast.error("Greutatea trebuie sa fie mai mare decat 0");
    if (codNum > FAN_MAX_COD) return toast.error("Rambursul maxim acceptat de FAN Courier este 10.000 lei");

    /*
     * ⚠ ORI TOATE TREI, ORI NICIUNA, si la livrarea la domiciliu, nu doar la FANbox.
     *
     * Cele trei campuri pleaca separat (`length ? parseFloat(...) : undefined`), iar
     * serverul cere toate trei deodata. Cu doua completate, a treia lipsa arunca TACUT
     * si pe celelalte doua si trimite coletul obisnuit din Setari: 30x20x10 declarat
     * pentru un colet de 120x80, si diferenta o refactureaza FAN pe factura lunara.
     * Aici se vede si se spune; pe server se si refuza.
     */
    const completate = [length, width, height].filter(v => v.trim() !== "");
    if (completate.length > 0 && completate.length < 3) {
      return toast.error("Completeaza toate trei dimensiunile (L x l x H), sau lasa-le goale");
    }

    if (punctFan === "fanbox") {
      if (!recipientEmail.trim()) return toast.error("Emailul destinatarului este obligatoriu pentru livrarea la FANbox");
      if (weightNum > FANBOX_MAX_WEIGHT_KG) return toast.error(`Greutatea maxima pentru FANbox este ${FANBOX_MAX_WEIGHT_KG} kg`);
      if ((parseInt(parcels) || 1) > 1) return toast.error("FANbox accepta un singur colet per AWB");
      const dims = [length, width, height].map(v => parseFloat(v.replace(",", ".")));
      if (!dims.every(d => d > 0)) {
        return toast.error("Dimensiunile coletului (L x l x H) sunt obligatorii pentru FANbox");
      }
      const sorted = [...dims].sort((a, b) => a - b);
      if (sorted.some((d, i) => d > FANBOX_COMPARTMENT_CM[i])) {
        return toast.error(`Coletul depaseste compartimentul FANbox (max ${FANBOX_COMPARTMENT_CM.join(" x ")} cm)`);
      }
    }
    /*
     * ⚠ PAYPOINT ARE ALTE LIMITE: 10 kg si 60x90x60 cm. Nu sunt ale FANbox-ului.
     *
     * ⚠ Dimensiunile NU se cer aici, spre deosebire de FANbox: documentatia le face
     * obligatorii doar acolo, fiindca ele aleg compartimentul dulapului. Lasate goale,
     * serverul cade pe coletul obisnuit al magazinului si-l verifica tot el. Deci se
     * masoara doar ce a completat omul.
     */
    if (punctFan === "paypoint") {
      if (weightNum > PAYPOINT_MAX_WEIGHT_KG) {
        return toast.error(`Greutatea maxima pentru livrarea la PayPoint este ${PAYPOINT_MAX_WEIGHT_KG} kg`);
      }
      const dims = [length, width, height].map(v => parseFloat(v.replace(",", ".")));
      if (dims.every(d => d > 0)) {
        const sorted = [...dims].sort((a, b) => a - b);
        if (sorted.some((d, i) => d > PAYPOINT_LATURI_CM[i])) {
          return toast.error(`Coletul depaseste limitele PayPoint (max ${PAYPOINT_LATURI_CM.join(" x ")} cm)`);
        }
      }
    }

    /*
     * ⚠ `try/finally`, nu doar doua apeluri in sir.
     *
     * O actiune de server nu esueaza doar prin `{ error }`: poate ARUNCA, retea
     * cazuta, desfasurare in curs, termen depasit. Atunci `setCreating(false)` de
     * mai jos nu se mai executa niciodata, iar butonul ramane invartindu-se pana
     * la reincarcarea paginii. Inchiderea modalului nu il deblocheaza, fiindca
     * modalul e montat permanent si isi pastreaza starea.
     */
    setCreating(true);
    try {
    const result = await createFanCourierAwbAction(businessId, order.id, {
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      recipientEmail: recipientEmail.trim(),
      recipientCounty: recipientCounty.trim(),
      recipientLocality: recipientLocality.trim(),
      recipientStreet: recipientStreet.trim(),
      recipientStreetNo: recipientStreetNo.trim(),
      recipientZipCode: recipientZipCode.trim(),
      /* ⚠ Un singur colet e regula FANbox, nu a punctelor in general: PayPoint si oficiul
         primesc mai multe, ca livrarea la domiciliu. */
      parcels: punctFan === "fanbox" ? 1 : (parseInt(parcels) || 1),
      weightKg: weightNum,
      /*
       * ⚠ `parseFloat`, ca la VALIDARE (mai sus, unde se verifica incadrarea in
       * compartimentul FANbox). Cu `parseInt` la trimitere, cele doua nu mai
       * priveau acelasi colet: 44,3 trecea validarea si pleca 44, iar un 0,5
       * trecea ca subunitar si pleca ZERO, la domiciliu chiar asa, fiindca
       * `?? 1` nu prinde zeroul.
       */
      length: length ? parseFloat(length.replace(",", ".")) : undefined,
      width: width ? parseFloat(width.replace(",", ".")) : undefined,
      height: height ? parseFloat(height.replace(",", ".")) : undefined,
      cod: codNum,
      content: content.trim() || order.order_number,
      observation: observation.trim(),
      pickupPointId: laPunctFan ? addr!.locker_id : undefined,
      /* ⚠ Amandoua, sau niciunul: serverul refuza un id fara retea, fiindca reteaua
         decide serviciul, optiunea si limitele, si nu se poate ghici din id. */
      pickupPointType: punctFan ?? undefined,
    });

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(`AWB FAN Courier ${result.awbNumber} creat (${autoService})`);
      onSuccess();
    }
    } catch (e) {
      toast.error(`Nu am putut trimite cererea catre server: ${(e as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await deleteFanCourierAwbAction(businessId, order.id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("AWB FAN Courier sters");
        onSuccess();
      }
    } catch (e) {
      toast.error(`Nu am putut trimite cererea catre server: ${(e as Error).message}`);
    } finally {
      setDeleting(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const url = `/api/fancourier/awb?orderId=${order.id}&businessId=${businessId}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? "Eroare la descarcarea PDF");
        return;
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `awb-fancourier-${orderData.fan_courier_awb_number}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      toast.error("Eroare la descarcarea AWB");
    } finally {
      setDownloading(false);
    }
  }

  /* ⚠ `true`: formularul exista doar cat timp e deschis, deci dialogul e mereu deschis
     cat timp componenta asta traieste. Vezi invelisul de la `FanCourierAwbModal`. */
  const cutiaDialogului = useDialogAccesibil(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={cutiaDialogului}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titlu-awb-fan"
        /* ⚠ `tabIndex={-1}` ca sa poata primi focusul la deschidere fara sa intre in
           ordinea de Tab; `focus:outline-none` ca sa nu apara un inel in jurul intregii
           cutii. Vezi `useDialogAccesibil`. */
        tabIndex={-1}
        className="relative bg-background rounded-2xl border border-border shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto focus:outline-none">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2.5">
            <img src="/integrations/fan-courier.svg" alt="FAN Courier" className="h-5 w-auto" />
            <div>
              <p id="titlu-awb-fan" className="text-sm font-semibold text-foreground">AWB FAN Courier</p>
              <p className="text-xs text-muted-foreground">Comanda {order.order_number}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {hasAwb ? (
            /* ── AWB existent ── */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-info/5 border border-info/20">
                <p className="text-xs font-semibold text-info mb-1">AWB generat</p>
                <p className="text-lg font-mono font-bold text-foreground">{orderData.fan_courier_awb_number}</p>
              </div>

              <Button variant="outline" size="lg" onClick={handleDownload} disabled={downloading} className="w-full">
                {downloading ? <Loader2 className="animate-spin" /> : <Download />}
                {downloading ? "Se descarca..." : "Descarca eticheta PDF"}
              </Button>

              <a
                href={`https://www.fancourier.ro/awb-tracking/?tracking=${encodeURIComponent(orderData.fan_courier_awb_number ?? "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium border border-border rounded-lg text-foreground hover:bg-muted transition-colors"
              >
                <MapPin className="h-4 w-4" />
                Urmareste expedierea
              </a>

              <div className="pt-2 border-t border-border">
                <Button variant="destructive" size="lg" onClick={handleDelete} disabled={deleting} className="w-full">
                  {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {deleting ? "Se sterge..." : "Sterge AWB"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  AWB-ul poate fi sters doar daca nu a fost preluat de curier
                </p>
              </div>
            </div>
          ) : (
            /* ── Creare AWB ── */
            <div className="space-y-5">
              {/* Destinatar */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Destinatar</p>
                <div className="space-y-3">
                  {laPunctFan && (
                    <div className="p-3 rounded-xl bg-info/5 border border-info/20">
                      <p className="text-xs font-semibold text-info mb-0.5">
                        {punctFan === "paypoint" ? "Livrare la PayPoint"
                          : punctFan === "office" ? "Ridicare din oficiu FAN Courier"
                          : "Livrare la FANbox"}
                      </p>
                      <p className="text-sm font-medium text-foreground">{addr?.locker_name}</p>
                      {(addr?.locker_address || addr?.locker_city) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[addr?.locker_address, addr?.locker_city, addr?.locker_county].filter(Boolean).join(", ")}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Judetul si localitatea AWB-ului se preiau automat de la locker, conform cerintelor FAN Courier.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Nume *</label>
                      <input
                        type="text"
                        value={recipientName}
                        onChange={e => setRecipientName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Telefon *</label>
                      <input
                        type="tel"
                        value={recipientPhone}
                        onChange={e => setRecipientPhone(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{punctFan === "fanbox" ? "Email *" : "Email"}</label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={e => setRecipientEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                    {punctFan === "fanbox" && (
                      <p className="text-[11px] text-muted-foreground mt-1">FAN Courier trimite codul de ridicare pe email.</p>
                    )}
                  </div>
                  {!laPunctFan && (<>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Judet *</label>
                      <input
                        type="text"
                        value={recipientCounty}
                        onChange={e => setRecipientCounty(e.target.value)}
                        placeholder="ex: Cluj"
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Localitate *</label>
                      <input
                        type="text"
                        value={recipientLocality}
                        onChange={e => setRecipientLocality(e.target.value)}
                        placeholder="ex: Cluj-Napoca"
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Strada</label>
                      <input
                        type="text"
                        value={recipientStreet}
                        onChange={e => setRecipientStreet(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Nr.</label>
                      <input
                        type="text"
                        value={recipientStreetNo}
                        onChange={e => setRecipientStreetNo(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Cod postal</label>
                    <input
                      type="text"
                      value={recipientZipCode}
                      onChange={e => setRecipientZipCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                  </>)}
                </div>
              </div>

              {/* Colet */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Detalii colet</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Greutate (kg) *</label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                      {notaGreutate(dinCatalog, liniiFaraGreutate) && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{notaGreutate(dinCatalog, liniiFaraGreutate)}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Nr. colete</label>
                      <input
                        type="number"
                        min="1"
                        max={punctFan === "fanbox" ? 1 : undefined}
                        value={punctFan === "fanbox" ? "1" : parcels}
                        onChange={e => setParcels(e.target.value)}
                        disabled={punctFan === "fanbox"}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors disabled:opacity-60"
                      />
                      {punctFan === "fanbox" && (
                        <p className="text-[11px] text-muted-foreground mt-1">FANbox: un singur colet, max {FANBOX_MAX_WEIGHT_KG} kg</p>
                      )}
                      {/* ⚠ PayPoint primeste mai multe colete, dar are limita de greutate a lui. */}
                      {punctFan === "paypoint" && (
                        <p className="text-[11px] text-muted-foreground mt-1">PayPoint: max {PAYPOINT_MAX_WEIGHT_KG} kg</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      {punctFan === "fanbox"
                        ? "Dimensiuni cm (obligatoriu la FANbox: determina compartimentul)"
                        : punctFan === "paypoint"
                          ? `Dimensiuni cm (la PayPoint, cel mult ${PAYPOINT_LATURI_CM.join(" x ")})`
                          : "Dimensiuni cm (toate trei, sau niciuna si pleaca coletul obisnuit din Setari)"}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "L", value: length, set: setLength },
                        { label: "l", value: width, set: setWidth },
                        { label: "H", value: height, set: setHeight },
                      ].map(({ label, value, set }) => (
                        <div key={label}>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">{label} (cm)</label>
                          <input
                            type="number"
                            min="1"
                            value={value}
                            onChange={e => set(e.target.value)}
                            placeholder="0"
                            className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 bg-primary/5 border border-primary/20 text-primary">
                    <Package className="h-3.5 w-3.5 flex-shrink-0" />
                    Serviciu auto-selectat: <span className="font-bold">{autoService}</span>
                    {codNum > 0 && <span className="text-primary/60">(ramburs {codNum.toFixed(2)} lei)</span>}
                  </div>
                </div>
              </div>

              {/* Optiuni */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Optiuni</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Ramburs (lei)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cod}
                      onChange={e => setCod(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Continut colet</label>
                    <input
                      type="text"
                      value={content}
                      onChange={e => setContent(e.target.value)}
                      placeholder={`Comanda ${order.order_number}`}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Observatii</label>
                    <textarea
                      value={observation}
                      onChange={e => setObservation(e.target.value)}
                      rows={2}
                      placeholder="Observatii pentru curier..."
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors resize-none"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleCreate} disabled={creating} size="lg" className="w-full">
                {creating ? <Loader2 className="animate-spin" /> : <Package />}
                {creating ? "Se genereaza AWB..." : "Genereaza AWB FAN Courier"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
