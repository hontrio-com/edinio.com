import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { HeroMesh } from "./hero-backgrounds";
import { butonFantoma, butonVerde } from "@/lib/website/buton";
import { H1_HERO } from "@/lib/website/tipografie";

/**
 * Hero-ul mare: totul pe mijloc, peste un mesh de lumină verde.
 *
 * Verdele stă unde contează: butonul principal, eticheta „Nou" și lumina din
 * spate. Titlul rămâne negru — verdele care sare în ochi dintr-un cuvânt de
 * mijloc era exact tiparul de care am scăpat în restul site-ului.
 *
 * ═══ DOUĂ COMPONENTE, UN SINGUR DESEN ═══
 *
 * `Hero` e cel de pe pagina de start, cu textele lui. `HeroPagina` e același
 * cadru, pentru paginile care cer un hero întreg în loc de capul scurt cu
 * firimituri (`PageHero`) — prima e „Mentenanță gratuită".
 *
 * Amândouă trec prin `HeroCadru`, și asta e tot rostul împărțirii: cererea a
 * fost „un hero EXACT ca pe prima pagină". Copiat, ar fi fost exact la fel o
 * singură zi — până la prima corectură făcută într-un singur loc.
 */

const TRUST = "15 zile gratuit, fără card de credit. Anulezi oricând.";

interface Actiune {
  label: string;
  href: string;
}

function HeroCadru({
  eticheta,
  title,
  lead,
  principala,
  secundara,
  fundal,
  spatiere,
  latimeTitlu = "max-w-[900px]",
}: {
  /** Pastila de deasupra titlului. Lipsește pe paginile care n-au ce anunța. */
  eticheta?: React.ReactNode;
  /*
   * ⚠ NODE, nu `string`: titlul paginii „Optimizare" are înăuntru un cuvânt cu
   * urmă de viteză și sigla Google în locul unei litere. Tot ce trebuie păzit e
   * ca textul CITIT să rămână întreg — vezi componentele din `sections/optimizare`.
   */
  title: React.ReactNode;
  lead: string;
  principala: Actiune;
  secundara?: Actiune;
  /**
   * Ce se mai desenează în spatele textului, peste lumina verde.
   *
   * Azi îl folosește o singură pagină, „Integrări", cu câmpul ei de sigle care
   * plutesc. Stă ca prop și nu ca o a treia copie a hero-ului din același motiv
   * pentru care există `HeroPagina`: cadrul e unul singur, iar o corectură la
   * titlu sau la butoane trebuie să se vadă peste tot.
   */
  fundal?: React.ReactNode;
  /**
   * Spațierea de sus și de jos, ca variabile CSS, când textul trebuie să lase
   * loc pentru `fundal`.
   *
   * Numerele NU se scriu aici: vin de la cel care desenează fundalul (vezi
   * `stiluriBanda()` din `lib/website/integrari-hero.ts`), fiindcă acolo se știe
   * cât spațiu ocupă el. Cu două seturi de numere, primul schimbat ar fi lăsat
   * fundalul peste titlu.
   */
  spatiere?: CSSProperties;
  /**
   * Lățimea la care se rupe titlul, când cea din oficiu nu e potrivită.
   *
   * ⚠ EXISTĂ PENTRU UN SINGUR MOTIV, ȘI E BINE SĂ RĂMÂNĂ AȘA. Titlul se rupe la
   * 900px peste tot; pe „Mentenanță gratuită" clientul a cerut (13.08) ca a doua
   * propoziție să stea întreagă pe un rând, iar ea are 1087px la corpul de 66.
   * Fără prop, singurele ieșiri erau ori să lărgim titlul pe TOATE paginile, ori
   * să micșorăm corpul doar pe asta — prima strică ce e bine în altă parte, a
   * doua rupe potrivirea între pagini.
   */
  latimeTitlu?: string;
}) {
  return (
    /*
     * `-mt-18 pt-18` urcă secțiunea sub bara de sus și îi pune la loc spațiul
     * înăuntru. Bara e lipicioasă, deci stă în curgere: fără asta, lumina s-ar
     * opri brusc la marginea ei de jos și s-ar vedea o dungă peste tot ecranul.
     * Așa vine din marginea de sus a ferestrei, iar când derulezi, sticla mată a
     * barei o estompează, ceea ce arată chiar bine.
     */
    <section className="relative isolate -mt-18 overflow-hidden bg-white pt-18">
      <HeroMesh />
      {fundal}

      {/*
        Spatiul de sus e mult mai mic pe telefon decat pe ecran mare. Pe desktop,
        o respiratie de 112px face hero-ul sa para asezat; pe un ecran de 650px
        inaltime, aceeasi respiratie manaca a cincea parte din tot ce se vede
        inainte de derulare si impinge butonul spre marginea de jos.

        Cand vine spatiere din afara, clasele de padding NU se mai pun deloc.
        Puse amandoua, ar fi ramas la mila ordinii din fisierul de stiluri — iar
        cine ar fi citit codul n-ar fi avut de unde sa stie care castiga.
      */}
      <div
        className={cn(
          "relative mx-auto max-w-[1200px] px-5 text-center sm:px-6 lg:px-8",
          spatiere
            ? "hero-banda"
            : "pt-10 pb-16 sm:pt-16 sm:pb-20 lg:pt-28 lg:pb-32",
        )}
        style={spatiere}
      >
        {eticheta}

        <h1
          className={cn(
            "mx-auto mt-6 sm:mt-7",
            H1_HERO,
            latimeTitlu,
          )}
        >
          {title}
        </h1>

        <p className="mx-auto mt-5 max-w-[640px] text-[16px] leading-[1.6] text-ink-2 sm:mt-6 sm:text-[19px]">
          {lead}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:mt-10">
          <Link
            href={principala.href}
            /* Vezi nota din `site-header/SiteHeader.tsx`: ruta de inscriere trage
               clientul Supabase si validarea, ~124 kB, pe care 95% nu-i deschid. */
            prefetch={false}
            className={cn("halou-cta", butonVerde("lat"))}
          >
            {principala.label}
          </Link>
          {secundara ? (
            <Link
              href={secundara.href}
              className={cn("group", butonFantoma("lat"))}
            >
              {secundara.label}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          ) : null}
        </div>

        {/*
          Un rand de text, nu trei bife.
          Randul de bife verzi e semnul din nastere al oricarui hero facut in
          graba: aceleasi trei casute, aceeasi iconita, pe orice site. Aceeasi
          informatie, spusa ca o propozitie, nu mai cere atentie si nu mai seamana
          cu a nimanui.
        */}
        <p className="mt-7 text-[14px] text-ink-3">{TRUST}</p>
      </div>
    </section>
  );
}

