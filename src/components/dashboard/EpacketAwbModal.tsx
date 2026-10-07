"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Link2, Loader2, MapPin, Package, RefreshCw, Search, Truck, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import {
  cautaLocalitatiEpacketAction,
  codPostalEpacketAction,
  createEpacketAwbAction,
  getEpacketEtichetaAction,
  leagaAwbEpacketAction,
  pregatesteAwbEpacketAction,
  tarifeEpacketAction,
  type PregatireAwbEpacket,
} from "@/lib/actions/epacket.actions";
import {
  CURIERI_DE_TEST, CURIERI_EPACKET, NUME_CURIER_EPACKET,
  type CurierEpacket, type LocalitateEpacket, type OfertaEpacket,
} from "@/lib/epacket/client";
import { coleteEgale, type ColetEpacket, type DateAwbEpacket, type OptiuniAwbEpacket } from "@/lib/epacket/expediere";
import { JUDETE, codAutoAlJudetului } from "@/lib/ro/judete";
import { useGreutateaAwb, notaGreutate } from "@/components/dashboard/useGreutateaAwb";
import { useDialogAccesibil } from "@/components/dashboard/useDialogAccesibil";
import { Button } from "@/components/ui/button";
import { ButonPrinteaza } from "./ButonPrinteaza";
import { dinBase64 } from "@/lib/orders/printeaza-eticheta";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

export type { OptiuniAwbEpacket } from "@/lib/epacket/expediere";

const JUDETE_CU_COD = JUDETE.map((j) => ({ nume: j, cod: codAutoAlJudetului(j) ?? "" })).filter((j) => j.cod);

/**
 * Emiterea unui AWB e-packet.
 *
 * ═══ CE E ALTFEL FATA DE CELELALTE FERESTRE ═══
 *
 *   - **Localitatea se ALEGE din nomenclatorul lor** (`locality_id`), nu se scrie. Fereastra o
 *     potriveste singura (93% din comenzile reale, masurat); altfel arata lista din care alege omul.
 *   - **Codul postal e obligatoriu la ei**, iar checkoutul nu-l cere: se propune din punctele
 *     localitatii si se spune de unde vine.
 *   - **Adresa pleaca in campuri separate** (strada, numar, bloc...), despartita pe server.
 *   - **Tarifele tuturor curierilor** se vad pe loc, iar curierul se poate schimba la adresa.
 *   - **AWB-ul nu se poate anula prin API** si fiecare emitere TAXEAZA: un raspuns pierdut nu se
 *     reincearca orb. Supapa e „AWB-ul exista deja in aplicatia e-packet”: se leaga, verificat.
 *   - **Eticheta nu se pastreaza nicaieri**: se cere de la ei la fiecare descarcare.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  optiuni?: OptiuniAwbEpacket;
  onSuccess: () => void;
};

/** Monteaza formularul abia la deschidere, ca valorile initiale sa se calculeze din nou. */
export function EpacketAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

