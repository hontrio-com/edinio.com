"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Loader2, Package, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import { createGlsAwbAction, type DateAwbGls } from "@/lib/actions/gls.actions";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

type ShippingAddress = {
  name?: string;
  city?: string;
  county?: string;
  address?: string;
  street?: string;
  street_no?: string;
  postal_code?: string;
  country?: string;
  courier?: string;
  delivery_type?: string;
  locker_id?: string;
  locker_name?: string;
};

/**
 * Emiterea AWB-ului GLS dintr-o comanda.
 *
 * ═══ ⚠ ETICHETA SE DESCARCA ACUM, NU MAI TARZIU ═══
 *
 * MyGLS intoarce PDF-ul o SINGURA data, la creare. Nu exista „retipareste": a
 * chema iar `PrintLabels` ar crea un al DOILEA colet, real si facturat.
 *
 * De aceea eticheta se descarca automat imediat ce AWB-ul e emis, si modalul
 * ramane deschis cu butonul de descarcare cat timp e in memorie. Daca pagina se
 * reincarca, PDF-ul se pierde — iar coletul exista deja, deci NU se reemite.
 *
 * ⚠ GLS nu cere greutatea la emitere (spre deosebire de ceilalti cinci curieri):
 * cantareste la depozit. De aia formularul n-are camp de greutate — nu e o
 * scapare.
 */
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
 * Fara el, componenta ramane montata cu `return null`, iar valorile initiale
 * (rambursul, adresa) s-ar calcula o singura data, la prima randare — deci un
 * efect ar trebui sa le rescrie la fiecare deschidere. Efectul acela e chiar
 * ce interzice `react-hooks/set-state-in-effect`, si pe buna dreptate: starea
 * derivata dintr-o proprietate nu se sincronizeaza, se DERIVA.
 *
 * Montand la deschidere, initializatorii `useState` ruleaza din nou de fiecare
 * data si nu mai e nevoie de niciun efect.
 */
export function GlsAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

