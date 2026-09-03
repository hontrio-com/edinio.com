"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { UrmaPasOnboarding } from "@/components/edinio-marketing/UrmaPalnie";
import { useRouter, useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import { Check, Loader2, Crown, Zap, Rocket, Gift, ShieldCheck, Infinity as InfinityIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { createBusiness } from "@/lib/actions/business.actions";
import { trackOnboardingStep } from "@/lib/actions/auth.actions";
import { urmareste } from "@/lib/edinio-marketing/magistrala";
import { verificaPlataOnboarding } from "@/lib/actions/plata-onboarding.actions";
import { type BillingInterval, getAnnualPrice, getAnnualMonthlyEquivalent, ANNUAL_FREE_MONTHS, PLAN_PRICES } from "@/lib/plans";
import { conversiaDinPlata } from "@/lib/edinio-marketing/verdict-plata";

const PLANS = [
  {
    id: "free",
    name: "Testare gratuita",
    price: 0,
    priceSuffix: "15 zile",
    description: "Testeaza platforma fara obligatii",
    icon: Gift,
    features: [
      "Acces complet 15 zile",
      "Pana la 10 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
    ],
    color: "border-zinc-300 hover:border-zinc-400",
    selectedColor: "border-primary bg-primary/5 ring-2 ring-primary/20",
    badge: null,
  },
  {
    id: "basic",
    name: "Basic",
    price: 99,
    priceSuffix: "lei/luna",
    description: "Pentru afaceri in crestere",
    icon: Zap,
    features: [
      "Pana la 500 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanta gratuita pe viata",
    ],
    color: "border-zinc-300 hover:border-blue-400",
    selectedColor: "border-blue-500 bg-blue-50 ring-2 ring-blue-200",
    badge: null,
  },
  {
    id: "premium",
    name: "Premium",
    price: 249,
    priceSuffix: "lei/luna",
    description: "Cel mai popular",
    icon: Crown,
    features: [
      "Pana la 2.500 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanta gratuita pe viata",
      "Manager dedicat magazinului tau",
    ],
    color: "border-primary/30 hover:border-primary",
    selectedColor: "border-primary bg-primary/5 ring-2 ring-primary/20",
    badge: "Recomandat",
  },
  {
    id: "ultra",
    name: "Ultra",
    price: 499,
    priceSuffix: "lei/luna",
    description: "Pentru afaceri mari",
    icon: Rocket,
    features: [
      "Produse nelimitate",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanta gratuita pe viata",
      "Manager dedicat magazinului tau",
    ],
    color: "border-zinc-300 hover:border-violet-400",
    selectedColor: "border-violet-500 bg-violet-50 ring-2 ring-violet-200",
    badge: null,
  },
];

export default function OnboardingPlanPage() {
  return (
    <Suspense fallback={
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
        <OnboardingProgress currentStep={2} />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    }>
      <PlanPageContent />
    </Suspense>
  );
}

function PlanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const createdRef = useRef(false);

  const isSuccess = searchParams.get("success") === "1";
  const isCancelled = searchParams.get("cancelled") === "1";

  // On mount: validate sessionStorage data exists + handle preselected plan
  useEffect(() => {
    const storedDetails = sessionStorage.getItem("onboarding_details");
    if (!storedDetails) { router.replace("/onboarding/details"); return; }

    // If coming from a campaign with ?plan=basic (saved in register page)
    const preselected = sessionStorage.getItem("preselected_plan");
    if (preselected && ["basic", "premium", "ultra"].includes(preselected) && !isSuccess && !isCancelled) {
      sessionStorage.removeItem("preselected_plan");
      setSelectedPlan(preselected);
      // Auto-start Stripe checkout. Redirectionarea e neasistata (userul nu vede
      // toggle-ul), deci folosim intervalul lunar ca sa nu il facturam anual fara
      // sa fi ales explicit.
      setLoading(true);
      sessionStorage.setItem("onboarding_pending_plan", preselected);
      sessionStorage.setItem("onboarding_pending_interval", "monthly");
      fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: preselected, interval: "monthly", return_to: "onboarding" }),
      })
        .then(r => r.json())
        .then((data: { url?: string; error?: string }) => {
          if (data.url) {
            /*
              ⚠ DUPA CONFIRMARE, NU INAINTE — si asta e deosebirea fata de forma
              de ieri. Evenimentul statea inaintea lui `fetch`, deci daca ruta de
              checkout cadea, GA4, Meta si TikTok primeau „a inceput cumpararea"
              pentru o sesiune Stripe care nu s-a nascut niciodata.

              ⚠ SI DRUMUL DE CAMPANIE PORNESTE O CUMPARARE. Omul n-a apasat nimic
              — a venit cu `?plan=...` si e dus direct la Stripe — dar fapta e
              aceeasi: incepe plata unui plan stiut, la un pret stiut.

              ⚠ ACUM AMANDOUA DRUMURILE AU ACEEASI REGULA: intai se stie ca
              sesiunea exista, abia apoi se spune ca a inceput cumpararea.
            */
            urmareste({
              name: "begin_checkout",
              plan_id: preselected,
              billing_period: "monthly",
              value: PLAN_PRICES[preselected] ?? 0,
              currency: "RON",
            });
            window.location.href = data.url;
          }
          else { toast.error(data.error ?? "Eroare la plata"); setLoading(false); }
        })
        .catch(() => { toast.error("Eroare la plata"); setLoading(false); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Track step + ensure the page opens at the top. The App Router can keep the
  // previous step's scroll position (bottom) when navigating into this Suspense
  // route, so we force scroll to top on mount (immediately + after first paint).
  useEffect(() => {
    trackOnboardingStep("plan");
    window.scrollTo(0, 0);
    const id = requestAnimationFrame(() => window.scrollTo(0, 0));
    /*
      Start-of-funnel event (skip when returning from a successful Stripe payment).

      ⚠ AICI NU MAI PLEACA `begin_checkout`, si asta e mutarea zilei de
      03.09.2026. Se tragea la INTRAREA pe pagina — deci „a inceput cumpararea"
      insemna de fapt „a deschis pagina de planuri". Fara plan ales, fara suma,
      fara moneda: un eveniment de comert care n-avea nimic de comert in el.

      ⚠ SE PASTRA PENTRU COMPARABILITATE cu lunile trecute. Numarat: 5 platitori
      in ultimele 60 de zile. Nu exista o serie istorica pe care sa merite s-o
      aperi cu un eveniment neadevarat.

      ⚠ CE PLEACA ACUM: pasul de palnie, pe numele lui. `onboarding_step_view` e
      deja in taxonomie si nu merge la Meta sau TikTok — deci nu mai afirma nimanui
      ca omul a inceput sa cumpere.

      ⚠ SI CE SE PIERDE, ca sa fie spus: pasul „details" nu trimite nimic catre
      Meta si TikTok tocmai fiindca `begin_checkout` se tragea imediat dupa (nota
      din `onboarding/details/page.tsx`). Mutat pe apasare, Meta nu mai vede
      trecerea details → plan, ci doar pe cei care chiar pornesc plata. Semnalul e
      mai rar si adevarat, in loc de des si fals.
    */
    if (!isSuccess) {
      urmareste({ name: "onboarding_step_view", onboarding_step: "plan", onboarding_step_index: 2 });
    }
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle return from Stripe success
  useEffect(() => {
    if (!isSuccess || createdRef.current) return;
    createdRef.current = true;

    const storedPlan = sessionStorage.getItem("onboarding_pending_plan");
    if (!storedPlan) return;

    setCreating(true);
    finalizeBusiness(storedPlan);
  }, [isSuccess]);

  // Show toast if payment was cancelled
  useEffect(() => {
    if (isCancelled) {
      toast.error("Plata a fost anulata. Selecteaza un plan pentru a continua.");
      // Restore previously selected plan
      const storedPlan = sessionStorage.getItem("onboarding_pending_plan");
      if (storedPlan) setSelectedPlan(storedPlan);
    }
  }, [isCancelled]);

  async function finalizeBusiness(plan: string) {
    const storedDetails = sessionStorage.getItem("onboarding_details");
    if (!storedDetails) return;

    try {
      const details = JSON.parse(storedDetails);

      // `plan` NU se mai trimite: serverul decide singur (trial gratuit sau
      // planul platit scris de webhook-ul Stripe). Il pastram aici doar pentru
      // evenimentele de analiza de mai jos.
      const result = await createBusiness({
        business_name: String(details.business_name ?? ""),
        phone: String(details.phone ?? ""),
        slug: String(details.slug ?? ""),
        primary_color: "#1AB554",
        /*
          ⚠ ID-UL SESIUNII, ca serverul sa nu acorde un trial cuiva care a platit.
          Nu e un „am platit" pe cuvantul nostru: acolo se duce la Stripe si
          intreaba. Un id inventat da „n-a platit", deci se cade pe drumul gratuit.
        */
        sesiuneStripe: searchParams.get("sid") ?? undefined,
      });

      if (result.error) {
        toast.error(result.error);
        setCreating(false);
        setLoading(false);
        return;
      }

      const paidInterval: BillingInterval =
        sessionStorage.getItem("onboarding_pending_interval") === "annual" ? "annual" : "monthly";

      sessionStorage.removeItem("onboarding_details");
      sessionStorage.removeItem("onboarding_pending_plan");
      sessionStorage.removeItem("onboarding_pending_interval");

      /*
        ⚠ `event_id` E ID-UL MAGAZINULUI TOCMAI CREAT, nu un numar aleator.

        Doua motive, si al doilea e cel important:
        1. E unic prin constructie — un magazin se creeaza o singura data.
        2. SERVERUL IL STIE. Cand se adauga trimiterea de pe server (Meta CAPI,
           TikTok Events API), ea poate folosi EXACT acelasi id fara sa-l care
           nimeni prin cookie-uri sau prin parametri de adresa. Fara asta, un
           singur abonament ar aparea ca doua conversii.
      */
      /*
        ⚠ PENTRU ABONAMENT, ID-UL SESIUNII STRIPE; pentru trial, id-ul magazinului.

        Nu e o inconsecventa, ci doua perechi deosebite. Trialul se raporteaza de
        pe server din `createBusiness`, care stie id-ul magazinului. Abonamentul se
        raporteaza din webhook-ul Stripe, care NU-l stie — la ora lui magazinul
        inca nu exista — dar stie id-ul sesiunii. Fiecare drum poarta id-ul pe care
        il are si perechea lui.

        ⚠ CADEREA PE ID-UL MAGAZINULUI nu e o plasa, e o marturisire: daca `sid`
        lipseste (o adresa veche, sau cineva care intra de-a dreptul pe `?success=1`),
        browserul trimite un id pe care webhook-ul nu-l are, deci conversia s-ar
        numara de doua ori. Se prefera asta in locul unei conversii pierdute, iar
        cazul e rar prin constructie: Stripe pune sablonul intotdeauna.
      */
      const idConversie = result.businessId ?? "";

      /*
        ═══ ⚠ CINE SPUNE CA S-A ACORDAT UN TRIAL ═══

        Pana pe 03.09.2026, randul asta intreba `plan === "free"` — adica ce scria
        in `sessionStorage`, adica ce ALESESE omul. Serverul, in schimb, stie cate
        randuri a schimbat in baza.

        Cele doua se despart mai des decat pare: omul isi face al doilea magazin si
        are deja un trial (baza refuza, browserul raporteaza oricum), sau plata a
        intrat intre timp. In amandoua, pleca o conversie din browser fara perechea
        ei de pe server — deci Meta o numara singura, n-avand cu ce s-o uneasca.

        Acum amandoua capetele citesc ACELASI adevar si poarta acelasi `event_id`.
      */
      if (result.trialRaportat) {
        urmareste({ name: "trial_start", plan_id: "free", event_id: idConversie });
      } else if (plan !== "free") {
        /*
          ═══ ⚠ ABONAMENTUL SE RAPORTEAZA NUMAI DUPA CE STRIPE CONFIRMA ═══

          Pana azi, browserul socotea plata reusita din `?success=1` si din
          `sessionStorage` — doua lucruri pe care le stapaneste chiar omul din fata
          ecranului. Cine pornea o plata si o abandona avea deja amandoua, iar o
          intoarcere pe adresa aia trimitea un `purchase` catre GA4, Google Ads,
          Meta si TikTok pentru bani neincasati.

          ⚠ SI SUMA VINE DE LA STRIPE, nu din tabelul nostru de preturi. Webhook-ul
          o ia din `amount_total` si comentariul lui spune apasat ca asa trebuie;
          browserul facea exact pe dos. Cele doua cai ar fi raportat acelasi
          abonament cu doua sume la prima reducere sau la primul pret schimbat in
          Stripe si uitat in cod.

          ⚠ DACA STRIPE NU RASPUNDE, nu se trimite nimic din browser. Perechea de
          pe server pleaca oricum, din webhook, catre Meta si TikTok. Se pierde doar
          jumatatea de browser, pentru GA4 si Google Ads — iar o conversie lipsa se
          vede si se poate recupera, pe cand una falsa intra in invatarea licitatiei
          si nu mai iese.
        */
        /*
          ═══ ⚠ SE REINCEARCA NUMAI CAND MOTIVUL E „NU STIU" ═══

          Daca Stripe nu raspunde, `purchase` nu pleaca — si asta e purtarea buna.
          Dar fara nicio reluare, o pana de doua secunde inseamna o conversie
          pierduta DEFINITIV pentru GA4 si Google Ads: pagina duce omul la panou
          dupa o secunda si opt zecimi, si nimeni nu mai intreaba niciodata.

          ⚠ SI SE REIA NUMAI PE `indisponibil`. Un „n-a platit" sau „nu e sesiunea
          lui" sunt raspunsuri LIMPEZI — reincercate, ar da acelasi lucru si ar
          intarzia degeaba omul care tocmai a terminat.

          ⚠ SCURT SI MARGINIT: doua reluari, la 600ms si 1800ms, adica sub timpul
          in care oricum sta pagina cu confetti. Ce nu se lamureste in atat ramane
          nelamurit — nu inventam o conversie ca sa nu ne lipseasca.
        */
        const sid = searchParams.get("sid") ?? "";
        let plata = await verificaPlataOnboarding(sid);
        for (const pauza of [600, 1800]) {
          if (plata.ok || plata.motiv !== "indisponibil") break;
          await new Promise((r) => setTimeout(r, pauza));
          plata = await verificaPlataOnboarding(sid);
        }
        /*
          ⚠ SI MONEDA SE VERIFICA, nu se toarna — aceeasi regula ca in webhook.
          Taxonomia cunoaste doar `RON`, fiindca atat facturam. O suma in alta
          moneda trimisa cu eticheta „RON" ar raporta un venit fals, si nimic n-ar
          arata de ce. Mai bine netrimisa.
        */
        /*
          ═══ ⚠ DACA STRIPE NU STIE, BROWSERUL NU INVENTEAZA ═══

          Pana pe 03.09.2026 randurile de mai jos cadeau pe `plan` si pe
          `paidInterval` — amandoua din `sessionStorage`, adica din ce alesese omul.
          Nota de atunci spunea „Stripe are ultimul cuvant", dar codul ii dadea
          ultimul cuvant browserului ori de cate ori Stripe tacea.

          ⚠ CE STRICA. `plan_id` si `billing_period` sunt dimensiunile dupa care
          se citeste ce se vinde. Umplute din browser, un raport pe planuri arata
          ce si-au DORIT oamenii, amestecat cu ce au CUMPARAT — si nimic nu le
          deosebeste. Suma si moneda veneau deja numai de la Stripe; acum vin toate.

          ⚠ SI DACA METADATA CHIAR LIPSESTE? Nu pleaca `purchase` din browser.
          Conversia nu se pierde: webhook-ul o trimite oricum catre Meta si TikTok,
          cu acelasi `event_id`. Se pierde doar perechea de browser pentru GA4 si
          Google Ads — si numai in cazul in care noi insine am scris gresit
          metadata la crearea sesiunii, adica un defect care trebuie sa se vada.
        */
        /* ⚠ Regula sta in `conversiaDinPlata`, ca sa se poata CHEMA dintr-o proba.
           `event_id` e chiar id-ul folosit de webhook: asa cele doua se contopesc. */
        const conversia = conversiaDinPlata(plata);
        if (conversia) {
          urmareste({ name: "purchase", ...conversia });
        }
      }

      toast.success("Magazinul tau a fost creat cu succes!");
      confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 } });
      setTimeout(() => { window.location.href = "/dashboard"; }, 1800);
    } catch {
      toast.error("A aparut o eroare. Incearca din nou.");
      setCreating(false);
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!selectedPlan) return;
    setLoading(true);

    if (selectedPlan === "free") {
      // Free trial: create business directly (no payment needed)
      await finalizeBusiness("free");
      return;
    }

    // Paid plan: redirect to Stripe Checkout
    try {
      sessionStorage.setItem("onboarding_pending_plan", selectedPlan);
      sessionStorage.setItem("onboarding_pending_interval", billingInterval);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, interval: billingInterval, return_to: "onboarding" }),
      });

      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Eroare la initializarea platii.");
        setLoading(false);
        return;
      }

      /*
        ⚠ CLIPA E „L-AM PREDAT LUI STRIPE", nu „a introdus cardul" — si numele
        imprumutat de la GA4 spune al doilea. Randul asta n-a avut niciodata o
        nota, deci momentul parea mostenit; e ales.

        ⚠ DE CE NU SE MUTA. Formularul de card e al lui Stripe, pe domeniul lor:
        n-avem cum sa vedem cand il atinge omul. Singurele clipe observabile de
        aici incolo sunt „a platit" — care e deja `purchase` — si „a esuat". Un
        eveniment tras numai la esec ar fi mai rau decat niciunul.

        ⚠ DE CE NU-I SCHIMBAM NUMELE, desi nu se potriveste. `AddPaymentInfo` e
        eveniment standard la Meta, deci se poate optimiza pe el; un nume propriu
        ar fi mai cinstit si complet nefolositor. Se plateste exactitatea numelui
        ca sa ramana folosul.

        ⚠ CE UMFLA, si de ce e primit. Cine e trimis la Stripe si se razgandeste
        acolo a trimis deja evenimentul, iar `?cancelled=1` il aduce inapoi si il
        invita la a doua apasare — deci acelasi om poate numara de mai multe ori.
        E semnal de INTENTIE, unde repetitia e primita: nu duce nici `value`, nici
        `currency`, nu e conversie in GA4 si nu e actiune de conversie in Google
        Ads. Nu se umfla niciun venit, doar un pas de palnie.
      */
      urmareste({
        name: "begin_checkout",
        plan_id: selectedPlan,
        billing_period: billingInterval,
        value: billingInterval === "annual"
          ? getAnnualPrice(selectedPlan)
          : (PLAN_PRICES[selectedPlan] ?? 0),
        currency: "RON",
      });
      window.location.href = data.url;
    } catch {
      toast.error("Eroare la initializarea platii. Incearca din nou.");
      setLoading(false);
    }
  }

  // Show loading state when returning from Stripe
  if (creating) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
        <OnboardingProgress currentStep={2} />
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Se creeaza magazinul tau...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
      <UrmaPasOnboarding pas="plan" index={2} />
      <OnboardingProgress currentStep={2} />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
            Alege planul potrivit
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground">
            Poti incepe cu testarea gratuita si face upgrade oricand
          </p>
        </div>

        {/* Toggle facturare lunar / anual */}
        <div className="mb-6 flex justify-center">
          <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border bg-muted/40">
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              disabled={loading}
              className={cn(
                "px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-60",
                billingInterval === "monthly"
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Lunar
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("annual")}
              disabled={loading}
              className={cn(
                "px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-60",
                billingInterval === "annual"
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Anual
              <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold uppercase tracking-wide">
                {ANNUAL_FREE_MONTHS} luni gratis
              </span>
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const Icon = plan.icon;
            const isFree = plan.price === 0;
            const perMonth = billingInterval === "annual" ? getAnnualMonthlyEquivalent(plan.id) : plan.price;
            const annualTotal = getAnnualPrice(plan.id);
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                disabled={loading}
                className={cn(
                  "relative flex flex-col p-5 rounded-2xl border-2 text-left transition-all disabled:opacity-60",
                  isSelected ? plan.selectedColor : plan.color
                )}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold uppercase tracking-wider">
                    {plan.badge}
                  </span>
                )}

                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    isSelected ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground">{plan.description}</p>
                  </div>
                </div>

                <div className="mb-4 min-h-[68px]">
                  {isFree ? (
                    <>
                      <span className="text-3xl font-bold text-foreground">Gratuit</span>
                      <span className="text-sm text-muted-foreground ml-2">{plan.priceSuffix}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-foreground">{perMonth}</span>
                      <span className="text-sm text-muted-foreground ml-1">lei/luna</span>
                      {billingInterval === "annual" ? (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Facturat anual: {annualTotal} lei.{" "}
                          <span className="text-primary font-semibold">{ANNUAL_FREE_MONTHS} luni gratis</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">Facturat lunar</p>
                      )}
                    </>
                  )}
                </div>

                <ul className="space-y-2 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className={cn(
                        "h-4 w-4 flex-shrink-0 mt-0.5",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )} />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className={cn(
                  "mt-4 pt-3 border-t flex items-center justify-center gap-2 text-sm font-semibold transition-colors",
                  isSelected ? "border-primary/20 text-primary" : "border-border text-muted-foreground"
                )}>
                  {isSelected ? (
                    <>
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </div>
                      Selectat
                    </>
                  ) : (
                    "Selecteaza"
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Garantii */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-8 text-xs sm:text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
            Anulezi oricand, fara costuri
          </span>
          <span className="flex items-center gap-2">
            <InfinityIcon className="h-4 w-4 text-primary flex-shrink-0" />
            Pretul tau ramane fix pe viata
          </span>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-8 pt-6 border-t border-border">
          <button type="button" onClick={() => router.push("/onboarding/details")} disabled={loading}
            className="py-3 sm:py-2.5 px-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors text-center sm:text-left disabled:opacity-40">
            Inapoi
          </button>
          <button type="button" onClick={handleCreate} disabled={loading || !selectedPlan}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 sm:py-3 text-sm font-medium text-white rounded-lg
              bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading
              ? (selectedPlan === "free" ? "Se creeaza..." : "Redirectionare catre plata...")
              : (selectedPlan && selectedPlan !== "free"
                ? "Plateste si creeaza magazinul"
                : "Creeaza magazinul gratuit")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
