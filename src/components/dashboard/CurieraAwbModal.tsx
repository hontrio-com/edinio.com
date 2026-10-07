"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, MapPin, Package, Truck, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import { createCurieraAwbAction, getCurieraEtichetaAction } from "@/lib/actions/curiera.actions";
import { GREUTATE_MAXIMA_LOCKER_KG, type DateAwbCuriera, type OptiuniAwbCuriera } from "@/lib/curiera/expediere";
import { ePunctFanbox } from "@/lib/curiera/puncte";
import { useGreutateaAwb, notaGreutate } from "@/components/dashboard/useGreutateaAwb";
import { useDialogAccesibil } from "@/components/dashboard/useDialogAccesibil";
import { liniaAdresei } from "@/lib/orders/adresa";
import { Button } from "@/components/ui/button";
import { ButonPrinteaza } from "./ButonPrinteaza";
import { dinBase64 } from "@/lib/orders/printeaza-eticheta";
import type { Database } from "@/types/database.types";
import { punctulAltuiCurier } from "@/lib/orders/punctul-altui-curier";
import { PunctAltuiCurier } from "./PunctAltuiCurier";

type Order = Database["public"]["Tables"]["orders"]["Row"];

type ShippingAddress = {
  city?: string;
  county?: string;
  address?: string;
  street?: string;
  street_no?: string;
  postal_code?: string;
  courier?: string;
  delivery_type?: string;
  locker_id?: string | number;
  locker_name?: string;
  locker_address?: string;
  /* ⚠ Localitatea, judetul si codul postal PUNCTULUI. Declarate, ca `tsc` sa vada lipsa lor:
     la punct Curiera rescrie oricum destinatia cu a punctului, iar cererea trebuie sa spuna
     acelasi lucru ca eticheta, nu orasul clientului langa id-ul unui locker din alt oras. */
  locker_city?: string;
  locker_county?: string;
  locker_post_code?: string;
};

export type { OptiuniAwbCuriera } from "@/lib/curiera/expediere";

/**
 * Numele serviciilor extra ale platformei Curiera, citite din `list_services?type=extra` pe
 * 29.09.2026. Doar pentru eticheta casutei: id-ul e cel care pleaca, iar un id necunoscut
 * aici se arata cu numarul lui, nu dispare.
 */
const NUME_EXTRA: Record<string, string> = {
  "443": "Deschidere colet la livrare",
  "616": "Retur documente",
};

/**
 * Emiterea unui AWB Curiera.
 *
 * ═══ CE E ALTFEL FATA DE CELELALTE FORMULARE DE AWB ═══
 *
 *   - **Un singur camp de adresa** (`to_address`), deci `liniaAdresei`: `to_str` ar fi pus
 *     „Str. " in fata unei linii care incepe deja cu „Strada" (masurat).
 *   - **Eticheta nu se pastreaza nicaieri.** Se cere de la Curiera la fiecare descarcare,
 *     fiindca e o citire pura; deci butonul merge si pe un AWB emis ieri.
 *   - **Fereastra ramane deschisa dupa emitere**, cu butonul de eticheta. Pagina se
 *     reimprospateaza dedesubt, ca butonul „Genereaza AWB" sa nu mai apara pe comanda.
 *   - **Anularea** sta in „Editeaza comanda", ca la ceilalti: merge numai pana la ridicare.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  optiuni?: OptiuniAwbCuriera;
  onSuccess: () => void;
};

/**
 * Invelisul care MONTEAZA formularul abia la deschidere, ca valorile initiale (adresa,
 * rambursul, greutatea) sa se calculeze din nou de fiecare data, fara efect de sincronizare.
 */
export function CurieraAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

