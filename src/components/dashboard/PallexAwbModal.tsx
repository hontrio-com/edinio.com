"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, FileText, Loader2, Package, ShieldCheck, X } from "lucide-react";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import {
  createPallexAwbAction,
  stareBorderouAction,
  valideazaBorderouAction,
  type DatePallEx,
} from "@/lib/actions/pallex.actions";
import { adaugaZileLucratoare, ziuaInRomania } from "@/lib/pallex/expediere";
import { BORDEROU_VALIDAT_DE_CLIENT } from "@/lib/pallex/client";
import { JUDETE, potrivesteJudet } from "@/lib/ro/judete";
import { useGreutateaAwb, notaGreutate } from "@/components/dashboard/useGreutateaAwb";
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
  company?: string;
};

/**
 * Emiterea unei partide Pall-Ex dintr-o comanda.
 *
 * ═══ CE E ALTFEL FATA DE CELELALTE SASE FORMULARE DE AWB ═══
 *
 *   - **Numar de paleti si greutate totala**, nu numar de colete. Pall-Ex e o
 *     retea de marfa paletizata.
 *   - **Data si fereastra orara**, obligatorii de amandoua partile.
 *   - **Cod postal si judet**, obligatorii — ceilalti curieri le primesc goale.
 *   - **Fara camp de ramburs**, fiindca Pall-Ex nu incaseaza nimic la livrare. In
 *     locul lui e o confirmare, cand comanda are bani neincasati.
 *   - **Marfa nu pleaca la emitere**: partida intra intr-un borderou, si abia
 *     validarea borderoului o porneste.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  onSuccess: () => void;
  /**
   * ⚠ Termenele implicite, luate din configurarea Pall-Ex a magazinului.
   *
   * Fixate in cod (1 si 2), formularul contrazicea tacut si pagina de configurare
   * („sunt doar valorile implicite din formularul de partida"), si serverul, care
   * cade pe `config.zile_pana_la_*` cand datele lipsesc. Un comerciant care isi
   * pune 3 zile pana la ridicare vedea tot „maine" si expedia pe o data pe care
   * n-o poate onora.
   */
  zile?: { ridicare: number; livrare: number };
};

/**
 * Invelisul care MONTEAZA formularul abia la deschidere.
 *
 * Fara el, componenta ramane montata cu `return null`, iar valorile initiale
 * (datele, adresa, greutatea) s-ar calcula o singura data, la prima randare —
 * deci un efect ar trebui sa le rescrie la fiecare deschidere. Efectul acela e
 * chiar ce interzice `react-hooks/set-state-in-effect`, si pe buna dreptate:
 * starea derivata dintr-o proprietate nu se sincronizeaza, se DERIVA.
 */
export function PallexAwbModal(props: Props) {
  if (!props.open) return null;
  return <Formular {...props} />;
}

type ComandaPallex = {
  pallex_awb_number?: string | null;
  pallex_bordereau_id?: number | null;
};

