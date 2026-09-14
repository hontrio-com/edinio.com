"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, FileDown, Loader2, MapPin, Package, PackageOpen, Search, Truck, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import {
  acceptaOfertaTransportAction, cereOfertaTransportAction, coteazaSmartshipAction,
  createSmartshipAwbAction, getOfertaTransportAction, getSmartshipLabelAction,
  getSmartshipPickupSlotsAction, getSmartshipSoldAction, getSmartshipTraceAction,
  programeazaSmartshipPickupAction, refuzaOfertaTransportAction, verificaSmartshipAwbAction,
  type StareAfisata,
} from "@/lib/actions/smartship.actions";
import { useGreutateaAwb, notaGreutate } from "@/components/dashboard/useGreutateaAwb";
import { useDialogAccesibil } from "@/components/dashboard/useDialogAccesibil";
import { cheiaOfertei, etichetaOferta, termenLivrare, textRamburs, type OfertaAratata } from "@/lib/smartship/preturi";
import { Button } from "@/components/ui/button";
import type { OfertaTransport } from "@/lib/smartship/client";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

type ShippingAddress = {
  city?: string; county?: string; address?: string; street?: string; street_no?: string;
  postal_code?: string; courier?: string; delivery_type?: string;
  locker_id?: string; locker_name?: string; locker_city?: string;
  smartship_courier_id?: number; smartship_own_contract?: boolean;
  smartship_locker_net?: "easybox" | "fanbox";
};

/**
 * Emiterea unei expedieri SmartShip.
 *
 * ═══ DOI PASI, CA LA CEILALTI BROKERI ═══
 *
 * Intai „Calculeaza preturi" (`POST /cost` — o citire pura, nu creeaza nimic),
 * apoi alegerea ofertei. Ca la Woot, Colete, eColet si Innoship.
 *
 * ⚠ Dar cu o deosebire care conteaza: SmartShip NU are endpoint de validare si NU
 * are mediu de proba. Emiterea e primul apel care atinge realitatea, iar el
 * costa. De aia verificarile locale sunt mai stufoase decat la ceilalti si de aia
 * ecranul spune raspicat ce se intampla la apasare.
 *
 * ⚠ Oferta aleasa de CLIENT in checkout se preselecteaza, si se spune pe fata:
 * comerciantul poate schimba, dar trebuie sa vada ce a platit omul.
 *
 * ⚠ La livrarea in locker, `/cost` intoarce DOAR varianta la locker si trece
 * peste curierul cerut — asa e documentat. Deci o singura linie acolo nu e un
 * defect.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
};

export function SmartshipAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

type ComandaSmartship = {
  smartship_awb_number?: string | null;
  smartship_courier_id?: number | null;
  smartship_courier_name?: string | null;
  smartship_tracking_url?: string | null;
  smartship_own_contract?: boolean | null;
  smartship_cost?: number | null;
  smartship_pickup_code?: string | null;
  smartship_offer_ref?: string | null;
  smartship_offer_status?: string | null;
};

/** FedEx e singurul curier la care ridicarea se programeaza separat. */
const CURIER_FEDEX = 19;

/**
 * De la ce greutate propunem singuri o oferta de transport.
 *
 * Pragul REAL e al lor si NU e publicat: sub el, `/transport-offer` raspunde 422
 * cu `min_weight`. Cifra de aici e doar momentul in care ARATAM butonul - aleasa
 * peste plafonul celui mai mare curier de colete din tabelul lor (PTT Express,
 * 800 kg pe expediere, 31 kg pe colet), ca sa nu trimitem pe un drum mai scump pe
 * cineva care are inca varianta obisnuita. Sub prag butonul nu dispare, ramane un
 * rand de text: comerciantul care stie ca marfa lui e voluminoasa il deschide.
 */
const PRAG_MARFA_GREA_KG = 200;

/** Tipurile de camion, transcrise din `content.truck_type`. Valorile sunt ALE LOR. */
const TIPURI_CAMION: { valoare: string; eticheta: string }[] = [
  { valoare: "box", eticheta: "Camion box" },
  { valoare: "prelata", eticheta: "Prelata" },
  { valoare: "platforma", eticheta: "Platforma" },
  { valoare: "basculanta", eticheta: "Basculanta" },
  { valoare: "cisterna", eticheta: "Cisterna" },
  { valoare: "container", eticheta: "Container" },
  { valoare: "agabaritic", eticheta: "Agabaritic" },
  { valoare: "autotransportator", eticheta: "Autotransportator" },
  { valoare: "cap_tractor", eticheta: "Cap tractor" },
];

