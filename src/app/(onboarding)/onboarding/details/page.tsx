"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UrmaPasOnboarding } from "@/components/edinio-marketing/UrmaPalnie";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { CadruPas } from "@/components/onboarding/CadruPas";
import { campCls, ButonContinua } from "@/components/onboarding/campuri";
import { slugify } from "@/lib/utils/slugify";
import { checkSlugAvailability } from "@/lib/actions/business.actions";
import { trackOnboardingStep } from "@/lib/actions/auth.actions";
import { urmareste } from "@/lib/edinio-marketing/magistrala";
import { citesteCiorna, scrieCiorna } from "@/lib/onboarding/ciorna";
import { normalizeazaTelefon, telefonValid } from "@/lib/onboarding/aspect";

type StareAdresa = "idle" | "checking" | "available" | "taken";

export default function OnboardingDetailsPage() {
  const router = useRouter();
  const [nume, setNume] = useState("");
  const [telefon, setTelefon] = useState("");
  const [slug, setSlug] = useState("");
  /* Cat timp omul n-a scris el adresa, ea urmeaza numele. Dupa ce a scris-o, nu i-o mai rescriem. */
  const [slugAtins, setSlugAtins] = useState(false);
  const [stareAdresa, setStareAdresa] = useState<StareAdresa>("idle");
  const [erori, setErori] = useState<{ nume?: string; telefon?: string; slug?: string }>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const verificaAdresa = useCallback((valoare: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!valoare || valoare.length < 3 || !/^[a-z0-9-]+$/.test(valoare)) {
      setStareAdresa("idle");
      return;
    }
    setStareAdresa("checking");
    timerRef.current = setTimeout(async () => {
      const libera = await checkSlugAvailability(valoare);
      setStareAdresa(libera ? "available" : "taken");
    }, 500);
  }, []);

  /*
    Track step + transfer plan from cookie (Google OAuth flow).

    ⚠ AICI ERA UN `CompleteRegistration` TRIMIS A DOUA OARA, scos pe 01.09.2026:
    acelasi cont nou e numarat de `UrmaContNou` (layoutul onboardingului), dintr-un
    jeton scris de SERVER in actiunea care creeaza contul. Drumul serverului are un
    `event_id` si prinde si inscrierile prin Google.
  */
  useEffect(() => {
    trackOnboardingStep("details");
    // Google OAuth: plan comes via cookie since sessionStorage doesn't survive redirect
    const cookieMatch = document.cookie.match(/preselected_plan=(\w+)/);
    if (cookieMatch && ["basic", "premium", "ultra"].includes(cookieMatch[1])) {
      sessionStorage.setItem("preselected_plan", cookieMatch[1]);
      document.cookie = "preselected_plan=; path=/; max-age=0";
    }
    /* Cine se intoarce (buton „Inapoi", fila redeschisa) isi gaseste ce scrisese. */
    const c = citesteCiorna();
    if (c) {
      /* eslint-disable react-hooks/set-state-in-effect -- citire unica din stocarea browserului, dupa montare */
      if (c.business_name) setNume(c.business_name);
      if (c.phone) setTelefon(c.phone);
      if (c.slug) { setSlug(c.slug); setSlugAtins(true); verificaAdresa(c.slug); }
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [verificaAdresa]);

  function schimbaNume(v: string) {
    setNume(v);
    if (erori.nume) setErori((e) => ({ ...e, nume: undefined }));
    if (!slugAtins) {
      const s = slugify(v).slice(0, 50);
      setSlug(s);
      verificaAdresa(s);
    }
  }

  function schimbaAdresa(v: string) {
    const s = v.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 50);
    setSlug(s);
    setSlugAtins(true);
    if (erori.slug) setErori((e) => ({ ...e, slug: undefined }));
    verificaAdresa(s);
  }

  function valideaza() {
    const e: typeof erori = {};
    const n = nume.trim();
    if (n.length < 2) e.nume = "Scrie numele magazinului (cel puțin 2 caractere).";
    else if (n.length > 100) e.nume = "Numele poate avea cel mult 100 de caractere.";
    if (!telefonValid(normalizeazaTelefon(telefon))) e.telefon = "Scrie un număr de telefon românesc, de exemplu 0722 123 456.";
    if (slug.length < 3) e.slug = "Adresa trebuie să aibă cel puțin 3 caractere.";
    else if (stareAdresa === "taken") e.slug = "Adresa e deja folosită de alt magazin. Încearcă alta.";
    setErori(e);
    return Object.keys(e).length === 0;
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (stareAdresa === "checking" || !valideaza()) return;

    scrieCiorna({
      business_name: nume.trim(),
      phone: normalizeazaTelefon(telefon),
      slug,
    });

    /*
      ═══ ⚠ NU MAI E `Lead` ═══

      Randurile de aici trimiteau `Lead` (Meta) si `SubmitForm` (TikTok), adica
      exact numele sub care pleaca si o cerere din formularul de contact, deci
      „Lead" amesteca un client interesat cu un cont pe jumatate creat. Acum pasul
      se numeste ce este: `onboarding_step_complete`. Catre Meta si TikTok nu pleaca
      nimic de aici; `begin_checkout` pleaca la apasarea catre plata.
    */
    urmareste({ name: "onboarding_step_complete", onboarding_step: "details", onboarding_step_index: 1 });
    router.push("/onboarding/aspect");
  }

  return (
    <>
      <UrmaPasOnboarding pas="details" index={1} />
      <CadruPas
        pas={1}
        titlu="Hai să-ți creăm magazinul"
        descriere="Trei informații și magazinul tău e aproape gata. Le poți schimba oricând din panou."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <div>
            <label htmlFor="business_name" className="mb-1.5 block text-sm font-medium text-foreground">
              Numele magazinului
            </label>
            <input
              id="business_name"
              type="text"
              autoComplete="organization"
              placeholder="De exemplu: Florăria Mirei"
              value={nume}
              onChange={(e) => schimbaNume(e.target.value)}
              aria-invalid={!!erori.nume}
              aria-describedby={erori.nume ? "eroare-nume" : undefined}
              className={campCls(!!erori.nume)}
              autoFocus
            />
            {erori.nume && <p id="eroare-nume" className="mt-1.5 text-xs text-destructive">{erori.nume}</p>}
          </div>

          <div>
            <label htmlFor="slug" className="mb-1.5 block text-sm font-medium text-foreground">
              Adresa magazinului
            </label>
            <div
              className={
                "flex items-center overflow-hidden rounded-lg border bg-surface transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 " +
                (erori.slug || stareAdresa === "taken" ? "border-destructive" : "border-border")
              }
            >
              <span className="select-none border-r border-border bg-muted/50 px-3 py-3 text-sm text-muted-foreground">edinio.com/</span>
              <input
                id="slug"
                type="text"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="magazinul-tau"
                value={slug}
                onChange={(e) => schimbaAdresa(e.target.value)}
                aria-invalid={!!erori.slug || stareAdresa === "taken"}
                aria-describedby="stare-adresa"
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <span className="pr-3" aria-hidden>
                {stareAdresa === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {stareAdresa === "available" && <Check className="h-4 w-4 text-primary" />}
                {stareAdresa === "taken" && <X className="h-4 w-4 text-destructive" />}
              </span>
            </div>
            <p id="stare-adresa" className={"mt-1.5 text-xs " + (erori.slug || stareAdresa === "taken" ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
              {erori.slug
                ?? (stareAdresa === "taken" ? "Adresa e deja folosită de alt magazin. Încearcă alta."
                  : stareAdresa === "available" ? "Adresa e liberă."
                  : "Poți conecta mai târziu și un domeniu propriu, de exemplu magazinul-tau.ro.")}
            </p>
          </div>

          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-foreground">
              Telefonul magazinului
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="0722 123 456"
              value={telefon}
              onChange={(e) => { setTelefon(e.target.value); if (erori.telefon) setErori((x) => ({ ...x, telefon: undefined })); }}
              aria-invalid={!!erori.telefon}
              aria-describedby="ajutor-telefon"
              className={campCls(!!erori.telefon)}
            />
            <p id="ajutor-telefon" className={"mt-1.5 text-xs " + (erori.telefon ? "text-destructive" : "text-muted-foreground")}>
              {erori.telefon ?? "Apare pe magazin, ca să te poată contacta clienții."}
            </p>
          </div>

          <ButonContinua dezactivat={stareAdresa === "checking"}>Continuă</ButonContinua>
        </form>
      </CadruPas>
    </>
  );
}
