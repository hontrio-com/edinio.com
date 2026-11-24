"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_EVENT, acordaFunctional, readConsent } from "@/lib/cookie-consent";
import type { VitrinaSuport } from "@/lib/suport/config";
import { comandaNotata, contextulPaginii } from "@/lib/suport/context-vitrina";
import { adaptorulPentru, pregatesteChatul, type AdaptorChat } from "@/lib/suport/adaptoare";
import type { RaspunsIdentitate } from "@/lib/suport/tipuri-chat";
import { PictogramaChat } from "./PictogramaChat";

/*
 * Butonul de contact al magazinului: chatul furnizorului ales (Tidio, tawk.to, Intercom, Zendesk) si, cand
 * magazinul le are, WhatsApp si telefonul, la un loc.
 *
 * ═══ DE CE E AL NOSTRU, SI NU AL FURNIZORULUI ═══
 *
 * Butonul furnizorului sta in coltul de jos cu un z-index urias si nu stie nimic despre magazin: pe telefon
 * ajunge peste bara de cumparare, iar pozitia lui se regleaza numai din panoul furnizorului. Al nostru:
 *   - urca deasupra barelor lipite jos, care isi anunta inaltimea prin variabila CSS `--bara-de-jos`
 *     (`LocPesteBaraDeJos`, `LocPentruButonulDeContact`), si deasupra barei de cookie-uri cat e deschisa
 *     (`--banner-cookie`, anuntata de `CookieConsent`): sub ea n-ar putea fi apasat pana la raspuns;
 *   - se da la o parte cand e deschis cosul, fereastra de comanda, filtrele sau meniul (toate blocheaza
 *     derularea paginii, si asta se vede pe `body`);
 *   - nu incarca nimic de la furnizor pana la prima apasare (`aspect.incarcare === "apasare"`), deci pagina
 *     ramane la fel de rapida.
 *
 * ═══ ACORDUL ═══
 *
 * Scriptul furnizorului pune cookie-uri, deci nu porneste fara acordul pentru categoria „functionale”. Cine
 * nu l-a dat la banner il da aici, intr-un cartonas, la prima apasare pe chat: apasarea pe „Deschide chatul”
 * e chiar cererea omului. Magazinele cu bannerul oprit nu intreaba nimic (`cereAcord` fals), ca la pixeli.
 * ⚠ Nici legatura spre furnizor (`preconnect`) nu se deschide fara acord: i-ar arata adresa IP a omului.
 *
 * ═══ CE NU FACE ═══
 *
 * Nu se monteaza in zona de cont si nici in previzualizarea din editor (layoutul il tine sub
 * `DoarInAfaraContului` si `DoarInMagazinReal`; in editor se deseneaza `MartorButonContact`). Nu apare
 * pentru roboti. Nu trimite nimic despre om: identitatea vine de la server, semnata, numai pe domeniul
 * propriu al magazinului (`/api/cont/suport`).
 *
 * ⚠ Textele sunt ale platformei, in vitrina: fara diacritice.
 */

type Faza = "repaus" | "se-incarca" | "gata" | "esec";

const FARA_IDENTITATE: RaspunsIdentitate = { identitate: null, amprenta: null };

/** Lista de sub butonul „Contact”. Un singur buton pe pagina, deci un singur id. */
const ID_OPTIUNI = "edinio-contact-optiuni";

/*
 * Chatul traieste cat pagina, nu cat componenta: scriptul furnizorului, odata pus, nu se mai poate scoate.
 * De aceea adaptorul sta aici, la nivelul modulului, iar butonul (care se poate remonta) doar il asculta.
 */
let adaptor: AdaptorChat | null = null;
let incarcare: Promise<AdaptorChat> | null = null;
let amprentaTrimisa: string | null = null;
/** Ce s-a pregatit deja la apropierea de buton: bucata noastra de cod si, separat, legatura spre furnizor. */
const pregatit = { cod: false, legatura: false };
const ascultatori: { necitite: (n: number) => void; stare: (deschisa: boolean) => void } = {
  necitite: () => {},
  stare: () => {},
};

function eRobot(): boolean {
  return /bot|crawl|spider|slurp|lighthouse|pagespeed|headless/i.test(navigator.userAgent);
}

function peTelefonAcum(): boolean {
  return window.matchMedia("(max-width: 639.98px)").matches;
}