function Formular({ onClose, order, businessId, onSuccess }: Props) {
  const comanda = order as typeof order & ComandaSmartship;
  const addr = (order.shipping_address ?? {}) as ShippingAddress;
  const awb = comanda.smartship_awb_number ?? null;

  const laLocker = (addr.courier ?? "").toLowerCase().trim() === "smartship"
    && addr.delivery_type === "locker"
    && !!addr.locker_id;

  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: !!awb, businessId, orderId: order.id,
  });
  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);

  const [continut, setContinut] = useState("Produse");
  const [colete, setColete] = useState("1");
  const [oferte, setOferte] = useState<OfertaAratata[] | null>(null);
  const [aleasa, setAleasa] = useState<OfertaAratata | null>(null);
  const [greutateFacturata, setGreutateFacturata] = useState<number | null>(null);
  const [cotand, setCotand] = useState(false);
  const [emitand, setEmitand] = useState(false);
  const [verificand, setVerificand] = useState(false);
  const [descarcand, setDescarcand] = useState(false);
  const [incarcStari, setIncarcStari] = useState(false);
  const [stari, setStari] = useState<{ status: string; lista: StareAfisata[] } | null>(null);

  const [slots, setSlots] = useState<{ zi: string; deLa: string[]; panaLa: string[] }[] | null>(null);
  const [ziRidicare, setZiRidicare] = useState("");
  const [deLa, setDeLa] = useState("");
  const [panaLa, setPanaLa] = useState("");
  const [ridicand, setRidicand] = useState(false);

  const [credit, setCredit] = useState<number | null>(null);
  const [oferta, setOferta] = useState<OfertaTransport | null>(null);
  const [lucrezOferta, setLucrezOferta] = useState(false);
  const [arataOferta, setArataOferta] = useState(false);
  const [tipCamion, setTipCamion] = useState("");
  const [grupaj, setGrupaj] = useState(true);
  const [adr, setAdr] = useState(false);
  const [temperatura, setTemperatura] = useState(false);
  const [buget, setBuget] = useState("");
  const [mesajOferta, setMesajOferta] = useState("");

  const ramburs = rambursDeIncasat(order);

  /*
   * ═══ ⚠ FANBOX NU SE POATE COTA, SI NU E O SCAPARE ═══
   *
   * Documentatia leaga `content.locker_id` de easybox („Pentru livrare la SameDay
   * easybox (curier 12)") si spune ca un `locker_id` nevalid cade cu 612, fara
   * cadere pe livrarea la adresa. FANbox apare in schimb DOAR la emitere
   * (`courier_id: 3` + `use_own_contract: 1` + `locker_id` din `/geolocation/fanbox`).
   *
   * Deci o cotare cu un locker FANbox e un teritoriu nedocumentat, care poate
   * raspunde 612 — si atunci comerciantul ar ramane cu o comanda pe care n-o
   * poate expedia din panou. Aici curierul e IMPUS din alegerea clientului, iar
   * butonul de emitere nu mai asteapta o oferta.
   */
  const curierImpus = laLocker && addr.smartship_locker_net === "fanbox"
    ? { courierId: 3, contractPropriu: true, nume: "FAN Courier FANbox" }
    : null;

  function destinatar() {
    return {
      nume: order.customer_name,
      strada: addr.street || addr.address || "",
      numar: addr.street_no || null,
      /*
       * ⚠ La SmartShip adresa RAMANE a clientului chiar si la locker: ei ruteaza
       * dupa `locker_id`, iar adresa e datele de contact. Pe dos fata de Sameday
       * si Innoship, unde adresa se inlocuieste cu a punctului.
       */
      oras: addr.city || "",
      judet: addr.county || null,
      codPostal: addr.postal_code || null,
      telefon: order.customer_phone,
      email: order.customer_email,
    };
  }

  function dateComune() {
    return {
      destinatar: destinatar(),
      greutateKg: Number(weight) || 0,
      continut: continut.trim() || "Produse",
      numarColete: Math.max(1, Math.floor(Number(colete) || 1)),
      ramburs,
      valoareDeclarata: Number(order.total) || 0,
      felLivrare: (laLocker ? "locker" : "domiciliu") as "locker" | "domiciliu",
      lockerId: laLocker ? addr.locker_id : null,
    };
  }

  async function handleCoteaza() {
    /* ⚠ `finally`, si in `try` DOAR apelul; ramificarea ramane afara. Vezi
       `steagul-se-stinge-in-finally`. */
    setCotand(true);
    let r: Awaited<ReturnType<typeof coteazaSmartshipAction>>;
    try {
      r = await coteazaSmartshipAction(businessId, order.id, dateComune());
    } catch (e) {
      /* ⚠ O CITIRE: nimic nu s-a schimbat la SmartShip. */
      toast.error(
        "SmartShip nu a raspuns: " + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"),
        { duration: 12000 },
      );
      return;
    } finally {
      setCotand(false);
    }
    if (!r.ok) return toast.error(r.error, { duration: 12000 });

    setOferte(r.oferte);
    setGreutateFacturata(r.greutateFacturata);
    if (r.oferte.length === 0) return toast.warning("SmartShip n-a intors nicio oferta pentru comanda asta.");

    /* Preselectam ce a ales clientul; daca nu mai e in lista, prima (cea mai ieftina). */
    const alesaDeClient = r.oferte.find(
      (o) => o.courierId === addr.smartship_courier_id && o.contractPropriu === !!addr.smartship_own_contract,
    );
    setAleasa(alesaDeClient ?? r.oferte[0]);
    toast.success(`${r.oferte.length} ${r.oferte.length === 1 ? "oferta" : "oferte"}`);
  }

  async function handleEmite() {
    const ales = aleasa
      ? { courierId: aleasa.courierId, contractPropriu: aleasa.contractPropriu, nume: aleasa.numeCurier }
      : curierImpus;
    if (!ales) return toast.error("Alege o oferta");
    /* ⚠ Incarcatura intr-un `const`, ca `try` sa cuprinda DOAR apelul. */
    const dateSmartship = {
      ...dateComune(),
      courierId: ales.courierId,
      contractPropriu: ales.contractPropriu,
      courierName: ales.nume,
    };

    setEmitand(true);
    let r: Awaited<ReturnType<typeof createSmartshipAwbAction>>;
    try {
      r = await createSmartshipAwbAction(businessId, order.id, dateSmartship);
    } catch (e) {
      /* ⚠ Emiterea SCHIMBA la SmartShip, deci NU se spune „a esuat": AWB-ul poate sa fi plecat,
         iar a doua apasare ar face al doilea, taxabil. Butonul de verificare de mai jos citeste,
         deci el se apasa intai. */
      toast.error(
        "SmartShip nu a raspuns, si nu stim daca AWB-ul s-a creat. NU emite din nou: apasa "
        + "verificarea, care doar citeste. "
        + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"),
        { duration: 18000 },
      );
      return;
    } finally {
      setEmitand(false);
    }
    if ("error" in r) return toast.error(r.error, { duration: 14000 });
    for (const av of r.avertismente) toast.warning(av, { duration: 12000 });
    toast.success(`AWB emis: ${r.awb}`);
    onSuccess();
  }

  async function handleVerifica() {
    setVerificand(true);
    let r: Awaited<ReturnType<typeof verificaSmartshipAwbAction>>;
    try {
      r = await verificaSmartshipAwbAction(businessId, order.id);
    } catch (e) {
      /* ⚠ Butonul asta e iesirea din „am trimis si n-am primit raspuns", deci n-are voie sa
         ramana blocat. E o citire, si mesajul o spune. */
      toast.error(
        "SmartShip nu a raspuns la verificare. Incearca din nou peste putin, e doar o citire: "
        + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"),
        { duration: 14000 },
      );
      return;
    } finally {
      setVerificand(false);
    }
    if (!r.ok) return toast.error(r.error, { duration: 14000 });
    toast[r.gasit ? "success" : "info"](r.mesaj, { duration: 14000 });
    if (r.gasit) onSuccess();
  }

  async function handleStari() {
    setIncarcStari(true);
    let r: Awaited<ReturnType<typeof getSmartshipTraceAction>>;
    try {
      r = await getSmartshipTraceAction(businessId, order.id);
    } catch (e) {
      /* ⚠ Tot o CITIRE. */
      toast.error("SmartShip nu a raspuns: "
        + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"));
      return;
    } finally {
      setIncarcStari(false);
    }
    if (!r.ok) return toast.error(r.error);
    setStari({ status: r.descriere, lista: r.stari });
  }

  /**
   * Eticheta.
   *
   * ⚠ PDF-ul vine ca base64 prin serverul nostru, si nu din lene: raspunsul de
   * emitere are un `pdf_link` gata facut, dar acela poarta CHEIA DE API in cale.
   * Pus intr-un `href`, ar publica credentiala magazinului catre oricine se uita
   * la pagina.
   */
  async function handleEticheta() {
    setDescarcand(true);
    let r: Awaited<ReturnType<typeof getSmartshipLabelAction>>;
    try {
      r = await getSmartshipLabelAction(businessId, order.id);
    } catch (e) {
      /* ⚠ O CITIRE: eticheta se cere prin serverul nostru, dinadins (vezi nota de deasupra). */
      toast.error(
        "Eticheta nu s-a putut citi de la SmartShip: "
        + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"),
        { duration: 12000 },
      );
      return;
    } finally {
      setDescarcand(false);
    }
    if (!r.ok) return toast.error(r.error, { duration: 12000 });

    const octeti = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([octeti], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `AWB-${awb}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Creditul disponibil.
   *
   * ⚠ Nu e o paza (se poate consuma intre citire si emitere), dar transforma
   * codul 605 dintr-un blocaj in registru intr-un numar pe care omul il vede
   * INAINTE sa apese.
   */
  async function handleCredit() {
    const r = await getSmartshipSoldAction(businessId);
    if (!r.ok) return toast.error(r.error);
    setCredit(r.sold.available_for_shipping);
  }

  async function handleCereOferta() {
    if (!confirm(
      "Trimiti o solicitare de oferta pentru marfa grea?\n\n"
      + "Raspunsul vine de la echipa SmartShip, nu automat — poate dura ore sau zile. "
      + "Comanda ramane fara AWB pana accepti oferta.",
    )) return;
    /* ⚠ Incarcatura intr-un `const`, ca `try` sa cuprinda DOAR apelul. */
    const dateOferta = {
      ...dateComune(),
      truckType: tipCamion || null,
      grupaj,
      adr,
      temperaturaControlata: temperatura,
      buget: Number(buget) || null,
      mesaj: mesajOferta.trim() || null,
    };

    setLucrezOferta(true);
    let r: Awaited<ReturnType<typeof cereOfertaTransportAction>>;
    try {
      r = await cereOfertaTransportAction(businessId, order.id, dateOferta);
    } catch (e) {
      /* ⚠ ALTA NESIGURANTA DECAT LA EMITERE. Aici nu se naste niciun AWB: solicitarea pleaca
         spre oameni si raspunsul poate dura ore sau zile (vezi confirmarea de mai sus). Deci
         intrebarea nu e „s-a emis?", ci „a intrat solicitarea?", si o a doua cerere trimisa
         degeaba inseamna doua solicitari pentru aceeasi marfa. */
      toast.error(
        "SmartShip nu a raspuns, si nu stim daca solicitarea a intrat. Verifica in contul "
        + "SmartShip inainte sa ceri din nou, ca sa nu ajunga doua cereri pentru aceeasi marfa. "
        + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"),
        { duration: 18000 },
      );
      return;
    } finally {
      setLucrezOferta(false);
    }
    if (!r.ok) return toast.error(r.error, { duration: 14000 });
    toast.success(`Solicitare inregistrata: ${r.ref}`);
    onSuccess();
  }

  async function handleVerificaOferta() {
    setLucrezOferta(true);
    let r: Awaited<ReturnType<typeof getOfertaTransportAction>>;
    try {
      r = await getOfertaTransportAction(businessId, order.id);
    } catch (e) {
      /* ⚠ O CITIRE: se intreaba daca a venit oferta, nu se schimba nimic. */
      toast.error(
        "SmartShip nu a raspuns: " + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"),
        { duration: 12000 },
      );
      return;
    } finally {
      setLucrezOferta(false);
    }
    if (!r.ok) return toast.error(r.error, { duration: 12000 });
    setOferta(r.oferta);
    if (!r.oferta.offer) toast.info(`Inca nu exista oferta (${r.oferta.request_status ?? "in lucru"}).`);
  }

  async function handleAcceptaOferta() {
    if (!confirm(
      "Accepti oferta?\n\nSe emite pe loc un AWB REAL si pretul ofertei "
      + "se scade din creditul contului.",
    )) return;
    setLucrezOferta(true);
    let r: Awaited<ReturnType<typeof acceptaOfertaTransportAction>>;
    try {
      r = await acceptaOfertaTransportAction(businessId, order.id);
    } catch (e) {
      /* ⚠⚠ NU E O SIMPLA ACCEPTARE. Confirmarea de mai sus o spune: se emite pe loc un AWB REAL
         si pretul ofertei se scade din creditul contului. Deci nesiguranta de aici costa bani,
         si o a doua apasare ar putea emite al doilea AWB pe aceeasi marfa. */
      toast.error(
        "SmartShip nu a raspuns, si nu stim daca oferta a fost acceptata. NU accepta din nou: "
        + "acceptarea emite un AWB real si scade din creditul contului. Verifica in contul "
        + "SmartShip. "
        + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"),
        { duration: 25000 },
      );
      return;
    } finally {
      setLucrezOferta(false);
    }
    if (!r.ok) return toast.error(r.error, { duration: 14000 });
    toast.success(`Oferta acceptata. AWB: ${r.awb}`);
    onSuccess();
  }

  async function handleRefuzaOferta() {
    const motiv = prompt("Motivul refuzului (optional):") ?? undefined;
    setLucrezOferta(true);
    let r: Awaited<ReturnType<typeof refuzaOfertaTransportAction>>;
    try {
      r = await refuzaOfertaTransportAction(businessId, order.id, motiv);
    } catch (e) {
      /* ⚠ Refuzul SCHIMBA la SmartShip: poate sa fi ajuns, si atunci oferta chiar e refuzata
         desi ecranul inca o arata. */
      toast.error(
        "SmartShip nu a raspuns. Verifica in contul SmartShip daca refuzul a ajuns: "
        + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"),
        { duration: 14000 },
      );
      return;
    } finally {
      setLucrezOferta(false);
    }
    if (!r.ok) return toast.error(r.error);
    toast.success("Oferta a fost refuzata.");
    onSuccess();
  }

  async function handleSlots() {
    const r = await getSmartshipPickupSlotsAction(businessId, order.id);
    if (!r.ok) return toast.error(r.error, { duration: 12000 });
    const lista = r.optiuni
      .filter((o) => o.available !== false && o.pickup_date)
      .map((o) => ({
        zi: String(o.pickup_date),
        deLa: (o.ready_time_options ?? []).map((t) => t.slice(0, 5)),
        panaLa: (o.latest_time_options ?? []).map((t) => t.slice(0, 5)),
      }));
    setSlots(lista);
    if (lista.length === 0) return toast.info("FedEx n-are niciun interval disponibil acum.");
    setZiRidicare(lista[0].zi);
    setDeLa(lista[0].deLa[0] ?? "");
    setPanaLa(lista[0].panaLa[lista[0].panaLa.length - 1] ?? "");
  }

  async function handleRidicare() {
    if (!ziRidicare || !deLa || !panaLa) return toast.error("Alege ziua si intervalul");
    setRidicand(true);
    let r: Awaited<ReturnType<typeof programeazaSmartshipPickupAction>>;
    try {
      r = await programeazaSmartshipPickupAction(businessId, order.id, {
        pickup_date: ziRidicare, ready_time: deLa, latest_time: panaLa,
      });
    } catch (e) {
      /* ⚠ Programarea SCHIMBA la SmartShip: poate sa fi ajuns, si atunci soferul chiar vine. */
      toast.error(
        "SmartShip nu a raspuns. Verifica in contul SmartShip daca ridicarea s-a programat, "
        + "inainte sa programezi din nou: "
        + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"),
        { duration: 14000 },
      );
      return;
    } finally {
      setRidicand(false);
    }
    if (!r.ok) return toast.error(r.error, { duration: 12000 });
    toast.success(r.mesaj);
    onSuccess();
  }

  const ziAleasa = slots?.find((s) => s.zi === ziRidicare);

  /* ⚠ Vezi `useDialogAccesibil`: Escape inchide, focusul ramane inauntru si se intoarce de
     unde a plecat. `true`, nu un prop: fereastra e montata doar cat timp e deschisa. */
  const cutiaDialogului = useDialogAccesibil(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={cutiaDialogului}
        role="dialog"
        aria-modal="true"
        aria-label="Generare AWB SmartShip"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-5 shadow-xl focus:outline-none">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Truck className="h-4 w-4" />SmartShip
            </h3>
            <p className="text-xs text-muted-foreground">Comanda {order.order_number} · {order.customer_name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {awb ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-success/20 bg-success/5 p-3">
              <p className="text-xs text-muted-foreground">Numar AWB</p>
              <p className="font-mono text-sm font-semibold text-foreground">{awb}</p>
              {comanda.smartship_courier_name && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {comanda.smartship_courier_name}
                  {comanda.smartship_own_contract ? " · contractul tau" : ""}
                  {comanda.smartship_cost ? ` · ${Number(comanda.smartship_cost).toFixed(2)} lei` : ""}
                </p>
              )}
              {comanda.smartship_tracking_url && (
                <a href={comanda.smartship_tracking_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary underline">
                  Pagina de urmarire
                </a>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleEticheta} disabled={descarcand} className="flex-1">
                {descarcand ? <Loader2 className="animate-spin" /> : <FileDown />}
                {descarcand ? "Se descarca..." : "Eticheta PDF"}
              </Button>
              <Button variant="outline" onClick={handleStari} disabled={incarcStari} className="flex-1">
                {incarcStari ? <Loader2 className="animate-spin" /> : <Package />}
                {incarcStari ? "Se cere..." : "Unde e coletul"}
              </Button>
            </div>

            {stari && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-foreground">{stari.status}</p>
                {stari.lista.length > 0 ? (
                  <ul className="space-y-1.5">
                    {stari.lista.map((s, i) => (
                      <li key={`s-${i}`} className="text-xs">
                        <span className="text-foreground">{s.descriere}</span>
                        {s.localitate ? <span className="text-muted-foreground"> · {s.localitate}</span> : null}
                        {s.data ? <span className="text-muted-foreground"> · {s.data}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Nu exista inca evenimente de urmarire.</p>
                )}
              </div>
            )}

            {/*
              * ⚠ Ridicarea se programeaza SEPARAT doar la FedEx. La ceilalti,
              * SmartShip o comanda automat la emitere — de aia exista comutatorul
              * „nu comanda automat ridicarea" in configurare, nu invers.
              */}
            {/*
              * ⚠ Curierul se citeste de pe COMANDA, nu din `shipping_address`:
              * dupa emitere, cel real e cel cu care s-a emis (comerciantul poate
              * fi ales altul decat clientul), iar `addr` pastreaza doar alegerea
              * din checkout. Numele e a doua sursa, pentru comenzile emise
              * inainte ca `smartship_courier_id` sa fie scris.
              */}
            {comanda.smartship_courier_id === CURIER_FEDEX
              || comanda.smartship_courier_name?.toLowerCase().includes("fedex") ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />Ridicare FedEx
                  </p>
                  {comanda.smartship_pickup_code ? (
                    <span className="text-xs text-muted-foreground">Programata · cod {comanda.smartship_pickup_code}</span>
                  ) : (
                    <Button variant="outline" size="sm" onClick={handleSlots}>Vezi intervalele</Button>
                  )}
                </div>

                {!comanda.smartship_pickup_code && slots && slots.length > 0 && (
                  <div className="space-y-2">
                    <select
                      value={ziRidicare}
                      onChange={(e) => {
                        setZiRidicare(e.target.value);
                        const z = slots.find((s) => s.zi === e.target.value);
                        setDeLa(z?.deLa[0] ?? "");
                        setPanaLa(z?.panaLa[z.panaLa.length - 1] ?? "");
                      }}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    >
                      {slots.map((s) => <option key={s.zi} value={s.zi}>{s.zi}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <select value={deLa} onChange={(e) => setDeLa(e.target.value)}
                        className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm">
                        {(ziAleasa?.deLa ?? []).map((t) => <option key={t} value={t}>de la {t}</option>)}
                      </select>
                      <select value={panaLa} onChange={(e) => setPanaLa(e.target.value)}
                        className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm">
                        {(ziAleasa?.panaLa ?? []).map((t) => <option key={t} value={t}>pana la {t}</option>)}
                      </select>
                    </div>
                    <Button onClick={handleRidicare} disabled={ridicand} className="w-full">
                      {ridicand ? <Loader2 className="animate-spin" /> : null}
                      Programeaza ridicarea
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      SmartShip accepta o singura programare pe AWB.
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {laLocker && (
              <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info/5 p-3 text-xs">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                <div>
                  <p className="font-semibold text-foreground">
                    Ridicare din locker{addr.smartship_locker_net === "fanbox" ? " FANbox" : " Easybox"}
                  </p>
                  <p className="text-muted-foreground">{addr.locker_name || addr.locker_id}{addr.locker_city ? ` · ${addr.locker_city}` : ""}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Greutate (kg)</label>
                <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
              </div>
              <div className="w-24">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Colete</label>
                <input value={colete} onChange={(e) => setColete(e.target.value)} inputMode="numeric"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
              </div>
            </div>
            {nota && <p className="text-xs text-warning">{nota}</p>}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Continut</label>
              <input value={continut} onChange={(e) => setContinut(e.target.value)} maxLength={255}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
            </div>

            {curierImpus ? (
              <p className="rounded-lg border border-info/20 bg-info/5 p-3 text-xs text-foreground">
                Clientul a ales un locker <strong>FANbox</strong>, care se emite pe contractul tau
                de FAN Courier. SmartShip nu coteaza lockerele FANbox inainte de emitere, deci
                pretul se vede abia pe AWB.
              </p>
            ) : null}

            <Button variant="outline" onClick={handleCoteaza} disabled={cotand} className="w-full">
              {cotand ? <Loader2 className="animate-spin" /> : <Search />}
              {cotand ? "Se calculeaza..." : "Calculeaza preturi"}
            </Button>

            {/*
              * ⚠ Greutatea FACTURATA e maximul dintre cea reala si cea volumetrica
              * (L×l×h / 6000). Cand difera, comerciantul trebuie s-o vada aici, nu
              * pe factura de peste o luna.
              */}
            {greutateFacturata !== null && greutateFacturata > (Number(weight) || 0) && (
              <p className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs text-foreground">
                SmartShip factureaza <strong>{greutateFacturata} kg</strong> (greutate volumetrica),
                nu {weight} kg. Dimensiunile implicite se schimba in configurarea SmartShip.
              </p>
            )}

            {oferte && oferte.length > 0 && (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {oferte.map((o) => {
                  const selectata = aleasa
                    && aleasa.courierId === o.courierId
                    && aleasa.contractPropriu === o.contractPropriu;
                  const alesaDeClient = o.courierId === addr.smartship_courier_id
                    && o.contractPropriu === !!addr.smartship_own_contract;
                  const rambursText = textRamburs(o);
                  return (
                    <button key={cheiaOfertei(o)} type="button" onClick={() => setAleasa(o)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${selectata ? "border-primary bg-primary/5" : "border-border"}`}>
                      <span className="flex-1">
                        {etichetaOferta(o)}
                        {alesaDeClient && <span className="ml-1 text-primary">· ales de client</span>}
                        {termenLivrare(o) && <span className="block text-muted-foreground">{termenLivrare(o)}</span>}
                        {ramburs > 0 && rambursText && <span className="block text-muted-foreground">{rambursText}</span>}
                      </span>
                      <span className="font-semibold">{o.pret.toFixed(2)} lei</span>
                    </button>
                  );
                })}
              </div>
            )}

            {ramburs > 0 && (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground">
                Ramburs de incasat: <strong>{ramburs.toFixed(2)} lei</strong>
              </p>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="text-muted-foreground">
                SmartShip <strong>nu are mediu de test</strong>: expedierea e reala si se scade din
                creditul contului. Emiterea e aparata impotriva dublei apasari; daca ceva pica
                nesigur, apasa „Verifica la SmartShip”.
              </p>
            </div>

            <div className="flex items-center justify-between text-xs">
              {credit === null ? (
                <button type="button" onClick={handleCredit} className="text-primary underline">
                  Vezi creditul disponibil
                </button>
              ) : (
                <span className="text-muted-foreground">
                  Credit disponibil: <strong className="text-foreground">{credit} lei</strong>
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleVerifica} disabled={verificand} className="flex-1">
                {verificand ? <Loader2 className="animate-spin" /> : null}
                Verifica la SmartShip
              </Button>
              <Button onClick={handleEmite} disabled={emitand || (!aleasa && !curierImpus)} className="flex-1">
                {emitand ? <Loader2 className="animate-spin" /> : <Truck />}
                {emitand ? "Se emite..." : "Creeaza AWB"}
              </Button>
            </div>

            {/*
              * MARFA GREA: UN FLUX CU UN OM LA CELALALT CAPAT.
              *
              * Nu e o cotare. Cererea pleaca la echipa SmartShip, iar raspunsul
              * vine peste ore sau zile - de aia referinta se scrie pe comanda si
              * de aia sectiunea ramane deschisa cat timp exista o solicitare.
              *
              * Se arata doar cand chiar are rost: peste pragul de marfa grea (sub
              * el raspund cu 422 si trimit inapoi la emiterea obisnuita), sau cand
              * comanda are deja o solicitare pornita.
              */}
            {(Number(weight) >= PRAG_MARFA_GREA_KG || comanda.smartship_offer_ref || arataOferta) && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <PackageOpen className="h-3.5 w-3.5" />Marfa grea: oferta de transport
                  </p>
                  {!comanda.smartship_offer_ref && (
                    <Button variant="outline" size="sm" onClick={handleCereOferta} disabled={lucrezOferta}>
                      {lucrezOferta ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cere oferta"}
                    </Button>
                  )}
                </div>

                {!comanda.smartship_offer_ref ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Pentru paleti si marfa voluminoasa, unde curierii obisnuiti nu se potrivesc.
                      Raspunsul vine de la echipa SmartShip, nu automat.
                    </p>

                    <div className="flex gap-2">
                      <select
                        value={tipCamion}
                        onChange={(e) => setTipCamion(e.target.value)}
                        className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-xs"
                      >
                        <option value="">Tip camion (nu conteaza)</option>
                        {TIPURI_CAMION.map((t) => <option key={t.valoare} value={t.valoare}>{t.eticheta}</option>)}
                      </select>
                      <input
                        value={buget}
                        onChange={(e) => setBuget(e.target.value)}
                        inputMode="decimal"
                        placeholder="Buget (lei)"
                        className="w-28 rounded-md border border-input bg-transparent px-3 text-xs"
                      />
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" className="accent-primary" checked={grupaj} onChange={(e) => setGrupaj(e.target.checked)} />
                        accepta grupaj
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" className="accent-primary" checked={adr} onChange={(e) => setAdr(e.target.checked)} />
                        marfa ADR
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" className="accent-primary" checked={temperatura} onChange={(e) => setTemperatura(e.target.checked)} />
                        temperatura controlata
                      </label>
                    </div>

                    <textarea
                      value={mesajOferta}
                      onChange={(e) => setMesajOferta(e.target.value)}
                      maxLength={1000}
                      rows={2}
                      placeholder="Detalii pentru echipa: cum se incarca, termene dorite, ce utilaje sunt la destinatie..."
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Solicitarea <strong className="text-foreground">{comanda.smartship_offer_ref}</strong>
                      {comanda.smartship_offer_status ? ` \u00b7 ${comanda.smartship_offer_status}` : ""}
                    </p>

                    <Button variant="outline" size="sm" onClick={handleVerificaOferta} disabled={lucrezOferta} className="w-full">
                      {lucrezOferta ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Verifica oferta
                    </Button>

                    {oferta?.offer && (
                      <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-xs">
                        <p className="font-semibold text-foreground">
                          {oferta.offer.price} lei · {oferta.offer.carrier ?? "transportator partener"}
                        </p>
                        {oferta.offer.delivery_term && <p className="text-muted-foreground">{oferta.offer.delivery_term}</p>}
                        {oferta.offer.valid_until && <p className="text-muted-foreground">valabila pana la {oferta.offer.valid_until}</p>}
                        {oferta.offer.message && <p className="text-muted-foreground">{oferta.offer.message}</p>}
                        {oferta.offer.acceptable ? (
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={handleAcceptaOferta} disabled={lucrezOferta} className="flex-1">
                              Accepta (emite AWB)
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleRefuzaOferta} disabled={lucrezOferta} className="flex-1">
                              Refuza
                            </Button>
                          </div>
                        ) : (
                          <p className="text-warning">
                            {oferta.offer.expired ? "Oferta a expirat." : "Oferta nu mai poate fi acceptata."}
                          </p>
                        )}
                      </div>
                    )}

                    {oferta && !oferta.offer && oferta.resolution_message && (
                      <p className="text-xs text-warning">{oferta.resolution_message}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {!comanda.smartship_offer_ref && Number(weight) < PRAG_MARFA_GREA_KG && !arataOferta && (
              <button type="button" onClick={() => setArataOferta(true)} className="text-xs text-muted-foreground underline">
                Coletul e prea mare pentru curieri? Cere o oferta de transport
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
