"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import { Ripple } from "@/components/ui/ripple";
import {
  MAIL_EXPEDITOR,
  MENTENANTA_MAILURI,
  WHATSAPP_CONTACT,
  WHATSAPP_MESAJE,
  type MesajWhatsApp,
  type CardMentenanta,
  type MailMentenanta,
} from "@/lib/website/mentenanta";

/**
 * Ilustrațiile celor patru carduri de pe „Mentenanță gratuită".
 *
 * ═══ ARTEFACTE, NU ORNAMENTE ═══
 *
 * „Actualizări", „securitate", „optimizări" sunt cuvinte abstracte, iar
 * ilustrația lor obișnuită e o iconiță într-un pătrat colorat — exact tiparul
 * pe care clientul l-a tăiat de fiecare dată. Aici fiecare card arată un
 * ARTEFACT: lista de versiuni instalate, drumul unei sesizări, panoul de stare
 * al infrastructurii, măsurătoarea de viteză. Aceeași alegere ca la
 * `TrustedProduct` de pe pagina de start, unde încrederea a fost desenată ca o
 * pagină de produs adevărată, nu ca un simbol.
 *
 * ═══ TOATE PATRU ÎN ACELAȘI CADRU ═══
 *
 * `Panou` e obligatoriu pentru toate: același chenar, aceeași densitate, un cap
 * și trei rânduri. Uniformitatea e jumătate din motivul pentru care o serie
 * arată a serie — patru desene cu forme diferite se citesc ca patru lucruri
 * adunate. Structural, nu ținut minte: dacă cineva desenează al cincilea, e
 * obligat să treacă tot prin `Panou`.
 *
 * ⚠ Tot ce e aici e `aria-hidden` la nivelul învelișului din `SectiuneCeInclude`:
 * fiecare ilustrație repetă exact ce scrie în descrierea de alături, iar citită
 * a doua oară ar fi doar zgomot pentru cine folosește un cititor de ecran.
 */


/** Cadrul comun. Vezi nota de mai sus — nu se ocolește. */
function Panou({ cap, children }: { cap: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-[14px] border border-hairline bg-white">
      <div className="border-b border-hairline bg-tint px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          {cap}
        </span>
      </div>
      <div className="divide-y divide-hairline">{children}</div>
    </div>
  );
}

/* ═══ CUTIA POȘTALĂ ═══

   Cerută de client (13.08): mailuri care apar pe rând, „identic 1 la 1 ca un mail
   de la Gmail", după o captură trimisă de el.

   ⚠ CE S-A MĂSURAT DIN CAPTURĂ, cu pipeta, și e păstrat întocmai:
     rândul                     40px înălțime
     linia dintre rânduri       #ECEFF1
     expeditorul, subiectul,    #202124, îngroșate (toate mailurile sunt necitite)
       și ora
     fragmentul de după subiect #5F6368, obișnuit
     căsuța și steaua           #C3C4C3
   Iar rândul e: căsuță, stea, expeditor pe o coloană a lui, apoi subiectul și
   fragmentul pe UN SINGUR rând tăiat la capăt, cu ora la dreapta.

   ⚠ FĂRĂ CELE DOUĂ BIFE din captură — clientul a spus anume că sunt de la o
   extensie a lui, nu din Gmail.

   ⚠ ORDINEA SOSIRII E INVERSĂ celei de pe ecran. Într-o cutie poștală mailul nou
   intră SUS și le împinge pe celelalte în jos. De aceea animația pleacă de la
   coada listei: apare al patrulea, apoi al treilea DEASUPRA lui, și tot așa.
   Dacă ar apărea de sus în jos, ar arăta a listă care se încarcă, nu a mailuri
   care sosesc — și tocmai asta s-a cerut.
*/

/** Cât stă între două mailuri. Sub 500ms nu se mai vede că sosesc pe rând. */
const PAS_MAIL_MS = 780;

