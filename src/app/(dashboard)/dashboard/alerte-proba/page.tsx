import { TrialBanner } from "@/components/dashboard/TrialBanner";
import { GracePeriodBanner } from "@/components/dashboard/GracePeriodBanner";
import { PaymentPastDueBanner } from "@/components/dashboard/PaymentPastDueBanner";
import { ActivationChecklist, type ChecklistStep } from "@/components/dashboard/ActivationChecklist";

/*
  PAGINA DE PROBA, DE ARUNCAT.

  Alertele astea se arata fiecare in alta imprejurare (trial care se apropie de
  final, plata esuata, magazin suspendat, magazin neconfigurat), deci nu pot fi
  vazute toate deodata pe un cont adevarat. Aici sunt puse una sub alta, cu date
  nascocite, exact asa cum arata in panou.

  Nu e legata din niciun meniu. Se sterge dupa ce hotaram ce facem cu ele.
*/

const PESTE = (zile: number) => new Date(Date.now() + zile * 86400000).toISOString();

const PASI_NEINCEPUTI: ChecklistStep[] = [
  { id: "product", title: "Adauga primul produs", description: "Fara produse, clientii nu au ce cumpara.", done: false, href: "/dashboard/products/new", cta: "Adauga" },
  { id: "customize", title: "Personalizeaza magazinul", description: "Adauga logo, culori si detaliile magazinului tau.", done: false, href: "/dashboard/editor", cta: "Personalizeaza" },
  { id: "publish", title: "Publica magazinul", description: "Fa magazinul vizibil pentru clientii tai.", done: false, href: "/dashboard/editor", cta: "Publica" },
  { id: "order", title: "Primeste prima comanda", description: "Distribuie link-ul pe WhatsApp si retele sociale.", done: false, share: true, cta: "Distribuie" },
];

const PASI_PE_JUMATATE = PASI_NEINCEPUTI.map((p, i) => ({ ...p, done: i < 2 }));
const PASI_GATA = PASI_NEINCEPUTI.map((p) => ({ ...p, done: true }));

export default function AlerteProba() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Alertele de cont, toate odata</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pagina de proba. Fiecare dintre ele apare in alta imprejurare; aici sunt puse cap la cap.
        </p>
      </div>

      <Sectiune
        titlu="1. Perioada de proba, cu 10 zile ramase"
        cand="Plan `free`, cat timp mai sunt cel mult 15 zile. Sus de tot, peste bara de meniu."
      >
        <TrialBanner planExpiresAt={PESTE(10)} />
      </Sectiune>

      <Sectiune titlu="2. Perioada de proba, cu 2 zile ramase" cand="Aceeasi banda, sub 3 zile.">
        <TrialBanner planExpiresAt={PESTE(2)} />
      </Sectiune>

      <Sectiune titlu="3. Perioada de proba EXPIRATA" cand="Se vede doar la adminii exceptati de la blocare: pe un cont obisnuit, panoul e inchis si omul ajunge la /reactivare.">
        <TrialBanner planExpiresAt={PESTE(-1)} />
      </Sectiune>

      <Sectiune
        titlu="4. Plata abonamentului a esuat"
        cand="Abonament platit, `payment_failed_at` scris de webhookul Stripe, inainte de suspendare."
      >
        <PaymentPastDueBanner />
      </Sectiune>

      <Sectiune titlu="5. Perioada de gratie: 5 zile pana la suspendare" cand="Magazinul are `suspended_until` in viitor.">
        <GracePeriodBanner suspendedUntil={PESTE(5)} />
      </Sectiune>

      <Sectiune titlu="6. Perioada de gratie: maine" cand="Sub 3 zile, banda devine rosie.">
        <GracePeriodBanner suspendedUntil={PESTE(1)} />
      </Sectiune>

      <Sectiune titlu="7. Magazin SUSPENDAT" cand="`suspended_until` a trecut: magazinul nu mai e vizibil clientilor.">
        <GracePeriodBanner suspendedUntil={PESTE(-2)} />
      </Sectiune>

      <Sectiune titlu="8. Pasii de pornire, niciunul facut" cand="Magazin nou. Sta in panou, sub bara de stare.">
        <ActivationChecklist steps={PASI_NEINCEPUTI} plan="free" planExpiresAt={PESTE(10)} publicUrl="https://edinio.com/magazinul-meu" />
      </Sectiune>

      <Sectiune titlu="9. Pasii de pornire, doi din patru" cand="Acelasi, dupa ce omul a inceput.">
        <ActivationChecklist steps={PASI_PE_JUMATATE} plan="free" planExpiresAt={PESTE(10)} publicUrl="https://edinio.com/magazinul-meu" />
      </Sectiune>

      <Sectiune titlu="10. Toti pasii facuti, dar tot pe proba" cand="Nu mai sunt pasi, deci in locul lor apare indemnul de a alege un plan.">
        <ActivationChecklist steps={PASI_GATA} plan="free" planExpiresAt={PESTE(10)} publicUrl="https://edinio.com/magazinul-meu" />
      </Sectiune>

      <Sectiune titlu="11. Toti pasii facuti, pe plan platit" cand="Nu se mai arata nimic (dedesubt e gol, si asa trebuie sa fie).">
        <ActivationChecklist steps={PASI_GATA} plan="premium" planExpiresAt={PESTE(300)} publicUrl="https://edinio.com/magazinul-meu" />
      </Sectiune>
    </div>
  );
}

function Sectiune({ titlu, cand, children }: { titlu: string; cand: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">{titlu}</h2>
      <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{cand}</p>
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">{children}</div>
    </section>
  );
}
