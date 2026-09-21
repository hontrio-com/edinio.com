"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Ticket,
  Percent, Banknote, Truck, Copy, Check, RefreshCw, X, ShoppingBag, TrendingUp, Search,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatPrice, formatPriceValue } from "@/lib/utils/format";
import {
  createDiscount, updateDiscount, deleteDiscount, toggleDiscount,
  type DiscountData,
} from "@/lib/actions/discount.actions";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { marimeaRandului } from "@/lib/dashboard/cifra-pe-un-rand";
import { descriePerioada, perioadaCodului, ziuaClipei } from "@/lib/discounts/perioada";
import { CE_NU_OPRESTE_LIMITA, LIMITA_NUMARA_DE_ACUM, despreLimita, limitaValida } from "@/lib/discounts/per-client";
import { SertarCod } from "@/components/dashboard/discounturi/SertarCod";
import { AlegePeCeMerge } from "@/components/dashboard/discounturi/AlegePeCeMerge";
import { FARA_RESTRANGERE, parseRestrangere, restrangereValida } from "@/lib/discounts/restrangere";
import {
  CODURI_PE_PAGINA, NUMELE_FILTRULUI, NUMELE_SORTARII, SORTARI, cateLaFiltru, filtreCuRost,
  type FiltruStare, type Sortare,
} from "@/lib/discounts/filtre";
import { catePagini, rezumatulPaginii, type CodDinLista, type TotalurileCodurilor } from "@/lib/discounts/lista";
import {
  DESPRE_STARE, DE_CE_DOUA_CIFRE, TONUL_STARII, sePoateFolosi, stareaCodului, utilizarile,
  type CifreleCodului,
} from "@/lib/discounts/stare";

/*
  ⚠ Randul nu mai vine din tabela, ci din `discounts_page`: pe langa coloane
  poarta si cifrele codului, din acelasi drum. Vezi `lib/discounts/lista.ts`.
*/
type Discount = CodDinLista;

function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const TYPE_CONFIG = {
  percent:      { label: "Procent",           icon: Percent,  color: "text-info bg-info/10 border-info/20" },
  fixed:        { label: "Sumă fixă",          icon: Banknote, color: "text-success bg-success/10 border-success/20" },
  free_shipping:{ label: "Transport gratuit", icon: Truck,    color: "text-purple-600 bg-purple-500/10 border-purple-500/20" },
};

const EMPTY_FORM: DiscountData = {
  code: "",
  type: "percent",
  value: 10,
  min_order_amount: null,
  max_uses: null,
  is_active: true,
  incepe_in: null,
  expira_in: null,
  per_customer_limit: null,
  restrangere: FARA_RESTRANGERE,
  doar_prima_comanda: false,
};

const fieldCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/* ── Overlay wrapper shared by modals ─────────────────────────────────────── */
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      {children}
    </div>
  );
}

/* ── Create / Edit modal ──────────────────────────────────────────────────── */
interface ModalProps {
  businessId: string;
  editing: Discount | null;
  categorii: { id: string; name: string }[];
  onClose: () => void;
}

