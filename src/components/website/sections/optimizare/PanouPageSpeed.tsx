import { SCORURI_PAGESPEED } from "@/lib/website/optimizare";
import { CadraneLaIntrare } from "./CadraneLaIntrare";

/**
 * Panoul cu rezultatele PageSpeed Insights, ca ilustrație a cardului „Încărcare
 * rapidă".
 *
 * ═══ CADRANELE SUNT CHIAR COMPONENTA CLIENTULUI ═══
 *
 * `components/ui/gauge-1.tsx`, copiată literal. Prima formă era o rescriere a
 * mea, mai ușoară; clientul a cerut de două ori componenta lui, deci asta e.
 * Ce trebuie știut despre ea — că aduce `framer-motion` și că pornește animația
 * la 100ms de la montare, nu când intră în ecran — e scris în capul fișierului
 * ei.
 *
 * Aici rămân doar așezarea și legătura cu datele.
 *
 * ═══ COMPONENTĂ DE SERVER ═══
 *
 * Panoul n-are nicio stare: cadranele își poartă singure animația, iar ele sunt
 * cele marcate `"use client"`. Deci tot restul — grila, eticheta fiecărui scor și
 * rândul citit de cititoarele de ecran — pleacă gata randat de pe server.
 */

/**
 * Mărimea cadranului, legată de lățimea panoului.
 *
 * ⚠ NU e o valoare fixă pe trepte de ecran, și asta a fost o corectură măsurată.
 * Înălțimea în care încap cadranele vine din ilustrația 4:3 a cardului, adică din
 * LĂȚIMEA CARDULUI — iar aceea sare exact la trecerea de prag, când grila mai
 * adaugă o coloană. Cu pixeli ficși pe trepte, la 320, 640 și 1024px conținutul
 * ieșea cu 8-18px peste marginea ilustrației: trei lățimi din nouăsprezece
 * încercate, toate fix după câte un prag.
 *
 * `size` al componentei primește `100%`, iar lățimea o dă învelișul, în procente
 * din panou (`cqw`). Plafonul de 86 e mărimea la care e desenată; sub 48 cifra
 * n-ar mai încăpea în inel.
 */
const MARIME_CADRAN = "w-[calc(37.5cqw-28px)] max-w-[86px] min-w-[48px]";

export function PanouPageSpeed() {
  return (
    /*
      Umple ilustrația 4:3 a cardului. Nu-și desenează propria casetă: fondul
      `tint` și colțurile de 11px sunt deja ale ilustrației, ca la „Problema".

      `@container`: cadranele se măsoară în procente din lățimea panoului. Vezi
      nota de la `MARIME_CADRAN`.
    */
    <div className="@container absolute inset-0 flex flex-col justify-center px-4 py-4 sm:px-5">
      {/*
        Scorurile ca TEXT, o singură dată, pentru cine ascultă pagina și pentru
        cine o indexează.

        ⚠ Fără rândul ăsta, cifrele există doar în cadrane — iar cadranele
        pornesc de la zero și urcă abia în browser, deci de pe server ar pleca
        patru zerouri și atât. Ce trimite serverul trebuie să spună adevărul
        singur.
      */}
      <p className="sr-only">
        Rezultate PageSpeed Insights, măsurate pe mobil:{" "}
        {SCORURI_PAGESPEED.map((s) => `${s.eticheta} ${s.scor} din 100`).join(", ")}.
      </p>

      {/*
        ⚠ CADRANELE SUNT ÎNTR-UN ÎNVELIȘ DE CLIENT, `CadraneLaIntrare`, și nu din
        gust: `dynamic()` pus AICI n-ar despica nimic. Documentația lui Next spune
        că un import dinamic dintr-o componentă de server nu se despică automat,
        iar `ssr: false` e chiar interzis acolo. Ar fi trecut de build și n-ar fi
        economisit niciun octet. Motivele întregi și cifrele sunt în fișierul acela.

        Aici rămâne ce ține de server: rândul `sr-only` de mai sus, care poartă
        cifrele adevărate, și așezarea.
      */}
      <CadraneLaIntrare />
    </div>
  );
}
