"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { submitMigrationLead } from "@/lib/actions/migration.actions";
import {
  MARIMI_CATALOG,
  MAX,
  PLATFORME_FORMULAR,
} from "@/lib/website/migrare-form";
import {
  incarcaRecaptcha,
  recaptchaActiv,
  tokenRecaptcha,
} from "@/lib/website/recaptcha-client";
import { BUTON_INACTIV, butonVerde } from "@/lib/website/buton";
import { cn } from "@/lib/utils/cn";

/**
 * Formularul de cerere de migrare, din secțiunea „Platforme" de pe `/migrare`.
 *
 * Cerut de client (19.08) cu câmpurile scrise pe rând. E singurul formular de pe
 * pagină și, de acum, ultimul lucru dinaintea subsolului — până la el, pagina doar
 * povestea ce se mută, fără să ceară nimic.
 *
 * ⚠ ACELAȘI TIPAR CA `ContactForm`, dinadins, până la clasele câmpurilor. Sunt
 * două formulare publice pe același site; dacă unul arată altfel sau se poartă
 * altfel la eroare, diferența nu spune nimic — e doar zgomot. Ce e comun se ia de
 * acolo, nu se reinventează.
 *
 * ═══ TREI STĂRI, ȘI EROAREA NU ȘTERGE NIMIC ═══
 *
 * Se scrie, se trimite, s-a trimis. Un formular care se golește la eroare pierde
 * tot ce a completat omul și nu mai e reîncercat de nimeni.
 *
 * ═══ VERIFICAREA DE PE SERVER E CEA CARE CONTEAZĂ ═══
 *
 * `required` și `type="email"` de aici sunt comoditate: opresc apăsarea inutilă și
 * arată greșeala lângă câmp. Regula adevărată stă în `lib/website/migrare-form.ts`
 * și e chemată din acțiune — o acțiune de server poate fi apelată cu orice corp.
 */

const CAMP =
  "w-full rounded-[8px] border border-hairline bg-white px-3.5 text-[15px] text-ink placeholder:text-ink-3 transition-colors duration-200 focus:border-ink-3 focus:outline-none focus:ring-2 focus:ring-ink/5";