function DiscountModal({ businessId, editing, categorii, onClose }: ModalProps) {
  const [form, setForm] = useState<DiscountData>(
    editing
      ? {
          code: editing.code,
          type: editing.type as DiscountData["type"],
          value: editing.value,
          min_order_amount: editing.min_order_amount,
          max_uses: editing.max_uses,
          is_active: editing.is_active,
          /*
            ⚠⚠ `ziuaClipei`, NU `slice(0, 10)`.

            Un cod care porneste pe 1 octombrie se pastreaza ca
            `2026-09-30T21:00:00Z` — ora Romaniei, scrisa in UTC. Taiat cu
            `slice`, formularul ar fi aratat „30 septembrie", si, salvat asa,
            codul s-ar fi mutat cu o zi inapoi la FIECARE deschidere a editarii.
          */
          incepe_in: ziuaClipei(editing.starts_at),
          expira_in: ziuaClipei(editing.expires_at),
          per_customer_limit: editing.per_customer_limit,
          restrangere: parseRestrangere(editing.restrangere),
          doar_prima_comanda: editing.doar_prima_comanda,
        }
      : { ...EMPTY_FORM, code: "" }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function validate() {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = "Codul este obligatoriu";
    else if (!/^[A-Z0-9_-]{3,20}$/i.test(form.code.trim())) e.code = "3-20 caractere, doar litere, cifre, - si _";
    if (form.type !== "free_shipping" && form.value <= 0) e.value = "Valoarea trebuie sa fie pozitiva";
    if (form.type === "percent" && form.value > 100) e.value = "Procentul nu poate depasi 100%";
    /*
      ⚠ ACEEASI REGULA CA PE SERVER, chemata — nu scrisa a doua oara. Serverul
      refuza oricum o perioada intoarsa; aici se spune INAINTE ca fereastra sa
      se inchida, fiindca mesajul de izbanda pleaca odata cu inchiderea ei (vezi
      `handleSubmit`) si omul ar fi fost felicitat pentru un cod nesalvat.
    */
    const p = perioadaCodului(form.incepe_in, form.expira_in);
    if ("error" in p) e.perioada = p.error;
    const l = limitaValida(form.per_customer_limit);
    if ("error" in l) e.per_customer_limit = l.error;
    const rr = restrangereValida(form.restrangere);
    if ("error" in rr) e.restrangere = rr.error;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const payload: DiscountData = {
      ...form,
      code: form.code.trim().toUpperCase(),
      value: form.type === "free_shipping" ? 0 : Number(form.value),
      min_order_amount: form.min_order_amount ? Number(form.min_order_amount) : null,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      incepe_in: form.incepe_in || null,
      expira_in: form.expira_in || null,
      per_customer_limit: form.per_customer_limit ? Number(form.per_customer_limit) : null,
      restrangere: form.restrangere,
      doar_prima_comanda: form.doar_prima_comanda,
    };
    // Close modal immediately for instant feel
    toast.success(editing ? "Discount actualizat." : "Discount creat.");
    onClose();
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof updateDiscount>> | Awaited<ReturnType<typeof createDiscount>>;
      try {
        result = editing
          ? await updateDiscount(editing.id, businessId, payload)
          : await createDiscount(businessId, payload);
      } catch {
        /* ⚠ MESAJUL DE IZBANDA SI INCHIDEREA FERESTREI AU PLECAT INAINTE de tranzitie (randurile
           101 si 102). La o cadere, omul a fost deja felicitat si formularul s-a inchis cu tot ce
           scrisese in el. Nu mut nimic, asa e scrisa casa; dar mesajul dezice lauda pe fata. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca discountul s-a salvat. Mesajul de dinainte a plecat prea "
          + "devreme: reincarca pagina si uita-te in lista de coduri.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) { toast.error(result.error); }
    });
  }

  return (
    <Overlay>
      <div className="bg-card rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto ring-1 ring-foreground/10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {editing ? "Editeaza discount" : "Discount nou"}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Code */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Cod discount
            </label>
            <div className="flex gap-2">
              <input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="ex: VARA20"
                className={cn(fieldCls, "flex-1 font-mono tracking-widest", errors.code && "border-destructive")}
              />
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, code: generateCode() }))}
                className="px-2.5 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground"
                title="Genereaza cod aleatoriu"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            {errors.code && <p className="text-xs text-destructive mt-1">{errors.code}</p>}
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Tip discount
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["percent", "fixed", "free_shipping"] as const).map(t => {
                const cfg = TYPE_CONFIG[t];
                const Icon = cfg.icon;
                const active = form.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 text-xs font-medium transition-all",
                      active ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Value */}
          {form.type !== "free_shipping" && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                {form.type === "percent" ? "Procent reducere" : "Sumă reducere (lei)"}
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={form.type === "percent" ? 100 : undefined}
                  step="0.01"
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                  className={cn(fieldCls, "pr-12", errors.value && "border-destructive")}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                  {form.type === "percent" ? "%" : "lei"}
                </span>
              </div>
              {errors.value && <p className="text-xs text-destructive mt-1">{errors.value}</p>}
            </div>
          )}

          {/* Min order amount */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Valoare minima comanda (optional)
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.min_order_amount ?? ""}
                onChange={e => setForm(f => ({ ...f, min_order_amount: e.target.value ? Number(e.target.value) : null }))}
                placeholder="Fără minim"
                className={cn(fieldCls, "pr-12")}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">lei</span>
            </div>
            {/*
              ⚠⚠ DOUA NUMERE CARE PAR SA VORBEASCA DESPRE ACELASI LUCRU.
              Pragul minim se judeca pe TOT cosul, si asa ramane; restrangerea
              spune doar pe ce se SOCOTESTE reducerea. „20% la Accesorii, minim
              500 lei" inseamna 500 de lei pe tot cosul, nu 500 de lei de
              accesorii — iar fara randul asta fiecare ar fi citit ce voia.
            */}
            {form.restrangere.fel !== "tot" && form.min_order_amount ? (
              <p className="text-[11px] text-muted-foreground mt-1">
                Pragul se judecă pe tot coșul, nu doar pe produsele alese mai sus.
              </p>
            ) : null}
          </div>

          {/* Max uses */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Numar maxim de utilizari (optional)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={form.max_uses ?? ""}
              onChange={e => setForm(f => ({ ...f, max_uses: e.target.value ? Number(e.target.value) : null }))}
              placeholder="Nelimitat"
              className={fieldCls}
            />
          </div>

          {/*
            ⚠⚠ „DOAR LA PRIMA COMANDĂ" STĂ DEASUPRA LIMITEI PER CLIENT, fiindcă
            o cuprinde: bifat, codul e de la sine o singură dată per om. Pus
            dedesubt, cele două câmpuri s-ar fi citit ca reguli care se adună.
          */}
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div className="min-w-0 pr-3">
              <p className="text-sm font-medium text-foreground">Doar la prima comandă</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {form.doar_prima_comanda
                  ? "Merge doar pentru cineva care n-a mai comandat niciodată de la tine. Se numără orice comandă de dinainte, inclusiv cele anulate. E de la sine o singură dată per client."
                  : "Bifează dacă e un cod de bun venit, numai pentru clienți noi."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, doar_prima_comanda: !f.doar_prima_comanda }))}
              aria-pressed={form.doar_prima_comanda}
              aria-label="Doar la prima comandă"
              className="flex-shrink-0"
            >
              {form.doar_prima_comanda
                ? <ToggleRight className="h-7 w-7 text-primary" />
                : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
            </button>
          </div>

          {/*
            ⚠⚠ DOUA LIMITE CARE PAR UNA. Cea de deasupra e pe CAMPANIE („o mie
            de utilizari cu totul"), asta e pe OM („o data de fiecare client").
            Asezate una sub alta si scrise amandoua „utilizari", se citesc gresit
            — de-aia a doua isi spune pe fata pe cine margineste, si ce
            inseamna acolo „acelasi client".
          */}
          <div>
            <label htmlFor="cod-per-client" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              De câte ori îl poate folosi un client (opțional)
            </label>
            <input
              id="cod-per-client"
              type="number"
              min={1}
              step={1}
              value={form.doar_prima_comanda ? 1 : (form.per_customer_limit ?? "")}
              onChange={e => setForm(f => ({ ...f, per_customer_limit: e.target.value ? Number(e.target.value) : null }))}
              placeholder="Fără limită"
              /* ⚠ Stins, nu ascuns: omul vede CE valoare are codul lui, si de ce
                 nu o poate schimba. Ascuns, ar fi parut ca n-are nicio limita. */
              disabled={form.doar_prima_comanda}
              className={cn(fieldCls, form.doar_prima_comanda && "opacity-60", errors.per_customer_limit && "border-destructive")}
            />
            {errors.per_customer_limit
              ? <p className="text-xs text-destructive mt-1">{errors.per_customer_limit}</p>
              : <p className="text-[11px] text-muted-foreground mt-1">
                  {form.doar_prima_comanda
                    ? "„Doar la prima comandă” înseamnă deja o singură dată per client."
                    : despreLimita(form.per_customer_limit)}
                </p>}
            {/*
              ⚠ SE SPUNE SI CE NU OPRESTE. Cumparatorul isi scrie singur
              telefonul; fara randul asta, comerciantul crede ca a cumparat o
              garantie si afla abia din raport ca n-a fost una.
            */}
            {form.per_customer_limit !== null && (
              <p className="text-[11px] text-muted-foreground mt-1">{CE_NU_OPRESTE_LIMITA}</p>
            )}
            {/*
              ⚠⚠ NUMAI LA UN COD DEJA FOLOSIT, fiindca numai acolo intrebarea se
              pune. Aratat mereu, randul ar fi fost zgomot pe un cod nou.
            */}
            {form.per_customer_limit !== null && editing !== null && editing.uses_count > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">{LIMITA_NUMARA_DE_ACUM}</p>
            )}
          </div>

          {/*
            ⚠ Restrangerea sta LANGA valoare, nu la capatul formularului: ea
            schimba CE se reduce, deci se citeste impreuna cu cat se reduce.
          */}
          <AlegePeCeMerge
            businessId={businessId}
            valoare={form.restrangere}
            categoriiMagazin={categorii}
            onSchimba={(r) => setForm((f) => ({ ...f, restrangere: r }))}
            eroare={errors.restrangere}
          />

          {/*
            ⚠⚠ O PERIOADA, NU DOUA CAMPURI RAZLETE.

            Pana acum exista doar „Data expirare". Cele doua capete sunt insa
            acelasi lucru — cat tine campania — si asezate impreuna se citesc
            ca atare. Sub ele se scrie in cuvinte ce inseamna, fiindca „de la
            1 octombrie" nu spune de la ce ORA, iar raspunsul (miezul noptii,
            ora Romaniei) e chiar defectul pe care l-am reparat azi.
          */}
          <div className="rounded-xl border border-border p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Cât ține codul (opțional)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="cod-de-cand" className="block text-[11px] text-muted-foreground mb-1">De când</label>
                <input
                  id="cod-de-cand"
                  type="date"
                  lang="ro"
                  value={form.incepe_in ?? ""}
                  onChange={e => setForm(f => ({ ...f, incepe_in: e.target.value || null }))}
                  className={cn(fieldCls, errors.perioada && "border-destructive")}
                />
              </div>
              <div>
                <label htmlFor="cod-pana-cand" className="block text-[11px] text-muted-foreground mb-1">Până când</label>
                <input
                  id="cod-pana-cand"
                  type="date"
                  lang="ro"
                  value={form.expira_in ?? ""}
                  onChange={e => setForm(f => ({ ...f, expira_in: e.target.value || null }))}
                  /*
                    ⚠ `min` doar pe capatul de sus, si doar pe capatul de jos al
                    perioadei. Pus si pe „De când", ar fi impiedicat editarea
                    unei campanii care a pornit deja: comerciantul ar fi deschis
                    fereastra ca sa schimbe procentul si n-ar fi putut salva.
                  */
                  min={form.incepe_in ?? undefined}
                  className={cn(fieldCls, errors.perioada && "border-destructive")}
                />
              </div>
            </div>
            {errors.perioada
              ? <p className="text-xs text-destructive">{errors.perioada}</p>
              : <p className="text-[11px] text-muted-foreground">{descriePerioada(form.incepe_in, form.expira_in)}</p>}
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/50">
            <div>
              <p className="text-sm font-medium text-foreground">Codul e pornit</p>
              <p className="text-xs text-muted-foreground mt-0.5">Cumpărătorii pot folosi codul ăsta</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              className="flex-shrink-0"
            >
              {form.is_active
                ? <ToggleRight className="h-7 w-7 text-primary" />
                : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Anulează
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Se salvează…" : editing ? "Salvează" : "Creează"}
            </Button>
          </div>
        </form>
      </div>
    </Overlay>
  );
}

