import { Package, ReceiptText, ShieldCheck, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormularIntrare } from "../FormularIntrare";
import type { ModAutentificare } from "../autentificare-client";
import { CARD, TITLU } from "../ui/clase";

/**
 * Intrarea in cont. Fara meniul contului: omul inca n-a intrat.
 *
 * ⚠ Textele din stanga stau DIRECT pe fundalul magazinului, deci folosesc
 * `--st-on-bg`; cardul formularului sta pe `--st-surface`.
 *
 * ⚠ Titlul, textul si lista de avantaje se aleg din Setari. Textul comerciantului
 * se arata ca atare (poate avea diacritice: e al lui, nu al nostru); sirul gol
 * inseamna textul implicit de mai jos.
 */

function Avantaj({ icon: Icon, titlu, text }: { icon: LucideIcon; titlu: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--st-radius-sm)] bg-[var(--st-primary-soft)]">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titlu}</span>
        <span className="mt-0.5 block text-sm opacity-75">{text}</span>
      </span>
    </li>
  );
}

export function EcranIntrare({
  numeMagazin,
  greutateTitlu,
  titlu = "",
  text = "",
  avantaje = true,
  modInitial = "intrare",
  dupaStergere = null,
}: {
  numeMagazin: string;
  greutateTitlu: "font-normal" | "font-semibold";
  titlu?: string;
  text?: string;
  avantaje?: boolean;
  modInitial?: ModAutentificare;
  /** Omul tocmai si-a sters contul: `cerere` spune daca cererea catre magazin a plecat. */
  dupaStergere?: { cerere: boolean | null } | null;
}) {
  return (
    <main className="flex-1" style={{ fontFamily: "var(--st-font-body)" }}>
      <div className="mx-auto w-full px-4 py-10 sm:px-6 lg:py-16" style={{ maxWidth: "min(var(--st-container), 68rem)" }}>
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16">
          <div className="order-2 text-[var(--st-on-bg)] lg:order-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest opacity-70">Contul meu</p>
            <h1 className={`mt-2 text-3xl tracking-tight lg:text-4xl ${greutateTitlu}`} style={TITLU}>
              {titlu || `Comenzile tale de la ${numeMagazin}, intr-un singur loc`}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed opacity-75 lg:text-base">
              {text || "Intri cu emailul si parola ta. Contul nou se confirma cu un cod pe email, iar comenzile facute cu aceeasi adresa apar singure."}
            </p>
            {avantaje && <ul className="mt-8 space-y-5">
              <Avantaj icon={Package} titlu="Istoricul comenzilor" text="Fiecare comanda, cu produsele, plata si livrarea ei." />
              <Avantaj icon={Truck} titlu="Urmarirea coletului" text="Unde e coletul si cand a plecat, fara sa cauti emailuri." />
              <Avantaj icon={ReceiptText} titlu="Facturile, gata de descarcat" text="Documentele emise de magazin, in PDF." />
              <Avantaj icon={ShieldCheck} titlu="Datele tale, sub control" text="Alegi ce mesaje primesti si iti poti sterge contul oricand." />
            </ul>}
          </div>

          <div className={`order-1 lg:order-2 ${CARD} p-6 sm:p-8`}>
            {dupaStergere && (
              <div role="status" className="mb-6 rounded-[var(--st-radius-sm)] bg-[var(--st-primary-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--st-text)]">
                <p className="font-semibold">Contul tau a fost sters.</p>
                {dupaStergere.cerere === true && <p className="mt-1">Magazinul a primit cererea ta de stergere a datelor din comenzi si are o luna sa raspunda.</p>}
                {dupaStergere.cerere === false && <p className="mt-1">Cererea catre magazin nu a putut fi trimisa. Scrie-i direct, din pagina de contact.</p>}
              </div>
            )}
            <FormularIntrare modInitial={modInitial} />
          </div>
        </div>
      </div>
    </main>
  );
}