function Formular({ onClose, order, businessId, onSuccess, zile }: Props) {
  const comanda = order as typeof order & ComandaPallex;
  const addr = (order.shipping_address ?? {}) as ShippingAddress;

  /*
   * ⚠ Partida tocmai emisa se tine LOCAL, si fereastra NU se inchide dupa emitere.
   *
   * Prima forma chema `onSuccess()` imediat, iar parintele inchidea modalul si
   * reincarca pagina. Adica exact pasul FARA de care marfa nu pleaca — validarea
   * borderoului — ramanea ascuns dupa o redeschidere, desi textul de mai jos ii
   * promitea comerciantului ca butonul apare „in aceeasi fereastra".
   *
   * Acum reimprospatarea parintelui se cere abia la INCHIDERE (`incheie`), deci
   * fereastra ramane deschisa pe blocul de validare.
   */
  const [emisa, setEmisa] = useState<{ awb: string; bordereauId: number | null } | null>(null);
  const awbCurent = emisa?.awb ?? comanda.pallex_awb_number ?? null;
  const borderouId = emisa ? emisa.bordereauId : comanda.pallex_bordereau_id ?? null;
  const areAwb = !!awbCurent;

  /** Inchiderea ferestrei. Cere reincarcarea DOAR daca s-a schimbat ceva. */
  function incheie() {
    if (emisa) onSuccess();
    else onClose();
  }

  const azi = ziuaInRomania();

  const [nume, setNume] = useState(order.customer_name ?? "");
  const [telefon, setTelefon] = useState(order.customer_phone ?? "");
  const [oras, setOras] = useState(addr.city ?? "");
  /* Judetul se potriveste pe lista noastra: Pall-Ex il vrea ca ISO auto, iar
     un text liber („Jud. Brasov") n-ar avea cum sa fie tradus. */
  const [judet, setJudet] = useState(potrivesteJudet(addr.county) ?? "");
  const [codPostal, setCodPostal] = useState(addr.postal_code ?? "");
  const [strada, setStrada] = useState(
    [addr.street ?? addr.address ?? "", addr.street_no ?? ""].filter(Boolean).join(" ").trim(),
  );

  const [numarPaleti, setNumarPaleti] = useState("1");
  const { weight, setWeight, dinCatalog, liniiFaraGreutate } = useGreutateaAwb({
    open: true, hasAwb: areAwb, businessId, orderId: order.id,
  });
  const [lungime, setLungime] = useState("");
  const [latime, setLatime] = useState("");
  const [inaltime, setInaltime] = useState("");

  /* Aceleasi expresii ca in `createPallexAwbAction`, ca formularul si lotul sa
     propuna aceleasi zile. */
  const [dataRidicare, setDataRidicare] = useState(
    () => adaugaZileLucratoare(azi, zile?.ridicare ?? 1),
  );
  const [dataLivrare, setDataLivrare] = useState(
    () => adaugaZileLucratoare(adaugaZileLucratoare(azi, zile?.ridicare ?? 1), zile?.livrare ?? 2),
  );
  const [oraDe, setOraDe] = useState("");
  const [oraPana, setOraPana] = useState("");

  const [lift, setLift] = useState(false);
  const [acces, setAcces] = useState(false);
  const [programare, setProgramare] = useState(false);
  const [depaletare, setDepaletare] = useState(false);
  const [inSediu, setInSediu] = useState(false);
  const [asistare, setAsistare] = useState(false);
  const [asigurare, setAsigurare] = useState(false);
  const [observatii, setObservatii] = useState("");

  /*
   * ⚠ Suma se ia dupa BANI, nu dupa metoda de plata: o comanda cu plata online
   * ramasa neplatita arata ca una cu cardul si ar trece nebagata in seama. Vezi
   * `rambursDeIncasat` — s-a intamplat deja in productie.
   */
  const deIncasat = areAwb ? 0 : rambursDeIncasat({ payment_status: order.payment_status, total: order.total });
  const [confirmaFaraIncasare, setConfirmaFaraIncasare] = useState(false);

  const [creating, setCreating] = useState(false);
  const [seDescarca, setSeDescarca] = useState<"label" | "note" | null>(null);
  const [validand, setValidand] = useState(false);
  const [borderou, setBorderou] = useState<{ id: number; validat: number; partide: number } | null>(null);
  const [borderouCerut, setBorderouCerut] = useState(false);

  async function descarca(fel: "label" | "note") {
    setSeDescarca(fel);
    try {
      const res = await fetch(`/api/pallex/document?orderId=${order.id}&businessId=${businessId}&fel=${fel}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(j?.error ?? "Documentul nu a putut fi descarcat");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fel === "label" ? "eticheta" : "aviz"}-pallex-${awbCurent}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setSeDescarca(null);
    }
  }

  /**
   * Starea borderoului, ceruta la cerere.
   *
   * ⚠ E un apel catre Pall-Ex, deci nu se face la fiecare deschidere de modal:
   * comerciantul apasa cand vrea sa vada, iar butonul de validare spune atunci
   * CATE partide porneste.
   */
  async function vezBorderoul() {
    setBorderouCerut(true);
    const r = await stareBorderouAction(businessId, order.id);
    if ("error" in r) {
      toast.error(r.error);
      setBorderouCerut(false);
      return;
    }
    /*
     * ⚠ `stare: null` NU inseamna „se incarca".
     *
     * Randarea de mai jos trateaza `borderou === null` ca „se citeste", iar
     * butonul nu mai revine fiindca `borderouCerut` a ramas true. Deci un borderou
     * pe care Pall-Ex nu-l intoarce bloca fereastra DEFINITIV, si tocmai pe pasul
     * fara de care marfa nu pleaca.
     */
    if (!r.stare) {
      toast.error("Nu am putut citi borderoul de la Pall-Ex. Incearca din nou.");
      setBorderouCerut(false);
      return;
    }
    setBorderou(r.stare);
  }

  async function valideaza() {
    setValidand(true);
    const r = await valideazaBorderouAction(businessId, order.id);
    setValidand(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    toast.success("Borderou validat — marfa poate pleca");
    setBorderou((b) => (b ? { ...b, validat: BORDEROU_VALIDAT_DE_CLIENT } : b));
  }

  async function handleCreate() {
    if (!nume.trim()) return toast.error("Numele destinatarului este obligatoriu");
    if (!oras.trim()) return toast.error("Localitatea destinatarului este obligatorie");
    if (!judet) return toast.error("Judetul destinatarului este obligatoriu — Pall-Ex il cere ca ISO auto");
    if (!codPostal.trim()) return toast.error("Codul postal al destinatarului este obligatoriu la Pall-Ex");
    if (!strada.trim()) return toast.error("Adresa destinatarului este obligatorie");

    const paleti = parseInt(numarPaleti, 10);
    if (!Number.isFinite(paleti) || paleti < 1) return toast.error("Numarul de paleti trebuie sa fie cel putin 1");

    const kg = parseFloat(weight);
    if (!Number.isFinite(kg) || kg <= 0) return toast.error("Completeaza greutatea totala a marfii");

    if (deIncasat > 0 && !confirmaFaraIncasare) {
      return toast.error("Confirma ca stii ca Pall-Ex nu incaseaza la livrare");
    }

    /*
     * Dimensiunile sunt optionale, dar merg impreuna: `Pallet` cere toate patru
     * masuratorile, iar o lista partiala e respinsa cu totul. Fara ele, partida
     * pleaca doar cu numarul de paleti si greutatea totala.
     */
    const L = parseFloat(lungime);
    const l = parseFloat(latime);
    const h = parseFloat(inaltime);
    const areDimensiuni = [L, l, h].every((v) => Number.isFinite(v) && v > 0);
    const listaPaleti = areDimensiuni
      ? Array.from({ length: paleti }, () => ({
          weight: Math.round((kg / paleti) * 100) / 100,
          length: L, width: l, height: h,
        }))
      : undefined;

    const date: DatePallEx = {
      destinatar: {
        nume: nume.trim(),
        companie: addr.company ?? null,
        strada: strada.trim(),
        oras: oras.trim(),
        judet,
        codPostal: codPostal.trim(),
        telefon: telefon.trim(),
      },
      numarPaleti: paleti,
      greutateKg: kg,
      paleti: listaPaleti,
      dataRidicare,
      dataLivrare,
      oraDeschidereLivrare: oraDe || null,
      oraInchidereLivrare: oraPana || null,
      valoare: asigurare ? Number(order.total) || 0 : undefined,
      observatii: observatii.trim() || null,
      servicii: {
        liftLaLivrare: lift,
        accesRestrictionatLaLivrare: acces,
        programareLivrare: programare,
        depaletare,
        livrareInSediu: inSediu,
        asistareReceptie: asistare,
        asigurare,
      },
      confirmaFaraIncasare,
    };

    setCreating(true);
    const r = await createPallexAwbAction(businessId, order.id, date);
    setCreating(false);

    if ("error" in r) {
      toast.error(r.error);
      return;
    }

    setEmisa({ awb: r.awb, bordereauId: r.bordereauId });
    if (r.validat) {
      /* Borderoul e deja validat automat: nu mai are ce sa astepte de la om. */
      setBorderouCerut(true);
      setBorderou(r.bordereauId
        ? { id: r.bordereauId, validat: BORDEROU_VALIDAT_DE_CLIENT, partide: 0 }
        : null);
      toast.success(`Partida Pall-Ex ${r.awb} creata si borderoul validat — marfa poate pleca`);
    } else {
      toast.success(
        `Partida Pall-Ex ${r.awb} creata. Marfa NU pleaca pana cand nu validezi borderoul.`,
      );
    }
  }

  const nota = notaGreutate(dinCatalog, liniiFaraGreutate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Package className="h-5 w-5" />
            Partida Pall-Ex
          </h2>
          <button onClick={incheie} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {areAwb && (
          <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm">
            <p>
              {emisa ? "Partida Pall-Ex creata: " : "Comanda are partida Pall-Ex "}
              <strong>{awbCurent}</strong>.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => descarca("label")} disabled={seDescarca !== null}>
                {seDescarca === "label" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Eticheta
              </Button>
              <Button size="sm" variant="outline" onClick={() => descarca("note")} disabled={seDescarca !== null}>
                {seDescarca === "note" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Aviz de transport
              </Button>
            </div>

            {/*
              ⚠ Pasul fara de care marfa NU pleaca. E si ireversibil, si nu doar
              pentru comanda asta: un borderou strange partidele mai multor
              comenzi, iar dupa validare niciuna nu se mai poate anula. De aia
              butonul nu apare singur — intai se cere starea, care spune cate
              partide sunt in borderou.
            */}
            {/*
              ⚠ Partida fara borderou nu are voie sa treaca in tacere: textul de
              la emitere tocmai a promis butonul „in aceeasi fereastra", iar
              `bordereau_id` poate lipsi din raspunsul crearii (client.ts o spune
              explicit). Fara ramura asta, comerciantul ramanea cu o partida care
              nu pleaca si fara niciun indiciu de ce.
            */}
            {!borderouId && (
              <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="flex items-start gap-2 text-xs font-medium text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  Nu stim in ce borderou a intrat partida.
                </p>
                <p className="text-xs text-muted-foreground">
                  Marfa NU pleaca pana cand borderoul nu e validat, iar validarea nu se
                  poate face de aici fara numarul lui. Valideaza-l din contul ClientPlus,
                  sau anuleaza partida din „Editeaza comanda" si emite din nou.
                </p>
              </div>
            )}

            {borderouId && (
              <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3">
                <p className="flex items-start gap-2 text-xs font-medium text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  Marfa pleaca abia dupa validarea borderoului {borderouId}.
                </p>

                {!borderouCerut ? (
                  <Button size="sm" variant="outline" onClick={vezBorderoul}>
                    Vezi borderoul
                  </Button>
                ) : borderou === null ? (
                  <p className="text-xs text-muted-foreground">Se citeste borderoul...</p>
                ) : borderou.validat > 0 ? (
                  <p className="text-xs font-semibold text-success">
                    Borderou deja validat ({borderou.validat === BORDEROU_VALIDAT_DE_CLIENT
                      ? "de tine"
                      : "si de transportator"}). Marfa e pe drum.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Borderoul contine <strong>{borderou.partide || "?"}</strong>{" "}
                      {borderou.partide === 1 ? "partida" : "partide"}. Validarea le porneste
                      pe toate si niciuna nu se mai poate anula dupa aceea.
                    </p>
                    <Button size="sm" onClick={valideaza} disabled={validand}>
                      {validand ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Valideaza borderoul
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {!areAwb && (
          <div className="space-y-3">
            {/*
              ⚠ Avertismentul care nu apare la niciun alt curier. Pall-Ex nu are
              ramburs, deci pe o comanda neplatita marfa pleaca fara nicio cale de
              incasare — si asta nu se mai poate repara a doua zi.
            */}
            {deIncasat > 0 && (
              <label className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmaFaraIncasare}
                  onChange={(e) => setConfirmaFaraIncasare(e.target.checked)}
                />
                <span>
                  Comanda are <strong>{deIncasat.toFixed(2)} lei neincasati</strong>, iar
                  Pall-Ex <strong>nu incaseaza la livrare</strong>. Confirm ca trimit marfa
                  oricum si ca banii se incaseaza altfel.
                </span>
              </label>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Nume destinatar *</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={nume} onChange={(e) => setNume(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Telefon</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={telefon} onChange={(e) => setTelefon(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Localitate *</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={oras} onChange={(e) => setOras(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Judet *</span>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={judet} onChange={(e) => setJudet(e.target.value)}>
                  <option value="">Alege judetul</option>
                  {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-muted-foreground">Strada si numar *</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={strada} onChange={(e) => setStrada(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Cod postal *</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={codPostal} onChange={(e) => setCodPostal(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Numar de paleti</span>
                <input type="number" min={1} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={numarPaleti} onChange={(e) => setNumarPaleti(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Greutate totala (kg)</span>
                <input type="number" step="0.01" min={0} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={weight} onChange={(e) => setWeight(e.target.value)} />
              </label>
            </div>

            {nota && <p className="text-xs text-muted-foreground">{nota}</p>}

            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-medium text-foreground">
                Dimensiunile unui palet (optional, in cm)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="Lungime" type="number" min={0}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={lungime} onChange={(e) => setLungime(e.target.value)} />
                <input placeholder="Latime" type="number" min={0}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={latime} onChange={(e) => setLatime(e.target.value)} />
                <input placeholder="Inaltime" type="number" min={0}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={inaltime} onChange={(e) => setInaltime(e.target.value)} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Se trimit doar completate toate trei — Pall-Ex refuza o masuratoare
                partiala. Greutatea se imparte egal intre paleti.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Data ridicarii *</span>
                <input type="date" min={azi} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={dataRidicare} onChange={(e) => setDataRidicare(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Data livrarii *</span>
                <input type="date" min={dataRidicare} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={dataLivrare} onChange={(e) => setDataLivrare(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Destinatarul primeste de la</span>
                <input type="time" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={oraDe} onChange={(e) => setOraDe(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">... pana la</span>
                <input type="time" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={oraPana} onChange={(e) => setOraPana(e.target.value)} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Orele lasate goale se iau din configurarea Pall-Ex. Sarbatorile legale nu
              sunt luate in calcul la datele propuse — doar sambetele si duminicile.
            </p>

            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-medium text-foreground">Servicii la livrare</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {([
                  ["Masina cu lift", lift, setLift],
                  ["Acces restrictionat", acces, setAcces],
                  ["Livrare cu programare", programare, setProgramare],
                  ["Depaletare", depaletare, setDepaletare],
                  ["Livrare in sediu", inSediu, setInSediu],
                  ["Asistare la receptie", asistare, setAsistare],
                ] as const).map(([eticheta, valoare, seteaza]) => (
                  <label key={eticheta} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={valoare} onChange={(e) => seteaza(e.target.checked)} />
                    {eticheta}
                  </label>
                ))}
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={asigurare} onChange={(e) => setAsigurare(e.target.checked)} />
                  Asigurare ({(Number(order.total) || 0).toFixed(2)} lei)
                </label>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Fiecare serviciu bifat se tarifeaza separat de Pall-Ex.
              </p>
            </div>

            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Observatii pentru transportator</span>
              <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={observatii} onChange={(e) => setObservatii(e.target.value)} />
            </label>

            <p className="rounded-md border border-info/30 bg-info/5 px-3 py-2 text-xs">
              Dupa emitere, marfa NU pleaca imediat: partida intra intr-un borderou pe
              care trebuie sa-l validezi. Butonul apare aici, in aceeasi fereastra.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={incheie} disabled={creating}>Renunta</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="animate-spin" /> : <Package className="h-4 w-4" />}
                {creating ? "Se emite..." : "Creeaza partida"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
