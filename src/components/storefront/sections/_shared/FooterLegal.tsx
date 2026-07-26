"use client";

import Image from "next/image";
import { CompanyIdentity } from "@/components/ministore/CompanyIdentity";
import { NetopiaBadge } from "@/components/ministore/NetopiaBadge";
import { EdinioCredit } from "@/components/ministore/EdinioCredit";
import { POLICY_LINKS } from "@/lib/storefront/policy-links";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

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
export function FooterLegal() {
  const { business, basePath } = useStoreChrome();

  return (
    <div className="py-6 sm:py-8 flex flex-col sm:flex-row sm:items-start gap-8 sm:gap-16">
      {/* Date de identificare firma — obligatoriu legal + procesatori de plati (Netopia) */}
      <CompanyIdentity business={business} />

      <div className="flex-1">
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Informatii legale</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {/* Functia de retragere din contract — obligatorie conform OUG 18/2026 */}
          <a href={`${basePath}/retur`}
            className="text-[13px] text-white/70 hover:text-white transition-colors font-medium">
            Retrage-te din contract
          </a>
          {POLICY_LINKS.map(({ slug, label }) => (
            <a key={slug} href={`${basePath}/politici/${slug}`}
              className="text-[13px] text-white/50 hover:text-white transition-colors">
              {label}
            </a>
          ))}
        </div>
      </div>

      <div className="shrink-0">
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Protectia consumatorilor</p>
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
      <NetopiaBadge businessId={business.id} />
    </div>
  );
}

/**
 * Randul de subsol: drepturile de autor ale magazinului si creditul Edinio.
 * Creditul se poate ascunde doar pe planurile platite (`hide_edinio_badge`),
 * decizie luata inauntrul lui `EdinioCredit` — nu e o setare de design.
 */
export function FooterCredit() {
  const { business, color } = useStoreChrome();

  return (
    <div className="pt-5 flex items-center justify-between gap-3">
      <p className="text-[11px] text-white/25">
        &copy; {new Date().getFullYear()} {business.store_name ?? business.business_name}
      </p>
      <EdinioCredit businessId={business.id} color={color} className="text-[11px] text-white/25" />
    </div>
  );
}