function descarca(base64: string, nume: string): boolean {
  const octeti = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  /* ⚠ Se judeca dupa octeti, ca pe server: un raspuns de eroare salvat ca .pdf se deschide „deteriorat". */
  if (String.fromCharCode(...octeti.subarray(0, 5)) !== "%PDF-") return false;
  const url = URL.createObjectURL(new Blob([octeti], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nume;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

function numar(v: string): number {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const lei = (n: number) => `${n.toFixed(2).replace(".", ",")} lei`;

function Formular({ onClose, order, businessId, optiuni, onSuccess }: Props) {
  const [awbEmis, setAwbEmis] = useState<{ awb: string; curier: string; pret: number | null; test: boolean; ridicare: string | null } | null>(null);
  const awb = awbEmis?.awb ?? order.epacket_awb_number ?? null;
  const curierAwb = awbEmis?.curier ?? order.epacket_curier ?? null;
  const testAwb = awbEmis?.test ?? order.epacket_test === true;

  const [pregatire, setPregatire] = useState<PregatireAwbEpacket | null>(null);
  const [eroarePregatire, setEroarePregatire] = useState<string | null>(null);

  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: !!awb, businessId, orderId: order.id,
  });
  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);

  const [prenume, setPrenume] = useState("");
  const [nume, setNume] = useState("");
  const [telefon, setTelefon] = useState(order.customer_phone ?? "");
  const emailComanda = (order.customer_email ?? "").trim();
  const [email, setEmail] = useState(emailComanda || optiuni?.emailRezerva || "");
  const [localitate, setLocalitate] = useState<LocalitateEpacket | null>(null);
  const [candidati, setCandidati] = useState<LocalitateEpacket[]>([]);
  const [motivLocalitate, setMotivLocalitate] = useState("");
  const [cautare, setCautare] = useState("");
  const [judetCautare, setJudetCautare] = useState(codAutoAlJudetului((order.shipping_address as { county?: string } | null)?.county) ?? "");
  const [caut, setCaut] = useState(false);
  const [codPostal, setCodPostal] = useState("");
  const [sursaCod, setSursaCod] = useState<"comanda" | "localitate" | null>(null);
  const [strada, setStrada] = useState("");
  const [numarStrada, setNumarStrada] = useState("");
  const [bloc, setBloc] = useState("");
  const [scara, setScara] = useState("");
  const [etaj, setEtaj] = useState("");
  const [apartament, setApartament] = useState("");

  const [curier, setCurier] = useState<CurierEpacket>(optiuni?.curierAdresa ?? "DPD");
  const [tipColet, setTipColet] = useState<"parcel" | "envelope">("parcel");
  const [colete, setColete] = useState("1");
  const dim = optiuni?.dimensiuni ?? { lungime: 30, latime: 20, inaltime: 10 };
  const [lungime, setLungime] = useState(String(dim.lungime));
  const [latime, setLatime] = useState(String(dim.latime));
  const [inaltime, setInaltime] = useState(String(dim.inaltime));
  /* Rambursul se completeaza dupa BANI, nu dupa metoda (vezi `rambursDeIncasat`); ramane editabil. */
  const [ramburs, setRamburs] = useState(() =>
    awb ? "0" : rambursDeIncasat({ payment_status: order.payment_status, total: order.total, order_source: order.order_source }).toFixed(2),
  );
  const [asigurare, setAsigurare] = useState(() =>
    optiuni?.asigurare && Number(order.total) > 0 ? Number(order.total).toFixed(2) : "",
  );
  const [deschidere, setDeschidere] = useState(optiuni?.deschidere === true);
  const [continut, setContinut] = useState(() => {
    const items = (Array.isArray(order.items) ? order.items : []) as { name?: string }[];
    const dinComanda = items.map((i) => i?.name).filter(Boolean).join(", ").slice(0, 50);
    return dinComanda || optiuni?.continutImplicit || "";
  });

  const [oferte, setOferte] = useState<OfertaEpacket[] | null>(null);
  const [cotez, setCotez] = useState(false);
  const [creating, setCreating] = useState(false);
  const [descarcand, setDescarcand] = useState(false);
  const [awbLegat, setAwbLegat] = useState("");
  const [leg, setLeg] = useState(false);

  const punct = pregatire?.punct ?? null;
  const punctStrain = pregatire?.punctStrain ?? null;
  const tip: "D2D" | "D2L" = punct ? "D2L" : "D2D";
  const curierEfectiv: CurierEpacket = punct ? punct.curier : curier;

  /* Pregatirea: o singura data la deschidere, si numai fara AWB. Doar CITIRI pe server. */
  useEffect(() => {
    if (awb) return;
    let anulat = false;
    pregatesteAwbEpacketAction(businessId, order.id).then((r) => {
      if (anulat) return;
      if (!r.ok) { setEroarePregatire(r.error); return; }
      const p = r.pregatire;
      setPregatire(p);
      setPrenume(p.prenume);
      setNume(p.nume);
      setStrada(p.adresa.strada);
      setNumarStrada(p.adresa.numar);
      setBloc(p.adresa.bloc);
      setScara(p.adresa.scara);
      setEtaj(p.adresa.etaj);
      setApartament(p.adresa.apartament);
      if (p.localitate.fel === "gasita") setLocalitate(p.localitate.localitate);
      else { setCandidati(p.localitate.candidati); setMotivLocalitate(p.localitate.motiv); }
      if (p.codPostal) { setCodPostal(p.codPostal.cod); setSursaCod(p.codPostal.sursa); }
    }).catch((e) => { if (!anulat) setEroarePregatire(e instanceof Error ? e.message : "pregatirea nu a mers"); });
    return () => { anulat = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function colet(): ColetEpacket[] {
    return coleteEgale(numar(weight), punct ? 1 : parseInt(colete, 10) || 1, { lungime: numar(lungime), latime: numar(latime), inaltime: numar(inaltime) });
  }

  async function handleCauta() {
    if (cautare.trim().length < 2 || !judetCautare) return toast.error("Alege judetul si scrie cel putin doua litere");
    setCaut(true);
    try {
      const r = await cautaLocalitatiEpacketAction(businessId, cautare.trim(), judetCautare);
      if (!r.ok) return toast.error(r.error);
      setCandidati(r.localitati);
      if (r.localitati.length === 0) toast.error("Nicio localitate cu numele asta in judet");
    } catch (e) {
      toast.error("Cautarea nu a mers: " + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"));
    } finally {
      setCaut(false);
    }
  }

  async function alegeLocalitatea(l: LocalitateEpacket) {
    setLocalitate(l);
    setCandidati([]);
    setOferte(null);
    /* Codul scris de om ramane; cel dedus din alta localitate nu mai e bun. */
    if (sursaCod === "comanda") return;
    setCodPostal("");
    setSursaCod(null);
    try {
      const r = await codPostalEpacketAction(businessId, order.id, l.id);
      if (r.ok && r.codPostal) { setCodPostal(r.codPostal.cod); setSursaCod(r.codPostal.sursa); }
    } catch {
      /* Fara propunere, omul scrie codul. */
    }
  }

  async function handleTarife() {
    /* La punct, tariful se cere pe localitatea comenzii, daca o stim (punctul e in ea). */
    const loc = localitate?.id;
    if (!loc) return toast.error("Alege intai localitatea destinatarului");
    if (!(numar(weight) > 0)) return toast.error("Completeaza greutatea");
    setCotez(true);
    try {
      const r = await tarifeEpacketAction(businessId, order.id, {
        localitateId: loc, tip, tipColet, colete: colet(),
        ramburs: numar(ramburs), asigurare: numar(asigurare), deschidere: tip === "D2D" && deschidere,
      });
      if (!r.ok) return toast.error(r.error, { duration: 10000 });
      setOferte(r.oferte.filter((o) => o.tip === tip));
    } catch (e) {
      toast.error("Tarifele nu s-au putut cere: " + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"));
    } finally {
      setCotez(false);
    }
  }

  async function handleCreate() {
    if (!(numar(weight) > 0)) return toast.error("Completeaza greutatea coletului");
    if (tip === "D2D" && !localitate) return toast.error("Alege localitatea destinatarului din lista e-packet");
    const date: DateAwbEpacket = {
      curier: curierEfectiv,
      tip,
      destinatar: {
        prenume: prenume.trim(), nume: nume.trim(), telefon: telefon.trim(), email: email.trim(),
        localitateId: tip === "D2D" ? localitate?.id ?? null : null,
        codPostal: codPostal.trim(), strada: strada.trim(), numar: numarStrada.trim(),
        bloc: bloc.trim(), scara: scara.trim(), etaj: etaj.trim(), apartament: apartament.trim(),
      },
      punctId: punct?.id ?? null,
      tipColet,
      colete: tipColet === "envelope" ? [{ greutate: numar(weight) }] : colet(),
      continut: continut.trim(),
      ramburs: numar(ramburs),
      asigurare: numar(asigurare),
      deschidere: tip === "D2D" && tipColet === "parcel" && deschidere,
    };

    /*
     * ⚠ `finally`, si in `try` DOAR apelul: o actiune care ARUNCA (desfasurare in curs, retea
     * cazuta) ar lasa altfel butonul invartindu-se.
     */
    setCreating(true);
    let r: Awaited<ReturnType<typeof createEpacketAwbAction>>;
    try {
      r = await createEpacketAwbAction(businessId, order.id, date);
    } catch (e) {
      /* ⚠ Nu stim daca AWB-ul s-a creat (si s-a TAXAT), deci NU se spune „a esuat". */
      toast.error(
        "e-packet nu a raspuns, deci nu stim daca AWB-ul s-a creat. NU apasa din nou: verifica in aplicatia e-packet, "
        + "iar daca il gasesti, leaga-l mai jos. " + (e instanceof Error ? e.message : ""),
        { duration: 16000 },
      );
      return;
    } finally {
      setCreating(false);
    }

    if ("error" in r) {
      toast.error(r.error, { duration: 14000 });
      return;
    }
    for (const av of r.avertismente) toast.warning(av, { duration: 14000 });
    const ridicare = r.ridicare?.ceruta && r.ridicare.de
      ? `Ridicare comandata: ${new Date(r.ridicare.de).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })}${r.ridicare.pana ? ` - ${new Date(r.ridicare.pana).toLocaleTimeString("ro-RO", { timeStyle: "short" })}` : ""}`
      : null;
    setAwbEmis({ awb: r.awb, curier: r.curier, pret: r.pret, test: r.test, ridicare });
    toast.success(`AWB ${NUME_CURIER_EPACKET[r.curier as CurierEpacket] ?? r.curier} ${r.awb} emis prin e-packet${r.pret !== null && !r.test ? ` (${lei(r.pret)})` : ""}`);
    onSuccess();
  }

  async function handleLeaga() {
    if (!awbLegat.trim()) return toast.error("Scrie numarul AWB din aplicatia e-packet");
    setLeg(true);
    try {
      const r = await leagaAwbEpacketAction(businessId, order.id, awbLegat.trim());
      if (!r.ok) return toast.error(r.error, { duration: 12000 });
      toast.success(r.mesaj);
      setAwbEmis({ awb: r.awb, curier: "", pret: null, test: optiuni?.test === true, ridicare: null });
      onSuccess();
    } catch (e) {
      toast.error("Legarea nu a mers: " + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"));
    } finally {
      setLeg(false);
    }
  }

  async function handleEticheta() {
    setDescarcand(true);
    let r: Awaited<ReturnType<typeof getEpacketEtichetaAction>>;
    try {
      r = await getEpacketEtichetaAction(businessId, order.id);
    } catch (e) {
      toast.error("Eticheta nu s-a putut cere de la e-packet: " + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"), { duration: 12000 });
      return;
    } finally {
      setDescarcand(false);
    }
    if (!r.ok) return toast.error(r.error, { duration: 12000 });
    if (!descarca(r.base64, r.nume || `eticheta-epacket-${awb}.pdf`)) {
      toast.error("e-packet nu a trimis un PDF. Incearca din nou peste cateva minute.");
      return;
    }
    if (r.avertisment) toast.warning(r.avertisment, { duration: 12000 });
  }

  const cutiaDialogului = useDialogAccesibil(true, onClose);
  const campClasa = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
  const ofertaAleasa = oferte?.find((o) => o.curier === curierEfectiv) ?? null;
  const testCurierRefuzat = optiuni?.test && !CURIERI_DE_TEST.includes(curierEfectiv);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={cutiaDialogului}
        role="dialog"
        aria-modal="true"
        aria-label="Genereaza AWB e-packet"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-background p-5 shadow-xl focus:outline-none">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Truck className="h-5 w-5" />
              Genereaza AWB e-packet
            </h2>
            <p className="text-xs text-muted-foreground">Comanda {order.order_number} · {order.customer_name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Inchide" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {awb ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-success/20 bg-success/5 p-3">
              <p className="text-xs text-muted-foreground">
                Numar AWB{curierAwb ? ` ${NUME_CURIER_EPACKET[curierAwb as CurierEpacket] ?? curierAwb}` : ""}
              </p>
              <p className="font-mono text-sm font-semibold text-foreground">{awb}</p>
              {awbEmis?.pret != null && !testAwb && <p className="mt-1 text-xs text-muted-foreground">Taxat din credit: {lei(awbEmis.pret)}</p>}
              {awbEmis?.ridicare && <p className="mt-1 text-xs text-muted-foreground">{awbEmis.ridicare}</p>}
              {order.epacket_status_label && <p className="mt-1 text-xs text-muted-foreground">Stare la curier: {order.epacket_status_label}</p>}
              {testAwb && (
                <p className="mt-1 text-xs font-medium text-warning">AWB DE TEST: nu pleaca la curier si nu se taxeaza.</p>
              )}
            </div>
            <Button onClick={handleEticheta} disabled={descarcand} className="w-full">
              {descarcand ? <Loader2 className="animate-spin" /> : <Download className="h-4 w-4" />}
              Descarca eticheta
            </Button>
            <ButonPrinteaza
              className="w-full"
              aduce={async () => {
                const r = await getEpacketEtichetaAction(businessId, order.id);
                if (!r.ok) return r.error;
                if (r.avertisment) toast.warning(r.avertisment, { duration: 12000 });
                return dinBase64(r.base64);
              }}
            >
              Printeaza eticheta
            </ButonPrinteaza>
            <p className="text-xs text-muted-foreground">
              Eticheta se cere de la e-packet la fiecare descarcare, deci o poti lua oricand din comanda. AWB-ul nu se poate
              anula din Edinio: anularea se cere la e-packet (contact@e-packet.ro, 0371 236 562).
            </p>
            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={onClose}>Inchide</Button>
            </div>
          </div>
        ) : eroarePregatire ? (
          <div className="space-y-3">
            <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{eroarePregatire}</p>
            <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Inchide</Button></div>
          </div>
        ) : !pregatire ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Caut localitatea si codul postal la e-packet...
          </div>
        ) : (
          <div className="space-y-4">
            {optiuni?.test && (
              <p className="rounded-lg border border-warning/30 bg-warning/5 p-2 text-xs text-foreground">
                Cheie de TEST: AWB-ul se face in mediul de test DPD sau Sameday, nu pleaca la nimeni si nu se taxeaza.
              </p>
            )}

            {punct ? (
              <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info/5 p-3 text-xs">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                <div>
                  <p className="font-semibold text-foreground">Livrare la locker {NUME_CURIER_EPACKET[punct.curier]}</p>
                  <p className="text-muted-foreground">{punct.nume}</p>
                  <p className="mt-1 text-muted-foreground">Un singur colet. Clientul ridica singur coletul de acolo.</p>
                </div>
              </div>
            ) : (
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Curier</span>
                <select className={campClasa} value={curier} onChange={(e) => { setCurier(e.target.value as CurierEpacket); }}>
                  {CURIERI_EPACKET.map((c) => <option key={c} value={c}>{NUME_CURIER_EPACKET[c]}</option>)}
                </select>
              </label>
            )}
            {testCurierRefuzat && (
              <p className="text-xs text-warning">Cu cheia de test merg doar DPD si Sameday.</p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Prenume * (3-25)</span>
                <input className={campClasa} value={prenume} maxLength={25} onChange={(e) => setPrenume(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Nume * (3-25)</span>
                <input className={campClasa} value={nume} maxLength={25} onChange={(e) => setNume(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Telefon *</span>
                <input className={campClasa} value={telefon} onChange={(e) => setTelefon(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Email *</span>
                <input className={campClasa} value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              {!emailComanda && email && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Comanda n-are email, iar e-packet il cere: am pus emailul magazinului. Notificarile curierului ajung atunci la tine.
                </p>
              )}
            </div>

            {/* ⚠ Punctul ALTUI curier: e-packet nu-l poate folosi, deci coletul merge acasa. Fara
                asta, adresa punctului ar fi ajuns pe AWB ca adresa clientului (`livrareaComenzii`). */}
            {punctStrain && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-foreground">
                <p className="font-semibold">Clientul a ales in checkout {punctStrain.numePunct} ({punctStrain.curierPunct}).</p>
                <p className="mt-1">
                  e-packet nu livreaza in punctele altui curier: AWB-ul de aici duce coletul ACASA la client, la adresa de mai jos.{" "}
                  {punctStrain.linieAcasa
                    ? "Am pus adresa de acasa scrisa de el in checkout; verific-o."
                    : "Clientul n-a scris o adresa de acasa: afl-o de la el inainte sa emiti."}
                </p>
              </div>
            )}

            {!punct && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">Adresa de livrare</p>
                {localitate ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">Localitate: <span className="font-medium">{localitate.afisare}</span></p>
                    <Button variant="outline" size="sm" onClick={() => { setLocalitate(null); setOferte(null); }}>Schimba</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {motivLocalitate && <p className="text-xs text-warning">Alege localitatea: {motivLocalitate}.</p>}
                    {candidati.length > 0 && (
                      <ul className="max-h-48 overflow-y-auto rounded-md border border-border">
                        {candidati.map((l) => (
                          <li key={l.id}>
                            <button type="button" onClick={() => void alegeLocalitatea(l)} className="w-full px-3 py-2 text-left text-sm hover:bg-muted">
                              {l.afisare}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <select value={judetCautare} onChange={(e) => setJudetCautare(e.target.value)} className={campClasa} aria-label="Judetul">
                        <option value="">Judetul</option>
                        {JUDETE_CU_COD.map((j) => <option key={j.cod} value={j.cod}>{j.nume}</option>)}
                      </select>
                      <input className={campClasa} value={cautare} placeholder="Localitatea" onChange={(e) => setCautare(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCauta(); } }} />
                      <Button variant="outline" onClick={handleCauta} disabled={caut}>
                        {caut ? <Loader2 className="animate-spin" /> : <Search className="h-4 w-4" />} Cauta
                      </Button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="col-span-2 text-sm">
                    <span className="mb-1 block text-muted-foreground">Strada * (max. 50)</span>
                    <input className={campClasa} value={strada} maxLength={50} onChange={(e) => setStrada(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted-foreground">Numar *</span>
                    <input className={campClasa} value={numarStrada} maxLength={10} placeholder="FN" onChange={(e) => setNumarStrada(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted-foreground">Cod postal *</span>
                    <input className={campClasa} value={codPostal} maxLength={6} inputMode="numeric"
                      onChange={(e) => { setCodPostal(e.target.value); setSursaCod("comanda"); }} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted-foreground">Bloc</span>
                    <input className={campClasa} value={bloc} maxLength={30} onChange={(e) => setBloc(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted-foreground">Scara</span>
                    <input className={campClasa} value={scara} maxLength={10} onChange={(e) => setScara(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted-foreground">Etaj</span>
                    <input className={campClasa} value={etaj} maxLength={10} onChange={(e) => setEtaj(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted-foreground">Ap.</span>
                    <input className={campClasa} value={apartament} maxLength={10} onChange={(e) => setApartament(e.target.value)} />
                  </label>
                </div>
                {sursaCod === "localitate" && (
                  <p className="text-xs text-muted-foreground">
                    Codul postal e al localitatii (din punctele curierilor), fiindca comanda nu are unul. Daca il stii pe al strazii, scrie-l.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {punctStrain
                    ? `Adresa de acasa din comanda: ${punctStrain.linieAcasa || "nescrisa"}`
                    : `Adresa din comanda: ${(order.shipping_address as { address?: string } | null)?.address ?? ""}`}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Tip</span>
                <select className={campClasa} value={tipColet} onChange={(e) => { setTipColet(e.target.value as "parcel" | "envelope"); setOferte(null); }}>
                  <option value="parcel">Colet</option>
                  {!punct && <option value="envelope">Plic (max. 0,5 kg)</option>}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Greutate (kg) *</span>
                <input inputMode="decimal" className={campClasa} value={weight} onChange={(e) => { setWeight(e.target.value); setOferte(null); }} />
              </label>
              {tipColet === "parcel" && (
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Colete</span>
                  <input type="number" min={1} max={punct ? 1 : 50} className={campClasa} value={punct ? "1" : colete} disabled={!!punct}
                    onChange={(e) => { setColete(e.target.value); setOferte(null); }} />
                </label>
              )}
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Ramburs (lei)</span>
                <input type="number" step="0.01" min={0} className={campClasa} value={ramburs} onChange={(e) => { setRamburs(e.target.value); setOferte(null); }} />
              </label>
            </div>
            {nota && <p className="text-xs text-warning">{nota}</p>}
            {numar(ramburs) > 0 && optiuni && !optiuni.rambursGata && (
              <p className="text-xs text-destructive">Contul de ramburs nu e completat in configurarea e-packet: AWB-ul cu ramburs va fi refuzat.</p>
            )}

            {tipColet === "parcel" && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Dimensiunile unui colet, in cm (obligatorii la e-packet)</p>
                <div className="grid grid-cols-3 gap-2">
                  <input aria-label="Lungime" inputMode="decimal" className={campClasa} value={lungime} onChange={(e) => { setLungime(e.target.value); setOferte(null); }} />
                  <input aria-label="Latime" inputMode="decimal" className={campClasa} value={latime} onChange={(e) => { setLatime(e.target.value); setOferte(null); }} />
                  <input aria-label="Inaltime" inputMode="decimal" className={campClasa} value={inaltime} onChange={(e) => { setInaltime(e.target.value); setOferte(null); }} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Valoare asigurata (lei)</span>
                <input type="number" step="0.01" min={0} placeholder="fara asigurare" className={campClasa} value={asigurare}
                  onChange={(e) => { setAsigurare(e.target.value); setOferte(null); }} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Continut * (max. 50)</span>
                <input maxLength={50} className={campClasa} value={continut} onChange={(e) => setContinut(e.target.value)} />
              </label>
            </div>
            {!punct && tipColet === "parcel" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded border-border accent-primary" checked={deschidere}
                  onChange={(e) => { setDeschidere(e.target.checked); setOferte(null); }} />
                Deschiderea coletului la livrare {curier === "DPD" ? "(la DPD doar cu ramburs)" : curier === "FCR" ? "(FAN Courier n-o ofera)" : ""}
              </label>
            )}

            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Tarife</p>
                <Button variant="outline" size="sm" onClick={handleTarife} disabled={cotez}>
                  {cotez ? <Loader2 className="animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {oferte ? "Recalculeaza" : "Vezi tarifele"}
                </Button>
              </div>
              {oferte && (
                <ul className="space-y-1">
                  {oferte.map((o) => (
                    <li key={`${o.curier}-${o.tip}`}>
                      <button type="button" disabled={!o.disponibil || !!punct}
                        onClick={() => setCurier(o.curier)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm ${o.curier === curierEfectiv ? "bg-primary/10 font-medium" : "hover:bg-muted"} disabled:cursor-default disabled:opacity-60`}>
                        <span>{NUME_CURIER_EPACKET[o.curier]}</span>
                        <span>{o.disponibil && o.pret !== null ? lei(o.pret) : o.motiv || "indisponibil"}</span>
                      </button>
                    </li>
                  ))}
                  {oferte.length === 0 && <li className="text-xs text-muted-foreground">Niciun curier nu ofera tarif pentru expedierea asta.</li>}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Pretul final, cu TVA, din creditul e-packet. E o estimare: AWB-ul se taxeaza la pretul din clipa emiterii.
                {optiuni?.test ? " Cu cheia de test tarifele Sameday nu sunt reale." : ""}
              </p>
              {ofertaAleasa && !ofertaAleasa.disponibil && (
                <p className="text-xs text-warning">{NUME_CURIER_EPACKET[curierEfectiv]} nu ofera tarif pentru expedierea asta: alege alt curier.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={creating}>Renunta</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="animate-spin" /> : <Package className="h-4 w-4" />}
                {creating ? "Se genereaza..." : `Genereaza AWB ${NUME_CURIER_EPACKET[curierEfectiv]}`}
              </Button>
            </div>

            <details className="rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">AWB-ul exista deja in aplicatia e-packet?</summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Daca emiterea a ramas fara raspuns si AWB-ul apare in aplicatia e-packet, leaga-l aici in loc sa emiti altul
                (fiecare emitere se taxeaza, iar AWB-urile nu se anuleaza prin API). Numarul se verifica la e-packet.
              </p>
              <div className="mt-2 flex gap-2">
                <input className={campClasa} value={awbLegat} placeholder="Numarul AWB" onChange={(e) => setAwbLegat(e.target.value)} />
                <Button variant="outline" onClick={handleLeaga} disabled={leg}>
                  {leg ? <Loader2 className="animate-spin" /> : <Link2 className="h-4 w-4" />} Leaga
                </Button>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
