"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, MapPin, Package, Truck, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import { createPostaAwbAction, getPostaTraceAction, type StareAfisata } from "@/lib/actions/posta.actions";
import { useGreutateaAwb, notaGreutate } from "@/components/dashboard/useGreutateaAwb";
import { adaugaZileLucratoare, ziuaInRomania } from "@/lib/utils/zile-lucratoare";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";

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
  locker_id?: string;
  locker_name?: string;
  locker_city?: string;
  locker_county?: string;
  locker_post_code?: string;
};

/**
 * Emiterea unui AWB Poșta Română.
 *
 * ═══ CE E ALTFEL FATA DE CELELALTE FORMULARE DE AWB ═══
 *
 *   - **Nu vine nimeni sa ridice.** Nu exista data de ridicare, ci data la care
 *     DUCI TU coletele la oficiu (`dataPrezentarePresetata`). Ea ajunge pe
 *     documentul de transport si scurteaza prelucrarea la ghiseu.
 *   - **Nu exista buton de eticheta.** API-ul Postei nu are metoda de tiparire;
 *     eticheta se scoate din aplicatia lor. Se spune pe fata, in loc sa lipseasca
 *     fara explicatie.
 *   - **Nu exista buton de anulare.** Tot API-ul lor. Din panou se poate doar
 *     scoate numarul de pe comanda, din fereastra de editare, dupa ce ai anulat
 *     la ei.
 *   - **Livrarea la oficiu** (post-restant) se preia din alegerea cumparatorului
 *     din checkout si se arata, ca sa se vada unde ajunge coletul.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  /** Peste cate zile lucratoare duce comerciantul coletele, din configurare. */
  zilePrezentare?: number;
  onSuccess: () => void;
};

/**
 * Invelisul care MONTEAZA formularul abia la deschidere, ca valorile initiale sa
 * se calculeze din nou de fiecare data, fara efect de sincronizare.
 */
export function PostaAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

type ComandaPosta = {
  posta_awb_number?: string | null;
  posta_oficiu_id?: string | null;
  posta_borderou_id?: number | null;
};