function Formular({ onClose, order, businessId, onSuccess }: Props) {
  const comanda = order as typeof order & { gls_awb_number?: string | null };
  const areAwb = !!comanda.gls_awb_number;
  const addr = (order.shipping_address ?? {}) as ShippingAddress;

  /* Livrarea la punct GLS aleasa de client in checkout. */
  const laPunct = addr.courier === "gls" && addr.delivery_type === "locker" && !!addr.locker_id;

  const [nume, setNume] = useState(order.customer_name ?? "");
  const [telefon, setTelefon] = useState(order.customer_phone ?? "");
  const [email, setEmail] = useState(order.customer_email ?? "");
  const [oras, setOras] = useState(addr.city ?? "");
  const [strada, setStrada] = useState(
    [addr.street ?? addr.address ?? "", addr.street_no ?? ""].filter(Boolean).join(" ").trim(),
  );
  const [codPostal, setCodPostal] = useState(addr.postal_code ?? "");
  const [numarColete, setNumarColete] = useState("1");
  /*
   * Rambursul se completeaza dupa BANI, nu dupa metoda: o comanda cu plata online
   * ramasa neplatita ar pleca altfel cu ramburs zero si fara nicio cale de
   * incasare. Vezi `rambursDeIncasat` — s-a intamplat deja in productie.
   *
   * Ramane EDITABIL: e valoarea implicita, nu o incuietoare.
   */
  const [ramburs, setRamburs] = useState(() =>
    areAwb ? "0" : rambursDeIncasat({ payment_status: order.payment_status, total: order.total }).toFixed(2),
  );
  const [continut, setContinut] = useState(() => {
    const items = (Array.isArray(order.items) ? order.items : []) as { name?: string }[];
    const nume = items.map((i) => i?.name).filter(Boolean).join(", ");
    return (nume || "Produse").slice(0, 40);
  });

  const [creating, setCreating] = useState(false);
  const [eticheta, setEticheta] = useState<string | null>(null);
  const [awbEmis, setAwbEmis] = useState<string | null>(null);

  function descarca(base64: string, awb: string) {
    const octeti = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([octeti], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `eticheta-gls-${awb}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreate() {
    if (!nume.trim()) return toast.error("Numele destinatarului este obligatoriu");
    if (!telefon.trim()) return toast.error("Telefonul destinatarului este obligatoriu");
    if (!oras.trim()) return toast.error("Orasul destinatarului este obligatoriu");
    if (!laPunct && !strada.trim()) return toast.error("Adresa destinatarului este obligatorie");

    const colete = parseInt(numarColete, 10);
    if (!Number.isFinite(colete) || colete < 1) return toast.error("Numarul de colete trebuie sa fie cel putin 1");

    const date: DateAwbGls = {
      destinatar: {
        nume: nume.trim(),
        strada: strada.trim(),
        oras: oras.trim(),
        judet: addr.county ?? null,
        codPostal: codPostal.trim() || null,
        tara: addr.country || "RO",
        telefon: telefon.trim(),
        email: email.trim(),
      },
      numarColete: colete,
      ramburs: parseFloat(ramburs) || 0,
      continut: continut.trim() || null,
      servicii: laPunct ? { parcelShopId: addr.locker_id } : undefined,
    };

    setCreating(true);
    const r = await createGlsAwbAction(businessId, order.id, date);
    setCreating(false);

    if ("error" in r) {
      toast.error(r.error);
      return;
    }

    setAwbEmis(r.awb);
    if (r.etichetaBase64) {
      setEticheta(r.etichetaBase64);
      /* Descarcare automata: e singura ocazie. */
      descarca(r.etichetaBase64, r.awb);
      toast.success(`AWB GLS ${r.awb} creat — eticheta s-a descarcat`);
    } else {
      toast.warning(
        `AWB GLS ${r.awb} exista deja. Eticheta nu se mai poate obtine de la GLS — cauta-o in descarcari sau in MyGLS.`,
      );
    }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Package className="h-5 w-5" />
            AWB GLS
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {areAwb && !awbEmis && (
          <div className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            Comanda are deja AWB GLS <strong>{comanda.gls_awb_number}</strong>.
          </div>
        )}

        {eticheta && awbEmis && (
          <div className="mb-4 space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <p className="flex items-start gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              Salveaza eticheta acum
            </p>
            <p className="text-xs text-muted-foreground">
              GLS o trimite o singura data, la emitere. Daca inchizi pagina fara sa o
              salvezi, nu se mai poate obtine — o gasesti doar in contul MyGLS.
            </p>
            <Button size="sm" onClick={() => descarca(eticheta, awbEmis)}>
              <Download className="h-4 w-4" />
              Descarca eticheta {awbEmis}
            </Button>
          </div>
        )}

        {!areAwb && (
          <div className="space-y-3">
            {laPunct && (
              <div className="rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-xs">
                Livrare la punct GLS: <strong>{addr.locker_name || addr.locker_id}</strong>.
                Adresa de strada nu se mai trimite.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Nume destinatar *</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={nume} onChange={(e) => setNume(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Telefon *</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={telefon} onChange={(e) => setTelefon(e.target.value)} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-muted-foreground">Email</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Oras *</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={oras} onChange={(e) => setOras(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Cod postal</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={codPostal} onChange={(e) => setCodPostal(e.target.value)} />
              </label>
              {!laPunct && (
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted-foreground">Strada si numar *</span>
                  <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={strada} onChange={(e) => setStrada(e.target.value)} />
                </label>
              )}
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Numar de colete</span>
                <input type="number" min={1} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={numarColete} onChange={(e) => setNumarColete(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Ramburs (lei)</span>
                <input type="number" step="0.01" min={0} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={ramburs} onChange={(e) => setRamburs(e.target.value)} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-muted-foreground">Continut</span>
                <input maxLength={40} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={continut} onChange={(e) => setContinut(e.target.value)} />
              </label>
            </div>

            {/* GLS nu cere greutatea la emitere — cantareste la depozit. */}
            <p className="text-xs text-muted-foreground">
              GLS nu cere greutatea la emiterea AWB-ului: coletul se cantareste la depozit.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={creating}>Renunta</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="animate-spin" /> : <Package className="h-4 w-4" />}
                {creating ? "Se emite..." : "Emite AWB"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
