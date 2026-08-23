"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { submitContactMessage } from "@/lib/actions/contact.actions";
import { MAX } from "@/lib/website/contact-form";
import { incarcaRecaptcha, recaptchaActiv, tokenRecaptcha } from "@/lib/website/recaptcha-client";
import { BUTON_INACTIV, butonVerde } from "@/lib/website/buton";
import { cn } from "@/lib/utils/cn";

/**
 * Formularul de pe `/contact`.
 *
 * ⚠ CEL DINAINTE NU TRIMITEA NIMIC. `handleSubmit` doar chema `preventDefault()`
 * si punea „Mesaj trimis" pe ecran. Fiecare om care a scris de pe pagina asta a
 * plecat crezand ca a luat legatura cu noi. Nu era o functie neterminata cu un
 * `TODO` deasupra: arata exact ca una care merge, si de-aia a stat asa.
 *
 * ═══ CE SE VEDE CAND CEVA NU MERGE ═══
 *
 * Trei stari, nu doua: se scrie, se trimite, s-a trimis — plus eroarea, care
 * NU sterge ce a scris omul. Un formular care se goleste la eroare pierde zece
 * randuri scrise cu mana si nu mai e reincercat de nimeni.
 *
 * ═══ VERIFICAREA DE PE SERVER E CEA CARE CONTEAZA ═══
 *
 * `required` si `type="email"` de aici sunt comoditate: opresc apasarea inutila
 * si arata greseala langa camp. Regula adevarata sta in `lib/website/contact-form.ts`
 * si e chemata din actiune — o actiune de server poate fi apelata cu orice corp.
 */

const CAMP =
  "w-full rounded-[8px] border border-hairline bg-white px-3.5 text-[15px] text-ink placeholder:text-ink-3 transition-colors duration-200 focus:border-ink-3 focus:outline-none focus:ring-2 focus:ring-ink/5";

export function ContactForm() {
  const [trimis, setTrimis] = useState(false);
  const [eroare, setEroare] = useState<string | null>(null);
  const [seTrimite, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEroare(null);
    const f = new FormData(e.currentTarget);

    startTransition(async () => {
      /* Tokenul se cere ACUM, nu la incarcarea paginii: expira in 2 minute, iar
         unul luat inainte ca omul sa scrie mesajul e mort la trimitere. */
      const captchaToken = await tokenRecaptcha("contact");

      const res = await submitContactMessage({
        nume: String(f.get("nume") ?? ""),
        email: String(f.get("email") ?? ""),
        telefon: String(f.get("telefon") ?? ""),
        mesaj: String(f.get("mesaj") ?? ""),
        acord: f.get("acord") === "on",
        captchaToken,
      });
      if (res.ok) setTrimis(true);
      else setEroare(res.error);
    });
  }

  if (trimis) {
    return (
      <div className="placa rounded-[16px] px-6 py-10 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          {/* `--primary`, nu verdele de marca: #1AB554 are pe alb 2,70:1. Doctrina
              celor doi verzi e in capul lui `globals.css`. */}
          <Check className="h-5 w-5 text-primary" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <p className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-ink">
          Am primit mesajul tău
        </p>
        <p className="mx-auto mt-2 max-w-[380px] text-[15px] leading-[1.6] text-ink-2">
          Ți-am trimis o confirmare pe email. Îți răspundem în programul de asistență.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      /* Scriptul Google se aduce la PRIMA atingere a formularului, nu la
         deschiderea paginii: cine doar citeste programul si pleaca nu trimite
         nimic catre Google. Vezi `lib/website/recaptcha-client.ts`. */
      onFocusCapture={() => { void incarcaRecaptcha(); }}
      className="placa rounded-[16px] p-6 sm:p-7"
      noValidate={false}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Camp eticheta="Nume complet" nume="nume">
          <input
            id="nume" name="nume" type="text" required autoComplete="name"
            maxLength={MAX.nume} placeholder="Ion Popescu"
            className={`${CAMP} h-11`}
          />
        </Camp>
        <Camp eticheta="Telefon" nume="telefon">
          <input
            id="telefon" name="telefon" type="tel" required autoComplete="tel"
            maxLength={MAX.telefon} placeholder="0750 456 809"
            className={`${CAMP} h-11`}
          />
        </Camp>
      </div>

      <div className="mt-4">
        <Camp eticheta="Email" nume="email">
          <input
            id="email" name="email" type="email" required autoComplete="email"
            maxLength={MAX.email} placeholder="ion@exemplu.ro"
            className={`${CAMP} h-11`}
          />
        </Camp>
      </div>

      <div className="mt-4">
        <Camp eticheta="Mesaj" nume="mesaj">
          <textarea
            id="mesaj" name="mesaj" required rows={5}
            maxLength={MAX.mesaj} placeholder="Cu ce te putem ajuta?"
            className={`${CAMP} resize-y py-3 leading-[1.6]`}
          />
        </Camp>
      </div>

      {/*
        Acordul. Bifa e OBLIGATORIE si se verifica si pe server: consimtamantul
        e temeiul pe care prelucram datele, iar `required` pe caseta e doar o
        comoditate — actiunea poate fi chemata cu orice corp.

        Caseta e desenata cu `accent-color`, nu inlocuita cu un `<div>` stilizat:
        una adevarata primeste focus, se bifeaza cu SPATIU si e citita corect de
        cititoarele de ecran, fara nicio linie de cod in plus.
      */}
      <label className="mt-6 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="acord"
          required
          className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded-[4px] accent-primary"
        />
        <span className="text-[14px] leading-[1.55] text-ink-2">
          Sunt de acord cu{" "}
          {/* `next/link`, nu `<a>`: e o pagină a site-ului, deci se navighează fără
              reîncărcare. Formularul de migrare, scris mai târziu după modelul
              ăstuia, o făcea deja corect. */}
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
        Eroarea sta LANGA buton, nu sus: acolo se uita omul dupa ce apasa.
        `role="alert"` o anunta si cititoarelor de ecran, care altfel n-ar
        observa un text aparut fara sa se schimbe pagina.
      */}
      {eroare ? (
        <p role="alert" className="mt-5 text-[14px] leading-[1.5] text-[#B42318]">
          {eroare}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={seTrimite}
        className={cn("mt-6 w-full sm:w-auto", butonVerde(), BUTON_INACTIV)}
      >
        {seTrimite ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Se trimite...
          </>
        ) : (
          "Trimite mesajul"
        )}
      </button>

      {/*
        Randul cerut de Google.
        Cand insigna „protected by reCAPTCHA" nu se afiseaza — si nu se afiseaza,
        fiindca scriptul vine abia la prima atingere — conditiile de folosire cer
        ca pagina sa spuna asta in text, cu linkuri catre politica si termenii
        lor. Nu e podoaba si nu se taie ca sa iasa mai curat.
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

/** Eticheta + campul, legate prin `htmlFor`/`id`. */
function Camp({
  eticheta,
  nume,
  children,
}: {
  eticheta: string;
  nume: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={nume} className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {eticheta}
      </label>
      {children}
    </div>
  );
}
