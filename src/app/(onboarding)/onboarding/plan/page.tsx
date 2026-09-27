"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { UrmaPasOnboarding } from "@/components/edinio-marketing/UrmaPalnie";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { createBusiness } from "@/lib/actions/business.actions";
import { trackOnboardingStep } from "@/lib/actions/auth.actions";
import { urmareste } from "@/lib/edinio-marketing/magistrala";
import { verificaPlataOnboarding } from "@/lib/actions/plata-onboarding.actions";
import { type BillingInterval, getAnnualPrice, getAnnualMonthlyEquivalent, ANNUAL_FREE_MONTHS, PLAN_PRICES } from "@/lib/plans";
import { conversiaDinPlata } from "@/lib/edinio-marketing/verdict-plata";
import { usePlataAbonament } from "@/components/dashboard/PlataAbonament";
import { ButonContinua, LinkInapoi } from "@/components/onboarding/campuri";
import { citesteCiorna, ciornaCompleta, stergeCiorna } from "@/lib/onboarding/ciorna";
import { culoareValida } from "@/lib/onboarding/aspect";
import type { FirmaFacturare, FirmaManuala } from "@/lib/billing/firma-abonament";

/*
 * Planurile platite, DRUMUL PRINCIPAL (27.09.2026, cerut de el: majoritatea sa
 * activeze direct un plan). Testarea gratuita e ultimul chenar, mai mic si fara
 * accent de culoare.
 *
 * Ce deosebeste planurile cu adevarat e numarul de produse si managerul dedicat;
 * comenzile nelimitate si suportul 7 din 7 sunt la toate, iar mentenanta se spune
 * o singura data, sub carduri.
 */
const PLANS = [
  { id: "basic", name: "Basic", price: 99, pentru: "Pentru început", puncte: ["Până la 500 de produse"] },
  { id: "premium", name: "Premium", price: 249, pentru: "Pentru magazine în creștere", puncte: ["Până la 2.500 de produse", "Manager dedicat"] },
  { id: "ultra", name: "Ultra", price: 499, pentru: "Pentru cataloage mari", puncte: ["Produse nelimitate", "Manager dedicat"] },
] as const;

export default function OnboardingPlanPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <OnboardingProgress currentStep={3} />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    }>
      <PlanPageContent />
    </Suspense>
  );
}

/*
  Firma verificata in ANAF la plata. Magazinul se creeaza abia dupa intoarcerea de
  la Stripe, deci datele asteapta aici, langa `onboarding_details`, si ajung la
  `createBusiness`, care le verifica din nou. Webhook-ul are oricum copia lui din
  metadata abonamentului, pentru prima factura.
*/
function pastreazaFirma(firma: FirmaFacturare | undefined) {
  if (firma) sessionStorage.setItem("onboarding_firma", JSON.stringify(firma));
}

function firmaPastrata(): FirmaFacturare | undefined {
  try {
    const brut = sessionStorage.getItem("onboarding_firma");
    return brut ? (JSON.parse(brut) as FirmaFacturare) : undefined;
  } catch {
    return undefined;
  }
}

/** Firma pastrata, in forma in care o primeste ruta de plata. */
function firmaDeRetrimis(): { cui?: string; manual?: FirmaManuala } {
  const f = firmaPastrata();
  if (!f) return {};
  return {
    cui: f.cui,
    manual: { nume: f.business_name, regCom: f.reg_com, adresa: f.address, oras: f.city, judet: f.county },
  };
}

function PlanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const createdRef = useRef(false);
  const plataAbonament = usePlataAbonament();

  const isSuccess = searchParams.get("success") === "1";
  const isCancelled = searchParams.get("cancelled") === "1";

  // On mount: validate sessionStorage data exists + handle preselected plan
  useEffect(() => {
    if (!ciornaCompleta(citesteCiorna())) { router.replace("/onboarding/details"); return; }

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
      plataAbonament.asteapta({ plan: preselected, interval: "monthly", return_to: "onboarding", ...firmaDeRetrimis() })
        .then((data) => {
          if (data?.url) {
            pastreazaFirma(data.firma);
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
          else { setLoading(false); }
        })
        .catch(() => { toast.error("Nu am putut porni plata. Încearcă din nou."); setLoading(false); });
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

      ⚠ CE PLEACA ACUM: nimic de aici. Pasul de palnie se trimitea DEJA, din
      `<UrmaPasOnboarding pas="plan" index={2} />` de mai jos — la fel ca la pasul
      „details", care are numai componenta.

      ⚠ SI O ZI AU PLECAT DOUA. Cand am scos `begin_checkout` de aici, am pus in
      locul lui un `onboarding_step_view` scris de mana, fara sa ma uit ca acelasi
      eveniment vine deja din componenta. Paza `vazut.current` din ea e per
      instanta, deci nu putea opri apelul meu, iar magistrala nu deduplica: la GA4
      ajungeau amandoua. Pasul 2 al palniei se numara dublu fata de pasul 1 — si
      inca o data la fiecare intoarcere cu `?cancelled=1`.

      ⚠ CUM S-A GASIT: o maturare adversariala pe propria mea reparatie, nu o
      proba. De aia se matura si dupa ce „s-a rezolvat".

      ⚠ SI CE SE PIERDE, ca sa fie spus: pasul „details" nu trimite nimic catre
      Meta si TikTok tocmai fiindca `begin_checkout` se tragea imediat dupa (nota
      din `onboarding/details/page.tsx`). Mutat pe apasare, Meta nu mai vede
      trecerea details → plan, ci doar pe cei care chiar pornesc plata. Semnalul e
      mai rar si adevarat, in loc de des si fals.
    */

    return () => cancelAnimationFrame(id);
    /*
      ⚠ NU MAI E NEVOIE DE `eslint-disable` AICI. Statea pentru `billingInterval`,
      citit de `begin_checkout` la montare; odata cu evenimentul a plecat si
      dependenta, iar directiva ramasa era ea insasi un avertisment.
    */
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
      toast.error("Plata a fost anulată. Alege un plan ca să continui.");
      // Restore previously selected plan
      const storedPlan = sessionStorage.getItem("onboarding_pending_plan");
      if (storedPlan) setSelectedPlan(storedPlan);
    }
  }, [isCancelled]);

  async function finalizeBusiness(plan: string) {
    const details = citesteCiorna();
    /*
      Fara ciorna (alt browser, stocare golita) nu avem din ce crea magazinul. Nu
      lasam rotita sa se invarta la nesfarsit: omul reia pasul 1. Daca tocmai a
      platit, planul e deja scris de webhook, iar crearea de dupa nu-i mai da trial.
    */
    if (!ciornaCompleta(details)) {
      setCreating(false);
      setLoading(false);
      router.replace("/onboarding/details");
      return;
    }

    try {

      // `plan` NU se mai trimite: serverul decide singur (trial gratuit sau
      // planul platit scris de webhook-ul Stripe). Il pastram aici doar pentru
      // evenimentele de analiza de mai jos.
      const result = await createBusiness({
        business_name: String(details.business_name ?? ""),
        phone: String(details.phone ?? ""),
        slug: String(details.slug ?? ""),
        /* Culoarea si stilul alese la pasul 2. Serverul le verifica din nou: vin din browser. */
        primary_color: culoareValida(details.culoare),
        stil: details.stil,
        /*
          ⚠ ID-UL SESIUNII, ca serverul sa nu acorde un trial cuiva care a platit.
          Nu e un „am platit" pe cuvantul nostru: acolo se duce la Stripe si
          intreaba. Un id inventat da „n-a platit", deci se cade pe drumul gratuit.
        */
        sesiuneStripe: searchParams.get("sid") ?? undefined,
        firma: firmaPastrata(),
      });

      if (result.error) {
        toast.error(result.error);
        setCreating(false);
        setLoading(false);
        return;
      }

      stergeCiorna();
      sessionStorage.removeItem("onboarding_pending_plan");
      sessionStorage.removeItem("onboarding_pending_interval");
      sessionStorage.removeItem("onboarding_firma");

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

          ⚠ SCURT SI MARGINIT: doua reluari, la 600ms si 1800ms, cat omul vede
          „Iti cream magazinul" (din 27.09.2026 nu mai e o pauza cu confetti: se
          merge direct in panou). Ce nu se lamureste in atat ramane
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
          Variabila a mai stat o zi acolo dupa reparatie, nemaifolosita de nimeni:
          nu mai turna nimic, dar era chiar mecanismul scos. A fost stearsa.
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

      /*
        Direct in panou (pasul „primul produs" a existat o zi si a fost scos la cererea
        lui, 27.09.2026). Incarcare intreaga, nu `router.push`: poarta din middleware
        trebuie sa vada acum `onboarding_completed`.
      */
      window.location.href = "/dashboard";
    } catch {
      toast.error("A apărut o eroare. Încearcă din nou.");
      setCreating(false);
      setLoading(false);
    }
  }

  async function handleCreate(plan: string) {
    if (!plan) return;
    setSelectedPlan(plan);
    setLoading(true);

    if (plan === "free") {
      // Free trial: create business directly (no payment needed)
      await finalizeBusiness("free");
      return;
    }

    // Paid plan: redirect to Stripe Checkout
    try {
      sessionStorage.setItem("onboarding_pending_plan", plan);
      sessionStorage.setItem("onboarding_pending_interval", billingInterval);

      const data = await plataAbonament.asteapta({ plan, interval: billingInterval, return_to: "onboarding", ...firmaDeRetrimis() });
      if (!data?.url) {
        setLoading(false);
        return;
      }
      pastreazaFirma(data.firma);

      /*
        ════════════════════════════════════════════════════════════════════
        {W} RANDURILE ASTEA AU DESCRIS O ZI UN EVENIMENT CARE NU MAI E AICI
        ════════════════════════════════════════════════════════════════════

        Pana pe 03.09.2026 aici pleca `add_payment_info`, iar nota explica de ce i
        se pastreaza numele imprumutat. Evenimentul a fost scos in aceeasi zi —
        nota nu. Deci a ramas un comentariu care sustinea, deasupra unui
        `begin_checkout`, ca linia asta trimite `AddPaymentInfo`, si care mai
        spunea si ca evenimentul „nu duce nici `value`, nici `currency`" — la doua
        randuri de un apel care duce amandoua.

        A treia oara intr-o saptamana cand textul ramane in urma codului. Nota o
        las scrisa fiindca cine gaseste `AddPaymentInfo` in istoricul acestui
        fisier trebuie sa afle ce s-a intamplat cu el, nu doar ca a disparut.

        ═══ {W} CE SE INTAMPLA CHIAR AICI ═══

        Omul a ales un plan si a apasat „continua catre plata", iar sesiunea Stripe
        e deja creata (`res.ok` si `data.url` de mai sus). Aia e clipa in care
        incepe cumpararea, si de aia evenimentul pleaca ABIA acum: inainte de
        verificare, o ruta cazuta ar fi produs „a inceput cumpararea" pentru o
        sesiune care nu s-a nascut.

        {W} SUMA E CEA CARE URMEAZA SA SE CEARA, nu una incasata. La `purchase`
        suma vine din `amount_total` de la Stripe, fiindca acolo e VENIT. Aici nu
        s-a incasat nimic: numarul spune „atat costa ce vrea omul sa cumpere", si
        se calculeaza la fel ca pretul aratat pe card — anual inseamna noua luni
        platite, nu douasprezece.

        {W} CE UMFLA, si de ce e primit. Cine ajunge la Stripe si se razgandeste a
        trimis deja evenimentul, iar `?cancelled=1` il aduce inapoi si il invita la
        a doua apasare — deci acelasi om poate numara de mai multe ori. E semnal de
        INTENTIE, unde repetitia e primita: nu e conversie in GA4 si nu e actiune de
        conversie in Google Ads, deci nu invata nicio licitatie. Ce ar fi fost grav
        e sa numere pe cine n-a ajuns niciodata la Stripe — si aia s-a inchis.
      */
      urmareste({
        name: "begin_checkout",
        plan_id: plan,
        billing_period: billingInterval,
        value: billingInterval === "annual"
          ? getAnnualPrice(plan)
          : (PLAN_PRICES[plan] ?? 0),
        currency: "RON",
      });
      window.location.href = data.url;
    } catch {
      toast.error("Nu am putut porni plata. Încearcă din nou.");
      setLoading(false);
    }
  }

  // Show loading state when returning from Stripe
  if (creating) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <OnboardingProgress currentStep={3} />
        <div className="flex flex-col items-center justify-center gap-4 py-20" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Îți creăm magazinul…</p>
        </div>
      </div>
    );
  }

  const seCreeazaGratuit = loading && selectedPlan === "free";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {plataAbonament.fereastra}
      <UrmaPasOnboarding pas="plan" index={3} />
      <div className="mx-auto max-w-3xl">
        <OnboardingProgress currentStep={3} />
      </div>

      <div className="text-center">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground sm:text-[32px]">
          Alege planul magazinului
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Prețul tău rămâne fix pe viață. Anulezi oricând, fără costuri.
        </p>

        <div className="mt-6 inline-flex rounded-lg border border-border bg-muted/50 p-1" role="radiogroup" aria-label="Perioada de facturare">
          {(["monthly", "annual"] as const).map((interval) => (
            <button
              key={interval}
              type="button"
              role="radio"
              aria-checked={billingInterval === interval}
              onClick={() => setBillingInterval(interval)}
              disabled={loading}
              className={cn(
                "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
                billingInterval === interval ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {interval === "monthly" ? "Lunar" : "Anual"}
              {interval === "annual" && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  {ANNUAL_FREE_MONTHS} luni gratis
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/*
        ⚠ PLANURILE PLATITE SUNT DRUMUL PRINCIPAL (27.09.2026), cerut de el: vrea ca
        majoritatea sa activeze direct un plan. Premium iese in fata (recomandat),
        iar testarea gratuita e ULTIMUL chenar, mai mic decat planurile si fara
        accent de culoare: se vede, dar nu concureaza cu ele.
      */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_0.8fr]">
        {PLANS.map((plan) => {
          const perMonth = billingInterval === "annual" ? getAnnualMonthlyEquivalent(plan.id) : plan.price;
          const seDuce = loading && selectedPlan === plan.id;
          const recomandat = plan.id === "premium";
          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-surface p-6",
                recomandat ? "border-primary shadow-[0_12px_32px_-12px_rgb(0_0_0/0.18)] ring-1 ring-primary" : "border-border",
              )}
            >
              {recomandat && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
                  Recomandat
                </span>
              )}
              <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{plan.pentru}</p>
              <p className="mt-5">
                <span className="text-4xl font-semibold tracking-tight text-foreground">{perMonth}</span>
                <span className="ml-1 text-sm text-muted-foreground">lei/lună</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {billingInterval === "annual" ? `${getAnnualPrice(plan.id)} lei, facturat anual` : "Facturat lunar"}
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                {[...plan.puncte, "Comenzi nelimitate", "Suport 7 zile din 7"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className={cn("h-4 w-4 shrink-0", recomandat ? "text-primary" : "text-foreground/50")} strokeWidth={2.5} />
                    {t}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => handleCreate(plan.id)}
                disabled={loading}
                className={cn(
                  "mt-6 flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50",
                  recomandat
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-foreground/80 bg-surface text-foreground hover:bg-muted",
                )}
              >
                {seDuce && <Loader2 className="h-4 w-4 animate-spin" />}
                {seDuce ? "Te ducem la plată…" : `Alege ${plan.name}`}
              </button>
            </div>
          );
        })}
        <div className="flex flex-col rounded-2xl border border-border bg-muted/30 p-5 lg:self-center">
          <h3 className="text-sm font-semibold leading-snug text-foreground">Nu vrei să alegi un plan acum?</h3>
          <p className="mt-1 text-sm text-muted-foreground">Testează gratuit 15 zile.</p>
          <button
            type="button"
            onClick={() => handleCreate("free")}
            disabled={loading}
            className="mt-4 flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {seCreeazaGratuit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {seCreeazaGratuit ? "Se creează…" : "Începe gratuit"}
          </button>
        </div>
      </div>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        Mentenanță gratuită pe viață la toate planurile. Plata se face securizat prin Stripe.
      </p>

      <LinkInapoi onClick={() => router.push("/onboarding/aspect")} />
    </div>
  );
}
