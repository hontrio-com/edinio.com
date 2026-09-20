import { TrialBanner } from "@/components/dashboard/TrialBanner";
import { GracePeriodBanner } from "@/components/dashboard/GracePeriodBanner";
import { PaymentPastDueBanner } from "@/components/dashboard/PaymentPastDueBanner";
import { ActivationChecklist, type ChecklistStep } from "@/components/dashboard/ActivationChecklist";

/*
  PAGINA DE PROBA, DE ARUNCAT INAINTE DE UNIRE (scrisa si in docs/redesign/REGISTRU.md).

  Alertele de cont apar fiecare in alta imprejurare, deci nu se pot vedea toate
  odata pe un cont adevarat. Aici sunt puse cap la cap, cu date nascocite,
  asezate in ordinea in care le intalneste un comerciant: de la „mai ai timp"
  pana la „magazinul e oprit".
*/

const PESTE = (zile: number) => new Date(Date.now() + zile * 86400000).toISOString();

const PASI: ChecklistStep[] = [
  { id: "product", title: "Adauga primul produs", description: "Fara produse, clientii nu au ce cumpara.", done: false, href: "/dashboard/products/new", cta: "Adauga" },
  { id: "customize", title: "Personalizeaza magazinul", description: "Adauga logo, culori si detaliile magazinului tau.", done: false, href: "/dashboard/editor", cta: "Personalizeaza" },
  { id: "publish", title: "Publica magazinul", description: "Fa magazinul vizibil pentru clientii tai.", done: false, href: "/dashboard/editor", cta: "Publica" },
  { id: "order", title: "Primeste prima comanda", description: "Distribuie link-ul pe WhatsApp si retele sociale.", done: false, share: true, cta: "Distribuie" },
];
const PASI_JUMATATE = PASI.map((p, i) => ({ ...p, done: i < 2 }));
const PASI_GATA = PASI.map((p) => ({ ...p, done: true }));

export default function PaginaAlerte() {
  return (
    <div className="mx-auto max-w-6xl space-y-12 p-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Alertele de cont</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toate, una sub alta, in ordinea in care le intalneste un comerciant. Aceeasi forma la
          toate; culoarea arata doar cat de grav e.
        </p>
      </header>

      <Grup titlu="Benzi, peste bara de sus">
        <Proba
          titlu="Perioada de testare, 10 zile ramase"
          cand="Plan gratuit, cat timp mai sunt cel mult 15 zile."
        >
          <TrialBanner planExpiresAt={PESTE(10)} zileRamase={10} />
        </Proba>

        <Proba titlu="Perioada de testare, 2 zile ramase" cand="Sub 3 zile trece pe chihlimbar.">
          <TrialBanner planExpiresAt={PESTE(2)} zileRamase={2} />
        </Proba>

        <Proba
          titlu="Perioada de testare expirata"
          cand="Un comerciant obisnuit nu o vede: panoul se inchide si ajunge la /reactivare. O vad adminii."
        >
          <TrialBanner planExpiresAt={PESTE(-1)} zileRamase={-1} />
        </Proba>

        <Proba
          titlu="Plata abonamentului a esuat"
          cand="Abonament platit, plata respinsa, magazinul inca merge."
        >
          <PaymentPastDueBanner />
        </Proba>

        <Proba titlu="Se suspenda in 5 zile" cand="Plata tot nu a intrat; magazinul are termen.">
          <GracePeriodBanner zileRamase={5} />
        </Proba>

        <Proba titlu="Se suspenda maine" cand="Sub 3 zile, aceeasi banda devine urgenta.">
          <GracePeriodBanner zileRamase={1} />
        </Proba>

        <Proba titlu="Magazin suspendat" cand="Termenul a trecut: magazinul nu mai e vizibil clientilor.">
          <GracePeriodBanner zileRamase={-2} />
        </Proba>
      </Grup>

      <Grup titlu="In pagina, sub bara de stare">
        <Proba titlu="Pasii de pornire, niciunul facut" cand="Magazin nou.">
          <ActivationChecklist steps={PASI} plan="free" planExpiresAt={PESTE(10)} publicUrl="https://edinio.com/magazinul-meu" />
        </Proba>

        <Proba titlu="Pasii de pornire, doi din patru" cand="Dupa ce omul a inceput.">
          <ActivationChecklist steps={PASI_JUMATATE} plan="free" planExpiresAt={PESTE(10)} publicUrl="https://edinio.com/magazinul-meu" />
        </Proba>

        <Proba titlu="Toti pasii facuti, inca pe proba" cand="In locul listei ramane indemnul de a alege un plan.">
          <ActivationChecklist steps={PASI_GATA} plan="free" planExpiresAt={PESTE(10)} publicUrl="https://edinio.com/magazinul-meu" />
        </Proba>

        <Proba titlu="Toti pasii facuti, pe plan platit" cand="Nu se mai arata nimic, si asa trebuie sa fie.">
          <ActivationChecklist steps={PASI_GATA} plan="premium" planExpiresAt={PESTE(300)} publicUrl="https://edinio.com/magazinul-meu" />
        </Proba>
      </Grup>
    </div>
  );
}

function Grup({ titlu, children }: { titlu: string; children: React.ReactNode }) {
  return (
    <section className="space-y-6">
      <h2 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{titlu}</h2>
      {children}
    </section>
  );
}

function Proba({ titlu, cand, children }: { titlu: string; cand: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{titlu}</p>
      <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{cand}</p>
      {/* Benzile se intind cat tot randul, ca in panou; cutia doar le margineste. */}
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">{children}</div>
    </div>
  );
}