function Actualizari() {
  const gazda = useRef<HTMLDivElement>(null);
  /* Câte mailuri se văd. Pleacă de la 0: cutia e goală până sosesc. */
  const [cate, setCate] = useState(0);

  useEffect(() => {
    const el = gazda.current;
    if (!el) return;

    const fara =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ceasuri: ReturnType<typeof setTimeout>[] = [];

    const observator = new IntersectionObserver(
      (intrari) => {
        for (const intrare of intrari) {
          if (!intrare.isIntersecting) continue;
          observator.disconnect();

          if (fara) {
            ceasuri.push(setTimeout(() => setCate(MENTENANTA_MAILURI.length), 0));
            return;
          }
          for (let i = 1; i <= MENTENANTA_MAILURI.length; i++) {
            ceasuri.push(setTimeout(() => setCate(i), i * PAS_MAIL_MS));
          }
        }
      },
      { threshold: 0.3 },
    );

    observator.observe(el);
    return () => {
      observator.disconnect();
      for (const ceas of ceasuri) clearTimeout(ceas);
    };
  }, []);

  /* Se arată COADA listei: cu unul, ultimul; cu două, ultimele două; și tot așa.
     Așa fiecare mail nou intră deasupra celor de dinainte. */
  const vizibile = MENTENANTA_MAILURI.slice(MENTENANTA_MAILURI.length - cate);

  return (
    <div ref={gazda} className="w-full">
      {/*
        Ce se aude și ce se indexează. Cutia pleacă GOALĂ din HTML — mailurile
        apar abia în browser — deci fără rândul ăsta, ce trimite serverul n-ar
        conține niciunul dintre texte. Aceeași grijă ca la celelalte ilustrații
        care se animă.
      */}
      <p className="sr-only">
        Exemple de anunțuri primite pe e-mail de la {MAIL_EXPEDITOR}:{" "}
        {MENTENANTA_MAILURI.map((m) => `${m.titlu} — ${m.descriere}`).join(" ")}
      </p>

      <div
        aria-hidden="true"
        className="w-full overflow-hidden rounded-[10px] border border-hairline bg-white"
      >
        <BaraGmail />

        {/*
          Înălțimea e REZERVATĂ de la început, pentru toate patru. Fără ea, panoul
          ar crește cu fiecare mail sosit și ar împinge pagina sub el de patru ori.
        */}
        <div
          className="flex w-full flex-col justify-start px-2"
          style={{ minHeight: MENTENANTA_MAILURI.length * 40 }}
        >
          {vizibile.map((mail) => (
            <RandMail key={mail.titlu} mail={mail} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Bara de sus a lui Gmail, după a doua captură a clientului (13.08).
 *
 * ⚠ MĂSURAT DIN CAPTURĂ, cu pipeta: fundalul barei #F4F6F9, pastila de căutare
 * #E9EEF6, rotunjită întreagă (era de 717x47, deci raza e chiar jumătate din
 * înălțime). Bara ține 66 din 979 de lățime, adică o cincisprezecime — de acolo
 * vine cât de scundă e față de rândurile de dedesubt.
 *
 * ⚠ SIGLA E FIȘIERUL CLIENTULUI (`public/mentenanta/gmail.svg`), nu una
 * desenată de mine: e marca lor, iar un M desenat din memorie s-ar fi văzut că
 * nu e al lor. Raportul 512/399,42 vine din `viewBox`-ul fișierului.
 *
 * ⚠ Scrisul din câmp e în ROMÂNEȘTE, deși captura clientului e în engleză: el
 * are contul pe engleză, dar un comerciant român își deschide Gmailul în
 * românește, iar mailurile de dedesubt sunt tot românești.
 */
function BaraGmail() {
  return (
    <div className="flex items-center gap-2 border-b border-hairline bg-[#F4F6F9] px-2.5 py-2">
      {/* Cele trei linii ale meniului. */}
      <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0 fill-[#5F6368]">
        <path d="M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z" />
      </svg>

      <span className="flex shrink-0 items-center gap-[5px]">
        <Image
          src="/mentenanta/gmail.svg"
          alt="Gmail"
          width={512}
          height={400}
          unoptimized
          className="h-[13px] w-auto"
        />
        <span className="text-[13px] leading-none text-[#5F6368]">Gmail</span>
      </span>

      {/* Câmpul de căutare: pastilă rotunjită întreagă, cu lupa la stânga și
          semnul de filtrare la dreapta. */}
      <span className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-[#E9EEF6] px-2.5 py-[5px]">
        <svg viewBox="0 0 24 24" className="h-[13px] w-[13px] shrink-0 fill-[#5F6368]">
          <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.49 4.49 0 0 1 9.5 14" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-[11.5px] leading-none text-[#5F6368]">
          Caută în e-mailuri
        </span>
        <svg viewBox="0 0 24 24" className="h-[13px] w-[13px] shrink-0 fill-[#5F6368]">
          <path d="M3 17v2h6v-2zM3 5v2h10V5zm10 16v-2h8v-2h-8v-2h-2v6zM7 9v2H3v2h4v2h2V9zm14 4v-2H11v2zm-6-4h2V7h4V5h-4V3h-2z" />
        </svg>
      </span>
    </div>
  );
}

function RandMail({ mail }: { mail: MailMentenanta }) {
  return (
    <div
      className="flex h-10 shrink-0 items-center gap-2 border-b border-[#ECEFF1] duration-300 ease-out animate-in fade-in slide-in-from-top-2 last:border-b-0"
      style={{ animationFillMode: "backwards" }}
    >
      {/*
        ⚠ FĂRĂ CĂSUȚA DE BIFAT, scoasă la cererea clientului (13.08), ca să
        rămână mai mult loc pentru text. E o abatere de la Gmail, dar una cu
        socoteală: căsuța e o UNEALTĂ — folosește la selectat mailuri, iar aici
        nu se selectează nimic. Într-un desen, ocupa doar lățime. Steaua rămâne,
        fiindcă ea e semn, nu unealtă: se citește ca „mail important".
      */}

      {/* Steaua, conturată. */}
      <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0 fill-none stroke-[#C3C4C3]" strokeWidth={1.6}>
        <path d="m12 3.5 2.6 5.6 6.1.8-4.5 4.2 1.2 6.1-5.4-3-5.4 3 1.2-6.1L3.3 9.9l6.1-.8z" />
      </svg>

      {/* Expeditorul, pe coloana lui. */}
      <span className="w-[64px] shrink-0 truncate text-[11.5px] font-bold text-[#202124] @[420px]:w-[86px] @[420px]:text-[12.5px]">
        {MAIL_EXPEDITOR}
      </span>

      {/*
        Subiectul și fragmentul, pe UN SINGUR rând tăiat la capăt — ca la ei.
        Subiectul îngroșat și negru, fragmentul obișnuit și cenușiu, despărțite
        printr-o liniuță. Amândouă în același element, altfel tăierea s-ar fi
        făcut pe fiecare în parte și ar fi ieșit două „…" pe același rând.
      */}
      <span className="min-w-0 flex-1 truncate text-[11.5px] leading-none @[420px]:text-[12.5px]">
        <span className="font-bold text-[#202124]">{mail.titlu}</span>
        <span className="text-[#5F6368]"> - {mail.descriere}</span>
      </span>

      <span className="shrink-0 text-[10.5px] font-bold text-[#202124] @[420px]:text-[11.5px]">
        {mail.ora}
      </span>
    </div>
  );
}

/* ═══ CONVERSAȚIA PE WHATSAPP ═══

   Cerută de client (13.08), care a ales-o dintre trei propuneri și a cerut
   interfața „1 la 1". Ce era înainte — trei puncte legate printr-o linie,
   „Sesizare primită / În lucru / Rezolvat" — a plecat cu totul.

   ═══ CE FACE UN DESEN SĂ SE RECUNOASCĂ DREPT WHATSAPP ═══

   Nu verdele. Sunt patru lucruri, și toate sunt ale lor:

   1. **TAPETUL BEJ** (#EFEAE2). E lucrul pe care ochiul îl recunoaște primul, de
      la distanță, înainte să citească un cuvânt. Pe alb, aceleași baloane ar
      putea fi orice aplicație de mesaje.
   2. **DOUĂ VERZURI, NU UNUL.** Balonul tău e #D9FDD3 — un verde foarte stins,
      aproape alb. Cine îl face verde aprins strică tot: pe WhatsApp, culoarea
      tare e a antetului pe telefon, nu a baloanelor.
   3. **CODIȚA, DOAR LA PRIMUL BALON dintr-un șir.** Două mesaje trimise unul
      după altul de aceeași persoană se leagă: primul are codiță, al doilea nu.
      E amănuntul care se vede fără să poată fi numit — cu codiță la fiecare,
      conversația arată a listă de citate.
   4. **ORA ÎNĂUNTRUL BALONULUI**, jos-dreapta, mică și cenușie, iar la mesajele
      tale cele două bife albastre (#53BDEB) după ea. Ora scrisă sub balon e
      tiparul altor aplicații.

   ⚠ TAPETUL E PLAT, fără mâzgălelile lor. Desenele alea sunt lucrarea lor, iar
   un tapet plat de aceeași culoare se recunoaște oricum. Dacă se cere vreodată
   întocmai, trebuie fișierul, nu o imitație desenată de mine.

   ⚠ „scrie…" ÎN ANTET, nu într-un balon cu trei puncte. Așa arată WhatsApp Web:
   starea de sub nume se schimbă din „online" în „scrie…" cât timp celălalt
   scrie. Balonul cu trei puncte e tiparul altor aplicații.
*/

/* Culorile sunt ale WhatsApp Web. Nu se înlocuiesc cu tokenurile noastre: aici
   desenul trebuie să fie al lor. */
const WA = {
  antet: "#F0F2F5",
  /* ⚠ Culoarea DIN IMAGINEA clientului (colțul ei), nu cea de pe WhatsApp Web.
     Tapetul e acum poza lor de fundal, iar culoarea asta e doar ce se vede până
     se încarcă ea: alta, s-ar fi văzut o săritură de nuanță la încărcare. */
  tapet: "#E2DAD2",
  balonulMeu: "#D9FDD3",
  balonulLui: "#FFFFFF",
  text: "#111B21",
  stins: "#667781",
  bife: "#53BDEB",
} as const;

/** Cât stă între pași. */
const PAS_MESAJ_MS = 900;
/** Cât „scrie" înainte de fiecare răspuns. */
const CAT_SCRIE_MS = 1100;

function Remediere() {
  const gazda = useRef<HTMLDivElement>(null);
  /* Câte mesaje se văd. Conversația pleacă goală. */
  const [cate, setCate] = useState(0);
  const [scrie, setScrie] = useState(false);

  useEffect(() => {
    const el = gazda.current;
    if (!el) return;

    const fara =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ceasuri: ReturnType<typeof setTimeout>[] = [];

    const observator = new IntersectionObserver(
      (intrari) => {
        for (const intrare of intrari) {
          if (!intrare.isIntersecting) continue;
          observator.disconnect();

          if (fara) {
            ceasuri.push(setTimeout(() => setCate(WHATSAPP_MESAJE.length), 0));
            return;
          }

          /* Fiecare mesaj al SUPORTULUI e precedat de „scrie…", ca într-o
             conversație adevărată. Al comerciantului apare direct: el scrie de
             pe telefonul lui, deci nu-l vede nimeni tastând. */
          let cand = PAS_MESAJ_MS;
          WHATSAPP_MESAJE.forEach((mesaj, i) => {
            if (mesaj.dinPartea === "suport") {
              const inceput = cand;
              ceasuri.push(setTimeout(() => setScrie(true), inceput));
              cand += CAT_SCRIE_MS;
            }
            const acum = cand;
            ceasuri.push(
              setTimeout(() => {
                setScrie(false);
                setCate(i + 1);
              }, acum),
            );
            cand += PAS_MESAJ_MS;
          });
        }
      },
      { threshold: 0.3 },
    );

    observator.observe(el);
    return () => {
      observator.disconnect();
      for (const ceas of ceasuri) clearTimeout(ceas);
    };
  }, []);

  const vizibile = WHATSAPP_MESAJE.slice(0, cate);

  return (
    <div ref={gazda} className="w-full">
      {/*
        Ce se aude și ce se indexează. Conversația pleacă GOALĂ din HTML, deci
        fără rândul ăsta niciun mesaj n-ar ajunge în ce trimite serverul.
      */}
      <p className="sr-only">
        Exemplu de conversație cu {WHATSAPP_CONTACT}:{" "}
        {WHATSAPP_MESAJE.map((m) => m.text).join(" ")}
      </p>

      <div
        aria-hidden="true"
        className="w-full overflow-hidden rounded-[10px] border border-hairline"
      >
        {/* ── Antetul ── */}
        <div
          className="flex items-center gap-2.5 px-3 py-2"
          style={{ backgroundColor: WA.antet }}
        >
          {/*
            Poza de profil: sigla noastră, pe alb — cerută de client (13.08). A
            luat locul semnului cenușiu de om, cel pe care WhatsApp îl pune când
            contactul n-are poză.

            ⚠ FUNDALUL E ALB, NU TRANSPARENT. Sigla are fundal străveziu, iar
            antetul lui WhatsApp e cenușiu (#F0F2F5): lăsată așa, punga verde ar
            fi stat direct pe cenușiu și n-ar mai fi semănat cu o poză de profil,
            care e întotdeauna un cerc plin.

            ⚠ Și e MAI MICĂ decât cercul (72%), cu spațiu în jur. O siglă lipită
            de marginea cercului arată tăiată; pozele de profil au aer în jurul
            lor.
          */}
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
            <Image
              src="/logo.png"
              alt="Edinio"
              width={284}
              height={289}
              unoptimized
              className="h-[72%] w-auto object-contain"
            />
          </span>

          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-[12.5px] leading-[1.3]"
              style={{ color: WA.text }}
            >
              {WHATSAPP_CONTACT}
            </span>
            {/*
              Starea. „scrie…" ia locul lui „online" cât timp celălalt tastează —
              exact ce face WhatsApp. Locul e rezervat de la început, ca antetul
              să nu salte când se schimbă cuvântul.
            */}
            <span
              className="block h-[13px] truncate text-[10.5px] leading-[13px]"
              style={{ color: WA.stins }}
            >
              {scrie ? "scrie…" : "online"}
            </span>
          </span>

          {/* Semnele din dreapta: apel video, apel, căutare, meniu. */}
          <span className="flex shrink-0 items-center gap-3">
            <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] fill-[#54656F]">
              <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" />
            </svg>
            <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] fill-[#54656F]">
              <path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1 1 0 0 0-1.02.24l-2.2 2.2a15.05 15.05 0 0 1-6.59-6.59l2.2-2.2a1 1 0 0 0 .25-1.02A11.4 11.4 0 0 1 8.5 4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1 17 17 0 0 0 17 17 1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1" />
            </svg>
            <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] fill-[#54656F]">
              <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.49 4.49 0 0 1 9.5 14" />
            </svg>
          </span>
        </div>

        {/*
          ── Conversația ──

          Înălțimea e REZERVATĂ pentru toate trei mesajele. Fără ea, panoul ar
          crește la fiecare mesaj și ar împinge pagina sub el.

          `justify-end` lipește mesajele de fund: într-o conversație, cel mai nou
          stă jos, iar golul rămâne deasupra. Lipite de sus, ar fi arătat a listă
          care se umple.
        */}
        <div
          className="flex flex-col justify-end gap-[6px] px-3 py-3"
          style={{
            backgroundColor: WA.tapet,
            /*
              ⚠ TAPETUL LOR, din fișierul pus de client — nu mâzgălelile desenate
              de mine. Așa arată fundalul unei conversații pe WhatsApp, iar el e
              lucrul pe care ochiul îl recunoaște de la distanță.

              ⚠ `cover`, NU `repeat`. Fișierul e o poză de telefon (760×1396), nu
              o dală care se leagă: repetat, s-ar fi văzut cusătura ca o dungă
              prin mijlocul conversației. Cu `cover` intră o singură dată, se
              întinde cât panoul și se taie pe înălțime — deci nicio cusătură.

              ⚠ Se servește `.webp`: 682KB devin 75, iar diferența e sub pragul
              vederii pe o textură atât de stinsă (0,003% din pixeli se abat cu
              mai mult de cinci trepte). PNG-ul rămâne pe disc ca original.
            */
            backgroundImage: "url(/mentenanta/fundal_whatsapp.webp)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            minHeight: 170,
          }}
        >
          {vizibile.map((mesaj, i) => (
            <Balon
              key={mesaj.text}
              mesaj={mesaj}
              /* Codiță doar la primul balon dintr-un șir al aceleiași persoane. */
              cuCodita={i === 0 || vizibile[i - 1].dinPartea !== mesaj.dinPartea}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Balon({ mesaj, cuCodita }: { mesaj: MesajWhatsApp; cuCodita: boolean }) {
  const alMeu = mesaj.dinPartea === "comerciant";

  return (
    <div
      className={cn(
        "flex duration-300 ease-out animate-in fade-in slide-in-from-bottom-1",
        alMeu ? "justify-end" : "justify-start",
      )}
      style={{ animationFillMode: "backwards" }}
    >
      <span
        className={cn(
          "relative max-w-[76%] px-2 py-[5px] text-[12px] leading-[1.35]",
          /* 7,5px peste tot, în afară de colțul unde stă codița. */
          alMeu ? "rounded-[7.5px]" : "rounded-[7.5px]",
          cuCodita && (alMeu ? "rounded-tr-none" : "rounded-tl-none"),
        )}
        style={{
          backgroundColor: alMeu ? WA.balonulMeu : WA.balonulLui,
          color: WA.text,
          /* Umbra lor, foarte joasă: ridică balonul de pe tapet fără să pară o
             carte de vizită. */
          boxShadow: "0 1px 0.5px rgba(11,20,26,0.13)",
        }}
      >
        {/* Codița: un triunghi mic, lipit de colțul de sus. */}
        {cuCodita ? (
          <svg
            viewBox="0 0 8 13"
            className={cn("absolute top-0 h-[13px] w-[8px]", alMeu ? "-right-2" : "-left-2")}
            style={{ transform: alMeu ? undefined : "scaleX(-1)" }}
          >
            <path d="M0 0h8L0 13z" fill={alMeu ? WA.balonulMeu : WA.balonulLui} />
          </svg>
        ) : null}

        {mesaj.text}

        {/*
          Ora, ÎNĂUNTRUL balonului, jos-dreapta. La mesajele mele, după ea vin
          cele două bife albastre — semnul că a fost citit.
        */}
        <span
          className="ml-2 inline-flex translate-y-[2px] items-center gap-[2px] whitespace-nowrap text-[9px] leading-none"
          style={{ color: WA.stins }}
        >
          {mesaj.ora}
          {alMeu ? (
            <svg viewBox="0 0 16 11" className="h-[9px] w-[13px]" fill="none">
              <path
                d="M1 5.5 3.8 8.4 9.4 1.6M6.2 5.9 8.1 8.4 13.9 1.6"
                stroke={WA.bife}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </span>
      </span>
    </div>
  );
}

/* ═══ SCUTUL ═══

   Imaginea e a clientului (`public/mentenanta/securitate.png`, pusă de el pe
   13.08). A luat locul lacătului desenat de mine în SVG — și bine a făcut: e
   VERDE, adică în culoarea mărcii, în timp ce lacătul albastru, oricât de bine
   ar fi fost desenat, era culoarea altcuiva pe pagina noastră.

   ⚠ SE SERVEȘTE `.webp`, NU `.png`, ȘI E ACEEAȘI IMAGINE. Verificat pixel cu
   pixel, compusă pe alb: diferență maximă 0 pe toate trei canalele. E o
   recodare FĂRĂ PIERDERI, doar cu alt împachetat — 207KB devin 137. PNG-ul
   rămâne pe disc ca original. (Cu pierderi, la calitate 90, ar fi ieșit 16KB,
   dar acolo apar diferențe de până la 54 din 255 în degradeul verde, iar aia e
   o hotărâre a clientului, nu a mea.)

   ═══ CUM ÎNCONJOARĂ CERCURILE SCUTUL ═══

   Cerut: „să-l înconjoare la perfecție". Două lucruri trebuie să se potrivească,
   și niciunul nu se nimerește singur:

   1. **ACELAȘI CENTRU.** Cercurile se așază la 50%/50% din panou, iar scutul e
      centrat de `flex`. Merge doar pentru că spațierea panoului e simetrică —
      cu o spațiere diferită sus față de jos, centrul imaginii și centrul
      cercurilor s-ar fi despărțit, iar inelele ar fi ieșit strâmbe în jurul ei.
   2. **PRIMUL CERC TRECE PE LÂNGĂ VÂRFURI.** Scutul e mai înalt decât lat, deci
      ce contează e ÎNĂLȚIMEA lui, nu lățimea. Măsurat pe canalul alfa al
      fișierului, desenul umple 523 din cei 565px ai imaginii, adică 92,6% din
      înălțime — restul e transparent. Primul cerc se socotește din înălțimea
      desenată ori partea aia plină, plus un gol de fiecare parte. Socotit din
      înălțimea IMAGINII, cercul ar fi trecut chiar prin vârful de sus și prin
      colțul de jos.
*/

const SCUT = {
  src: "/mentenanta/securitate.webp",
  latimeFisier: 484,
  inaltimeFisier: 565,
  /** Cât din înălțimea fișierului ocupă desenul. Măsurat pe alfa: 523 din 565. */
  parteaPlina: 523 / 565,
  /** Înălțimea la care se desenează, în pixeli. */
  inaltime: 176,
} as const;

/** Golul dintre marginea scutului și primul cerc. */
const GOL_PANA_LA_CERC = 16;

/** Diametrul primului cerc, ca să treacă pe lângă vârfurile scutului. */
const PRIMUL_CERC = Math.round(SCUT.inaltime * SCUT.parteaPlina + 2 * GOL_PANA_LA_CERC);

function Securitate() {
  return (
    <>
      {/*
        `Ripple`, componenta Magic UI trimisă de client. Cercuri concentrice care
        se strâng puțin și revin, pornind din mijlocul panoului — adică din
        spatele scutului.

        ⚠ CULOAREA E VERDE, nu albastră ca înainte: scutul e verde, iar niște
        inele albastre în jurul lui ar fi arătat a două desene suprapuse.

        ⚠ Opacitatea de pe cerc SE ÎNMULȚEȘTE cu alfa culorii. Cu 0,2 de la ei și
        un chenar la 45%, o formă de dinainte scotea o linie la 9% — pe alb,
        nimic. Ori culoarea are alfa, ori opacitatea e mică; amândouă odată,
        cercurile dispar. Aici chenarul e la culoare plină și doar opacitatea îl
        stinge.

        ⚠ Masca stinge efectul în TOATE părțile. A lor îl stinge doar în jos,
        fiindcă la ei desenul stă sus; la noi scutul e la mijloc.
      */}
      <Ripple
        mainCircleSize={PRIMUL_CERC}
        mainCircleOpacity={0.72}
        numCircles={7}
        clasaCerc="border-[#5CC98A] bg-[#1AB554]/[0.045] shadow-none"
        className="[mask-image:radial-gradient(120%_105%_at_50%_50%,#000_16%,rgba(0,0,0,0.5)_52%,transparent_86%)]"
      />

      <Image
        src={SCUT.src}
        alt="Scut cu lacăt: platforma și magazinele sunt protejate"
        width={SCUT.latimeFisier}
        height={SCUT.inaltimeFisier}
        unoptimized
        className="relative w-auto"
        style={{ height: SCUT.inaltime }}
      />
    </>
  );
}

/*
  ═══ INDICATOARELE LIGHTHOUSE ═══

  Cerute de client, „identic, cu tot cu animațiile lor". Sunt reproduse din
  raportul Google Lighthouse: disc palid în culoarea scorului, arc care se
  desenează peste el, numărul la mijloc, eticheta dedesubt.

  ⚠ NUMERELE SUNT ILUSTRATIVE, nu o măsurătoare. Clientul a cerut „toate peste
  93". Dacă vreodată se rulează Lighthouse pe un magazin real, valorile de aici
  se înlocuiesc cu cele măsurate — o pagină comercială care arată un scor arată
  o afirmație, iar afirmațiile trebuie să poată fi susținute.
*/

/** Verdele Lighthouse pentru „trecut" (scor ≥ 90). E al lor, nu al nostru. */
const VERDE_LIGHTHOUSE = "#0CCE6B";

const SCORURI = [
  { eticheta: "Performanță", valoare: 96 },
  { eticheta: "Accesibilitate", valoare: 98 },
  { eticheta: "Bune practici", valoare: 95 },
  { eticheta: "SEO", valoare: 100 },
];

/* Geometria cercului. `viewBox` de 120 ca în markup-ul lor, ca proporțiile
   dintre grosimea inelului și rază să iasă aceleași. */
const RAZA = 52;
const CIRCUMFERINTA = 2 * Math.PI * RAZA;
const DURATA_UMPLERE_MS = 1000;

function Indicator({ eticheta, valoare }: { eticheta: string; valoare: number }) {
  /*
   * Numărul pornește de la valoarea FINALĂ, nu de la zero.
   *
   * Așa, ce trimite serverul e chiar ce trebuie să vadă omul: fără JavaScript
   * rămâne scorul, nu un „0". Urcarea se pornește la montare, din
   * `useLayoutEffect` — pus în `useEffect`, browserul ar fi apucat să vopsească
   * o dată valoarea finală și s-ar fi văzut o clipire înainte de animație.
   * Același tipar ca prețul care urcă din `PricingSection`.
   */
  const [afisat, setAfisat] = useState(valoare);
  const [pornit, setPornit] = useState(false);

  const useIzomorf = typeof window === "undefined" ? useEffect : useLayoutEffect;
  useIzomorf(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setPornit(true);
      return;
    }
    setAfisat(0);
    setPornit(true);
    let raf = 0;
    /*
     * ⚠ Reperul de timp e PRIMUL CADRU, nu `performance.now()` de la programare.
     *
     * Doua motive. Unul de corectitudine: intre clipa in care se cere cadrul si
     * clipa in care browserul il livreaza trece un cadru intreg, deci animatia
     * pornea deja cu ~16ms consumati si primul lucru vazut nu era 0.
     *
     * Unul de regula: `performance.now()` e o functie impura, iar aici sta
     * intr-un `useIzomorf` — o VARIABILA care tine `useEffect` sau
     * `useLayoutEffect`. Regula `react-hooks/purity` nu poate sti ca variabila
     * aia e un hook, deci citea corpul functiei ca si cum ar rula la randare.
     * Fara `performance.now()`, intrebarea nici nu se mai pune.
     */
    let start = 0;
    const pas = (acum: number) => {
      if (start === 0) start = acum;
      const t = Math.min(1, (acum - start) / DURATA_UMPLERE_MS);
      /* Aceeași curbă ca arcul, altfel numărul și inelul ajung în momente
         diferite și se vede că sunt două animații, nu una. */
      const eased = 1 - Math.pow(1 - t, 3);
      setAfisat(Math.round(valoare * eased));
      if (t < 1) raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);

    /*
     * ⚠ PLASĂ DE SIGURANȚĂ: dacă `requestAnimationFrame` nu rulează, numărul
     * rămâne pe 0.
     *
     * Nu e o presupunere. Măsurat: într-o filă de fundal, Chrome nu livrează
     * NICIUN cadru — zero în 900 ms. Deci cine deschide pagina cu clic pe rotiță
     * și se uită la ea mai târziu ar fi găsit patru zerouri, adică exact
     * contrariul a ce spune ilustrația. La fel orice randare fără cadre (o
     * captură automată, un generator de imagine socială).
     *
     * `setTimeout` rulează și în filă ascunsă (încetinit, dar rulează), deci
     * după ce animația ar fi trebuit să se termine, valoarea se pune pur și
     * simplu la loc. Când fila e vizibilă, animația a ajuns deja acolo și linia
     * asta nu schimbă nimic.
     */
    const plasa = window.setTimeout(() => setAfisat(valoare), DURATA_UMPLERE_MS + 250);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(plasa);
    };
  }, [valoare]);

  const tinta = CIRCUMFERINTA * (1 - valoare / 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-[64px] w-[64px]">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          {/* Discul palid din spate: culoarea scorului la 10%, ca la ei. */}
          <circle cx="60" cy="60" r="56" fill={VERDE_LIGHTHOUSE} fillOpacity="0.1" />
          <circle
            cx="60" cy="60" r={RAZA}
            fill="none"
            stroke={VERDE_LIGHTHOUSE}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERINTA}
            /*
              Inelul se desenează din `stroke-dashoffset`: plin la început
              (nimic vizibil), până la țintă. Pornit doar după montare, ca
              tranziția să aibă de unde pleca — pusă din prima randare, valoarea
              ar fi fost deja cea finală și n-ar fi avut ce anima.
            */
            strokeDashoffset={pornit ? tinta : CIRCUMFERINTA}
            style={{
              transition: `stroke-dashoffset ${DURATA_UMPLERE_MS}ms cubic-bezier(0.33,1,0.68,1)`,
            }}
            className="motion-reduce:transition-none"
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-[20px] font-medium tabular-nums"
          style={{ color: VERDE_LIGHTHOUSE }}
        >
          {afisat}
        </span>
      </div>
      <span className="text-center text-[11px] leading-[1.3] text-ink-2">{eticheta}</span>
    </div>
  );
}

function Optimizari() {
  return (
    <Panou cap="Raport de performanță">
      <div className="flex items-start justify-center gap-3 px-3 py-6 sm:gap-5 sm:px-4">
        {SCORURI.map((s) => (
          <Indicator key={s.eticheta} eticheta={s.eticheta} valoare={s.valoare} />
        ))}
      </div>
    </Panou>
  );
}

const DESENE: Record<CardMentenanta["id"], () => React.JSX.Element> = {
  actualizari: Actualizari,
  remediere: Remediere,
  securitate: Securitate,
  optimizari: Optimizari,
};

export function IlustratieMentenanta({ id }: { id: CardMentenanta["id"] }) {
  const Desen = DESENE[id];
  return <Desen />;
}