/* ── Delete confirmation dialog ───────────────────────────────────────────── */
interface DeleteDialogProps {
  discount: Discount;
  businessId: string;
  onClose: () => void;
}

function DeleteDialog({ discount, businessId, onClose }: DeleteDialogProps) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof deleteDiscount>>;
      try {
        result = await deleteDiscount(discount.id, businessId);
      } catch {
        /* ⚠ `onClose()` sta dupa `try`, deci fereastra ramane deschisa si omul vede ca nu s-a
           terminat. In fisierul asta nu exista `router`, deci mesajul cere reincarcarea. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca discountul s-a sters. Reincarca pagina si uita-te in lista de coduri.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Discount sters.");
      onClose();
    });
  }

  return (
    <Overlay>
      <div className="bg-card rounded-2xl w-full max-w-sm shadow-2xl ring-1 ring-foreground/10 p-5">
        <h2 className="text-base font-semibold text-foreground mb-1">Șterge codul</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Esti sigur ca vrei sa stergi codul{" "}
          <span className="font-mono font-bold text-foreground">{discount.code}</span>?
          Actiunea nu poate fi anulata.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Anulează
          </Button>
          <Button type="button" onClick={handleDelete} disabled={isPending} className="flex-1 bg-destructive text-white hover:bg-destructive/90">
            {isPending ? "Se sterge..." : "Șterge"}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export function DiscountsClient({
  coduri, cateSunt, pagina, catePeStare, totaluri,
  cautare: cautareDinAdresa, stare, sortare,
  faraLegatura, businessId, categorii,
}: {
  /**
   * ⚠⚠ O PAGINA, deja filtrata si sortata in baza. Nu tot magazinul.
   * Fiecare rand isi poarta si cifrele, din acelasi drum — vezi `discounts_page`.
   */
  coduri: CodDinLista[];
  /** Cate coduri are multimea FILTRATA, nu pagina. Din `count(*) over ()`. */
  cateSunt: number;
  pagina: number;
  /** Cate coduri are fiecare stare, numarate PESTE CAUTARE, in baza. */
  catePeStare: Record<string, number>;
  /** Cifrele din cap, socotite pe TOT magazinul — nu pe pagina adusa. */
  totaluri: TotalurileCodurilor;
  cautare: string;
  stare: FiltruStare;
  sortare: Sortare;
  /** Comenzi cu cod dar fara legatura catre el. Azi zero peste tot. */
  faraLegatura: number;
  businessId: string;
  /** Categoriile magazinului, pentru restrangerea codului. Produsele se CAUTA. */
  categorii: { id: string; name: string }[];
}) {
  /*
    ⚠ `?nou=1` deschide direct formularul, si se citeste LA PRIMA RANDARE, nu
    intr-un efect: butonul „Adauga" din bara de sus trimite aici, iar omul
    trebuie sa vada formularul din clipa in care pagina apare, nu dupa ce
    aceasta se randeaza o data goala.
  */
  /*
    ⚠ CIFRELE SE SOCOTESC O DATĂ, nu în mijlocul randării fiecărui card. Puse
    acolo, fiecare card ar fi parcurs iar toată lista, iar „câte merg acum" ar fi
    pus aceeași întrebare de patru ori.

    ⚠ Și „merge acum" e CHIAR regula din `lib/discounts/stare.ts`, nu o socoteală
    scrisă din nou aici. Scrisă a doua oară, cardul ar fi numărat alte coduri
    decât cele scrise „Activ" în tabel.
  */
  const [deschis, setDeschis] = useState<Discount | null>(null);
  /*
   * ⚠⚠ CAUTAREA STA IN ADRESA, dar campul isi tine propria stare cat se scrie.
   *
   * Scrisa direct in adresa la fiecare litera, pagina s-ar fi re-adus de sase
   * ori pentru „BLACKFRIDAY" — sase drumuri la baza si sase randari, iar cursorul
   * ar fi sarit. Asa, campul raspunde pe loc si adresa se schimba dupa o pauza
   * scurta. ⚠ Si se porneste din adresa, ca o legatura trimisa sa arate acelasi
   * lucru.
   */
  const [cautare, setCautare] = useState(cautareDinAdresa);
  const router = useRouter();
  const parametriAdresa = useSearchParams();

  const duLa = useCallback((schimbari: Record<string, string>) => {
    const p = new URLSearchParams(parametriAdresa.toString());
    for (const [k, v] of Object.entries(schimbari)) {
      if (v === "" || (k === "stare" && v === "toate") || (k === "sort" && v === "noi") || (k === "page" && v === "1")) {
        /* ⚠ Implicitele NU se scriu in adresa: altfel fiecare legatura ar fi
           purtat trei parametri care nu spun nimic. */
        p.delete(k);
      } else {
        p.set(k, v);
      }
    }
    const sir = p.toString();
    router.replace(sir ? `?${sir}` : "?", { scroll: false });
  }, [parametriAdresa, router]);

  const asteaptaTastarea = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrieCautarea = useCallback((v: string) => {
    setCautare(v);
    if (asteaptaTastarea.current) clearTimeout(asteaptaTastarea.current);
    asteaptaTastarea.current = setTimeout(() => duLa({ q: v.trim(), page: "1" }), 300);
  }, [duLa]);
  /*
    ⚠⚠ NIMIC NU SE MAI FILTREAZĂ, SORTEAZĂ SAU NUMĂRĂ AICI.
    Pagina vine gata așezată din `discounts_page`, iar cifrele de lângă filtre
    din `discount_state_counts`. O a doua socoteală pe lângă cea din bază s-ar fi
    despărțit de ea la prima schimbare, și n-ar fi dat nicio eroare — exact
    defectul de care ne apărăm cu `starea-e-aceeasi-si-in-baza.test.ts`.
  */
  const aratate = coduri;
  const filtreleCuRost = filtreCuRost(catePeStare as Partial<Record<FiltruStare, number>>, stare);
  const filtru = stare;

  const potiFolosi = totaluri.potiFolosi;
  const totalComenzi = totaluri.comenzi;
  const totalBani = totaluri.baniDati;
  const totalVanzari = totaluri.vanzari;

  /*
   * ⚠⚠ O SINGURA MARIME PENTRU TOT RANDUL, data de cea mai lunga cifra.
   * Lasata pe seama fiecarui card, „6" ramanea la 44px langa „15.831,80 lei" la
   * 22px, si cele patru cutii nu mai aratau ca un set. Cerut de el.
   * ⚠ Se dau CHIAR sirurile care ajung pe ecran, nu numerele: `formatPrice`
   * adauga separatori si „lei", adica jumatate din lungime.
   */
  const marimeCifre = marimeaRandului([
    potiFolosi, totalComenzi,
    { valoare: formatPriceValue(totalBani), unitate: "lei" },
    { valoare: formatPriceValue(totalVanzari), unitate: "lei" },
  ]);

  const parametri = useSearchParams();
  const [modalOpen, setModalOpen] = useState(() => parametri.get("nou") !== null);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [deleting, setDeleting] = useState<Discount | null>(null);
  const [, startToggle] = useTransition();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  function handleEdit(d: Discount) {
    setEditing(d);
    setModalOpen(true);
  }

  function handleNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function handleToggle(d: Discount) {
    startToggle(async () => {
      let result: Awaited<ReturnType<typeof toggleDiscount>>;
      try {
        result = await toggleDiscount(d.id, businessId, !d.is_active);
      } catch {
        /* ⚠ Nu se schimba nimic local: comutatorul se aseaza din datele venite de la server. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca starea codului s-a schimbat. Reincarca pagina ca sa vezi cum a ramas.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) toast.error(result.error);
    });
  }

  const copyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Cod copiat!");
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 500);
  }, []);


  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Discounturi</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Creează coduri de reducere și vezi ce au adus</p>
        </div>
        <Button onClick={handleNew}>
          <Plus />
          <span className="hidden xs:inline sm:inline">Cod nou</span>
          <span className="xs:hidden sm:hidden">Nou</span>
        </Button>
      </div>

      {/*
        ⚠⚠ GOL DIN DOUA PRICINI DEOSEBITE, si se spun altfel.
        `totaluri.coduri === 0` inseamna ca magazinul n-are NICIUN cod — atunci
        se arata invitatia de a face primul. `cateSunt === 0` cu coduri in
        magazin inseamna ca doar CAUTAREA sau FILTRUL n-au gasit nimic, si atunci
        bara de filtre trebuie sa ramana pe ecran ca omul sa se poata intoarce.
        Confundate, cine filtra gresit primea „Niciun cod de reducere" si credea
        ca si-a pierdut campaniile.
      */}
      {totaluri.coduri === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Ticket className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-1">Niciun cod de reducere</h2>
          <p className="text-sm text-muted-foreground max-w-xs mb-4">
            Fă primul cod de reducere și dă-le cumpărătorilor un motiv să comande.
          </p>
          <Button onClick={handleNew}>
            <Plus />
            Fă primul cod
          </Button>
        </div>
      ) : (
        <>
          {/*
            ═══ CIFRELE DIN CAP ═══

            ⚠ SUNT CHIAR `CardStatistica`, cel de la Clienți, Statistici și Coșuri
            abandonate — nu patru cutii locale care semănau cu el. Cerut anume:
            „păstrăm peste tot aceeași linie de design".

            ⚠⚠ ȘI CIFRELE S-AU SCHIMBAT, nu doar cutiile. Erau „Total coduri",
            „Active", „Total utilizări", „Expirăte / Epuizate" — adică trei despre
            câte rânduri are tabelul, pe care comerciantul le vede numărând. Acum
            spun ce au făcut codurile: câte comenzi au adus și câți bani l-au
            costat. Aceeași hotărâre ca la Clienți, unde „Venit total" a ieșit
            fiindcă exista deja la Statistici.

            ⚠ „Cât m-au costat" e ZERO la codurile de transport gratuit, și nu e
            un defect: economia stă în transport, care ajunge 0 și nu păstrează
            nicăieri cât ar fi fost. De-aia scrie dedesubt câte comenzi au primit
            transport oferit — se poate spune CÂTE, nu CÂȚI lei.

            ⚠⚠ STAU SUS, DEASUPRA LISTEI, cerut de el pe 21.09.2026. Erau sub
            tabel — singura secțiune din panou unde erau acolo. Cifrele din cap
            sunt răspunsul la „cum merge treaba", și el se citește ÎNAINTE de
            listă, nu după ce ai derulat prin ea.
          */}
          <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-2 lg:grid-cols-4">
            <CardStatistica marime={marimeCifre}
              icon={Ticket}
              label="Coduri care merg acum"
              value={potiFolosi}
              explicatie="Codurile pe care un cumpărător le poate folosi chiar în clipa asta: pornite, neexpirate, neepuizate și ajunse la data de pornire."
              empty={potiFolosi === 0}
            />
            <CardStatistica marime={marimeCifre}
              icon={ShoppingBag}
              label="Comenzi aduse"
              value={totalComenzi}
              explicatie="Câte comenzi valide s-au făcut cu un cod de discount. Comenzile anulate sau rambursate nu se numără."
              empty={totalComenzi === 0}
            />
            <CardStatistica marime={marimeCifre}
              icon={Banknote}
              label="Cât te-au costat"
              value={formatPriceValue(totalBani)}
              unit="lei"
              explicatie="Banii dați ca reducere, pe comenzile valide. ⚠ La codurile de transport gratuit iese 0: economia stă în transport, și nu se păstrează nicăieri cât ar fi fost."
              empty={totalBani === 0}
            />
            <CardStatistica marime={marimeCifre}
              icon={TrendingUp}
              label="Vânzări cu cod"
              value={formatPriceValue(totalVanzari)}
              unit="lei"
              explicatie="Valoarea comenzilor valide făcute cu un cod. Pune-o lângă „Cât te-au costat” ca să vezi dacă reducerea și-a meritat banii."
              empty={totalVanzari === 0}
            />
          </div>

          {/*
            ⚠⚠ O CIFRĂ CARE TREBUIE SĂ SE VADĂ CÂND NU E ZERO. Comenzi care poartă
            un cod dar n-au legătură către el: atunci toate cifrele de mai sus
            sunt incomplete. Azi e zero peste tot, deci rândul nu apare niciodată
            — dar dacă apare, comerciantul află, în loc să citească un raport care
            tace.
          */}
          {faraLegatura > 0 && (
            <p className="mb-4 rounded-xl bg-warning/10 p-3 text-xs text-foreground">
              <span className="font-semibold">Atenție:</span> {faraLegatura}{" "}
              {faraLegatura === 1 ? "comandă poartă" : "de comenzi poartă"} un cod de reducere
              fără legătură către el. Cifrele de mai sus nu le cuprind.
            </p>
          )}

          {/*
            ═══ CĂUTAREA, FILTRELE ȘI SORTAREA ═══

            ⚠ APAR NUMAI CÂND E CE FILTRA. Sub patru coduri, o bară de filtre
            deasupra unei liste de trei rânduri e mai mult de citit decât lista
            însăși — iar comerciantul cu două coduri le vede pe amândouă dintr-o
            privire. Măsurat: media pe producție e 2,3 coduri pe magazin.

            ⚠ Pe telefon cele două meniuri stau într-o grilă de două coloane
            egale, ca la Clienți: într-un `flex-wrap` fiecare ieșea cât textul ei
            și rândurile se rupeau la întâmplare.
          */}
          {totaluri.coduri >= 4 && (
            <div className="mb-4 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={cautare}
                  onChange={(e) => scrieCautarea(e.target.value)}
                  placeholder="Caută după cod…"
                  aria-label="Caută după cod"
                  className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <select
                  value={filtru}
                  onChange={(e) => duLa({ stare: e.target.value, page: "1" })}
                  aria-label="Starea codurilor"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none sm:w-auto"
                >
                  {/*
                    ⚠ Cifra de lângă fiecare filtru se numără PESTE CĂUTARE. Altfel
                    omul caută „VARA", vede „Oprite (2)", apasă — și lista iese
                    goală, fiindcă cele două oprite erau alte coduri.
                  */}
                  {filtreleCuRost.map((f) => (
                    <option key={f} value={f}>{NUMELE_FILTRULUI[f]} ({cateLaFiltru(catePeStare, f)})</option>
                  ))}
                </select>

                <select
                  value={sortare}
                  onChange={(e) => duLa({ sort: e.target.value, page: "1" })}
                  aria-label="Ordinea codurilor"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none sm:w-auto"
                >
                  {SORTARI.map((o) => (
                    <option key={o} value={o}>{NUMELE_SORTARII[o]}</option>
                  ))}
                </select>

                <span className="col-span-2 text-right text-xs text-muted-foreground sm:col-span-1 sm:ml-auto">
                  {/* ⚠ Cate sunt IN TOT, nu cate incap pe pagina. Vezi `rezumatulPaginii`. */}
                  {rezumatulPaginii(cateSunt, pagina, CODURI_PE_PAGINA)}
                </span>
              </div>
            </div>
          )}

          {/*
            ⚠ GOLUL SPUNE DE CE E GOL. „Niciun cod" după un filtru arată exact ca
            o pagină stricată; aici se spune care e pricina și ce se poate face.
          */}
          {aratate.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <p className="font-medium text-foreground">Niciun cod pentru ce ai ales</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {cautare ? "Încearcă altă căutare" : "Alege altă stare"}
                {cautare && filtru !== "toate" ? " sau altă stare." : "."}
              </p>
            </div>
          ) : (
          <>
          {/* Table */}
          <div className="hidden bg-card ring-1 ring-foreground/10 rounded-xl overflow-hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cod</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tip</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Valoare</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Utilizări</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Expiră</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stare</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {aratate.map(d => {
                    const cfg = TYPE_CONFIG[d.type as keyof typeof TYPE_CONFIG];
                    const Icon = cfg.icon;
                    /*
                      ⚠ O SINGURĂ ÎNTREBARE, pusă regulii din `lib/discounts/stare.ts`.
                      Erau trei socoteli scrise aici, în mijlocul rândului, și încă
                      două mai jos la cifre — patru copii ale aceleiași reguli, care
                      s-ar fi despărțit la prima retușare.
                    */
                    const stare = stareaCodului(d);
                    const u = utilizarile(d, d.cifre.comenziTotal);

                    return (
                      <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            {/*
                              ⚠ APĂSAREA PE COD DESCHIDE FIȘA. Până acum rândul nu
                              ducea nicăieri: singurul drum către un cod era creionul
                              de editare, care arată regulile dar nu și ce a făcut.
                            */}
                            <button
                              type="button"
                              onClick={() => setDeschis(d)}
                              className="font-mono font-bold tracking-wider text-foreground hover:underline"
                            >
                              {d.code}
                            </button>
                            <button
                              type="button"
                              onClick={() => copyCode(d.code)}
                              className={cn("transition-colors", copiedCode === d.code ? "text-success" : "text-muted-foreground hover:text-foreground")}
                            >
                              {copiedCode === d.code ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          {/*
                            ⚠ Limita pe OM se vede in lista, langa cea pe comanda:
                            e o margine care schimba cine poate folosi codul, si
                            deschisa numai din editare ar fi ramas nestiuta.
                          */}
                          {d.per_customer_limit !== null && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {d.per_customer_limit === 1 ? "O dată per client" : `De ${d.per_customer_limit} ori per client`}
                            </p>
                          )}
                          {d.min_order_amount && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">Min. {d.min_order_amount} lei</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium", cfg.color)}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 hidden sm:table-cell">
                          <span className="font-semibold text-foreground">
                            {d.type === "percent" && `${d.value}%`}
                            {d.type === "fixed" && `${d.value} lei`}
                            {d.type === "free_shipping" && "-"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 hidden md:table-cell">
                          {/*
                            ⚠⚠ AMÂNDOUĂ CIFRELE, hotărârea lui. `uses_count` scade
                            înapoi la fiecare anulare, deci „26" nu răspundea la
                            „de câte ori a fost folosit codul" — măsurat pe demo,
                            BINEAIVENIT10 scria 26 și e pe 30 de comenzi.

                            ⚠ A doua apare NUMAI când diferă: pe codurile fără
                            anulări ar fi repetat-o pe prima.
                          */}
                          <span className={cn("text-sm", stare === "epuizat" && "text-destructive font-semibold")}>
                            {u.principal}
                          </span>
                          {u.langa && (
                            <span className="ml-1.5 text-xs text-muted-foreground" title={DE_CE_DOUA_CIFRE}>
                              · {u.langa}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 hidden lg:table-cell">
                          {d.expires_at ? (
                            /*
                              ⚠ SE ARATĂ DATA, și când a trecut. Scria „Expirăt" în
                              loc de dată — adică repeta eticheta de stare de alături
                              și ascundea singurul lucru pe care coloana îl avea de
                              spus: CÂND. Un cod expirat acum trei luni și unul
                              expirat ieri cer lucruri diferite.
                            */
                            <span className={cn("text-sm", stare === "expirat" ? "text-destructive" : "text-foreground")}>
                              {formatDate(new Date(d.expires_at))}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Nelimitat</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {/*
                            ⚠ ACEEAȘI `EtichetaStare` ca la Comenzi, Clienți și
                            Coșuri abandonate — nu un text colorat de mână. Aceeași
                            linie de design peste tot, cum a cerut.

                            ⚠ Și comutatorul rămâne alături, fiindcă e singurul
                            lucru de pe rând care se poate APĂSA. Eticheta spune ce
                            e, butonul schimbă ce se poate schimba.
                          */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggle(d)}
                              aria-label={d.is_active ? `Oprește codul ${d.code}` : `Pornește codul ${d.code}`}
                              className="text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {d.is_active
                                ? <ToggleRight className="h-5 w-5 text-primary" />
                                : <ToggleLeft className="h-5 w-5" />}
                            </button>
                            <EtichetaStare ton={TONUL_STARII[stare]} marime="mic" title={DESPRE_STARE[stare].explicatie}>
                              {DESPRE_STARE[stare].text}
                            </EtichetaStare>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              type="button"
                              onClick={() => handleEdit(d)}
                              className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(d)}
                              className="p-1.5 rounded-lg hover:bg-destructive/5 transition-colors text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/*
            ═══ ACELEAȘI CODURI, PE TELEFON ═══

            ⚠ CARDURI SUB `sm`, TABEL DE LA `sm` ÎN SUS — același tipar ca la
            Clienți și la Importuri, unde a fost și măsurat: un tabel de șapte
            coloane pe un telefon de 390px își pierde jumătate din ele, iar cele
            ascunse (`hidden md:table-cell`) nu se pot ajunge în niciun fel.
            Aici erau ascunse Valoare, Utilizări și Expiră — adică tot ce spune
            ce face codul. Rămâneau codul, tipul și starea.
          */}
          <ul className="space-y-2 sm:hidden">
            {aratate.map((d) => {
              const cfg = TYPE_CONFIG[d.type as keyof typeof TYPE_CONFIG];
              const Icon = cfg.icon;
              const stare = stareaCodului(d);
              const u = utilizarile(d, d.cifre.comenziTotal);
              const c = d.cifre;
              return (
                <li key={d.id} className="rounded-xl bg-card p-3.5 ring-1 ring-foreground/10">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setDeschis(d)}
                        className="truncate font-mono font-bold tracking-wider text-foreground hover:underline"
                      >
                        {d.code}
                      </button>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                        {d.type === "percent" && ` · ${d.value}%`}
                        {d.type === "fixed" && ` · ${d.value} lei`}
                      </p>
                    </div>
                    <EtichetaStare ton={TONUL_STARII[stare]} marime="mic" title={DESPRE_STARE[stare].explicatie}>
                      {DESPRE_STARE[stare].text}
                    </EtichetaStare>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span title={u.langa ? DE_CE_DOUA_CIFRE : undefined}>
                      <span className="font-semibold text-foreground">{u.principal}</span>
                      {u.langa ? ` · ${u.langa}` : ""} folosite
                    </span>
                    {c && c.baniDati > 0 && <span>{formatPrice(c.baniDati)} dați</span>}
                    {d.expires_at && <span>până la {formatDate(new Date(d.expires_at))}</span>}
                  </div>

                  <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
                    <button
                      type="button"
                      onClick={() => handleToggle(d)}
                      aria-label={d.is_active ? `Oprește codul ${d.code}` : `Pornește codul ${d.code}`}
                      className="p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {d.is_active ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyCode(d.code)}
                      aria-label={`Copiază codul ${d.code}`}
                      className={cn("p-1.5 transition-colors", copiedCode === d.code ? "text-success" : "text-muted-foreground hover:text-foreground")}
                    >
                      {copiedCode === d.code ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(d)}
                      aria-label={`Editează codul ${d.code}`}
                      className="ml-auto p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(d)}
                      aria-label={`Șterge codul ${d.code}`}
                      className="p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {/*
            ═══ RASFOIREA ═══

            ⚠ APARE NUMAI CAND CHIAR SUNT MAI MULTE PAGINI. Doua butoane stinse
            sub o lista de unsprezece randuri sunt o promisiune goala — aceeasi
            regula ca la bara de filtre, care apare abia de la patru coduri.

            ⚠⚠ SUNT LEGATURI, NU BUTOANE. Asa merge „deschide intr-o fila noua",
            merge „inapoi" din browser, si se poate trimite pagina a treia prin
            mesaj. Un buton cu `onClick` le pierde pe toate trei.
          */}
          {catePagini(cateSunt, CODURI_PE_PAGINA) > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {rezumatulPaginii(cateSunt, pagina, CODURI_PE_PAGINA)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => duLa({ page: String(pagina - 1) })}
                  disabled={pagina <= 1}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Înapoi
                </button>
                <span className="text-xs text-muted-foreground">
                  {pagina} / {catePagini(cateSunt, CODURI_PE_PAGINA)}
                </span>
                <button
                  type="button"
                  onClick={() => duLa({ page: String(pagina + 1) })}
                  disabled={pagina >= catePagini(cateSunt, CODURI_PE_PAGINA)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Înainte
                </button>
              </div>
            </div>
          )}
          </>
          )}


        </>
      )}

      {deschis && (
        <SertarCod
          cod={deschis}
          businessId={businessId}
          onEditeaza={() => { const d = deschis; setDeschis(null); handleEdit(d); }}
          onClose={() => setDeschis(null)}
        />
      )}

      {/* Modals */}
      {modalOpen && (
        <DiscountModal
          businessId={businessId}
          editing={editing}
          categorii={categorii}
          onClose={() => { setModalOpen(false); setEditing(null); }}
        />
      )}
      {deleting && (
        <DeleteDialog
          discount={deleting}
          businessId={businessId}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
