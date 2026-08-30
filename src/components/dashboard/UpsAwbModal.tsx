"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileDown, Loader2, MapPin, Package, Search, Truck, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import {
  coteazaUpsAction, createUpsAwbAction, getUpsEtichetaAction, getUpsPuncteAction,
  verificaUpsAwbAction,
} from "@/lib/actions/ups.actions";
import { useGreutateaAwb, notaGreutate } from "@/components/dashboard/useGreutateaAwb";
import { cheiaOfertei, etichetaOferta, explicatieTva } from "@/lib/ups/preturi";
import { GREUTATE_MAXIMA_PUNCT_KG, type PunctAles } from "@/lib/ups/expediere";
import type { OfertaUps, PunctUps } from "@/lib/ups/client";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

type ShippingAddress = {
  city?: string; county?: string; address?: string; street?: string; street_no?: string;
  postal_code?: string; country?: string; courier?: string; delivery_type?: string;
  locker_id?: string; locker_name?: string; locker_address?: string;
  locker_city?: string; locker_county?: string; locker_post_code?: string;
  /* ⚠ Numele astea trebuie sa fie IDENTICE cu ce scrie checkout-ul in `OrderModal.tsx`
     si in `checkout-core.ts`. Un camp scris altfel se pierde tacut, si alegerea
     clientului n-ar ajunge niciodata aici. */
  ups_service_code?: string;
  ups_service_name?: string;
};

