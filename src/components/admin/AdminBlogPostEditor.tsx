"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Upload, Plus, Trash2, Clock, Sparkles, HelpCircle, X, Check, RotateCcw, History, Pin, Eye,
} from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { GooglePreview, CharCounter } from "@/components/dashboard/SeoFields";
import { uploadImage } from "@/lib/upload";
import {
  SEO_DESCRIPTION_IDEAL_MIN, SEO_DESCRIPTION_MAX,
  SEO_TITLE_IDEAL_MIN, SEO_TITLE_MAX,
} from "@/lib/seo";
import {
  minuteDeCitit, slugDin, STARI,
  type ArticolBlog, type AutorBlog, type CategorieBlog, type IntrebareBlog, type StareArticol,
} from "@/lib/blog/types";
import { creeazaArticol, actualizeazaArticol, type ArticolInput } from "@/lib/actions/blog.actions";
import { NUMELE_TIPURILOR, type IndemnArticol, type TipIndemn } from "@/lib/blog/indemn";
import type { SablonArticol } from "@/lib/blog/sabloane";
import { AdminBlogVersiuni } from "./AdminBlogVersiuni";

const inputCls =
  "w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900/20";

/** Antetul unei secțiuni din formular, cu lămurirea sub el. */
function Sectiune({ titlu, lamurire, children }: { titlu: string; lamurire?: string; children: React.ReactNode }) {
  return (
    <section className="pt-6 border-t border-zinc-200">
      <h2 className="text-sm font-semibold text-zinc-900">{titlu}</h2>
      {lamurire && <p className="mt-1 mb-3 text-xs text-zinc-500 max-w-2xl">{lamurire}</p>}
      <div className={lamurire ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

type Stare = {
  title: string;
  slug: string;
  slugScrisDeMana: boolean;
  excerpt: string;
  answer_summary: string;
  content_html: string;
  cover_url: string;
  cover_alt: string;
  og_image_url: string;
  author_id: string;
  category_id: string;
  status: StareArticol;
  /** Formatul `datetime-local`, adică fără fus. Vezi nota de la salvare. */
  publicatLa: string;
  is_featured: boolean;
  is_pinned: boolean;
  /** Gol înseamnă „fără îndemn în articol”. */
  indemnTip: TipIndemn | "";
  indemnTitlu: string;
  indemnText: string;
  indemnEticheta: string;
  indemnAdresa: string;
  faq: IntrebareBlog[];
  seo_title: string;
  seo_description: string;
  canonical_url: string;
  noindex: boolean;
  etichete: string[];
  /** Ce se scrie acum in caseta, inainte de Enter. */
  etichetaInLucru: string;
};

/** ISO → valoarea pe care o cere `<input type="datetime-local">`, în ora locală. */
function pentruInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Ce se trimite la server, din starea formularului. */
function intrareDin(
  f: Stare,
  status: StareArticol,
  versiune: number | null,
  tacut = false,
): ArticolInput {
  return {
    /* Vezi `versiuneaMea`: fără ea, cine salvează al doilea scrie peste primul
       fără ca vreunul să afle. */
    edit_version: versiune,
    tacut,
    title: f.title,
    slug: f.slug,
    excerpt: f.excerpt,
    answer_summary: f.answer_summary,
    content_html: f.content_html,
    cover_url: f.cover_url,
    cover_alt: f.cover_alt,
    og_image_url: f.og_image_url,
    author_id: f.author_id,
    category_id: f.category_id,
    status,
    /* `datetime-local` dă o oră FĂRĂ fus. `new Date(...)` o citește ca oră
       locală a browserului, care e chiar ce a vrut omul când a ales-o. */
    published_at: f.publicatLa ? new Date(f.publicatLa).toISOString() : null,
    is_featured: f.is_featured,
    is_pinned: f.is_pinned,
    cta: f.indemnTip
      ? {
          tip: f.indemnTip,
          titlu: f.indemnTitlu.trim() || undefined,
          text: f.indemnText.trim() || undefined,
          eticheta: f.indemnEticheta.trim() || undefined,
          adresa: f.indemnAdresa.trim() || undefined,
        }
      : null,
    faq: f.faq,
    seo_title: f.seo_title,
    seo_description: f.seo_description,
    canonical_url: f.canonical_url,
    noindex: f.noindex,
    /* Și cea din casetă, nescrisă încă: altfel omul tastează o etichetă,
       apasă Salvează fără Enter, și o pierde fără să afle. */
    etichete: [...f.etichete, f.etichetaInLucru.trim()].filter(Boolean),
  };
}

function dinStareInitiala(a: ArticolBlog | null, etichete: string[], sablon?: SablonArticol | null): Stare {
  /* `cta` vine din baza ca `unknown`: e `jsonb`, deci poate fi orice. Se
     citește apărat, iar ce nu se potrivește rămâne gol. */
  const cta = (a?.cta && typeof a.cta === "object" && !Array.isArray(a.cta)
    ? (a.cta as IndemnArticol)
    : null);
  return {
    title: a?.title ?? "",
    slug: a?.slug ?? "",
    slugScrisDeMana: !!a,
    excerpt: a?.excerpt ?? "",
    answer_summary: a?.answer_summary ?? (a ? "" : sablon?.raspunsScurt ?? ""),
    /* ⚠ ȘABLONUL SE APLICĂ DOAR CÂND NU EXISTĂ ARTICOL. Pe unul salvat ar fi
       scris peste textul omului — iar `a?.x ?? sablon` ar fi făcut exact asta
       la orice câmp gol dintr-un articol adevărat. */
    content_html: a?.content_html ?? (a ? "" : sablon?.html ?? ""),
    cover_url: a?.cover_url ?? "",
    cover_alt: a?.cover_alt ?? "",
    og_image_url: a?.og_image_url ?? "",
    author_id: a?.author_id ?? "",
    category_id: a?.category_id ?? "",
    status: a?.status ?? "draft",
    publicatLa: pentruInput(a?.published_at ?? null),
    is_featured: a?.is_featured ?? false,
    is_pinned: a?.is_pinned ?? false,
    indemnTip: (cta?.tip as TipIndemn) ?? (a ? "" : sablon?.indemn ?? ""),
    indemnTitlu: cta?.titlu ?? "",
    indemnText: cta?.text ?? "",
    indemnEticheta: cta?.eticheta ?? "",
    indemnAdresa: cta?.adresa ?? "",
    faq: Array.isArray(a?.faq) ? a.faq : (a ? [] : sablon?.intrebari ?? []),
    seo_title: a?.seo_title ?? "",
    seo_description: a?.seo_description ?? "",
    canonical_url: a?.canonical_url ?? "",
    noindex: a?.noindex ?? false,
    etichete: etichete ?? [],
    etichetaInLucru: "",
  };
}

export function AdminBlogPostEditor({
  articol,
  autori,
  categorii,
  etichete = [],
  sablon = null,
  rol = "admin",
}: {
  articol: ArticolBlog | null;
  autori: AutorBlog[];
  categorii: CategorieBlog[];
  /** Etichetele pe care le are deja articolul. Gol la unul nou. */
  etichete?: string[];
  /** Schela de pornire, doar la un articol NOU. Vezi `blog/sabloane.ts`. */
  sablon?: SablonArticol | null;
  /** Un redactor nu poate publica singur. Vezi butoanele de jos. */
  rol?: "admin" | "editor";
}) {
  const router = useRouter();
  const [f, setF] = useState<Stare>(() => dinStareInitiala(articol, etichete, sablon));
  const [salveaza, setSalveaza] = useState(false);
  const [incarca, setIncarca] = useState(false);

  /*
    ═══ NESALVAT, SALVARE AUTOMATĂ, ȘI PAZA LA IEȘIRE ═══

    Editorul ăsta era singurul loc din panou unde se scrie mult text și nu
    exista nicio plasă. Restul panoului are deja tiparul `dirty` +
    `beforeunload` în cinci locuri (PageBuilder, FormBuilder, StoreDesignEditor
    și încă două).

    ⚠ `beforeunload` NU E DE AJUNS, ȘI E CALEA MAI PUȚIN PROBABILĂ. Butonul
    „← Articole” de sus e un `<Link>`, adică navigare pe client: browserul nu
    părăsește pagina, deci evenimentul nici nu pornește. Un singur clic ștergea
    tot. De aceea există și paza de la `inapoiLaLista`.

    ⚠ SALVAREA AUTOMATĂ MERGE DOAR PE UN ARTICOL CARE EXISTĂ DEJA. Pe unul nou
    ar fi creat rânduri în tăcere, de fiecare dată când cineva deschide
    formularul și se răzgândește. Acolo lucrează copia locală de mai jos.
  */
  const [nesalvat, setNesalvat] = useState(false);
  const [salvatLa, setSalvatLa] = useState<string | null>(null);
  const stareaAcum = useRef(f);
  /* ⚠ Scrisă în efect, nu în corpul randării: React interzice atingerea
     referințelor în timpul randării, fiindcă o randare întreruptă și reluată
     ar lăsa referința pe o valoare care n-a ajuns niciodată pe ecran. */
  useEffect(() => { stareaAcum.current = f; }, [f]);

  const pune = <K extends keyof Stare>(k: K, v: Stare[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    generatie.current++;
    setNesalvat(true);
  };

  /**
   * Ca `pune`, dar pentru valori venite DE LA SERVER.
   *
   * ⚠ NU MARCHEAZĂ NESALVAT, și asta e tot rostul lui. După o publicare reușită
   * codul făcea `setNesalvat(false)` și imediat `pune("status", ...)`, iar `pune`
   * marchează întotdeauna nesalvat. Deci formularul se declara nesalvat la o
   * zecime de secundă după ce serverul confirmase salvarea — ceea ce, mai
   * departe, pornea autosalvarea peste o publicare tocmai încheiată.
   */
  const puneDeLaServer = <K extends keyof Stare>(k: K, v: Stare[K]) => {
    setF((s) => ({ ...s, [k]: v }));
  };

  /**
   * ═══ O SINGURĂ SCRIERE ODATĂ ═══
   *
   * ⚠ FĂRĂ ASTA, AUTOSALVAREA ȘI PUBLICAREA SE BAT PE ACELAȘI ARTICOL.
   *
   * Ceasul de 30 de secunde putea porni exact când omul apasă „Publică". Dacă
   * publicarea ajungea prima la server și autosalvarea a doua, ultima scriere
   * câștiga — iar autosalvarea trimitea `status` vechi. Rezultatul: articolul
   * revenea în ciornă după ce ecranul îi spusese omului că e publicat. Niciun
   * mesaj de eroare, nicăieri.
   *
   * Referință, nu stare: trebuie citită de ceasul de autosalvare fără să aștepte
   * o randare, iar o valoare de stare ar fi fost veche exact în clipa care
   * contează.
   */
  const scriereInCurs = useRef(false);

  /**
   * Versiunea articolului, așa cum o știe serverul.
   *
   * ⚠ ASTA E CE OPREȘTE „ULTIMA SCRIERE CÂȘTIGĂ".
   *
   * Două file deschise pe același articol, sau doi redactori. A salvează. B are
   * încă versiunea veche pe ecran, salvează, și munca lui A dispare — fără nicio
   * eroare, fără ca vreunul dintre ei să afle vreodată.
   *
   * Se trimite la fiecare scriere. Dacă baza are altă versiune decât asta,
   * refuză scrierea și acțiunea întoarce un mesaj care spune ce s-a întâmplat.
   * După fiecare salvare reușită se pune numărul nou primit de la server.
   */
  const versiuneaMea = useRef<number | null>(articol?.edit_version ?? null);

  /**
   * Câte schimbări a făcut omul, de la deschiderea formularului.
   *
   * ⚠ FĂRĂ ASTA, ECRANUL MINTE DUPĂ FIECARE SALVARE AUTOMATĂ.
   *
   * Salvarea pleacă cu starea de ACUM și așteaptă răspunsul o secundă. În
   * secunda aceea omul mai scrie trei cuvinte. Când răspunsul vine, codul făcea
   * `setNesalvat(false)` și ștergea copia locală — deși serverul are ce era
   * ÎNAINTE de cele trei cuvinte, iar browserul are altceva. Ecranul spune
   * „Salvat", omul închide fila, și cele trei cuvinte nu există nicăieri.
   *
   * Numărul crește la fiecare atingere. Dacă la întoarcerea răspunsului nu mai e
   * cel de la plecare, înseamnă că s-a mai scris ceva între timp: rămâne
   * „Nesalvat", copia locală rămâne, iar următorul ceas trimite starea nouă.
   */
  const generatie = useRef(0);

  function schimbaTitlul(title: string) {
    setF((s) => ({ ...s, title, slug: s.slugScrisDeMana ? s.slug : slugDin(title) }));
    generatie.current++;
    setNesalvat(true);
  }

  function adaugaEticheta(brut: string) {
    const nume = brut.trim().replace(/,+$/, "").trim();
    if (!nume) { setF((s) => ({ ...s, etichetaInLucru: "" })); return; }
    setF((s) => ({
      ...s,
      /* Fara duplicate, si fara sa tina seama de litere mari: „eMAG" si „emag"
         dau acelasi slug, deci ar fi ajuns aceeasi eticheta oricum. Mai bine se
         vede pe loc decat sa se lamureasca abia dupa salvare. */
      etichete: s.etichete.some((e) => e.toLowerCase() === nume.toLowerCase())
        ? s.etichete
        : [...s.etichete, nume].slice(0, 12),
      etichetaInLucru: "",
    }));
  }

  async function incarcaCoperta(file: File) {
    setIncarca(true);
    const res = await uploadImage(file, "gallery", "blog");
    setIncarca(false);
    if ("error" in res) { toast.error(res.error); return; }
    /*
      ⚠ AICI ERA `setNesalvat(false)` + ștergerea copiei locale, puse din greșeală
      de o înlocuire automată care a lovit fiecare funcție cu aceeași linie de
      verificare a erorii. Urmarea: o simplă încărcare de copertă spunea „salvat",
      deși nimic nu plecase la server, și arunca și plasa de siguranță din browser.
      Încărcarea unei poze SCHIMBĂ articolul, deci îl lasă nesalvat — ceea ce face
      `pune` de mai jos.
    */
    pune("cover_url", res.url);
  }

  const nesalvatRef = useRef(nesalvat);
  useEffect(() => { nesalvatRef.current = nesalvat; }, [nesalvat]);

  /** Cheia sub care se ține copia locală. Un articol nou are cheia lui. */
  const cheieLocala = `blog-ciorna-${articol?.id ?? "nou"}`;

  /** Salvarea tăcută: fără mesaje, fără reîmprospătare, fără mutat pagina. */
  const salveazaTacut = useCallback(async () => {
    const st = stareaAcum.current;
    if (!articol || !st.title.trim()) return;

    /* ⚠ Se dă la o parte când omul salvează sau publică. Autosalvarea e o plasă,
       nu o concurentă: peste o scriere pornită de om, ea n-are ce adăuga, dar
       are ce strica. Nu se pune la coadă — următorul ceas vine în 30 de secunde,
       iar starea de atunci e oricum mai proaspătă decât cea de acum. */
    if (scriereInCurs.current) return;

    scriereInCurs.current = true;
    /* Generația de la care pleacă scrierea asta. Vezi `generatie`. */
    const gen = generatie.current;
    try {
      /* `tacut`: salvarea automată NU scrie versiune în istoric. Bate la 30 de
         secunde; cu o revizie de fiecare dată, cele 50 de sloturi se umplu în 25
         de minute și istoricul rămâne numai cu variante aproape identice. */
      const res = await actualizeazaArticol(
        articol.id,
        intrareDin(st, st.status, versiuneaMea.current, true),
      );
      if (!("error" in res)) {
        versiuneaMea.current = res.date.edit_version;
        setSalvatLa(new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }));
        /* ⚠ Doar dacă între timp n-a mai scris nimeni nimic. Altfel serverul are
           o stare mai veche decât ecranul, iar „Salvat" ar fi o minciună care se
           plătește la închiderea filei. */
        if (generatie.current === gen) {
          setNesalvat(false);
          try { localStorage.removeItem(cheieLocala); } catch { /* fila privată */ }
        }
      }
    } finally {
      scriereInCurs.current = false;
    }
  }, [articol, cheieLocala]);

  /* La fiecare 30 de secunde, dacă e ceva nesalvat. Nu la fiecare tastă: ar fi
     scris în baza de date de zeci de ori pe minut și ar fi umplut istoricul de
     versiuni cu zgomot. */
  useEffect(() => {
    if (!articol) return;
    const ceas = setInterval(() => { if (nesalvatRef.current) salveazaTacut(); }, 30_000);
    return () => clearInterval(ceas);
  }, [articol, salveazaTacut]);

  /* Paza la închiderea filei sau la reîncărcare. Vezi nota de sus: NU acoperă
     navigarea pe client, de aceea există și `inapoiLaLista`. */
  useEffect(() => {
    function laPlecare(e: BeforeUnloadEvent) {
      if (nesalvatRef.current) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", laPlecare);
    return () => window.removeEventListener("beforeunload", laPlecare);
  }, []);

  /*
    ⚠ COPIA LOCALĂ E SINGURA PLASĂ A UNUI ARTICOL NOU.

    Salvarea tăcută nu poate lucra înainte să existe rândul: ar fi creat
    articole de fiecare dată când cineva deschide formularul și se răzgândește.
    Dar tocmai articolul nou e cel la care se scrie cel mai mult text dintr-o
    dată. Copia din browser acoperă exact golul acela.
  */
  useEffect(() => {
    if (!nesalvat) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(cheieLocala, JSON.stringify(stareaAcum.current)); } catch { /* plin sau privat */ }
    }, 2000);
    return () => clearTimeout(t);
  }, [nesalvat, f, cheieLocala]);

  /* Ce s-a găsit în browser la deschidere, dacă e ceva. Se OFERĂ, nu se pune:
     o copie mai veche scrisă peste articolul de acum ar fi o pierdere, nu o
     salvare. */
  const [copieGasita, setCopieGasita] = useState<Stare | null>(null);
  const [vedeIstoricul, setVedeIstoricul] = useState(false);
  useEffect(() => {
    /* ⚠ AMÂNAT CU UN `setTimeout(0)`, nu citit direct în efect.

       Citirea nu poate sta în corpul componentei: `localStorage` nu există la
       randarea de pe server, iar o citire păzită cu `typeof window` ar da alt
       rezultat pe server decât în browser, adică nepotrivire la hidratare.

       Iar scrisă direct în efect, pune starea în aceeași bătaie cu montarea și
       declanșează o a doua randare imediată. Amânată o bătaie, banda apare
       după ce editorul e deja pe ecran, ceea ce e și corect ca purtare: omul
       vede întâi articolul, apoi întrebarea despre copie. */
    const t = setTimeout(() => {
      try {
        const brut = localStorage.getItem(cheieLocala);
        if (!brut) return;
        const veche = JSON.parse(brut) as Stare;
        if (veche.title !== stareaAcum.current.title || veche.content_html !== stareaAcum.current.content_html) {
          setCopieGasita(veche);
        }
      } catch { /* copie stricată: se ignoră */ }
    }, 0);
    return () => clearTimeout(t);
    // O singură dată, la deschidere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Întoarcerea la listă, cu întrebare când e ceva nesalvat. */
  function inapoiLaLista() {
    if (nesalvat && !window.confirm("Ai schimbări nesalvate. Le pierzi dacă pleci acum. Continui?")) return;
    router.push("/admin/blog");
  }

  /** Ce se face după orice scriere reușită: nu mai e nimic nesalvat. */
  function dupaOSalvareReusita(stareNoua?: StareArticol, generatieLaPornire?: number) {
    setSalvatLa(new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }));
    /* ⚠ Aceeași grijă ca la salvarea automată: dacă omul a mai scris ceva cât
       era cererea pe drum, serverul are o stare mai veche decât ecranul. Atunci
       rămâne „Nesalvat" și copia locală rămâne pe loc. */
    if (generatieLaPornire === undefined || generatie.current === generatieLaPornire) {
      setNesalvat(false);
      try { localStorage.removeItem(cheieLocala); } catch { /* filă privată */ }
    }
    /* ⚠ `puneDeLaServer`, NU `pune`: starea vine de la server, deci n-are ce
       marca drept nesalvat. Vezi nota de la definiția lui. */
    if (stareNoua) puneDeLaServer("status", stareNoua);
  }

  async function salveaza_(stareNoua?: StareArticol) {
    /* ⚠ Nicio a doua scriere cât una e pe drum. Două apăsări repezi pe „Publică"
       trimiteau două cereri, iar a doua scria peste prima cu o stare care putea
       fi deja veche. */
    if (scriereInCurs.current) return;
    scriereInCurs.current = true;

    const status = stareNoua ?? f.status;
    setSalveaza(true);

    const gen = generatie.current;
    const intrare = intrareDin(f, status, versiuneaMea.current);

    /* Ramurile sunt despărțite dinadins: cele două acțiuni întorc forme
       diferite, iar pe o singură variabilă de tip reunit `res.date` ajungea
       `unknown` și nu se putea citi id-ul articolului nou. */
    if (articol) {
      const res = await actualizeazaArticol(articol.id, intrare);
      setSalveaza(false);
      scriereInCurs.current = false;
      if ("error" in res) { toast.error(res.error, { duration: 12_000 }); return; }
      versiuneaMea.current = res.date.edit_version;
      dupaOSalvareReusita(stareNoua, gen);
      toast.success(generatie.current === gen ? "Salvat." : "Salvat — dar ai scris mai departe între timp.");
      router.refresh();
      return;
    }

    const res = await creeazaArticol(intrare);
    setSalveaza(false);
    scriereInCurs.current = false;
    if ("error" in res) { toast.error(res.error); return; }
    dupaOSalvareReusita(stareNoua, gen);
    toast.success("Articol creat.");
    /* `replace`, nu `push`: „înapoi" trebuie să ducă la lista de articole, nu
       la formularul gol de dinainte, care ar crea un al doilea articol. */
    router.replace(`/admin/blog/${res.date.id}`);
  }

  /*
    ═══ CEASUL NU SE CITEȘTE ÎN TIMPUL RANDĂRII ═══

    Aici era `Date.now()` scris direct în JSX, ca să se vadă dacă data aleasă e
    în viitor. React interzice asta pe bună dreptate: o funcție care întoarce
    altceva la fiecare apel face randarea să depindă de CÂND s-a întâmplat, nu
    de ce e în stare. Regula `react-hooks/purity` l-a prins.

    Citit o singură dată, la deschiderea editorului, momentul devine o valoare
    obișnuită din stare. A doua încercare a fost un efect care scria starea, și
    a picat la altă regulă (`set-state-in-effect`) — pe drept: nu era nimic din
    afară de urmărit, doar un moment de citit o dată.

    Un instantaneu de la deschidere e și mai corect decât unul care se
    reîmprospătează: întrebarea e „data aleasă e în viitor?", iar răspunsul n-are
    de ce să se schimbe sub ochii omului cât timp stă în formular.
  */
  const [deschisLa] = useState(() => Date.now());
  const programat =
    f.status === "published" && !!f.publicatLa
    && new Date(f.publicatLa).getTime() > deschisLa;

  const titluCatreGoogle = f.seo_title.trim() || f.title;
  const descriereCatreGoogle = f.seo_description.trim() || f.excerpt;
  const minute = minuteDeCitit(f.content_html);

  return (
    <div className="p-6 max-w-3xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-6">
        {/* Buton, nu `Link`: navigarea pe client nu porneste `beforeunload`,
            deci fara paza asta un singur clic stergea tot ce nu era salvat. */}
        <button type="button" onClick={inapoiLaLista}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" /> Articole
        </button>
        <div className="flex items-center gap-3">
          {articol && (
            <button type="button" onClick={() => setVedeIstoricul(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900">
              <History className="h-3.5 w-3.5" /> Istoric
            </button>
          )}
        <span className="flex items-center gap-2 text-xs text-zinc-500">
          {STARI[f.status]}{minute ? ` · ${minute} min de citit` : ""}
          {nesalvat ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] text-amber-700">
              Nesalvat
            </span>
          ) : salvatLa ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
              <Check className="h-3 w-3" /> salvat la {salvatLa}
            </span>
          ) : null}
        </span>
        </div>
      </div>

      {articol && (
        <AdminBlogVersiuni
          idArticol={articol.id}
          deschis={vedeIstoricul}
          inchide={() => setVedeIstoricul(false)}
          dupaRevenire={() => router.refresh()}
        />
      )}

      {/*
        ⚠ SE OFERĂ, NU SE PUNE. O copie mai veche scrisă automat peste articolul
        de acum ar fi o pierdere, nu o salvare. Omul vede că există și alege.
      */}
      {copieGasita && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <RotateCcw className="h-4 w-4 shrink-0 text-amber-700" />
          <p className="flex-1 text-sm text-amber-900">
            Am găsit în browser o versiune nesalvată
            {copieGasita.title ? ` a articolului „${copieGasita.title}”` : ""}.
          </p>
          <button type="button"
            onClick={() => { setF(copieGasita); setCopieGasita(null); generatie.current++; setNesalvat(true); }}
            className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800">
            Adu-o înapoi
          </button>
          <button type="button"
            onClick={() => {
              setCopieGasita(null);
              try { localStorage.removeItem(cheieLocala); } catch { /* filă privată */ }
            }}
            className="text-xs font-medium text-amber-800 hover:underline">
            Arunc-o
          </button>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <input type="text" value={f.title} onChange={(e) => schimbaTitlul(e.target.value)}
            placeholder="Titlul articolului"
            className="w-full text-2xl font-semibold text-zinc-900 placeholder:text-zinc-300 border-0 border-b border-zinc-200 pb-2 focus:outline-none focus:border-zinc-900" />
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
            <span>/blog/</span>
            <input type="text" value={f.slug}
              onChange={(e) => setF((s) => ({ ...s, slug: e.target.value, slugScrisDeMana: true }))}
              placeholder="adresa-articolului"
              className="flex-1 font-mono bg-transparent border-0 focus:outline-none text-zinc-600" />
          </div>
        </div>

        {/*
          ═══ RĂSPUNSUL SCURT, PENTRU MOTOARELE CARE RĂSPUND CU TEXT ═══

          Nu e un rezumat și nu e o introducere. E un răspuns care se ține pe
          picioarele lui: motoarele generative citează pasaje scoase din pagină,
          iar unul care spune „după cum vom vedea" nu poate fi citat singur.
          Regula practică e scrisă chiar sub câmp, ca să n-o caute nimeni.
        */}
        <Sectiune
          titlu="Răspunsul scurt"
          lamurire="Două-trei propoziții care răspund la întrebarea articolului și se înțeleg SINGURE, fără restul textului. Se arată în capul articolului, și e bucata pe care o citează ChatGPT, Perplexity sau răspunsurile din Google. Dacă îl citești rupt de articol și nu se înțelege, nu e bun încă."
        >
          <textarea value={f.answer_summary} rows={3}
            onChange={(e) => pune("answer_summary", e.target.value)}
            placeholder="Un magazin online pe Edinio se deschide în aceeași zi: alegi un plan, îți pui produsele și conectezi curierul. Nu ai nevoie de programator."
            className={inputCls + " resize-y"} />
        </Sectiune>

        <Sectiune titlu="Textul articolului">
          <RichTextEditor
            content={f.content_html}
            onChange={(html) => pune("content_html", html)}
            placeholder="Scrie articolul. Folosește titluri mari și mici: din ele se face cuprinsul."
            cuImagini
            incarcaImagine={async (file) => {
              const res = await uploadImage(file, "gallery", "blog");
              if ("error" in res) { toast.error(res.error); return null; }
              return res.url;
            }}
          />
        </Sectiune>

        <Sectiune
          titlu="Întrebări frecvente"
          /*
            ⚠ TEXTUL ĂSTA A FOST FALS. Spunea „pot apărea direct în rezultatele
            Google" — adevărat până în august 2023, când Google a scos
            rezultatele îmbogățite de tip FAQ pentru aproape toată lumea (au mai
            rămas doar site-uri de stat și de sănătate). Un om care citea asta
            își scria întrebările pentru un loc în Google care nu mai există,
            și apoi se întreba de ce nu apar.

            Rostul lor e acum altul, și nu mai mic: sunt bucata pe care motoarele
            care răspund cu text — ChatGPT, Perplexity, AI Overviews — o pot
            cita întreagă, fiindcă o întrebare cu răspunsul ei se ține pe
            picioarele ei fără restul articolului.
          */
          lamurire="Se arată la finalul articolului ȘI pleacă în datele structurate ca FAQPage. Nu mai aduc rezultate îmbogățite în Google (au fost scoase în 2023), dar sunt exact bucata pe care ChatGPT, Perplexity sau AI Overviews o pot cita întreagă. O întrebare fără răspuns nu se salvează: o structură care promite un răspuns inexistent e mai rea decât lipsa ei."
        >
          <div className="space-y-3">
            {f.faq.map((intrebare, i) => (
              <div key={i} className="p-3 border border-zinc-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <input type="text" value={intrebare.q}
                    onChange={(e) => pune("faq", f.faq.map((x, j) => j === i ? { ...x, q: e.target.value } : x))}
                    placeholder="Cât costă?" className={inputCls} />
                  <button type="button"
                    onClick={() => pune("faq", f.faq.filter((_, j) => j !== i))}
                    className="p-1.5 rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <textarea value={intrebare.a} rows={2}
                  onChange={(e) => pune("faq", f.faq.map((x, j) => j === i ? { ...x, a: e.target.value } : x))}
                  placeholder="Răspunsul, întreg, fără să trimită în altă parte."
                  className={inputCls + " resize-y"} />
              </div>
            ))}
            <button type="button" onClick={() => pune("faq", [...f.faq, { q: "", a: "" }])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-lg text-zinc-600 hover:bg-zinc-50">
              <Plus className="h-3.5 w-3.5" /> Adaugă întrebare
            </button>
          </div>
        </Sectiune>

        <Sectiune titlu="Imaginea de deschidere">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {f.cover_url ? (
                <Image src={f.cover_url} alt="" width={160} height={90}
                  className="h-[90px] w-40 rounded-lg object-cover border border-zinc-200" unoptimized />
              ) : (
                <div className="h-[90px] w-40 rounded-lg bg-zinc-100 border border-dashed border-zinc-300" />
              )}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-lg text-zinc-600 hover:bg-zinc-50 cursor-pointer">
                {incarca ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Încarcă
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const x = e.target.files?.[0]; if (x) incarcaCoperta(x); }} />
              </label>
              {f.cover_url && (
                <button type="button" onClick={() => pune("cover_url", "")}
                  className="text-xs text-zinc-500 hover:text-red-600">Scoate</button>
              )}
            </div>
            {f.cover_url && (
              <div>
                <input type="text" value={f.cover_alt}
                  onChange={(e) => pune("cover_alt", e.target.value)}
                  placeholder="Ce se vede în imagine" className={inputCls} />
                <p className="mt-1.5 text-xs text-zinc-500">
                  Textul acesta se citește cu voce tare pentru cine nu vede ecranul, și e singurul
                  lucru pe care îl înțelege Google despre imagine.
                </p>
              </div>
            )}

            {/*
              ⚠ CÂMPUL ĂSTA EXISTA ÎN MODEL, ÎN BAZĂ ȘI ÎN METADATE, DAR NU AVEA
              CASETĂ.

              Adică singurul fel de a-l pune era direct din baza de date. Mai rău:
              fiindcă editorul nu-l trimitea niciodată, `randDinIntrare` avea o
              ramură anume ca să NU-l scrie — altfel prima salvare a unui om care
              nici nu știa că există l-ar fi golit. Un câmp pe care codul îl
              ocolește ca să nu-l strice e un câmp care ar fi trebuit să aibă o
              casetă.
            */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Imaginea de partajare <span className="font-normal text-zinc-400">(opțional)</span>
              </label>
              <input type="text" value={f.og_image_url}
                onChange={(e) => pune("og_image_url", e.target.value)}
                placeholder="Lasă gol ca să se folosească imaginea de deschidere"
                className={inputCls} />
              <p className="mt-1.5 text-xs text-zinc-500">
                Ce se vede când cineva dă articolul mai departe pe Facebook, WhatsApp sau LinkedIn.
                Lăsat gol, se folosește imaginea de deschidere — de obicei asta și vrei. Se pune
                separat doar când imaginea de sus arată rău tăiată la 1200×630, sau când vrei pe ea
                titlul scris mare.
              </p>
            </div>
          </div>
        </Sectiune>

        <Sectiune titlu="Așezare">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Autor</label>
              <select value={f.author_id} onChange={(e) => pune("author_id", e.target.value)} className={inputCls}>
                <option value="">Fără autor</option>
                {autori.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Categorie</label>
              <select value={f.category_id} onChange={(e) => pune("category_id", e.target.value)} className={inputCls}>
                <option value="">Fără categorie</option>
                {categorii.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={f.is_featured}
                onChange={(e) => pune("is_featured", e.target.checked)} className="h-4 w-4 accent-zinc-900" />
              <span className="text-sm text-zinc-700 inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Scoate-l în față (vitrina din capul listei)
              </span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={f.is_pinned}
                onChange={(e) => pune("is_pinned", e.target.checked)} className="h-4 w-4 accent-zinc-900" />
              <span className="text-sm text-zinc-700 inline-flex items-center gap-1.5">
                <Pin className="h-3.5 w-3.5 text-zinc-500" /> Ține-l sus în listă, oricât de vechi ar fi
              </span>
            </label>
            <p className="text-xs text-zinc-500">
              Vitrina e una singură. Fixate pot fi mai multe: urcă în ordine, fără să ocupe vitrina.
            </p>
          </div>

          {/*
            ═══ ETICHETE ═══

            Se scriu liber, spre deosebire de categorie, care se alege dintr-o
            listă ținută de noi. Un articol are O categorie și poate avea mai
            multe etichete; de aceea categoria intră în firimituri și în datele
            structurate, iar eticheta nu — ar fi spus că articolul e în cinci
            secțiuni deodată.

            ⚠ Enter ADAUGĂ, nu trimite formularul. Fără `preventDefault`, Enter
            într-un câmp de text trimite formularul din jur, iar omul ar fi
            salvat articolul crezând că adaugă o etichetă.
          */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Etichete</label>
            {f.etichete.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {f.etichete.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                    {e}
                    <button type="button" aria-label={`Scoate eticheta ${e}`}
                      onClick={() => pune("etichete", f.etichete.filter((x) => x !== e))}
                      className="text-zinc-400 hover:text-red-600">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input type="text" value={f.etichetaInLucru}
              onChange={(e) => {
                const v = e.target.value;
                /* Virgula adaugă pe loc: aşa se poate lipi o listă întreagă. */
                if (v.includes(",")) adaugaEticheta(v);
                else pune("etichetaInLucru", v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); adaugaEticheta(f.etichetaInLucru); }
                if (e.key === "Backspace" && !f.etichetaInLucru && f.etichete.length > 0) {
                  pune("etichete", f.etichete.slice(0, -1));
                }
              }}
              onBlur={() => adaugaEticheta(f.etichetaInLucru)}
              placeholder="Scrie o etichetă și apasă Enter"
              className={inputCls} />
            <p className="mt-1.5 text-xs text-zinc-500">
              Cel mult 12. Fiecare primește pagina ei, la /blog/eticheta/…, unde se strâng
              toate articolele cu eticheta aceea.
            </p>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Rezumat pentru listă</label>
            <textarea value={f.excerpt} rows={2} onChange={(e) => pune("excerpt", e.target.value)}
              placeholder="Un rând, pentru cartonașul din lista de articole." className={inputCls + " resize-y"} />
          </div>
        </Sectiune>

        <Sectiune
          titlu="Îndemnul din articol"
          lamurire="Se arată la finalul textului, înaintea întrebărilor. Banda de la subsolul site-ului rămâne oricum; asta e pasul următor potrivit CU articolul. Cine tocmai a citit despre curierat are alt pas decât cine a citit despre facturare."
        >
          <div className="space-y-3">
            <select value={f.indemnTip}
              onChange={(e) => pune("indemnTip", e.target.value as TipIndemn | "")}
              className={inputCls}>
              <option value="">Fără îndemn în articol</option>
              {(Object.keys(NUMELE_TIPURILOR) as TipIndemn[]).map((t) => (
                <option key={t} value={t}>{NUMELE_TIPURILOR[t]}</option>
              ))}
            </select>

            {f.indemnTip && (
              <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
                <p className="text-xs text-zinc-500">
                  {f.indemnTip === "propriu"
                    ? "Scrii tu tot. Fără adresă și fără text pe buton, îndemnul nu se arată deloc: un buton care nu duce nicăieri e mai rău decât lipsa lui."
                    : "Lăsate goale, se folosesc textele presetate. Completează doar ce vrei să sune altfel."}
                </p>
                <input type="text" value={f.indemnTitlu}
                  onChange={(e) => pune("indemnTitlu", e.target.value)}
                  placeholder="Titlul îndemnului" className={inputCls} />
                <textarea value={f.indemnText} rows={2}
                  onChange={(e) => pune("indemnText", e.target.value)}
                  placeholder="O frază sub titlu" className={inputCls + " resize-y"} />
                <input type="text" value={f.indemnEticheta}
                  onChange={(e) => pune("indemnEticheta", e.target.value)}
                  placeholder="Textul de pe buton" className={inputCls} />
                {f.indemnTip === "propriu" && (
                  <input type="text" value={f.indemnAdresa}
                    onChange={(e) => pune("indemnAdresa", e.target.value)}
                    placeholder="/preturi sau https://..." className={inputCls} />
                )}
              </div>
            )}
          </div>
        </Sectiune>

        {/*
          ⚠ DATA VIITOARE ÎNSEAMNĂ PROGRAMAT, ȘI ATÂT. Nu există stare separată
          pentru asta, fiindcă o stare ar fi cerut un cron care s-o schimbe, iar
          un cron care nu pornește lasă articolul blocat pentru totdeauna.
        */}
        <Sectiune
          titlu="Publicarea"
          lamurire="Lăsată goală la publicare, data se pune singură pe momentul apăsării. Pusă în viitor, articolul se publică singur atunci, fără să mai intre nimeni aici."
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Stare</label>
              <select value={f.status} onChange={(e) => pune("status", e.target.value as StareArticol)} className={inputCls}>
                {(Object.keys(STARI) as StareArticol[])
                  /* Un redactor nu alege „Publicat” sau „Arhivat”: le-ar fi
                     respins acțiunea, iar lista i-ar fi promis altceva. */
                  .filter((s) => rol === "admin" || s === "draft" || s === "review")
                  .map((s) => (
                    <option key={s} value={s}>{STARI[s]}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Data publicării</label>
              <input type="datetime-local" value={f.publicatLa}
                onChange={(e) => pune("publicatLa", e.target.value)} className={inputCls} />
            </div>
          </div>

          {programat && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Programat. Nu se vede pe site până la data aleasă, chiar dacă starea scrie
              {" „Publicat”."}
            </p>
          )}
        </Sectiune>

        <Sectiune
          titlu="Cum apare în Google"
          lamurire="Lăsate goale, se folosesc titlul și rezumatul de mai sus."
        >
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-zinc-700">Titlu</label>
                <CharCounter len={titluCatreGoogle.length} idealMin={SEO_TITLE_IDEAL_MIN} max={SEO_TITLE_MAX} />
              </div>
              <input type="text" value={f.seo_title} onChange={(e) => pune("seo_title", e.target.value)}
                placeholder={f.title || "Titlul din capul paginii"} className={inputCls} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-zinc-700">Descriere</label>
                <CharCounter len={descriereCatreGoogle.length} idealMin={SEO_DESCRIPTION_IDEAL_MIN} max={SEO_DESCRIPTION_MAX} />
              </div>
              <textarea value={f.seo_description} rows={2} onChange={(e) => pune("seo_description", e.target.value)}
                placeholder={f.excerpt || "Rezumatul articolului"} className={inputCls + " resize-y"} />
            </div>

            <GooglePreview
              title={titluCatreGoogle}
              description={descriereCatreGoogle}
              url={`https://www.edinio.com/blog/${f.slug || "adresa-articolului"}`}
            />

            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Adresă canonică</label>
                <input type="text" value={f.canonical_url} onChange={(e) => pune("canonical_url", e.target.value)}
                  placeholder="doar dacă textul e publicat și altundeva" className={inputCls} />
              </div>
              <label className="flex items-end gap-2 pb-2 cursor-pointer">
                <input type="checkbox" checked={f.noindex}
                  onChange={(e) => pune("noindex", e.target.checked)} className="h-4 w-4 accent-zinc-900" />
                <span className="text-sm text-zinc-700">Ascunde-l de Google</span>
              </label>
            </div>
          </div>
        </Sectiune>
      </div>

      {/* Bara de salvare, lipită jos: un articol lung n-are de ce să fie derulat
          până la capăt pentru un buton. */}
      <div className="fixed bottom-0 inset-x-0 lg:left-[var(--admin-sidebar-width,240px)] bg-white border-t border-zinc-200 px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-end gap-2">
          {/*
            ⚠ EXISTA CA SA NU MAI FIE NEVOIE SA PUBLICI CA SA VEZI.

            Pana acum, un redactor n-avea niciun fel de a se uita la ciorna lui:
            pagina publica refuza tot ce nu e publicat, si bine face. Deci
            singurul fel de a vedea cum arata textul era sa-l arati lumii.

            ⚠ Doar pe un articol SALVAT. Pe unul nou nu exista inca `id`, deci
            n-ar avea ce sa arate; iar un buton care duce la o pagina goala e mai
            rau decat unul care lipseste.

            ⚠ `target="_blank"`: fila de editare ramane deschisa, cu tot ce e
            nesalvat in ea. Deschisa in aceeasi fila, previzualizarea ar fi
            aruncat munca nesalvata a omului.
          */}
          {articol?.id && (
            <a href={`/blog/previzualizare/${articol.id}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-zinc-300 rounded-lg hover:bg-zinc-50"
              title={nesalvat ? "Arata ultima versiune SALVATA, nu ce e pe ecran acum" : undefined}>
              <Eye className="h-4 w-4" />
              Previzualizează
              {nesalvat && <span className="text-xs font-normal text-amber-600">(ce e salvat)</span>}
            </a>
          )}
          <button type="button" onClick={() => salveaza_()} disabled={salveaza}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-zinc-300 rounded-lg hover:bg-zinc-50 disabled:opacity-50">
            {salveaza && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvează
          </button>
          {/*
            ⚠ REDACTORUL NU VEDE „PUBLICĂ”, VEDE „TRIMITE LA VERIFICARE”.

            Ascunderea butonului nu e paza — aceea e în acțiune, unde
            `poateLasaInStarea` respinge starea. Dar un buton care arată la fel
            pentru toată lumea și eșuează pentru jumătate dintre ei e o
            promisiune încălcată; mai bine spune de la început ce se întâmplă.
          */}
          {rol === "editor" ? (
            f.status !== "review" && (
              <button type="button" onClick={() => salveaza_("review")} disabled={salveaza}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-50">
                Trimite la verificare
              </button>
            )
          ) : (
            f.status !== "published" && (
              <button type="button" onClick={() => salveaza_("published")} disabled={salveaza}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-50">
                Publică
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