function Formular({ onClose, order, businessId, zilePrezentare, onSuccess }: Props) {
  const comanda = order as typeof order & ComandaPosta;
  const addr = (order.shipping_address ?? {}) as ShippingAddress;

  const awb = comanda.posta_awb_number ?? null;
  const [emitere, setEmitere] = useState(false);
  const [stari, setStari] = useState<StareAfisata[] | null>(null);
  const [incarcStari, setIncarcStari] = useState(false);

  /*
   * ⚠ Livrarea la oficiu se citeste din alegerea din CHECKOUT, nu din configurare:
   * cumparatorul a ales un oficiu anume, iar id-ul lui e chiar `idOficiuPR`.
   */
  const laOficiu = (addr.courier ?? "").toLowerCase().trim() === "posta"
    && addr.delivery_type === "locker"
    && !!addr.locker_id;

  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: !!awb, businessId, orderId: order.id,
  });
  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);

  const [continut, setContinut] = useState("Produse");
  const [dataPrezentare, setDataPrezentare] = useState(
    adaugaZileLucratoare(ziuaInRomania(), zilePrezentare ?? 0),
  );

  const ramburs = rambursDeIncasat(order);

  async function handleEmite() {
    setEmitere(true);
    const r = await createPostaAwbAction(businessId, order.id, {
      destinatar: {
        nume: order.customer_name,
        strada: addr.street || addr.address || "",
        numar: addr.street_no || null,
        /* ⚠ La oficiu, localitatea si judetul sunt ALE OFICIULUI, nu ale
           clientului: coletul ajunge acolo, nu acasa la el. Aceeasi regula ca la
           punctele GLS si ca in generarea in masa. */
        oras: (laOficiu ? addr.locker_city : "") || addr.city || "",
        judet: ((laOficiu ? addr.locker_county : "") || addr.county) || null,
        codPostal: ((laOficiu ? addr.locker_post_code : "") || addr.postal_code) || null,
        telefon: order.customer_phone,
        email: order.customer_email,
      },
      greutateKg: Number(weight) || 0,
      continut: continut.trim() || "Produse",
      ramburs,
      valoareMarfa: Number(order.total) || 0,
      postRestant: laOficiu,
      idOficiuPR: laOficiu ? addr.locker_id : null,
      dataPrezentare,
    });
    setEmitere(false);

    if ("error" in r) return toast.error(r.error, { duration: 10000 });

    for (const av of r.avertismente) toast.warning(av, { duration: 10000 });
    toast.success(`AWB emis: ${r.awb}`);
    onSuccess();
  }

  async function handleStari() {
    setIncarcStari(true);
    const r = await getPostaTraceAction(businessId, order.id);
    setIncarcStari(false);
    if (!r.ok) return toast.error(r.error);
    setStari(r.stari);
    if (r.stari.length === 0) {
      toast.info("Posta nu are inca niciun eveniment pentru trimiterea asta.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Truck className="h-4 w-4" />
              Poșta Română
            </h3>
            <p className="text-xs text-muted-foreground">
              Comanda {order.order_number} · {order.customer_name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {awb ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-success/20 bg-success/5 p-3">
              <p className="text-xs text-muted-foreground">Numar AWB</p>
              <p className="font-mono text-sm font-semibold text-foreground">{awb}</p>
              {comanda.posta_borderou_id ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Borderou {comanda.posta_borderou_id}
                </p>
              ) : null}
            </div>

            {/*
              ⚠ Se spune pe fata ce NU poate face integrarea. Un buton lipsa fara
              explicatie il trimite pe om sa-l caute; o propozitie il trimite unde
              trebuie.
            */}
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">Ce faci mai departe</p>
              <p>
                <strong>Eticheta o tiparesti din aplicatia Postei</strong> — API-ul lor nu
                are metoda de tiparire, deci nu o putem aduce aici.
              </p>
              <p className="mt-1">
                Apoi <strong>duci coletul la oficiu</strong>. Nu vine nimeni sa-l ridice.
              </p>
              <p className="mt-1">
                Pentru <strong>anulare</strong>, mergi la oficiu sau in aplicatia lor. Dupa
                ce ai anulat acolo, poti scoate numarul de pe comanda din fereastra de
                editare a comenzii.
              </p>
            </div>

            <Button variant="outline" onClick={handleStari} disabled={incarcStari} className="w-full">
              {incarcStari ? <Loader2 className="animate-spin" /> : <Package />}
              {incarcStari ? "Se cere..." : "Vezi unde e coletul"}
            </Button>

            {stari && stari.length > 0 && (
              <ul className="space-y-1.5 rounded-lg border border-border p-3">
                {stari.map((s, i) => (
                  <li key={`${s.cod}-${s.data}-${i}`} className="text-xs">
                    <span className="text-foreground">{s.descriere}</span>
                    {s.unitate ? <span className="text-muted-foreground"> · {s.unitate}</span> : null}
                    {s.data ? <span className="text-muted-foreground"> · {s.data}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {laOficiu && (
              <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info/5 p-3 text-xs">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                <div>
                  <p className="font-semibold text-foreground">Livrare la oficiu poștal</p>
                  <p className="text-muted-foreground">
                    {addr.locker_name || `Oficiul ${addr.locker_id}`}
                    {addr.locker_city ? ` · ${addr.locker_city}` : ""}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Clientul a ales sa ridice singur coletul de acolo.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Greutate (kg)
              </label>
              <input
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                inputMode="decimal"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              />
              {/* ⚠ Posta primeste greutati ZECIMALE, spre deosebire de eColet care
                  cere kilograme intregi. Nu se rotunjeste in sus. */}
              {nota && <p className="mt-1 text-xs text-warning">{nota}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Continut
              </label>
              <input
                value={continut}
                onChange={(e) => setContinut(e.target.value)}
                maxLength={64}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Cel mult 64 de caractere — atat accepta Posta pe acest camp.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Cand duci coletul la oficiu
              </label>
              <input
                type="date"
                value={dataPrezentare}
                onChange={(e) => setDataPrezentare(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Data ajunge pe documentul de transport si scurteaza prelucrarea la ghiseu.
              </p>
            </div>

            {ramburs > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                <p className="text-foreground">
                  Ramburs de incasat: <strong>{ramburs.toFixed(2)} lei</strong>
                </p>
                <p className="mt-1 text-muted-foreground">
                  Posta cere o valoare declarata de minim 20 de lei la trimiterile cu
                  ramburs. Cat se declara se alege in configurare.
                </p>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="text-muted-foreground">
                Trimiterea e <strong>reala si facturata</strong>: Posta nu are mediu de
                test. Emiterea e aparata impotriva dublei apasari, dar nu apasa la
                intamplare.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">Renunta</Button>
              <Button onClick={handleEmite} disabled={emitere} className="flex-1">
                {emitere ? <Loader2 className="animate-spin" /> : <Truck />}
                {emitere ? "Se emite..." : "Creeaza AWB"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