/** Identitatea clientului cu cont, de la server. Orice esec inseamna „anonim”: chatul se deschide oricum. */
async function cereIdentitatea(): Promise<RaspunsIdentitate> {
  try {
    const semnal = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(4000) : undefined;
    const r = await fetch("/api/cont/suport", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: semnal,
    });
    if (!r.ok) return FARA_IDENTITATE;
    const d = (await r.json()) as Partial<RaspunsIdentitate> | null;
    return { identitate: d?.identitate ?? null, amprenta: typeof d?.amprenta === "string" ? d.amprenta : null };
  } catch {
    return FARA_IDENTITATE;
  }
}

export function ButonContact({
  slug,
  culoare,
  culoareText,
  chat,
  numeFurnizor,
  whatsapp,
  telefon,
  cereAcord,
  peDomeniuPropriu,
  politica,
}: {
  slug: string;
  /** Culoarea magazinului si culoarea textului care se citeste pe ea. */
  culoare: string;
  culoareText: string;
  chat: VitrinaSuport;
  numeFurnizor: string;
  /** Legatura de WhatsApp, cand magazinul are butonul plutitor pornit. */
  whatsapp: string | null;
  /** Numarul de telefon, cand magazinul are butonul plutitor de apel pornit. */
  telefon: string | null;
  /** Bannerul de cookie-uri al magazinului e pornit: chatul cere acordul pentru „functionale”. */
  cereAcord: boolean;
  /** Cererea a venit pe domeniul propriu al magazinului: numai acolo exista conturi de client. */
  peDomeniuPropriu: boolean;
  /** Adresa politicii de confidentialitate, pentru cartonasul de acord. */
  politica: string | null;
}) {
  const cale = usePathname();
  const [faza, setFaza] = useState<Faza>(adaptor ? "gata" : "repaus");
  const [fereastraChat, setFereastraChat] = useState(false);
  const [necitite, setNecitite] = useState(0);
  const [meniu, setMeniu] = useState(false);
  const [cartonas, setCartonas] = useState(false);
  const [paginaBlocata, setPaginaBlocata] = useState(false);
  const [comanda, setComanda] = useState<ReturnType<typeof comandaNotata>>(null);
  const [ascunsPeTelefon, setAscunsPeTelefon] = useState(false);
  /* Acordul pentru chat a fost retras dupa ce chatul se incarcase: widgetul furnizorului a iesit din pagina. */
  const [retras, setRetras] = useState(() => adaptor !== null && cereAcord && readConsent(slug)?.functional !== true);
  /* Robotii nu primesc butonul: nu au cui scrie, iar pagina pe care o citesc ramane cea a magazinului. */
  const [robot] = useState(() => typeof navigator !== "undefined" && eRobot());
  const radacina = useRef<HTMLDivElement>(null);
  const butonAcord = useRef<HTMLButtonElement>(null);
  const butonPrincipal = useRef<HTMLButtonElement>(null);

  const butonulNostru = chat.aspect.buton === "magazin";
  const trimiteIdentitate = chat.date.identitate && peDomeniuPropriu;
  const areMeniu = butonulNostru && (!!whatsapp || !!telefon);
  const pePaginaDeMultumire = /\/confirm\/?$/.test(cale ?? "");

  /* Butonul asculta adaptorul cat e montat. */
  useEffect(() => {
    ascultatori.necitite = setNecitite;
    ascultatori.stare = (deschisa) => {
      setFereastraChat(deschisa);
      if (deschisa) setNecitite(0);
    };
    return () => {
      ascultatori.necitite = () => {};
      ascultatori.stare = () => {};
    };
  }, []);

  /* Cosul, fereastra de comanda, filtrele si meniul blocheaza derularea paginii: atunci butonul se da la o parte. */
  useEffect(() => {
    const verifica = () => setPaginaBlocata(document.body.style.overflow === "hidden");
    verifica();
    const observator = new MutationObserver(verifica);
    observator.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    return () => observator.disconnect();
  }, []);

  /* „Arata si pe telefon” oprit: nici buton, nici incarcare, sub latimea unui telefon. */
  useEffect(() => {
    if (chat.aspect.pe_telefon) return;
    const media = window.matchMedia("(max-width: 639.98px)");
    const verifica = () => setAscunsPeTelefon(media.matches);
    verifica();
    media.addEventListener("change", verifica);
    return () => media.removeEventListener("change", verifica);
  }, [chat.aspect.pe_telefon]);

  /* Comanda abia plasata, notata de pagina de multumire. */
  useEffect(() => {
    if (!chat.date.comanda) return;
    const citeste = () => setComanda(comandaNotata(slug));
    citeste();
    window.addEventListener("edinio-chat-comanda", citeste);
    return () => window.removeEventListener("edinio-chat-comanda", citeste);
  }, [slug, chat.date.comanda, cale]);

  const spuneContextul = useCallback((a: AdaptorChat) => {
    const pagina = chat.date.pagina ? contextulPaginii(slug) : null;
    const notata = chat.date.comanda ? comandaNotata(slug) : null;
    if (pagina || notata) a.spuneContextul(pagina, notata);
  }, [slug, chat.date.pagina, chat.date.comanda]);

  /**
   * Incarca chatul (o singura data pe pagina) si, daca se cere, il deschide. Intoarce `false` cand
   * furnizorul nu a raspuns.
   */
  const porneste = useCallback(async (deschide: boolean): Promise<boolean> => {
    const mesaj = deschide && pePaginaDeMultumire && chat.date.comanda
      ? (() => { const c = comandaNotata(slug); return c ? `Am o intrebare despre comanda ${c.numar}` : undefined; })()
      : undefined;

    if (adaptor) {
      /* Omul poate fi intrat in cont sau iesit de la ultima deschidere: identitatea se pune la zi inainte. */
      if (deschide && trimiteIdentitate) {
        const ident = await cereIdentitatea();
        if (ident.amprenta !== amprentaTrimisa) {
          adaptor.identifica(ident.identitate);
          amprentaTrimisa = ident.amprenta;
        }
      }
      spuneContextul(adaptor);
      if (deschide) adaptor.deschide(mesaj);
      return true;
    }

    if (!incarcare) {
      incarcare = (async () => {
        /* Bucata de cod a furnizorului si identitatea se cer deodata: niciuna n-o asteapta pe cealalta. */
        const [a, ident] = await Promise.all([
          adaptorulPentru(chat.cont, {
            ascundeButonulLor: butonulNostru,
            pozitie: chat.aspect.pozitie,
            acordAnaliza: !cereAcord || readConsent(slug)?.analytics === true,
            laNecitite: (n) => ascultatori.necitite(n),
            laStare: (deschisa) => ascultatori.stare(deschisa),
            cereIdentitatea: async () => (await cereIdentitatea()).identitate,
          }),
          trimiteIdentitate ? cereIdentitatea() : Promise.resolve(FARA_IDENTITATE),
        ]);
        await a.incarca(ident.identitate);
        amprentaTrimisa = ident.amprenta;
        adaptor = a;
        return a;
      })();
      /* Un esec nu ramane tinut minte: a doua apasare incearca din nou. */
      incarcare.catch(() => { incarcare = null; });
    }

    if (deschide) setFaza("se-incarca");
    try {
      const a = await incarcare;
      setFaza("gata");
      spuneContextul(a);
      if (deschide) a.deschide(mesaj);
      return true;
    } catch {
      if (deschide) setFaza("esec");
      return false;
    }
  }, [butonulNostru, cereAcord, chat.aspect.pozitie, chat.cont, chat.date.comanda, pePaginaDeMultumire, slug, spuneContextul, trimiteIdentitate]);

  /*
   * Acordul schimbat DUPA ce chatul s-a incarcat (omul a redeschis „Setari cookie-uri” din subsol). Retras: chatul
   * iese din pagina pe loc, nu abia la urmatoarea incarcare. Dat din nou: se intoarce. Retragerea trebuie sa fie la
   * fel de usoara si de adevarata ca acordarea.
   */
  useEffect(() => {
    if (!cereAcord) return;
    const laAcordSchimbat = () => {
      const acord = readConsent(slug);
      const functionale = acord?.functional === true;
      if (adaptor) adaptor.acord(functionale, acord?.analytics === true);
      setRetras(adaptor !== null && !functionale);
      if (functionale) return;
      /* La intoarcere, cine e omul se spune din nou; pana atunci nu mai e nicio fereastra si niciun mesaj de aratat. */
      amprentaTrimisa = null;
      setFereastraChat(false);
      setNecitite(0);
    };
    window.addEventListener(CONSENT_EVENT, laAcordSchimbat);
    return () => window.removeEventListener(CONSENT_EVENT, laAcordSchimbat);
  }, [cereAcord, slug]);

  /* Mesajul de esec dispare singur; butonul ramane, ca omul sa poata incerca din nou. */
  useEffect(() => {
    if (faza !== "esec") return;
    const ceas = window.setTimeout(() => setFaza("repaus"), 7000);
    return () => window.clearTimeout(ceas);
  }, [faza]);

  /* Incarcarea automata: dupa acord, la cateva secunde dupa pagina sau la prima miscare a omului. */
  useEffect(() => {
    if (chat.aspect.incarcare !== "automat" || adaptor || robot) return;
    if (!chat.aspect.pe_telefon && peTelefonAcum()) return;
    let pornit = false;
    let ceas: number | undefined;
    const miscari = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

    const incepe = () => {
      if (pornit) return;
      if (cereAcord && readConsent(slug)?.functional !== true) return;
      pornit = true;
      curata();
      const f = () => { void porneste(false); };
      /* Safari nu are `requestIdleCallback`: acolo ramane un ceas scurt. */
      const liber = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (typeof liber === "function") liber.call(window, f, { timeout: 4000 });
      else window.setTimeout(f, 1);
    };
    const dupaPagina = () => { ceas = window.setTimeout(incepe, 3500); };
    const curata = () => {
      if (ceas !== undefined) window.clearTimeout(ceas);
      window.removeEventListener("load", dupaPagina);
      window.removeEventListener(CONSENT_EVENT, incepe);
      for (const m of miscari) window.removeEventListener(m, incepe);
    };

    if (document.readyState === "complete") dupaPagina();
    else window.addEventListener("load", dupaPagina, { once: true });
    for (const m of miscari) window.addEventListener(m, incepe, { once: true, passive: true });
    /* Acordul dat la banner dupa incarcarea paginii porneste si el chatul. */
    window.addEventListener(CONSENT_EVENT, incepe);
    return curata;
  }, [chat.aspect.incarcare, chat.aspect.pe_telefon, cereAcord, porneste, robot, slug]);

  /* La schimbarea paginii, cu chatul deja incarcat: operatorul afla noua pagina la urmatorul mesaj. */
  useEffect(() => {
    if (adaptor) spuneContextul(adaptor);
  }, [cale, comanda, spuneContextul]);

  /* Lista de contact si cartonasul se inchid cu Escape si la o apasare in afara lor. */
  useEffect(() => {
    if (!meniu && !cartonas) return;
    const laTasta = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMeniu(false);
      setCartonas(false);
      butonPrincipal.current?.focus();
    };
    const laApasare = (e: PointerEvent) => {
      if (radacina.current && e.target instanceof Node && !radacina.current.contains(e.target)) {
        setMeniu(false);
        setCartonas(false);
      }
    };
    document.addEventListener("keydown", laTasta);
    document.addEventListener("pointerdown", laApasare);
    return () => {
      document.removeEventListener("keydown", laTasta);
      document.removeEventListener("pointerdown", laApasare);
    };
  }, [meniu, cartonas]);

  useEffect(() => {
    if (cartonas) butonAcord.current?.focus();
  }, [cartonas]);

  /**
   * Cursorul sau focusul a ajuns pe buton: apasarea e aproape. Aducem bucata noastra de cod (nicio cerere
   * spre furnizor) si, numai cu acordul dat, deschidem legatura spre gazda scriptului lui.
   */
  const pregateste = () => {
    if (adaptor || incarcare) return;
    const cuLegatura = !pregatit.legatura && (!cereAcord || readConsent(slug)?.functional === true);
    if (pregatit.cod && !cuLegatura) return;
    pregatit.cod = true;
    if (cuLegatura) pregatit.legatura = true;
    try {
      pregatesteChatul(chat.cont.furnizor, cuLegatura);
    } catch {
      /* e doar un avans: la apasare se incarca oricum */
    }
  };

  const laChat = () => {
    /* Focusul se intoarce pe buton inainte ca lista sa dispara: altfel ar ramane pe un element scos din pagina. */
    if (meniu) butonPrincipal.current?.focus();
    setMeniu(false);
    if (cereAcord && readConsent(slug)?.functional !== true) {
      setCartonas(true);
      return;
    }
    void porneste(true);
  };

  const laAcord = () => {
    acordaFunctional(slug);
    butonPrincipal.current?.focus();
    setCartonas(false);
    void porneste(true);
  };

  /* ═══ Cand butonul nu se deseneaza ═══ */
  const ascunsLaComanda = !chat.aspect.la_comanda && /\/checkout(\/|$)/.test(cale ?? "");
  /* Butonul furnizorului e in pagina: al nostru a fost doar rezerva pana la incarcare. Cu acordul retras, al lor a
     iesit din pagina, deci al nostru revine: de la el se poate da acordul din nou. */
  const alLorEInPagina = !butonulNostru && faza === "gata" && !retras;
  if (robot || ascunsLaComanda || ascunsPeTelefon || alLorEInPagina || fereastraChat || paginaBlocata) return null;

  const stanga = chat.aspect.pozitie === "stanga";
  const seIncarca = faza === "se-incarca";
  const eticheta = pePaginaDeMultumire && comanda ? "Ai o intrebare despre comanda?" : chat.aspect.text;
  const numePrincipal = areMeniu ? "Contact" : "Deschide chatul";
  const laPrincipal = () => {
    if (seIncarca) return;
    if (areMeniu) { setCartonas(false); setMeniu((v) => !v); } else laChat();
  };
  const clasaOptiune = "flex h-11 items-center gap-2 rounded-full border border-black/10 bg-white pl-3 pr-4 text-[13px] font-semibold text-gray-900 shadow-lg transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900 motion-reduce:transition-none";
  const clasaEticheta = "rounded-full border border-black/10 bg-white px-3 py-1.5 text-[13px] text-gray-900 shadow-md";

  return (
    /*
     * ⚠ ORDINEA DIN COD E ORDINEA TASTEI TAB: intai butonul, apoi ce deschide el (lista de contact, cartonasul
     * de acord). Pe ecran e rasturnata (`flex-col-reverse`): butonul jos, restul deasupra lui. Scrise in
     * ordinea de pe ecran, lista si cartonasul ar fi venit INAINTEA butonului, deci cine umbla din tastatura
     * ar fi trebuit sa mearga inapoi ca sa ajunga la ce tocmai a deschis.
     *
     * `max-sm:hidden` (cand comerciantul a oprit chatul pe telefon) ascunde butonul din prima clipa; starea
     * `ascunsPeTelefon` il scoate apoi cu totul. `print:hidden`: un buton plutitor nu are ce cauta pe hartie.
     */
    <div
      ref={radacina}
      data-edinio-chat=""
      className={`fixed z-30 flex flex-col-reverse gap-3 transition-[bottom] motion-reduce:transition-none print:hidden ${chat.aspect.pe_telefon ? "" : "max-sm:hidden "}${stanga ? "left-4 items-start" : "right-4 items-end"}`}
      style={{
        bottom: "calc(1.25rem + max(var(--bara-de-jos, 0px), var(--banner-cookie, 0px)))",
        /* Deasupra unei bare lipicioase, butonul o urmareste fara animatie (`LocPentruButonulDeContact`). */
        transitionDuration: "var(--bara-de-jos-durata, 200ms)",
      }}
    >
      <div className={`flex items-center gap-2.5 ${stanga ? "flex-row-reverse" : ""}`}>
        {/*
          Textul de langa buton se poate apasa cu mouse-ul, ca butonul. E ascuns de cititoarele de ecran si de
          tasta Tab (butonul e chiar langa el, cu acelasi nume), iar `onMouseDown` nu-l lasa sa ia focusul.
        */}
        {necitite > 0 ? (
          <button type="button" tabIndex={-1} aria-hidden="true" onMouseDown={(e) => e.preventDefault()} onClick={laPrincipal}
            className={`${clasaEticheta} font-semibold`}>
            Mesaj nou
          </button>
        ) : eticheta && !meniu && !cartonas ? (
          <button type="button" tabIndex={-1} aria-hidden="true" onMouseDown={(e) => e.preventDefault()} onClick={laPrincipal}
            className={`${clasaEticheta} hidden font-medium md:block`}>
            {eticheta}
          </button>
        ) : null}
        <button
          ref={butonPrincipal}
          type="button"
          data-edinio-chat-buton=""
          aria-label={necitite > 0 ? `${numePrincipal}, ${necitite} ${necitite === 1 ? "mesaj nou" : "mesaje noi"}` : numePrincipal}
          aria-expanded={areMeniu ? meniu : undefined}
          aria-controls={areMeniu && meniu ? ID_OPTIUNI : undefined}
          aria-busy={seIncarca || undefined}
          /* `aria-disabled`, nu `disabled`: un buton dezactivat si-ar pierde focusul chiar cat se deschide chatul. */
          aria-disabled={seIncarca || undefined}
          onClick={laPrincipal}
          onPointerEnter={pregateste}
          onFocus={pregateste}
          className={`relative flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900 motion-reduce:transition-none ${seIncarca ? "cursor-progress" : "hover:scale-105 active:scale-95 motion-reduce:hover:scale-100"}`}
          style={{ backgroundColor: culoare, color: culoareText }}
        >
          {seIncarca
            ? <span aria-hidden="true" className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
            : meniu
              ? <PictogramaInchide className="h-6 w-6" />
              : <PictogramaChat className="h-7 w-7" />}
          {necitite > 0 && (
            <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white">
              {necitite > 9 ? "9+" : necitite}
            </span>
          )}
        </button>
      </div>

      {meniu && areMeniu && (
        <ul id={ID_OPTIUNI} aria-label="Contact" className={`flex flex-col gap-2 ${stanga ? "items-start" : "items-end"}`}>
          <li>
            <button type="button" onClick={laChat} onPointerEnter={pregateste} onFocus={pregateste} className={clasaOptiune}>
              <PictogramaChat className="h-5 w-5" /> Chat
            </button>
          </li>
          {/*
            `tabIndex={0}` pe cele doua legaturi: Safari sare peste legaturi la tasta Tab (se opreste pe ele doar cu
            Option+Tab), deci din tastatura s-ar fi ajuns la „Chat” si la nimic altceva. Masurat in WebKit, 22.11.2026.
          */}
          {whatsapp && (
            <li>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" tabIndex={0} className={clasaOptiune}>
                <PictogramaWhatsApp className="h-5 w-5 text-[#25D366]" /> WhatsApp
              </a>
            </li>
          )}
          {telefon && (
            <li>
              <a href={`tel:${telefon}`} tabIndex={0} className={clasaOptiune}>
                <PictogramaTelefon className="h-5 w-5" /> Telefon
              </a>
            </li>
          )}
        </ul>
      )}

      {faza === "esec" && (
        <p role="alert" className="max-w-[min(18.5rem,calc(100vw-2rem))] rounded-xl border border-black/10 bg-white px-3 py-2 text-[13px] leading-snug text-gray-700 shadow-lg">
          Chatul nu s-a putut deschide. Incearca din nou.
        </p>
      )}

      {cartonas && (
        <div role="dialog" aria-label="Chat cu magazinul"
          className="w-[min(18.5rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-white p-4 text-left shadow-xl">
          <p className="text-[14px] font-semibold text-gray-900">Chat cu magazinul</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600">
            Chatul este oferit de {numeFurnizor} si foloseste cookie-uri.{" "}
            {politica && <a href={politica} className="underline hover:text-gray-900">Detalii</a>}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button ref={butonAcord} type="button" onClick={laAcord}
              className="h-10 flex-1 rounded-lg px-3 text-[13px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900 motion-reduce:transition-none"
              style={{ backgroundColor: culoare, color: culoareText }}>
              Deschide chatul
            </button>
            <button type="button" onClick={() => { butonPrincipal.current?.focus(); setCartonas(false); }}
              className="h-10 rounded-lg border border-black/10 px-3 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900 motion-reduce:transition-none">
              Nu acum
            </button>
          </div>
        </div>
      )}

      <span role="status" className="sr-only">
        {seIncarca ? "Se deschide chatul" : necitite > 0 ? "Ai un mesaj nou in chat" : ""}
      </span>
    </div>
  );
}

/* Pictogramele sunt desenate aici, nu aduse dintr-o biblioteca: butonul e pe fiecare pagina a magazinului. */

function PictogramaInchide({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function PictogramaTelefon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

function PictogramaWhatsApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 448 512" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
    </svg>
  );
}