/** Descarca PDF-ul primit in base64. */
function descarca(base64: string, nume: string): boolean {
  const octeti = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  /* ⚠ Se judeca dupa octeti, ca pe server: un „Not found" salvat ca .pdf se deschide „deteriorat". */
  if (String.fromCharCode(...octeti.subarray(0, 5)) !== "%PDF-") return false;
  const url = URL.createObjectURL(new Blob([octeti], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nume;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

function Formular({ onClose, order, businessId, optiuni, onSuccess }: Props) {
  const addr = (order.shipping_address ?? {}) as ShippingAddress;
  /* ⚠ Punctul ALTUI curier: coletul merge acasa, nu la adresa punctului (`punctul-altui-curier.ts`). */
  const punctStrain = punctulAltuiCurier(addr, (c) => c === "curiera");

  /*
   * Livrarea la punct aleasa de client in checkout.
   *
   * ⚠ Curierul se NORMALIZEAZA, ca in lot: o valoare venita cu majuscule sau cu spatii ar fi
   * trimis altfel coletul la domiciliu din fereastra si la punct din lot.
   */
  const laPunct = (addr.courier ?? "").toLowerCase().trim() === "curiera"
    && addr.delivery_type === "locker"
    && String(addr.locker_id ?? "").trim() !== "";

  const [awbEmis, setAwbEmis] = useState<string | null>(null);
  const awb = awbEmis ?? order.curiera_awb_number ?? null;
  /* AWB-ul la partener (de ex. DPD): intai cel intors de emitere, apoi cel de pe comanda. */
  const [partenerEmis, setPartenerEmis] = useState<{ nume: string; awb: string } | null>(null);
  const partener = partenerEmis ?? (order.curiera_partener_awb
    ? { nume: (order.curiera_partener ?? "").trim() || "partener", awb: order.curiera_partener_awb }
    : null);

  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: !!awb, businessId, orderId: order.id,
  });
  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);

  const [nume, setNume] = useState(order.customer_name ?? "");
  const [telefon, setTelefon] = useState(order.customer_phone ?? "");
  const [email, setEmail] = useState(order.customer_email ?? "");
  const [adresa, setAdresa] = useState(punctStrain ? punctStrain.linieAcasa : liniaAdresei(addr));
  /* ⚠ La punct: localitatea, judetul si codul postal ALE PUNCTULUI (vezi tipul de sus). */
  const [oras, setOras] = useState((laPunct ? addr.locker_city : "") || addr.city || "");
  const [judet, setJudet] = useState((laPunct ? addr.locker_county : "") || addr.county || "");
  const [codPostal, setCodPostal] = useState((laPunct ? addr.locker_post_code : "") || addr.postal_code || "");
  const [colete, setColete] = useState("1");
  const [lungime, setLungime] = useState("");
  const [latime, setLatime] = useState("");
  const [inaltime, setInaltime] = useState("");
  /*
   * Rambursul se completeaza dupa BANI, nu dupa metoda: o comanda cu plata online ramasa
   * neplatita ar pleca altfel cu ramburs zero. Ramane EDITABIL.
   */
  const [ramburs, setRamburs] = useState(() =>
    awb ? "0" : rambursDeIncasat({ payment_status: order.payment_status, total: order.total, order_source: order.order_source }).toFixed(2),
  );
  /* Asigurarea se precompleteaza DOAR cand comerciantul a cerut-o in configurare: se plateste. */
  const [asigurare, setAsigurare] = useState(() =>
    optiuni?.asigurare && Number(order.total) > 0 ? Number(order.total).toFixed(2) : "",
  );
  const extraDinConfig = optiuni?.serviciiExtra ?? [];
  /* ⚠ Numai cele alese in configurare: lista serviciilor e a CONTULUI fiecarui comerciant, iar o
     lista cablata (a contului de test) ar fi oferit casute platite pe care contul lui poate nu le are. */
  const extraDeAratat = extraDinConfig;
  const [extra, setExtra] = useState<string[]>(extraDinConfig);
  const [continut, setContinut] = useState(() => {
    const items = (Array.isArray(order.items) ? order.items : []) as { name?: string }[];
    const dinComanda = items.map((i) => i?.name).filter(Boolean).join(", ").slice(0, 100);
    return dinComanda || optiuni?.continutImplicit || "";
  });
  const [observatii, setObservatii] = useState("");

  const [creating, setCreating] = useState(false);
  const [descarcand, setDescarcand] = useState(false);

  function comutaExtra(id: string) {
    setExtra((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }

  async function handleCreate() {
    if (!nume.trim()) return toast.error("Numele destinatarului este obligatoriu");
    if (!telefon.trim()) return toast.error("Telefonul destinatarului este obligatoriu");
    if (!oras.trim() || !judet.trim()) return toast.error("Localitatea si judetul destinatarului sunt obligatorii");
    if (!laPunct && !adresa.trim()) return toast.error("Adresa destinatarului este obligatorie");
    const kg = parseFloat(weight.replace(",", "."));
    if (!Number.isFinite(kg) || kg <= 0) return toast.error("Completeaza greutatea coletului");
    const nrColete = parseInt(colete, 10);
    if (!Number.isInteger(nrColete) || nrColete < 1) return toast.error("Numarul de colete trebuie sa fie cel putin 1");
    const dim = [lungime, latime, inaltime].map((v) => parseFloat(v.replace(",", ".")));
    const cateDim = [lungime, latime, inaltime].filter((v) => v.trim() !== "").length;
    if (cateDim > 0 && (cateDim < 3 || dim.some((v) => !Number.isFinite(v) || v <= 0))) {
      return toast.error("Completeaza toate trei dimensiunile coletului, sau niciuna");
    }

    const date: DateAwbCuriera = {
      destinatar: {
        nume: nume.trim(),
        telefon: telefon.trim(),
        email: email.trim() || null,
        /* ⚠ La punct pleaca adresa PUNCTULUI: Curiera o scrie oricum pe eticheta. */
        adresa: laPunct ? (addr.locker_address ?? "").trim() || null : adresa.trim(),
        oras: oras.trim(),
        judet: judet.trim(),
        codPostal: codPostal.trim() || null,
      },
      /* ⚠ Id-ul punctului ramane SIR: `Number()` ar taia zerourile din fata unui id. */
      punctId: laPunct ? String(addr.locker_id).trim() : null,
      /* ⚠ Dulapul FANbox primeste un singur colet de cel mult 30 kg; serverul refuza altfel. */
      punctLocker: laPunct && ePunctFanbox(addr.locker_name),
      greutateKg: kg,
      colete: nrColete,
      dimensiuni: cateDim === 3 ? { lungime: dim[0], latime: dim[1], inaltime: dim[2] } : null,
      ramburs: parseFloat(ramburs.replace(",", ".")) || 0,
      valoareAsigurata: parseFloat(asigurare.replace(",", ".")) || null,
      continut: continut.trim() || null,
      observatii: observatii.trim() || null,
      serviciiExtra: extra,
    };

    /*
     * ⚠ `finally`, si in `try` DOAR apelul (forma eColet). O actiune care ARUNCA (desfasurare
     * in curs, retea cazuta) ar lasa altfel butonul invartindu-se, iar ramificarea tinuta
     * inauntru ar fi scos mesajul de nesiguranta pentru un AWB care CHIAR plecase.
     */
    setCreating(true);
    let r: Awaited<ReturnType<typeof createCurieraAwbAction>>;
    try {
      r = await createCurieraAwbAction(businessId, order.id, date);
    } catch (e) {
      /* ⚠ Nu stim daca expedierea a plecat, deci NU se spune „a esuat". */
      toast.error(
        "Curiera nu a raspuns, deci nu stim daca AWB-ul a plecat. Verifica in contul Curiera inainte sa incerci din nou: "
        + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"),
        { duration: 14000 },
      );
      return;
    } finally {
      setCreating(false);
    }

    if ("error" in r) {
      toast.error(r.error, { duration: 12000 });
      return;
    }

    for (const av of r.avertismente) toast.warning(av, { duration: 14000 });
    setAwbEmis(r.awb);
    setPartenerEmis(r.partener);
    toast.success(`AWB Curiera ${r.awb} emis${r.partener ? ` (AWB ${r.partener.nume}: ${r.partener.awb})` : ""}`);
    /* Pagina se reimprospateaza dedesubt; fereastra ramane, cu butonul de eticheta. */
    onSuccess();
  }

  async function handleEticheta() {
    setDescarcand(true);
    let r: Awaited<ReturnType<typeof getCurieraEtichetaAction>>;
    try {
      r = await getCurieraEtichetaAction(businessId, order.id);
    } catch (e) {
      /* ⚠ O CITIRE: la Curiera nu s-a schimbat nimic, deci nu se trimite nimeni sa verifice. */
      toast.error(
        "Eticheta nu s-a putut cere de la Curiera: "
        + (e instanceof Error ? e.message : "cererea nu a ajuns la capat"),
        { duration: 12000 },
      );
      return;
    } finally {
      setDescarcand(false);
    }

    if (!r.ok) return toast.error(r.error, { duration: 12000 });
    if (!descarca(r.base64, r.nume || `eticheta-curiera-${awb}.pdf`)) {
      toast.error("Curiera nu a trimis un PDF. Incearca din nou peste cateva minute.");
      return;
    }
    if (r.avertisment) toast.warning(r.avertisment, { duration: 12000 });
  }

  /* ⚠ Vezi `useDialogAccesibil`: Escape inchide, focusul ramane inauntru si se intoarce de
     unde a plecat. `true`, nu un prop: fereastra e montata doar cat timp e deschisa. */
  const cutiaDialogului = useDialogAccesibil(true, onClose);

  const campClasa = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={cutiaDialogului}
        role="dialog"
        aria-modal="true"
        aria-label="Genereaza AWB Curiera"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background p-5 shadow-xl focus:outline-none">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Truck className="h-5 w-5" />
              Genereaza AWB Curiera
            </h2>
            <p className="text-xs text-muted-foreground">
              Comanda {order.order_number} · {order.customer_name}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Inchide" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {awb ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-success/20 bg-success/5 p-3">
              <p className="text-xs text-muted-foreground">Numar AWB</p>
              <p className="font-mono text-sm font-semibold text-foreground">{awb}</p>
              {partener && (
                <p className="mt-1 text-xs text-muted-foreground">
                  AWB {partener.nume}: <span className="font-mono font-semibold text-foreground">{partener.awb}</span>
                </p>
              )}
              {order.curiera_status_label && (
                <p className="mt-1 text-xs text-muted-foreground">Stare la curier: {order.curiera_status_label}</p>
              )}
            </div>

            <Button onClick={handleEticheta} disabled={descarcand} className="w-full">
              {descarcand ? <Loader2 className="animate-spin" /> : <Download className="h-4 w-4" />}
              Descarca eticheta
            </Button>
            <ButonPrinteaza
              className="w-full"
              aduce={async () => {
                const r = await getCurieraEtichetaAction(businessId, order.id);
                if (!r.ok) return r.error;
                if (r.avertisment) toast.warning(r.avertisment, { duration: 12000 });
                return dinBase64(r.base64);
              }}
            >
              Printeaza eticheta
            </ButonPrinteaza>

            <p className="text-xs text-muted-foreground">
              Eticheta se cere de la Curiera la fiecare descarcare, deci o poti lua oricand din
              comanda.
              {" Pentru anulare, deschide „Editeaza comanda”: Curiera anuleaza doar pana cand curierul ridica coletul."}
            </p>

            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={onClose}>Inchide</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <PunctAltuiCurier punct={punctStrain} curier="Curiera" />
            {laPunct && (
              <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info/5 p-3 text-xs">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                <div>
                  <p className="font-semibold text-foreground">Livrare la punct de ridicare</p>
                  <p className="text-muted-foreground">
                    {addr.locker_name || `Punctul ${addr.locker_id}`}
                    {addr.locker_city ? ` · ${addr.locker_city}` : ""}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {ePunctFanbox(addr.locker_name) ? `Locker FANbox: un singur colet, de cel mult ${GREUTATE_MAXIMA_LOCKER_KG} kg. ` : ""}
                    Clientul ridica singur coletul de acolo. Localitatea si judetul de mai jos sunt ale punctului.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Nume destinatar *</span>
                <input className={campClasa} value={nume} onChange={(e) => setNume(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Telefon *</span>
                <input className={campClasa} value={telefon} onChange={(e) => setTelefon(e.target.value)} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-muted-foreground">Email</span>
                <input className={campClasa} value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              {!laPunct && (
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted-foreground">Adresa (strada, numar, bloc) *</span>
                  <input className={campClasa} value={adresa} onChange={(e) => setAdresa(e.target.value)} />
                </label>
              )}
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Localitate *</span>
                <input className={campClasa} value={oras} onChange={(e) => setOras(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Judet *</span>
                <input className={campClasa} value={judet} onChange={(e) => setJudet(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Cod postal</span>
                <input className={campClasa} value={codPostal} onChange={(e) => setCodPostal(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Greutate (kg) *</span>
                <input inputMode="decimal" className={campClasa} value={weight} onChange={(e) => setWeight(e.target.value)} />
              </label>
              {nota && <p className="text-xs text-warning sm:col-span-2">{nota}</p>}
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Numar de colete</span>
                <input type="number" min={1} className={campClasa} value={colete} onChange={(e) => setColete(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Ramburs (lei)</span>
                <input type="number" step="0.01" min={0} className={campClasa} value={ramburs} onChange={(e) => setRamburs(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Valoare asigurata (lei)</span>
                <input type="number" step="0.01" min={0} placeholder="fara asigurare" className={campClasa} value={asigurare} onChange={(e) => setAsigurare(e.target.value)} />
              </label>
            </div>

            <div>
              <p className="mb-1 text-xs text-muted-foreground">Dimensiunile unui colet, in cm (optional: toate trei sau niciuna)</p>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs">
                  <span className="mb-1 block text-muted-foreground">Lungime</span>
                  <input type="number" min={0} className={campClasa} value={lungime} onChange={(e) => setLungime(e.target.value)} />
                </label>
                <label className="text-xs">
                  <span className="mb-1 block text-muted-foreground">Latime</span>
                  <input type="number" min={0} className={campClasa} value={latime} onChange={(e) => setLatime(e.target.value)} />
                </label>
                <label className="text-xs">
                  <span className="mb-1 block text-muted-foreground">Inaltime</span>
                  <input type="number" min={0} className={campClasa} value={inaltime} onChange={(e) => setInaltime(e.target.value)} />
                </label>
              </div>
            </div>

            {/* Cele alese in configurare vin bifate; aici se pot scoate pentru un singur colet. */}
            {extraDeAratat.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Servicii extra (se platesc per colet)</p>
                {extraDeAratat.map((id) => (
                  <label key={id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-border accent-primary"
                      checked={extra.includes(id)}
                      onChange={() => comutaExtra(id)}
                    />
                    <span>{NUME_EXTRA[id] ?? `Serviciul extra ${id}`}</span>
                  </label>
                ))}
              </div>
            ) : null}

            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Continut</span>
              <input maxLength={255} className={campClasa} value={continut} onChange={(e) => setContinut(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Observatii pentru curier</span>
              <input className={campClasa} value={observatii} onChange={(e) => setObservatii(e.target.value)} />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={creating}>Renunta</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="animate-spin" /> : <Package className="h-4 w-4" />}
                {creating ? "Se genereaza..." : "Genereaza AWB"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
