"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle2, FileCheck, FileDown, Loader2, Package, Search, Truck, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import {
  coteazaDhlAction, createDhlAwbAction, getDhlDovadaAction, getDhlEtichetaAction, verificaDhlAwbAction,
  type DateAwbDhl,
} from "@/lib/actions/dhl.actions";
import { useGreutateaAwb, notaGreutate } from "@/components/dashboard/useGreutateaAwb";
import { cheiaOfertei, etichetaOferta, explicatieTva } from "@/lib/dhl/preturi";
import { avertismenteColet, DIMENSIUNI_IMPLICITE } from "@/lib/dhl/expediere";
import type { OfertaDhl } from "@/lib/dhl/client";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

type ShippingAddress = {
  city?: string; county?: string; address?: string; street?: string; street_no?: string;
  postal_code?: string; country?: string; courier?: string; delivery_type?: string;
  /* ⚠ Numele astea trebuie sa fie IDENTICE cu ce scrie checkout-ul in `OrderModal.tsx`
     si in `checkout-core.ts`. Un camp scris altfel se pierde tacut, si alegerea
     clientului n-ar ajunge niciodata aici.
     ⚠ La DHL pierderea costa mai mult decat la UPS: `productCode` e in `required` la
     `POST /shipments`, deci fara el DHL REFUZA emiterea — nu factureaza tacit produsul
     cel mai scump, cum face UPS. Iar `dhl_local_product_code` nu se compune niciodata de
     noi: se copiaza literal din cotarea pe care a vazut-o clientul. */
  dhl_product_code?: string;
  dhl_product_name?: string;
  dhl_local_product_code?: string;
};

/**
 * Emiterea unei expedieri DHL Express (MyDHL API).
 *
 * ═══ DOI PASI, CA LA CEILALTI ═══
 *
 * Intai „Calculeaza preturi" (`POST /rates` — citire pura, nu creeaza nimic si nu trece
 * prin registrul de operatii), apoi alegerea produsului.
 *
 * ═══ ⚠ SASE DEOSEBIRI FATA DE UPS, SI FIECARE COSTA BANI DACA E UITATA ═══
 *
 * 1. **⚠⚠ FARA RAMBURS, SI DE AICI NU SE POATE EMITE DELOC.** DHL Express nu vinde plata
 *    la livrare cu origine Romania. In checkout DHL nici nu apare pe comenzile cu
 *    ramburs; dar in panou comerciantul ar putea emite un AWB DHL pe orice comanda — si
 *    atunci curierul livreaza si NU incaseaza nimic. Coletul pleaca gratis, iar comanda
 *    arata expediata. E cea mai scumpa greseala posibila a integrarii, de aia butonul e
 *    STINS, nu doar insotit de un avertisment.
 *
 * 2. **⚠⚠ FARA ANULARE DE EXPEDIERE.** `delete:` apare O SINGURA data in toata
 *    specificatia lor, si aceea pe `/pickups/{dispatchConfirmationNumber}`. „Detaseaza
 *    AWB" din fereastra de editare scoate numerele de pe comanda si anuleaza RIDICAREA,
 *    dar expedierea ramane emisa la DHL. Al doilea curier fara anulare, dupa Packeta.
 *
 * 3. **Fara idempotenta si fara cod de „duplicate shipment".** Deci „Verifica la DHL" nu
 *    e un lux: e SINGURA cale de a afla daca o emitere care pare cazuta a creat totusi
 *    expedierea. O a doua apasare pe „Emite" ar face al doilea AWB, care nu se mai poate
 *    anula si care, prin conditiile lor, poate fi facturat.
 *
 * 4. **Codul postal opreste emiterea.** DHL cere sase cifre pentru Romania si le
 *    verifica, iar checkout-ul nostru nu cere cod postal la comenzile interne. Cotarea
 *    poate totusi intoarce preturi (DHL alege singur o locatie si raspunde 200), dar
 *    emiterea — care valideaza strict — cade. De aia preturile se vad si butonul e stins.
 *
 * 5. **Produsul e OBLIGATORIU la emitere.** Spre deosebire de UPS, care fara cod de
 *    serviciu factureaza tacit cel mai scump produs, DHL REFUZA cererea. Codul se ia din
 *    cotare, nu se compune, si se preselecteaza cel ales de client in checkout.
 *
 * 6. **Fara puncte de ridicare, si nu e o scapare.** `GET /servicepoints` exista, dar
 *    livrarea la punct trece prin `onDemandDelivery`, care cere un `servicePointId`
 *    obtinut doar prin „contact your local DHL Express Account Manager". Deci nu exista
 *    selector de punct aici si DHL nu apare in checkout ca livrare in punct.
 *
 * ⚠ Produsul ales de CLIENT in checkout se preselecteaza, si se spune pe fata:
 * comerciantul poate schimba, dar trebuie sa vada ce a platit omul.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
};

export function DhlAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

type ComandaDhl = {
  dhl_awb_number?: string | null;
  dhl_product_name?: string | null;
  dhl_product_code?: string | null;
  dhl_local_product_code?: string | null;
  dhl_tracking_url?: string | null;
  dhl_cost?: number | null;
  dhl_currency?: string | null;
  dhl_reference?: string | null;
  /** ⚠ Numarul ridicarii — SINGURUL lucru care se mai poate anula la DHL. */
  dhl_dispatch_confirmation?: string | null;
};

