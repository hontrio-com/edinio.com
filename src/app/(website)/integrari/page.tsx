import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { HeroPagina } from "@/components/website/sections/Hero";
import { BibliotecaIntegrari } from "@/components/website/sections/integrations/BibliotecaIntegrari";
import { CampSigle } from "@/components/website/sections/integrations/CampSigle";
import { stiluriBanda } from "@/lib/website/integrari-hero";
import { siteMetadata } from "@/lib/website/metadata";

export const metadata: Metadata = siteMetadata({
  title: "Integrari: curieri, plati, facturare si marketing",
  description:
    "Peste 25 de integrari pregatite: curierat, plati online, facturare SmartBill si Oblio, e-mail marketing, Google si marketplace-uri.",
  path: "/integrari",
});

/**
 * Pagina „Integrări".
 *
 * ═══ ACELAȘI CADRU CA LA „MENTENANȚĂ GRATUITĂ", CU UN FUNDAL ÎN PLUS ═══
 *
 * Tot `HeroPagina`, adică chiar hero-ul de pe pagina de start: titlu pe mijloc,
 * un buton verde, rândul de garanții. Peste lumina verde plutește în plus câmpul
 * de sigle (`CampSigle`) — pentru că aici întrebarea din capul omului nu e „ce
 * faceți", ci „mergeți cu ce folosesc EU". La întrebarea aia răspund mărcile, nu
 * o propoziție, și răspund înainte să fie citit primul cuvânt.
 *
 * ⚠ FĂRĂ firimituri, ca la „Mentenanță gratuită", și din același motiv: e o
 * pagină care convinge, nu una în care ajungi căutând ceva anume.
 *
 * ⚠ NETERMINATĂ. Are hero-ul; lista întreagă a integrărilor, pe categorii, vine
 * separat. Ce e până acum e final, nu coajă.
 *
 * ⚠ TITLUL ȘI DESCRIEREA SUNT ALE CLIENTULUI, date cuvânt cu cuvânt
 * (2026-08-13). Nu se rescriu. Au înlocuit „Peste 25 de integrări…", și odată cu
 * ele a dispărut și nepotrivirea cu banda de pe pagina de start, care zicea
 * „Zeci de integrări": acum niciuna nu mai dă o cifră.
 *
 * ⚠ Supratitlul „Integrări" a fost scos: `HeroPagina` n-are pastilă deasupra
 * titlului (vezi nota din `Hero.tsx`), iar titlul spune oricum cuvântul.
 * De confirmat cu clientul.
 */
export default function IntegrariPage() {
  return (
    <>
      <HeroPagina
        title="Toate integrările de care ai nevoie, pregătite din prima zi"
        lead="Facturare, curierat, plăți, e-mail marketing, Google și marketplace-uri. Le conectezi direct din Edinio, folosind propriile tale conturi."
        cta={{ label: "Începe gratuit", href: "/register" }}
        secundara={{ label: "Vezi prețurile", href: "/preturi" }}
        fundal={<CampSigle />}
        /* Spațierea vine din benzile siglelor, nu din ochi: exact zona în care
           plutesc casetele e zona în care textul nu are voie să intre. */
        spatiere={stiluriBanda() as CSSProperties}
      />

      <BibliotecaIntegrari />

      {/*
        Banda de final, cu harta României — cerută de client (2026-08-13), aceeași
        ca pe pagina de start.

        Se REFOLOSEȘTE, nu se scrie alta, și e aceeași hotărâre ca pe `/preturi`:
        textul ei e al clientului și e aprobat, iar o variantă proprie ar fi
        însemnat text inventat de mine pe o pagină comercială. Acum e a treia
        pagină care se închide la fel — deci dacă vreodată se schimbă o vorbă
        acolo, se schimbă pe toate trei deodată, ceea ce e chiar rostul.

        Până acum pagina se termina în gol: după al 65-lea card intrai direct în
        subsol, singura dintre paginile gata care făcea asta.
      */}
      <FinalCta />
    </>
  );
}
