"use client";

import Image from "next/image";
import { CompanyIdentity } from "@/components/ministore/CompanyIdentity";
import { NetopiaBadge } from "@/components/ministore/NetopiaBadge";
import { EdinioCredit } from "@/components/ministore/EdinioCredit";
import { POLICY_LINKS } from "@/lib/storefront/policy-links";
import { menuItemHref } from "@/lib/pages/menu";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { ButonSetariCookie } from "./ButonSetariCookie";

/**
 * Blocul legal obligatoriu din footer. NU e optional si nu are setare de ascundere.
 *
 * Contine tot ce legea si procesatorii de plati cer sa fie public:
 *  - datele de identificare ale firmei (CUI, Reg. Com., sedii)
 *  - functia de retragere din contract, ceruta de OUG 18/2026
 *  - cele sase pagini de politici
 *  - insignele ANPC SAL si SOL
 *  - insigna Netopia, obligatorie cand plata cu cardul e activa
 *
 * Fiecare varianta de footer trebuie sa compuna aceasta componenta. Motivul e
 * simplu: cu zece variante de design, e doar o chestiune de timp pana cand una
 * ar uita o cerinta legala, iar comerciantul ar afla din amenda.
 */
/**
 * Culorile blocului, dupa fundalul footerului care il compune.
 *
 * Sirurile sunt scrise intregi, nu compuse: varianta inchisa da acelasi marcaj
 * ca inainte, cu doua exceptii asumate — titlurile de coloana si randul de
 * copyright, amandoua urcate de la un contrast sub pragul AA. Aceleasi doua
 * valori sunt duplicate in `CompanyIdentity` si `NetopiaBadge`, care compun
 * acelasi rand; se schimba impreuna, altfel footerul arata cu jumatate din
 * titluri stinse.
 */
const TON = {
  inchis: {
    // Alb 30% pe #0A0A0A da 2,6:1, sub pragul AA de 4,5:1 la 10px; 50% da 5,3:1.
    titlu: "text-[10px] font-semibold text-white/50 uppercase tracking-widest mb-3",
    link: "text-[13px] text-white/50 hover:text-white transition-colors",
    linkTare: "text-[13px] text-white/70 hover:text-white transition-colors font-medium",
    // Alb 25% pe #0A0A0A da 2,1:1, sub pragul AA de 4,5:1 cerut la 11px; 50% il
    // urca la 5,3:1 si il aliniaza cu linkurile din acelasi bloc.
    copyright: "text-[11px] text-white/50",
  },
  deschis: {
    titlu: "text-[10px] font-semibold text-[var(--st-muted)] uppercase tracking-widest mb-3",
    link: "text-[13px] text-[var(--st-muted)] hover:text-[var(--st-text)] transition-colors",
    linkTare: "text-[13px] text-[var(--st-text)] hover:opacity-70 transition-opacity font-medium",
    copyright: "text-[11px] text-[var(--st-muted)]",
  },
} as const;

export type TonFooter = keyof typeof TON;

export function FooterLegal({ ton = "inchis", cuPagini = true }: {
  ton?: TonFooter;
  /** Stins cand varianta isi arata deja paginile in coloanele ei. */
  cuPagini?: boolean;
} = {}) {
  const { business, basePath, catalogRoot, menu } = useStoreChrome();
  const t = TON[ton];
  // Paginile proprii ale magazinului. Erau in footerul paginilor custom, dar nu
  // si in cel al paginii de magazin; acum apar peste tot, ca navigarea din
  // subsol sa fie aceeasi indiferent unde te afli.
  const pagini = menu.filter((m) => m.type === "page" || m.type === "link");

  return (
    // `flex-wrap` scoate insignele pe randul urmator cand nu mai incap, in loc
    // sa lase randul sa depaseasca; `min-w-0` pe coloanele de linkuri le lasa sa
    // se stranga odata cu identitatea firmei, altfel ele stau la min-content si
    // datele firmei sunt singurele strivite.
    <div className="py-6 sm:py-8 flex flex-wrap flex-col sm:flex-row sm:items-start gap-8 sm:gap-16">
      {/* Date de identificare firma — obligatoriu legal + procesatori de plati (Netopia) */}
      <CompanyIdentity business={business} ton={ton} />

      {cuPagini && pagini.length > 0 && (
        <div className="flex-1 min-w-0">
          <p className={t.titlu}>Pagini</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {pagini.map((it) => (
              <a key={it.id} href={menuItemHref(it, basePath, catalogRoot)}
                className={t.link}>
                {it.label}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className={t.titlu}>Informatii legale</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {/* Functia de retragere din contract — obligatorie conform OUG 18/2026 */}
          <a href={`${basePath}/retur`}
            className={t.linkTare}>
            Retrage-te din contract
          </a>
          {POLICY_LINKS.map(({ slug, label }) => (
            <a key={slug} href={`${basePath}/politici/${slug}`}
              className={t.link}>
              {label}
            </a>
          ))}
          {/* Retragerea consimtamantului trebuie sa fie la fel de usoara ca
              acordarea lui. Butonul plutea peste magazin; acum sta aici, langa
              politici, si deschide acelasi panou. Se randeaza doar cand exista
              banner de cookie-uri — altfel n-ar avea ce deschide. */}
          <ButonSetariCookie className={t.link} />
        </div>
      </div>

      <div className="shrink-0">
        <p className={t.titlu}>Protectia consumatorilor</p>
        <div className="flex items-center gap-3">
          <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener noreferrer"
            className="hover:opacity-80 transition-opacity" title="SAL - Solutionarea Alternativa a Litigiilor">
            <Image src="/anpc-sal.avif" alt="ANPC SAL - Solutionarea Alternativa a Litigiilor" width={98} height={40} className="rounded-md" />
          </a>
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer"
            className="hover:opacity-80 transition-opacity" title="SOL - Solutionarea Online a Litigiilor">
            <Image src="/anpc-sol.avif" alt="ANPC SOL - Solutionarea Online a Litigiilor" width={98} height={40} className="rounded-md" />
          </a>
        </div>
      </div>

      {/* Plata securizata (Netopia) — badge obligatoriu cand plata cu cardul e activa */}
      <NetopiaBadge businessId={business.id} ton={ton} />
    </div>
  );
}

/**
 * Randul de subsol: drepturile de autor ale magazinului si creditul Edinio.
 * Creditul se poate ascunde doar pe planurile platite (`hide_edinio_badge`),
 * decizie luata inauntrul lui `EdinioCredit` — nu e o setare de design.
 */
export function FooterCredit({ ton = "inchis" }: { ton?: TonFooter } = {}) {
  const { business, color } = useStoreChrome();
  const t = TON[ton];

  return (
    <div className="pt-5 flex items-center justify-between gap-3">
      <p className={t.copyright}>
        &copy; {new Date().getFullYear()} {business.store_name ?? business.business_name}
      </p>
      <EdinioCredit businessId={business.id} color={color} className={t.copyright} />
    </div>
  );
}