/**
 * Tipul MIME dupa formatul intors.
 *
 * ⚠ Implicitul e PDF, nu GIF ca la UPS: enumerarea lor de formate e
 * `PDF, ZPL, LP2, EPL2, PNG` cu `default: PDF`. `ZPL`/`EPL2`/`LP2` sunt text pentru
 * imprimanta termica — servite ca `application/pdf` ar deschide un vizualizator care
 * raporteaza fisier corupt.
 */
function tipulFisierului(nume: string): string {
  if (nume.endsWith(".png")) return "image/png";
  if (nume.endsWith(".tif")) return "image/tiff";
  if (nume.endsWith(".zip")) return "application/zip";
  if (nume.endsWith(".zpl")) return "text/plain";
  return "application/pdf";
}

/** Descarca un continut base64 sub numele dat. */
function descarca(base64: string, nume: string, tip: string) {
  const octeti = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([octeti], { type: tip }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nume;
  a.click();
  URL.revokeObjectURL(url);
}

function Formular({ onClose, order, businessId, onSuccess }: Props) {
  const comanda = order as typeof order & ComandaDhl;
  const addr = (order.shipping_address ?? {}) as ShippingAddress;
  const awb = comanda.dhl_awb_number ?? null;

  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: !!awb, businessId, orderId: order.id,
  });
  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);

  /*
   * ⚠ CAT ARE DE INCASAT CURIERUL, nu „ce metoda a bifat clientul". O plata online oprita
   * la jumatate lasa comanda `unpaid` si o face, in fapt, o comanda cu ramburs — iar DHL
   * n-ar incasa nimic pe ea. Vezi `rambursDeIncasat`, si comanda #0033 de la
   * Suporti-Numar.ro care a plecat fara nicio cale de incasare.
   */
  const ramburs = rambursDeIncasat(order);

  /** Produsul ales de client in checkout, cand exista. */
  const alesDeClient = (addr.courier ?? "").toLowerCase().trim() === "dhl"
    ? (addr.dhl_product_code ?? "").trim().toUpperCase() || null
    : null;

  const [continut, setContinut] = useState("Produse");
  const [oferte, setOferte] = useState<OfertaDhl[] | null>(null);
  const [aleasa, setAleasa] = useState<OfertaDhl | null>(null);
  const [valuteRefuzate, setValuteRefuzate] = useState<string[]>([]);
  const [alerte, setAlerte] = useState<string[]>([]);
  const [neVandute, setNeVandute] = useState<string[]>([]);
  const [cerContract, setCerContract] = useState<string[]>([]);
  const [faraCodPostal, setFaraCodPostal] = useState(false);
  const [faraDateVamale, setFaraDateVamale] = useState(false);

  const [cotand, setCotand] = useState(false);
  const [emitand, setEmitand] = useState(false);
  const [verificand, setVerificand] = useState(false);
  const [descarcand, setDescarcand] = useState(false);
  const [descarcandDovada, setDescarcandDovada] = useState(false);

  /*
   * Suprataxele coletului, spuse INAINTE de emitere.
   *
   * ⚠ Dimensiunile sunt cele IMPLICITE, fiindca aici nu avem configurarea magazinului —
   * ea sta pe server, in `dhl_config`. Deci avertismentele de GREUTATE (supraponderal
   * peste 70 kg, sortare manuala intre 25 si 70 kg) sunt exacte, iar cele de DIMENSIUNE
   * nu pot iesi la iveala pentru un comerciant care si-a pus o cutie mai mare in
   * configurare. Se ARATA, nu blocheaza nimic: o suprataxa scumpeste coletul, nu-l
   * opreste — de aia `avertismenteColet` e tinut in afara lui `lipsuriExpediere`.
   */
  const avertismente = avertismenteColet(Number(weight) || 0, DIMENSIUNI_IMPLICITE);

  function destinatar() {
    return {
      nume: order.customer_name,
      strada: addr.street || addr.address || "",
      numar: addr.street_no || null,
      oras: addr.city || "",
      judet: addr.county || null,
      codPostal: addr.postal_code || null,
      telefon: order.customer_phone,
      email: order.customer_email,
      tara: addr.country || "RO",
    };
  }

  /**
   * Datele COTARII — coletul, si nimic despre produs.
   *
   * ⚠⚠ AICI NU ARE VOIE SA INTRE PRODUSUL ALES, si asta a fost defectul. Pana acum exista
   * un singur `dateComune()` folosit si de cotare si de emitere, care ducea mereu
   * `productCode`-ul din `aleasa`. La prima apasare pe „Calculeaza preturi" `aleasa` e
   * `null`, deci mergea bine; dar cotarea preselecteaza singura o oferta, asa ca de la a
   * DOUA apasare — adica exact dupa ce comerciantul corecteaza greutatea, cum il indeamna
   * nota de sub camp — produsul pleca la `/rates`, unde campul lor e FILTRU al raspunsului
   * („Please use if you wish to filter the response by product(s)"). Lista se prabusea de
   * la patru oferte la una, si asta costa de doua ori:
   *   - produsele mai ieftine dispareau fara sa spuna nimeni nimic (la 1 kg, zona 1,
   *     Express Worldwide e sub Economy Select — ordinea se INVERSEAZA cu greutatea, deci
   *     recotarea era chiar momentul in care trebuia vazuta toata lista);
   *   - `oferte.some(o => o.productCode === alesDeClient)` devenea fals, deci se aprindea
   *     FALS „Produsul ales de client la comanda nu mai e disponibil", si comerciantul,
   *     crezandu-l, expedia pe alt produs decat cel platit de cumparator.
   * Intentia era deja scrisa pe server, in `corpTarife` din `lib/dhl/expediere.ts`
   * („Produsul se pune DOAR daca a fost cerut anume… La prima cotare lipseste dinadins"),
   * doar fereastra n-o respecta. UPS, de unde e copiata fereastra, nu are defectul: acolo
   * `corpTarife` nu citeste deloc codul de serviciu.
   *
   * ⚠ NU exista camp de ramburs, spre deosebire de toti ceilalti paisprezece curieri cu
   * incasare la livrare. DHL Express nu-l vinde din Romania, deci nu e nimic de trimis si
   * nimic de stins — de aia lipsa lui de aici e o hotarare, nu o omisiune.
   *
   * ⚠ Nici `articole` nu pleaca de aici: declaratia vamala cere cod HS si tara de
   * fabricatie pe fiecare produs, iar catalogul nostru nu le tine. De aia serverul
   * intoarce `lipsescDateleVamale` si emiterea catre destinatiile din afara Uniunii e
   * oprita — o expediere fara cod HS se blocheaza in vama, si DHL n-are anulare cu care
   * sa se repare.
   */
  function dateCotare(): DateAwbDhl {
    return {
      destinatar: destinatar(),
      greutateKg: Number(weight) || 0,
      continut: continut.trim() || "Produse",
      valoareComanda: Number(order.total) || 0,
    };
  }

  /**
   * Datele EMITERII — coletul PLUS produsul ales.
   *
   * ⚠ Produsul e OBLIGATORIU aici: fara `productCode` DHL REFUZA `POST /shipments`, spre
   * deosebire de UPS, care factureaza tacit cel mai scump serviciu.
   */
  function dateEmitere(): DateAwbDhl {
    return {
      ...dateCotare(),
      /* ⚠ Cele DOUA coduri se trimit amandoua si separat: la livrarile interne DHL cere
         produsul GLOBAL impreuna cu cel LOCAL, iar documentatia lor se contrazice pe
         latimea celui local (schema zice 1-3 caractere, exemplele scriu unul singur).
         Compus de noi, ar fi refuzat; de aia se copiaza literal din oferta. */
      productCode: aleasa?.productCode ?? null,
      productName: aleasa?.productName ?? null,
      localProductCode: aleasa?.localProductCode ?? null,
      cost: aleasa?.pret ?? null,
      valuta: aleasa?.valuta ?? null,
    };
  }

  async function handleCoteaza() {
    setCotand(true);
    const r = await coteazaDhlAction(businessId, order.id, dateCotare());
    setCotand(false);
    if (!r.ok) return toast.error(r.error, { duration: 20000 });

    setOferte(r.oferte);
    setValuteRefuzate(r.valuteRefuzate);
    setAlerte(r.alerte);
    setNeVandute(r.neVanduteInRomania);
    setCerContract(r.cerContract);
    setFaraCodPostal(r.lipsesteCodulPostal);
    setFaraDateVamale(r.lipsescDateleVamale);

    if (r.oferte.length === 0) {
      setAleasa(null);
      toast.warning(
        r.valuteRefuzate.length > 0
          ? `DHL a cotat in ${r.valuteRefuzate.join(", ")}, nu in lei. Nu convertim noi sumele — cere-i reprezentantului DHL tarife in RON.`
          : r.lipsesteCodulPostal
            ? "DHL n-a intors niciun pret, iar comanda n-are cod postal — ei cer sase cifre pentru Romania si le verifica. Completeaza-l pe comanda si incearca din nou."
            : "DHL n-a intors niciun produs pentru adresa asta.",
        { duration: 20000 },
      );
      return;
    }
    /*
     * Preselectam ce a ales clientul, daca produsul mai exista.
     *
     * ⚠ Potrivirea e pe `productCode`, produsul GLOBAL: el vine la fiecare oferta DHL, si
     * interna si externa. Pe codul LOCAL n-ar merge — el lipseste la expedierile
     * internationale, si atunci preselectia ar cadea exact pe comenzile in afara tarii.
     */
    const aPrecedenta = alesDeClient
      ? r.oferte.find((o) => o.productCode.toUpperCase() === alesDeClient)
      : null;
    setAleasa(aPrecedenta ?? r.oferte[0]);
  }

  async function handleEmite() {
    setEmitand(true);
    const r = await createDhlAwbAction(businessId, order.id, dateEmitere());
    setEmitand(false);
    if ("error" in r) return toast.error(r.error, { duration: 20000 });
    /*
     * ⚠ AVERTISMENTELE EMITERII SE ARATA, NU SE INGROAPA. Pana la reparatia asta fereastra
     * afisa doar „Expediere DHL creata: …" si se inchidea, iar avertismentele raspunsului
     * ramaneau numai in registrul de operatii externe, unde nu le citeste nimeni.
     * Cel mai scump dintre ele spune ca DHL NU a confirmat ridicarea (raspuns 201 fara
     * `dispatchConfirmationNumber`, familia lor de erori `410928`): fara el comerciantul
     * tiparea eticheta si astepta un sofer care nu vine. Al doilea, `7991`/`7995`, spune ca
     * DHL a creat expedierea FARA sa o tarifeze — tocmai de aia emiterea cere
     * `getRateEstimates: true` — deci pretul scris pe comanda ramane cel cotat si nimeni nu
     * afla ca nu e cel care se va factura.
     * ⚠ Se arata INAINTE de `onClose()`, altfel fereastra dispare peste ele, si cu durata
     * lunga; acelasi tipar ca la SmartShip, Innoship si Posta. Cotarea isi arata alertele
     * de mult — doar emiterea n-avea canal.
     */
    for (const av of r.avertismente) toast.warning(av, { duration: 20000 });
    toast.success(`Expediere DHL creata: ${r.awb}`);
    onSuccess();
    onClose();
  }

  /**
   * „Am trimis si n-am primit raspuns — s-a creat sau nu?"
   *
   * ⚠⚠ E o CITIRE (`GET /tracking?shipmentReference=…`), nu o reemitere, si e SINGURA cale
   * inapoi. DHL n-are idempotenta, n-are cod de „duplicate shipment" si — mai rau decat la
   * UPS — n-are nici anulare: al doilea AWB nascut dintr-o a doua apasare pe „Emite" nu se
   * mai poate desface deloc, si prin conditiile lor poate fi si facturat.
   */
  async function handleVerifica() {
    setVerificand(true);
    const r = await verificaDhlAwbAction(businessId, order.id);
    setVerificand(false);
    if (!r.ok) return toast.error(r.error, { duration: 25000 });
    if (r.gasit) {
      toast.success(r.mesaj, { duration: 20000 });
      onSuccess();
      onClose();
      return;
    }
    toast.info(r.mesaj, { duration: 20000 });
  }

  async function handleEticheta() {
    setDescarcand(true);
    const r = await getDhlEtichetaAction(businessId, order.id);
    setDescarcand(false);
    if (!r.ok) return toast.error(r.error, { duration: 20000 });

    /*
     * ⚠ Eticheta vine din TABELUL NOSTRU, si asta nu e o optimizare: `label` NU e in
     * enumerarea lui `GET /shipments/{awb}/get-image` (`waybill, commercial-invoice,
     * customs-entry, transport-accompanying-document, …`). Eticheta lipita pe colet nu se
     * poate recupera niciodata de la DHL — iar fiindca ei n-au nici anulare de expediere,
     * o eticheta pierduta nu se reface decat platind o a doua expediere.
     */
    descarca(r.base64, r.nume, tipulFisierului(r.nume));

    /*
     * ⚠ FACTURA COMERCIALA NU E OPTIONALA la expedierile vamale: netiparita, coletul se
     * opreste in vama si de acolo nu se mai poate repara nimic din aplicatie.
     *
     * ⚠ Se descarca drept PDF fiindca hartiile insotitoare vin de la ei ca PDF chiar si
     * cand eticheta a fost ceruta in format termic (`ZPL`/`EPL2`) — formatul lor per
     * document nu ne e intors odata cu continutul, deci nu se poate deduce altfel.
     */
    if (r.factura) {
      descarca(r.factura, r.nume.replace(/\.[^.]+$/, "-factura-comerciala.pdf"), "application/pdf");
    }
    /*
     * ⚠ NU MAI EXISTA descarcare de „document de transport" (`waybillDoc`), si nu fiindca
     * s-a renuntat la ea: NU A FUNCTIONAT NICIODATA. Cererea de emitere cerea DOUA
     * documente (`label` + `waybillDoc`), dar schema raspunsului lor enumera doar
     * `invoice, proforma, label or receipt` — deci `dupaTip("waybilldoc")` era NUL la
     * fiecare emitere si coloana `document_transport` ramanea goala. Mai rau, ceruta,
     * a doua hartie vine tot etichetata `label` (chiar exemplul lor
     * `domesticDocShipmentResponse`), asa ca „prima intrare de tip label" putea fi
     * borderoul de arhiva — adica exact hartia gresita lipita pe colet, la un curier fara
     * reimprimare de eticheta si fara anulare de expediere. `waybillDoc` s-a scos din
     * cerere; aici se scoate ramura care promitea un fisier ce nu venea.
     *
     * ⚠ Factura comerciala RAMANE, si nu e acelasi caz: `invoice` chiar e in enumerarea
     * lor si chiar vine inapoi la expedierile vamale.
     */
    if (r.factura) {
      toast.info(
        "S-a descarcat si factura comerciala. ⚠ Tipareste-o si pune-o in plicul de documente: fara ea coletul se opreste in vama.",
        { duration: 20000 },
      );
    }
  }

  /**
   * Dovada electronica a livrarii (ePOD).
   *
   * ⚠ DHL o pregateste ABIA A DOUA ZI dupa livrare („The digital signature is available
   * the next day after delivery"), deci in primele 24 de ore lipsa ei e starea NORMALA,
   * nu un defect. Actiunea intoarce chiar propozitia asta, ca omul sa nu deschida tichet.
   *
   * ⚠ De aia esecul se arata ca INFORMARE, nu ca eroare rosie: cazul cel mai des e „inca
   * n-a trecut o zi", iar un semnal de defectiune pe starea normala il invata pe comerciant
   * sa nu mai creada semnalele. Textul spune oricum ce s-a intamplat.
   */
  async function handleDovada() {
    setDescarcandDovada(true);
    const r = await getDhlDovadaAction(businessId, order.id);
    setDescarcandDovada(false);
    if (!r.ok) return toast.info(r.error, { duration: 20000 });
    descarca(r.base64, r.nume, tipulFisierului(r.nume));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-surface p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Truck className="h-4 w-4" /> Expediere DHL Express
          </h2>
          <button type="button" onClick={onClose} aria-label="Inchide"><X className="h-4 w-4" /></button>
        </div>

        {awb ? (
          <div className="space-y-3 text-sm">
            <p>
              Expediere: <strong>{awb}</strong>
              {comanda.dhl_product_name ? ` · ${comanda.dhl_product_name}` : ""}
            </p>
            {comanda.dhl_cost !== null && comanda.dhl_cost !== undefined && (
              <p className="text-muted-foreground">
                Cost cotat: {comanda.dhl_cost} {comanda.dhl_currency ?? "lei"}
              </p>
            )}
            {comanda.dhl_reference && (
              <p className="text-muted-foreground">
                Referinta noastra la DHL: <strong>{comanda.dhl_reference}</strong> — dupa ea o cauti in MyDHL.
              </p>
            )}
            {comanda.dhl_tracking_url && (
              <p className="text-muted-foreground break-all">
                Urmarire: <a className="underline" href={comanda.dhl_tracking_url} target="_blank" rel="noreferrer">{comanda.dhl_tracking_url}</a>
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleEticheta} disabled={descarcand}>
                {descarcand ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Descarca eticheta
              </Button>
              <Button variant="outline" onClick={handleDovada} disabled={descarcandDovada}>
                {descarcandDovada ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                Dovada livrarii
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              ⚠ Eticheta o pastram NOI de la emitere: API-ul DHL nu poate da inapoi eticheta de transport
              (endpointul lor de documente cunoaste doar factura, documentul de insotire si hartiile de vama).
              Daca s-a pierdut si de la noi, se descarca de mana din MyDHL, dupa numarul expedierii.
            </p>
            <p className="text-[11px] text-muted-foreground">
              „Dovada livrarii” intoarce PDF-ul lor cu semnatura, si DHL il pregateste abia a doua zi dupa
              livrare — pana atunci lipsa lui e normala, nu o defectiune.
            </p>

            {/*
              ⚠⚠ ANULAREA NU EXISTA, SI SE SPUNE AICI, NU DUPA.
              `delete:` apare o singura data in toata specificatia MyDHL API, si aceea pe
              ridicare. Comerciantul care crede ca „Detaseaza AWB" anuleaza transportul
              lasa eticheta tiparita pe masa; lipita pe alt colet sau ridicata din
              greseala, ea intra in reteaua DHL si comanda pleaca — si se factureaza — a
              doua oara. Ghidul lor spune raspicat ca expedierea „will not become an active
              shipment if the shipment label does not enter the DHL Network", adica
              raspunsul atarna de o hartie, nu de un apel.
            */}
            <p className="text-[11px] text-warning flex items-start gap-1.5">
              <Ban className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                DHL nu permite anularea expedierii prin API. „Detaseaza AWB” din fereastra de editare doar
                scoate numerele de pe comanda
                {comanda.dhl_dispatch_confirmation ? " si anuleaza ridicarea programata" : ""}
                {" "}— la DHL expedierea RAMANE emisa.
                <strong className="mx-1">Distruge eticheta tiparita</strong>
                daca renunti: intrata in reteaua lor, ea trimite coletul a doua oara si transportul se
                factureaza. Ce nu se poate face din aplicatie se rezolva in MyDHL sau la reprezentantul tau.
              </span>
            </p>
            {comanda.dhl_dispatch_confirmation && (
              <p className="text-[11px] text-muted-foreground">
                Ridicare programata: <strong>{comanda.dhl_dispatch_confirmation}</strong>. E singurul lucru
                care se mai poate anula la DHL — lasata pe loc, soferul vine dupa un colet care nu pleaca.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/*
              ⚠⚠ RAMBURSUL: AICI SE OPRESTE EMITEREA.
              DHL Express nu vinde plata la livrare cu origine Romania (verificat pe
              catalogul lor romanesc, pe ghidul de tarife si pe sonda de capabilitate).
              Trimis totusi codul lor de ramburs (`KB`), esecul n-ar veni la cotare, ci la
              emitere, cu `7008`. Iar emis fara el, AWB-ul e perfect valid: coletul pleaca,
              se livreaza, si nimeni nu incaseaza nimic. Comanda arata expediata, banii
              lipsesc, si lipsa se vede abia la inchiderea lunii.
              Se lasa totusi cotarea la indemana: comerciantul trebuie sa poata vedea cat
              l-ar costa DHL inainte sa hotarasca daca incaseaza altfel.
            */}
            {ramburs > 0 && (
              <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-2">
                <p className="text-xs font-semibold flex items-start gap-1.5 text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Comanda are de incasat {ramburs} lei la livrare, iar DHL nu incaseaza ramburs.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  DHL Express nu vinde plata la livrare cu expediere din Romania. Emis totusi, AWB-ul ar fi
                  valid si coletul s-ar livra <strong>fara sa se incaseze banii</strong> — marfa plecata gratis,
                  cu comanda aratand expediata. De aia „Emite AWB” e stins.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Incaseaza comanda inainte (link de plata, transfer) si marcheaz-o platita, sau expediaz-o cu
                  un curier care are ramburs. Preturile de mai jos le poti calcula oricum: cotarea nu creeaza
                  nimic.
                </p>
              </div>
            )}

            <label className="text-xs block">
              Greutate (kg)
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={weight} onChange={(e) => setWeight(e.target.value)}
              />
            </label>
            {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}

            {avertismente.map((a) => (
              <p key={a} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {a}
              </p>
            ))}

            {/*
              ⚠ NU E OPTIONAL, SI NU DOAR LA VAMA. `description` e in lista `required` a
              expedierii, la orice destinatie, iar DHL cere minimum TREI caractere reale
              (`7143 Shipment description must contain at least 3 characters`) desi schema
              lor scrie `minLength: 1`. Gol, cade emiterea; scurt, la fel. De aia campul
              porneste completat si nota spune pragul.
            */}
            <label className="text-xs block">
              Continut (obligatoriu la DHL pe orice expediere, si se tipareste pe documentele vamale)
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={continut} onChange={(e) => setContinut(e.target.value)}
              />
            </label>
            {continut.trim().length > 0 && continut.trim().length < 3 && (
              <p className="text-[11px] text-warning flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                DHL cere cel putin trei caractere in descrierea expedierii, altfel refuza emiterea.
              </p>
            )}

            <Button onClick={handleCoteaza} disabled={cotand}>
              {cotand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              Calculeaza preturi
            </Button>

            {/*
              ⚠ CODUL POSTAL, SI DE CE E O NOTA MARE SI NU UN RAND MIC.
              Checkout-ul Edinio nu cere cod postal la comenzile interne, iar DHL cere sase
              cifre pentru Romania si le verifica. Cotarea trece — DHL alege singur o
              locatie si raspunde 200 — dar emiterea, unde validarea e stricta, cade. Deci
              comerciantul ar vedea preturi si ar primi o eroare de neinteles la apasare.
            */}
            {faraCodPostal && (
              <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-1.5">
                <p className="text-xs font-semibold flex items-start gap-1.5 text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Comanda n-are cod postal, iar DHL il cere.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Pentru Romania DHL vrea sase cifre si le verifica. Preturile de mai sus, daca au aparut, vin
                  dintr-o locatie aleasa de ei — emiterea valideaza strict si ar fi refuzata. Completeaza codul
                  postal in datele de livrare ale comenzii si calculeaza din nou.
                </p>
              </div>
            )}

            {/*
              ⚠ DATELE VAMALE OPRESC EMITEREA, si e singurul loc unde blocam ceva ce DHL ar
              accepta. Codul HS nu e in lista lor `required`: o expediere vamala fara el
              trece de schema, trece de `tsc`, trece de probe. Vama nu trece — si de acolo
              nu se mai repara nimic, fiindca DHL n-are anulare de expediere.
            */}
            {faraDateVamale && (
              <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-1.5">
                <p className="text-xs font-semibold flex items-start gap-1.5 text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Destinatie in afara Uniunii, fara date vamale pe produse.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Declaratia vamala cere codul HS si tara de fabricatie pentru fiecare produs, iar catalogul
                  nu le are. Fara ele coletul se opreste in vama, si DHL nu are anulare de expediere cu care
                  sa se repare — de aia emiterea e oprita aici, nu dupa. Expediaza comanda cu un curier care
                  intocmeste el documentele, sau cere-i reprezentantului DHL o expediere de mana din MyDHL.
                </p>
              </div>
            )}

            {valuteRefuzate.length > 0 && (
              <p className="text-[11px] text-warning flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Contul DHL coteaza in {valuteRefuzate.join(", ")}, iar magazinul lucreaza in lei. Nu convertim
                noi sumele — un pret in euro scris ca lei ar subfactura transportul de cinci ori. Valuta de
                facturare a contului se schimba la reprezentantul DHL, nu de aici.
              </p>
            )}

            {cerContract.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                ⚠ Produsele {cerContract.join(", ")} sunt marcate de DHL ca „numai cu acord prealabil”. Le poti
                alege — ei le-au intors — dar fara acordul din contract emiterea cade cu „Account not allowed
                for this service”.
              </p>
            )}

            {neVandute.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                ⚠ DHL a cotat si produsele {neVandute.join(", ")}, pe care documentele lor comerciale romanesti
                nu le dau pe ruta asta. Le poti folosi — ei le-au intors pe contul tau — dar merita verificat cu
                reprezentantul.
              </p>
            )}

            {/*
              ⚠ NU SCRIE „DHL A RASPUNS CU", desi asa scrie la UPS si la ceilalti.
              Lista asta e AMESTECATA: `coteazaDhlAction` pune peste `warnings[]`-urile lor
              si propriile noastre constatari (ramburs neincasabil, cod postal lipsa, date
              vamale lipsa). Puse pe seama DHL, ele l-ar trimite pe comerciant sa se certe
              cu reprezentantul lui despre o propozitie scrisa de noi — si sa nu creada
              avertismentul, fiindca DHL n-are de unde sti daca o comanda e platita.
            */}
            {alerte.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground">Ce a semnalat cotarea:</p>
                {alerte.map((a) => (
                  <p key={a} className="text-[11px] text-muted-foreground">· {a}</p>
                ))}
              </div>
            )}

            {oferte && oferte.length > 0 && (
              <div className="space-y-1.5">
                {alesDeClient && !oferte.some((o) => o.productCode.toUpperCase() === alesDeClient) && (
                  <p className="text-[11px] text-warning flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Produsul ales de client la comanda nu mai e disponibil. Alege altul — pretul poate diferi.
                  </p>
                )}
                {oferte.map((o) => {
                  const tva = explicatieTva(o);
                  /* ⚠ Din ce se compune pretul: combustibil, suprataxe, servicii adaugate.
                     Fara linia asta, comerciantul vede un total si compara cu factura DHL
                     abia luna urmatoare, cand nu mai are ce discuta. */
                  const servicii = o.servicii.map((s) => s.nume).filter(Boolean);
                  return (
                    <button
                      key={cheiaOfertei(o)}
                      type="button"
                      onClick={() => setAleasa(o)}
                      className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs ${
                        aleasa && cheiaOfertei(aleasa) === cheiaOfertei(o)
                          ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <span className="min-w-0">
                        {etichetaOferta(o)}
                        {o.productCode.toUpperCase() === alesDeClient ? " · ales de client" : ""}
                        {/* ⚠ Numai `QDDC` e angajament de termen la ei; `QDDF` e tranzitul cel
                            mai rapid, FARA vamuire, si ei insisi scriu ca „does not constitute
                            DHL's service commitment". Pe o ruta extra-UE diferenta e de zile,
                            iar un termen prezentat ca promisiune devine o reclamatie pe care o
                            plateste magazinul, nu DHL. De aia se marcheaza doar angajamentul. */}
                        {o.tipEstimare === "QDDC" ? " · termen angajat de DHL" : ""}
                        {o.cereContract ? " · cere acord prealabil" : ""}
                        {servicii.length > 0 && (
                          <span className="block text-[10px] text-muted-foreground">
                            Include: {servicii.join(", ")}
                          </span>
                        )}
                      </span>
                      <span className="text-right shrink-0">
                        <strong className="block">{o.pret} {o.valuta === "RON" ? "lei" : o.valuta}</strong>
                        {tva && <span className="block text-[10px] text-muted-foreground">{tva}</span>}
                      </span>
                    </button>
                  );
                })}
                <p className="text-[11px] text-muted-foreground">
                  Termenele sunt ESTIMATIVE cand nu scrie altfel: implicitul DHL („QDDF”) e tranzitul cel mai
                  rapid, fara timpul de vamuire, si ei spun raspicat ca nu e un angajament de serviciu.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {/*
                ⚠ TREI MOTIVE DE STINGERE, si fiecare are pretul lui:
                  - `ramburs > 0`  — coletul s-ar livra fara sa incaseze nimeni (adevarul 1);
                  - `faraCodPostal` — DHL valideaza strict la emitere si refuza;
                  - `faraDateVamale` — coletul s-ar opri in vama, de unde nu se mai repara,
                    fiindca DHL n-are anulare de expediere.
                Ultimele doua sunt exact gardienii din `lipsuriExpediere`, deci butonul lasat
                aprins n-ar produce decat o eroare de neinteles dupa apasare.
              */}
              <Button
                onClick={handleEmite}
                disabled={emitand || !aleasa || ramburs > 0 || faraCodPostal || faraDateVamale}
              >
                {emitand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                Emite AWB
              </Button>
              <Button variant="outline" onClick={handleVerifica} disabled={verificand}>
                {verificand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Verifica la DHL
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Daca emiterea pare ca a esuat, apasa <strong className="mx-1">Verifica la DHL</strong> in loc sa
              incerci din nou: DHL n-are protectie contra dublurilor, iar al doilea AWB nu se mai poate anula
              deloc si poate fi facturat. Verificarea cauta dupa referinta comenzii si nu creeaza nimic.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
