"use client";

import { useState } from "react";
import { Loader2, Mail, Check } from "lucide-react";
import { aboneazaLaBlog } from "@/lib/actions/blog-abonati.actions";

/**
 * Caseta de abonare la noutățile blogului.
 *
 * ⚠ RĂSPUNSUL E ACELAȘI ȘI CÂND ADRESA E DEJA ABONATĂ. Un mesaj care ar spune
 * „ești deja abonat" transformă caseta într-o unealtă de aflat cine e abonat:
 * scrii adrese pe rând și citești răspunsul. Regula stă în acțiune, dar merită
 * știută și aici, ca să nu fie „îmbunătățită" cu un mesaj mai prietenos.
 *
 * ⚠ NIMENI NU E ABONAT PÂNĂ NU APASĂ LEGĂTURA DIN EMAIL. Textul de sub casetă o
 * spune, ca omul să știe că mai are un pas de făcut și să caute emailul.
 */
export function AbonareBlog() {
  const [email, setEmail] = useState("");
  const [trimite, setTrimite] = useState(false);
  const [gata, setGata] = useState<string | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);

  async function trimiteFormularul(e: React.FormEvent) {
    e.preventDefault();
    if (trimite) return;
    setTrimite(true);
    setEroare(null);
    const res = await aboneazaLaBlog(email);
    setTrimite(false);
    if (res.ok) { setGata(res.mesaj); setEmail(""); }
    else setEroare(res.eroare);
  }

  return (
    <section className="mt-16 rounded-2xl border border-hairline bg-tint p-6 sm:p-8">
      <div className="mx-auto max-w-[560px] text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white">
          <Mail className="h-4.5 w-4.5 text-ink-2" aria-hidden="true" />
        </span>
        <h2 className="mt-3 text-[19px] font-semibold leading-[1.3] text-ink">
          Primești noutățile pe email
        </h2>
        <p className="mt-2 text-[14.5px] leading-[1.6] text-ink-2">
          Scriem rar, doar când apare ceva care chiar ajută la vânzarea online. Te poți
          dezabona dintr-o apăsare.
        </p>

        {gata ? (
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-[14px] font-medium text-primary">
            <Check className="h-4 w-4" aria-hidden="true" />
            {gata}
          </p>
        ) : (
          <form onSubmit={trimiteFormularul} className="mt-5">
            <div className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="abonare-email" className="sr-only">Adresa ta de email</label>
              <input
                id="abonare-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="adresa@exemplu.ro"
                autoComplete="email"
                className="h-11 flex-1 rounded-full border border-hairline bg-white px-4 text-[14.5px] text-ink placeholder:text-ink-3 focus:border-ink-3/40 focus:outline-none"
              />
              <button
                type="submit"
                disabled={trimite}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[14.5px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {trimite && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Mă abonez
              </button>
            </div>
            {eroare && (
              <p role="alert" className="mt-2 text-[13px] text-red-600">{eroare}</p>
            )}
            <p className="mt-3 text-[12px] leading-[1.5] text-ink-3">
              Îți trimitem un email de confirmare. Abonarea începe abia după ce apeși
              legătura din el.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
