import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { HeroPagina } from "@/components/website/sections/Hero";
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
 * ⚠ TEXTELE SUNT CELE DE DINAINTE, neatinse. Aveau și un supratitlu „Integrări",
 * scos aici: `HeroPagina` n-are pastilă deasupra titlului (vezi nota din
 * `Hero.tsx`), iar titlul spune oricum cuvântul. De confirmat cu clientul.
 *
 * ⚠ Titlul zice „Peste 25", iar secțiunea de pe pagina de start zice „Zeci de
 * integrări" — a treia formă cerută de client, tot mai puțin precisă. Nu se
 * contrazic, dar dacă se uniformizează vreodată, aici e locul rămas în urmă.
 */
export default function IntegrariPage() {
  return (
    <HeroPagina
      title="Peste 25 de integrări, pregătite din prima zi"
      lead="Facturare, curierat, plăți, e-mail marketing, Google și marketplace-uri. Fiecare se activează cu propriile tale chei, în câteva minute."
      cta={{ label: "Începe gratuit", href: "/register" }}
      secundara={{ label: "Vezi prețurile", href: "/preturi" }}
      fundal={<CampSigle />}
      /* Spațierea vine din benzile siglelor, nu din ochi: exact zona în care
         plutesc casetele e zona în care textul nu are voie să intre. */
      spatiere={stiluriBanda() as CSSProperties}
    />
  );
}