/**
 * Emiterea unei expedieri UPS.
 *
 * ═══ DOI PASI, CA LA CEILALTI ═══
 *
 * Intai „Calculeaza preturi" (citire pura, nu creeaza nimic), apoi alegerea serviciului.
 *
 * ═══ ⚠ PATRU DEOSEBIRI FATA DE FEDEX ═══
 *
 * 1. **UPS ARE ramburs** — dar numai pe conturi „Daily Pickup" sau „Drop Shipping", si
 *    numai la nivel de EXPEDIERE. Tipul contului nu se poate citi din API; „Testeaza
 *    conexiunea" din configurare il probeaza printr-o cotare cu ramburs.
 * 2. **UPS ARE puncte de ridicare** (UPS Access Point), cu limite proprii in Romania:
 *    cel mult {@link GREUTATE_MAXIMA_PUNCT_KG} kg si 97 cm lungime.
 * 3. **Eticheta e GIF, nu PDF.** Enumerarea lor la emitere e `GIF`/`ZPL`/`EPL`/`SPL` —
 *    PDF-ul exista numai la reimprimare, si de acolo il si luam cand copia noastra
 *    lipseste.
 * 4. **Mai vin doua hartii**: caseta de semnatura Varsovia (la orice expediere din afara
 *    Statelor Unite, deci si la noi) si, la comenzile cu ramburs, „COD Turn In Page" —
 *    documentul pe care soferul il ia odata cu banii.
 *
 * ⚠ Serviciul ales de CLIENT in checkout se preselecteaza, si se spune pe fata:
 * comerciantul poate schimba, dar trebuie sa vada ce a platit omul.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
};

export function UpsAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

type ComandaUps = {
  ups_awb_number?: string | null;
  ups_service_name?: string | null;
  ups_service_code?: string | null;
  ups_tracking_url?: string | null;
  ups_cost?: number | null;
  ups_currency?: string | null;
  ups_reference?: string | null;
};

/** Tipul MIME dupa formatul intors. `ZPL`/`EPL`/`SPL` sunt text pentru imprimanta termica. */
function tipulFisierului(nume: string): string {
  if (nume.endsWith(".pdf")) return "application/pdf";
  if (nume.endsWith(".png")) return "image/png";
  if (nume.endsWith(".zpl")) return "text/plain";
  return "image/gif";
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
  const comanda = order as typeof order & ComandaUps;
  const addr = (order.shipping_address ?? {}) as ShippingAddress;
  const awb = comanda.ups_awb_number ?? null;

  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: !!awb, businessId, orderId: order.id,
  });
  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);

  const ramburs = rambursDeIncasat(order);

  /** Serviciul ales de client in checkout, cand exista. */
  const alesDeClient = (addr.courier ?? "").toLowerCase().trim() === "ups"
    ? (addr.ups_service_code ?? "").trim() || null
    : null;

  /** Comanda a fost plasata cu ridicare din punct? */
  const cerePunct = (addr.courier ?? "").toLowerCase().trim() === "ups" && addr.delivery_type === "locker";

  const [continut, setContinut] = useState("Produse");
  const [oferte, setOferte] = useState<OfertaUps[] | null>(null);
  const [aleasa, setAleasa] = useState<OfertaUps | null>(null);
  const [valuteRefuzate, setValuteRefuzate] = useState<string[]>([]);
  const [doarLista, setDoarLista] = useState(false);
  const [alerte, setAlerte] = useState<string[]>([]);
  const [neVandute, setNeVandute] = useState<string[]>([]);
  const [aceeasiLocalitate, setAceeasiLocalitate] = useState(false);

  /* Punctul de ridicare: cel din comanda, sau altul ales acum de comerciant. */
  const [punct, setPunct] = useState<PunctAles | null>(
    cerePunct && addr.locker_id
      ? {
        id: addr.locker_id,
        nume: addr.locker_name ?? `Punct UPS ${addr.locker_id}`,
        adresa: addr.locker_address ?? "",
        oras: addr.locker_city ?? addr.city ?? "",
        judet: addr.locker_county ?? addr.county ?? null,
        codPostal: addr.locker_post_code ?? null,
      }
      : null,
  );
  const [puncte, setPuncte] = useState<PunctUps[] | null>(null);

  const [cotand, setCotand] = useState(false);
  const [emitand, setEmitand] = useState(false);
  const [verificand, setVerificand] = useState(false);
  const [descarcand, setDescarcand] = useState(false);
  const [cautandPuncte, setCautandPuncte] = useState(false);

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

  /** ⚠ UN SINGUR loc care compune datele: cotarea si emiterea le impart. */
  function dateComune() {
    return {
      destinatar: destinatar(),
      greutateKg: Number(weight) || 0,
      continut: continut.trim() || "Produse",
      ramburs,
      valoareComanda: Number(order.total) || 0,
      serviceCode: aleasa?.serviceCode ?? null,
      serviceName: aleasa?.serviceName ?? null,
      cost: aleasa?.pret ?? null,
      valuta: aleasa?.valuta ?? null,
      punct,
    };
  }

  async function handleCoteaza() {
    setCotand(true);
    const r = await coteazaUpsAction(businessId, order.id, dateComune());
    setCotand(false);
    if (!r.ok) return toast.error(r.error, { duration: 15000 });

    setOferte(r.oferte);
    setValuteRefuzate(r.valuteRefuzate);
    setDoarLista(r.doarPretDeLista);
    setAlerte(r.alerte);
    setNeVandute(r.neVanduteInRomania);
    setAceeasiLocalitate(r.aceeasiLocalitate);

    if (r.oferte.length === 0) {
      toast.warning(
        r.valuteRefuzate.length > 0
          ? `UPS a cotat in ${r.valuteRefuzate.join(", ")}, nu in lei. UPS n-are camp prin care sa ceri valuta — cere-i reprezentantului tarife in RON.`
          : r.aceeasiLocalitate
            ? "UPS nu presteaza servicii in aceeasi localitate pe teritoriul Romaniei. Foloseste alt curier."
            : "UPS n-a intors niciun serviciu pentru adresa asta.",
        { duration: 15000 },
      );
      return;
    }
    /* Preselectam ce a ales clientul, daca serviciul mai exista. */
    const alePrecedenta = alesDeClient ? r.oferte.find((o) => o.serviceCode === alesDeClient) : null;
    setAleasa(alePrecedenta ?? r.oferte[0]);
  }

  async function handleCautaPuncte() {
    setCautandPuncte(true);
    const r = await getUpsPuncteAction(businessId, {
      oras: addr.city || "",
      judet: addr.county || "",
      codPostal: addr.postal_code || "",
    });
    setCautandPuncte(false);
    if (!r.ok) return toast.error(r.error, { duration: 15000 });
    setPuncte(r.puncte);
    if (r.puncte.length === 0) toast.warning("UPS n-a gasit niciun punct in localitatea asta.");
  }

  async function handleEmite() {
    setEmitand(true);
    const r = await createUpsAwbAction(businessId, order.id, dateComune());
    setEmitand(false);
    if ("error" in r) return toast.error(r.error, { duration: 15000 });
    toast.success(`AWB UPS creat: ${r.awb}`);
    onSuccess();
    onClose();
  }

  /**
   * „Am trimis si n-am primit raspuns — s-a creat sau nu?"
   *
   * ⚠ E o CITIRE, nu o reemitere. UPS n-are idempotenta, deci o a doua apasare pe
   * „Emite" ar face al doilea AWB, taxabil — butonul asta exista tocmai ca sa nu fie
   * nevoie de ea. Intreaba in doua feluri: intai reimprimarea dupa referinta (eticheta
   * exista din clipa crearii), apoi urmarirea.
   */
  async function handleVerifica() {
    setVerificand(true);
    const r = await verificaUpsAwbAction(businessId, order.id);
    setVerificand(false);
    if (!r.ok) return toast.error(r.error, { duration: 20000 });
    if (r.gasit) {
      toast.success(r.mesaj, { duration: 12000 });
      onSuccess();
      onClose();
      return;
    }
    toast.info(r.mesaj, { duration: 15000 });
  }

  async function handleEticheta() {
    setDescarcand(true);
    const r = await getUpsEtichetaAction(businessId, order.id);
    setDescarcand(false);
    if (!r.ok) return toast.error(r.error, { duration: 15000 });

    descarca(r.base64, r.nume, tipulFisierului(r.nume));

    /*
     * ⚠ A DOUA hartie, si nu e optionala. „Base 64 encoded graphic image of the Warsaw
     * text and signature box … The image will be returned for non-US based shipments."
     * Romania e non-US, deci ea exista la fiecare AWB si se tipareste odata cu eticheta.
     */
    if (r.semnatura) {
      descarca(r.semnatura, r.nume.replace(/\.[^.]+$/, "-semnatura.gif"), "image/gif");
    }
    /*
     * ⚠ A TREIA, si numai la ramburs: documentul pe care soferul il ia odata cu banii.
     * Vine in HTML — „Only HTML format is supported for COD Turn In Page."
     */
    if (r.documentRamburs) {
      descarca(r.documentRamburs, r.nume.replace(/\.[^.]+$/, "-ramburs.html"), "text/html");
      toast.info("S-au descarcat si caseta de semnatura si documentul de ramburs — tipareste-le pe amandoua.");
    } else if (r.semnatura) {
      toast.info("S-a descarcat si caseta de semnatura (o cere UPS la expedierile din afara SUA).");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-surface p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Truck className="h-4 w-4" /> Expediere UPS
          </h2>
          <button type="button" onClick={onClose} aria-label="Inchide"><X className="h-4 w-4" /></button>
        </div>

        {awb ? (
          <div className="space-y-3 text-sm">
            <p>
              AWB: <strong>{awb}</strong>
              {comanda.ups_service_name ? ` · ${comanda.ups_service_name}` : ""}
            </p>
            {comanda.ups_cost !== null && comanda.ups_cost !== undefined && (
              <p className="text-muted-foreground">
                Cost cotat: {comanda.ups_cost} {comanda.ups_currency ?? "lei"}
              </p>
            )}
            {comanda.ups_tracking_url && (
              <p className="text-muted-foreground break-all">
                Urmarire: <a className="underline" href={comanda.ups_tracking_url} target="_blank" rel="noreferrer">{comanda.ups_tracking_url}</a>
              </p>
            )}
            <Button variant="outline" onClick={handleEticheta} disabled={descarcand}>
              {descarcand ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Descarca eticheta
            </Button>
            <p className="text-[11px] text-muted-foreground">
              ⚠ Eticheta o pastram noi de la emitere: documentatia UPS se contrazice daca reimprimarea merge
              si pentru expedierile normale, nu doar pentru retururi. Daca s-a pierdut, o cerem totusi de la
              ei — si atunci vine ca PDF.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {ramburs > 0 && (
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Comanda are <strong className="mx-1">ramburs {ramburs} lei</strong>. UPS il accepta, dar
                doar pe conturi de tip „Daily Pickup” sau „Drop Shipping”. Daca emiterea cade pe motivul asta,
                verifica tipul contului cu reprezentantul UPS.
              </p>
            )}

            <label className="text-xs block">
              Greutate (kg)
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={weight} onChange={(e) => setWeight(e.target.value)}
              />
            </label>
            {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}

            <label className="text-xs block">
              Continut (se trimite ca descriere, la expedierile in alta tara)
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={continut} onChange={(e) => setContinut(e.target.value)}
              />
            </label>

            {/* ─── Punctul de ridicare ─────────────────────────────────────── */}
            {(cerePunct || punct) && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Livrare in punct UPS Access Point
                </p>
                {punct ? (
                  <p className="text-[11px] text-muted-foreground">
                    <strong>{punct.nume}</strong>
                    {punct.adresa ? ` · ${punct.adresa}` : ""}
                    {punct.oras ? ` · ${punct.oras}` : ""}
                  </p>
                ) : (
                  <p className="text-[11px] text-warning">
                    Comanda cere ridicare din punct, dar punctul ales nu s-a pastrat. Alege unul mai jos.
                  </p>
                )}
                {Number(weight) > GREUTATE_MAXIMA_PUNCT_KG && (
                  <p className="text-[11px] text-warning flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Punctele UPS din Romania primesc cel mult {GREUTATE_MAXIMA_PUNCT_KG} kg pe colet.
                  </p>
                )}
                <Button type="button" variant="outline" onClick={handleCautaPuncte} disabled={cautandPuncte}>
                  {cautandPuncte ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  {punct ? "Schimba punctul" : "Cauta puncte"}
                </Button>
                {puncte && puncte.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {puncte.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPunct({
                          id: p.id, nume: p.nume, adresa: p.adresa, oras: p.oras,
                          judet: p.judet, codPostal: p.codPostal,
                        })}
                        className={`block w-full rounded-lg border px-2 py-1.5 text-left text-[11px] ${
                          punct?.id === p.id ? "border-primary bg-primary/5" : "border-border"
                        }`}
                      >
                        <strong>{p.nume}</strong>
                        <span className="block text-muted-foreground">{p.adresa}{p.oras ? `, ${p.oras}` : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button onClick={handleCoteaza} disabled={cotand}>
              {cotand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              Calculeaza preturi
            </Button>

            {aceeasiLocalitate && (
              <p className="text-[11px] text-warning flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Comanda pleaca si ajunge in aceeasi localitate. Ghidul UPS spune ca ei nu presteaza servicii
                in aceeasi localitate pe teritoriul Romaniei — daca nu apare niciun pret, asta e motivul.
              </p>
            )}

            {valuteRefuzate.length > 0 && (
              <p className="text-[11px] text-warning flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Contul UPS coteaza in {valuteRefuzate.join(", ")}, iar magazinul lucreaza in lei. UPS nu are
                niciun camp prin care sa ceri valuta raspunsului, si nu convertim noi sumele — un pret in euro
                scris ca lei ar subfactura transportul de cinci ori.
              </p>
            )}

            {doarLista && (
              <p className="text-[11px] text-muted-foreground">
                UPS a intors doar preturi de LISTA, nu tarifele contractului. Cel mai des inseamna ca aplicatia
                si numarul de cont nu sunt legate de acelasi contract — sau ca lipseste codul de judet pe care
                ei il cer pentru tarife negociate.
              </p>
            )}

            {neVandute.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                ⚠ UPS a cotat si serviciile {neVandute.join(", ")}, pe care ghidul lor romanesc le da ca
                indisponibile pe ruta asta. Le poti folosi — ei le-au intors — dar merita verificat cu
                reprezentantul.
              </p>
            )}

            {alerte.length > 0 && (
              <p className="text-[11px] text-muted-foreground">UPS a raspuns cu: {alerte.join(" | ")}</p>
            )}

            {oferte && oferte.length > 0 && (
              <div className="space-y-1.5">
                {alesDeClient && !oferte.some((o) => o.serviceCode === alesDeClient) && (
                  <p className="text-[11px] text-warning flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Serviciul ales de client la comanda nu mai e disponibil. Alege altul — pretul poate diferi.
                  </p>
                )}
                {oferte.map((o) => {
                  const tva = explicatieTva(o);
                  return (
                    <button
                      key={cheiaOfertei(o)}
                      type="button"
                      onClick={() => setAleasa(o)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${
                        aleasa?.serviceCode === o.serviceCode ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <span>
                        {etichetaOferta(o)}
                        {o.serviceCode === alesDeClient ? " · ales de client" : ""}
                        {!o.negociat ? " · pret de lista" : ""}
                      </span>
                      <span className="text-right">
                        <strong className="block">{o.pret} {o.valuta === "RON" ? "lei" : o.valuta}</strong>
                        {tva && <span className="block text-[10px] text-muted-foreground">{tva}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {/*
                ⚠ CU PUNCT CERUT SI FARA PUNCT ALES, BUTONUL E STINS.
                Lasat activ, emiterea ar pleca fara `AlternateDeliveryAddress`: UPS
                raspunde 200, AWB-ul e valid, iar coletul se livreaza la adresa de acasa
                a cumparatorului — care il asteapta intr-un punct in care nu ajunge
                niciodata. Nimic din raspunsul lor n-ar semnala nepotrivirea.
              */}
              <Button onClick={handleEmite} disabled={emitand || !aleasa || (cerePunct && !punct)}>
                {emitand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                Emite AWB
              </Button>
              <Button variant="outline" onClick={handleVerifica} disabled={verificand}>
                {verificand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Verifica la UPS
              </Button>
            </div>

            {cerePunct && !punct && (
              <p className="text-[11px] text-warning flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Comanda cere ridicare dintr-un punct UPS, dar niciun punct nu e ales. Alege unul mai sus —
                altfel coletul ar pleca la adresa de acasa a cumparatorului, fara ca nimic sa semnaleze asta.
              </p>
            )}

            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Daca emiterea pare ca a esuat, apasa <strong className="mx-1">Verifica la UPS</strong> in loc sa
              incerci din nou: UPS nu are protectie contra dublurilor, deci a doua apasare ar crea al doilea AWB,
              taxabil. Verificarea cauta dupa referinta comenzii si nu creeaza nimic.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