/** Hero-ul paginii de start. Textele sunt ale clientului — nu se rescriu. */
export function Hero() {
  return (
    <HeroCadru
      /*
        ⚠ FĂRĂ PASTILA „Nou" — scoasă la cererea clientului pe 31.08.2026, care a
        spus că arată ca un tipar de șablon, nu ca ceva ales.

        Avea și un cusur de fond: anunța „Pagină de magazin" ca noutate, dar pe
        telefon jumătatea explicativă era ascunsă (`hidden sm:inline`), deci
        rămânea doar „Nou · Pagină de magazin" — o promisiune fără conținut, exact
        deasupra titlului care spune ce face platforma.

        ⚠ DACĂ SE PUNE ALTA CÂNDVA: `eticheta` e prop pe `HeroCadru` și rămâne
        acolo, folosită de paginile de comparație. Locul e liber, nu desființat.
        Dar merită să anunțe ceva ce se vede întreg și pe telefon.
      */
      title="Magazinul tău online, deschis în câteva minute"
      lead="Îți deschizi magazinul și începi să vinzi în aceeași zi. Toate integrările sunt incluse: curieri cu AWB automat, plăți cu cardul și facturare. Iar mentenanța și asistența rămân gratuite, permanent."
      principala={{ label: "Începe gratuit", href: "/register" }}
      /* Ancora, nu `/preturi`: sectiunea e chiar mai jos pe aceeasi pagina, iar o
         navigare ar fi mai mult decat trebuie. Vezi nota din `TOP_NAV`. */
      secundara={{ label: "Vezi prețurile", href: "/#preturi" }}
    />
  );
}

/**
 * Același hero, pentru o pagină interioară.
 *
 * FĂRĂ eticheta „Nou": aceea anunță o funcție nouă a platformei si e treaba
 * paginii de start. Pusă pe fiecare pagină, ar fi devenit ornament — și ar fi
 * trimis de pe pagina despre mentenanță la una despre magazin.
 *
 * ⚠ `eticheta` E ALTCEVA DECÂT PASTILA „Nou", deși intră pe același loc. Pe
 * paginile de comparație scrie deasupra titlului cu cine se compară („Edinio vs
 * Shopify") — fiindcă acolo titlul spune ce câștigi, nu cine cu cine. Fără ea,
 * omul ar fi citit „O alternativă românească la Shopify" fără să știe pe ce
 * pagină a ajuns. Nu se pune pe paginile care n-au ce anunța.
 */
export function HeroPagina({
  eticheta,
  title,
  lead,
  cta,
  secundara,
  fundal,
  spatiere,
  latimeTitlu,
}: {
  /** Vezi nota de sus: ce scrie deasupra titlului. */
  eticheta?: React.ReactNode;
  title: React.ReactNode;
  lead: string;
  cta: Actiune;
  secundara?: Actiune;
  /** Vezi `HeroCadru`: ce se mai desenează în spatele textului. */
  fundal?: React.ReactNode;
  /** Vezi `HeroCadru`: spațierea pe care o cere fundalul. */
  spatiere?: CSSProperties;
  /** Vezi `HeroCadru`: lățimea la care se rupe titlul. */
  latimeTitlu?: string;
}) {
  return (
    <HeroCadru
      eticheta={eticheta}
      title={title}
      lead={lead}
      principala={cta}
      secundara={secundara}
      fundal={fundal}
      spatiere={spatiere}
      latimeTitlu={latimeTitlu}
    />
  );
}