export function FormularMigrare() {
  const [trimis, setTrimis] = useState(false);
  const [eroare, setEroare] = useState<string | null>(null);
  const [seTrimite, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEroare(null);
    const f = new FormData(e.currentTarget);

    startTransition(async () => {
      /* Tokenul se cere ACUM, nu la încărcarea paginii: expiră în 2 minute, iar
         unul luat înainte ca omul să completeze e mort la trimitere. */
      const captchaToken = await tokenRecaptcha("migrare");

      const res = await submitMigrationLead({
        nume: String(f.get("nume") ?? ""),
        telefon: String(f.get("telefon") ?? ""),
        email: String(f.get("email") ?? ""),
        platforma: String(f.get("platforma") ?? ""),
        produse: String(f.get("produse") ?? ""),
        mentiuni: String(f.get("mentiuni") ?? ""),
        acord: f.get("acord") === "on",
        captchaToken,
      });
      if (res.ok) setTrimis(true);
      else setEroare(res.error);
    });
  }

  if (trimis) {
    return (
      /*
        `min-h` cât formularul plin, ca lângă ilustrație caseta să nu se strângă
        brusc la jumătate când se trimite. Fără el, tot ce e sub secțiune sare în
        sus în clipa apăsării.
      */
      <div className="placa flex min-h-[420px] flex-col items-center justify-center rounded-[16px] px-6 py-12 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          {/* `--primary`, nu verdele de marca: #1AB554 are pe alb 2,70:1. Doctrina
              celor doi verzi e in capul lui `globals.css`. */}
          <Check className="h-5 w-5 text-primary" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <p className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-ink">
          Am primit cererea ta
        </p>
        <p className="mt-2 max-w-[380px] text-[15px] leading-[1.6] text-ink-2">
          Ți-am trimis o confirmare pe email. Ne uităm peste magazinul tău și te
          căutăm la telefon ca să stabilim cum facem mutarea.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      /* Scriptul Google se aduce la PRIMA atingere a formularului, nu la
         deschiderea paginii: cine doar citește secțiunea și pleacă nu trimite
         nimic către Google. Vezi `lib/website/recaptcha-client.ts`. */
      onFocusCapture={() => {
        void incarcaRecaptcha();
      }}
      className="placa rounded-[16px] p-6 sm:p-7"
    >
      <Camp eticheta="Nume complet" nume="nume">
        <input
          id="nume"
          name="nume"
          type="text"
          required
          autoComplete="name"
          maxLength={MAX.nume}
          placeholder="Ion Popescu"
          className={`${CAMP} h-11`}
        />
      </Camp>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Camp eticheta="Telefon" nume="telefon">
          <input
            id="telefon"
            name="telefon"
            type="tel"
            required
            autoComplete="tel"
            maxLength={MAX.telefon}
            placeholder="0750 456 809"
            className={`${CAMP} h-11`}
          />
        </Camp>
        <Camp eticheta="Email" nume="email">
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            maxLength={MAX.email}
            placeholder="ion@exemplu.ro"
            className={`${CAMP} h-11`}
          />
        </Camp>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Camp eticheta="Platforma actuală" nume="platforma">
          <Lista id="platforma" optiuni={PLATFORME_FORMULAR} />
        </Camp>
        <Camp eticheta="Aproximativ câte produse ai?" nume="produse">
          <Lista id="produse" optiuni={MARIMI_CATALOG} />
        </Camp>
      </div>

      <div className="mt-4">
        <Camp eticheta="Alte mențiuni" nume="mentiuni" optional>
          <textarea
            id="mentiuni"
            name="mentiuni"
            rows={4}
            maxLength={MAX.mentiuni}
            placeholder="Spune-ne dacă există ceva important legat de magazin sau migrare."
            className={`${CAMP} resize-y py-3 leading-[1.6]`}
          />
        </Camp>
      </div>

      {/*
        Acordul. Bifa e OBLIGATORIE și se verifică și pe server: consimțământul e
        temeiul pe care prelucrăm datele, iar `required` pe casetă e doar o
        comoditate — acțiunea poate fi chemată cu orice corp.

        Caseta e desenată cu `accent-color`, nu înlocuită cu un `<div>` stilizat:
        una adevărată primește focus, se bifează cu SPAȚIU și e citită corect de
        cititoarele de ecran, fără nicio linie de cod în plus.
      */}
      <label className="mt-6 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="acord"
          required
          className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded-[4px] accent-primary"
        />
        <span className="text-[14px] leading-[1.55] text-ink-2">
          Am citit și sunt de acord cu{" "}
          <Link
            href="/confidentialitate"
            className="text-ink underline decoration-1 underline-offset-[3px] transition-opacity hover:opacity-70"
          >
            Politica de confidențialitate
          </Link>
          .
        </span>
      </label>

      {/*
        Eroarea stă LÂNGĂ buton, nu sus: acolo se uită omul după ce apasă.
        `role="alert"` o anunță și cititoarelor de ecran, care altfel n-ar observa
        un text apărut fără să se schimbe pagina.
      */}
      {eroare ? (
        <p role="alert" className="mt-5 text-[14px] leading-[1.5] text-[#B42318]">
          {eroare}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={seTrimite}
        className={cn("mt-6 w-full", butonVerde(), BUTON_INACTIV)}
      >
        {seTrimite ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Se trimite...
          </>
        ) : (
          /*
            ⚠ Textul e al clientului, dat cu majuscule. Se scrie normal și se
            ridică din CSS (`uppercase`), nu se bagă majusculele în text: așa,
            cititoarele de ecran nu-l silabisesc literă cu literă, iar dacă se
            răzgândește, se schimbă o clasă, nu propoziția.
          */
          <span className="uppercase tracking-[0.02em]">Trimite cererea de migrare</span>
        )}
      </button>

      {/*
        Rândul cerut de Google. Când insigna „protected by reCAPTCHA" nu se
        afișează — și nu se afișează, fiindcă scriptul vine abia la prima atingere
        — condițiile de folosire cer ca pagina să spună asta în text, cu linkuri
        către politica și termenii lor. Nu e podoabă și nu se taie ca să iasă mai
        curat.
      */}
      {recaptchaActiv() ? (
        <p className="mt-4 text-[12.5px] leading-[1.5] text-ink-3">
          Formularul e protejat de reCAPTCHA. Se aplică{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-1 underline-offset-[3px] transition-opacity hover:opacity-70"
          >
            Politica de confidențialitate
          </a>{" "}
          și{" "}
          <a
            href="https://policies.google.com/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-1 underline-offset-[3px] transition-opacity hover:opacity-70"
          >
            Termenii
          </a>{" "}
          Google.
        </p>
      ) : null}
    </form>
  );
}

/** Eticheta + câmpul, legate prin `htmlFor`/`id`. */
function Camp({
  eticheta,
  nume,
  optional,
  children,
}: {
  eticheta: string;
  nume: string;
  /** Scrie „opțional" lângă etichetă. */
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={nume} className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {eticheta}
        {/*
          ⚠ Se marchează CE E OPȚIONAL, nu ce e obligatoriu.

          Aici un singur câmp din șase poate rămâne gol. Cu steluțe pe celelalte
          cinci, formularul ar fi arătat ca un act; așa, e un singur cuvânt în
          plus, iar restul se citește curat. E și singurul lucru pe care omul
          chiar vrea să-l afle dinainte: unde poate sări.
        */}
        {optional ? <span className="font-normal text-ink-3"> (opțional)</span> : null}
      </label>
      {children}
    </div>
  );
}

/**
 * O listă de ales dintr-una închisă.
 *
 * ⚠ `<select>` ADEVĂRAT, nu un meniu făcut din `<div>`-uri. Pe telefon deschide
 * roata nativă a sistemului, se caută cu tastatura, merge cu `Tab` și cu săgețile
 * și e citit corect de cititoarele de ecran — tot ce ar fi trebuit rescris de
 * mână, prost, într-o variantă „frumoasă".
 *
 * Prețul e că săgeata proprie a browserului nu poate fi stilizată; se ascunde cu
 * `appearance-none` și se desenează una singură, la fel pe toate browserele.
 * Locul ei e lăsat liber din `pe-10`, altfel textul lung intră pe sub ea.
 *
 * ⚠ Fără `defaultValue`: prima opțiune ar fi fost aleasă din oficiu, iar cine
 * trece peste câmp fără să se uite ne-ar fi trimis „Shopify" pentru un magazin
 * care nu e pe Shopify. Cu `required` și o opțiune goală deasupra, browserul
 * oprește trimiterea până când omul chiar alege.
 */
function Lista({ id, optiuni }: { id: string; optiuni: readonly string[] }) {
  return (
    <div className="relative">
      <select
        id={id}
        name={id}
        required
        defaultValue=""
        className={`${CAMP} h-11 cursor-pointer appearance-none pe-10 invalid:text-ink-3`}
      >
        <option value="" disabled>
          Alege
        </option>
        {optiuni.map((o) => (
          <option key={o} value={o} className="text-ink">
            {o}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
      />
    </div>
  );
}
