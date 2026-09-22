"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Banknote, Eye, MousePointerClick, Pencil, Plus, Search, Sparkles, ToggleLeft, ToggleRight, Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { formatDate, formatPrice, formatPriceValue } from "@/lib/utils/format";
import { buttonVariants } from "@/components/ui/button";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { marimeaRandului } from "@/lib/dashboard/cifra-pe-un-rand";
import { catePagini, rezumatulPaginii } from "@/lib/dashboard/paginare";
import { toggleOffer, deleteOffer } from "@/lib/actions/offer.actions";
import { DESPRE_STAREA_OFERTEI, TONUL_STARII_OFERTA, toateMotiveleOfertei } from "@/lib/offers/stare";
import {
  CUVINTELE_OFERTELOR, NUMELE_FILTRULUI, NUMELE_SORTARII, OFERTE_PE_PAGINA, SORTARI,
  cateLaFiltru, filtreCuRost, type FiltruStare, type Sortare,
} from "@/lib/offers/filtre";
import {
  ceOfera, rataDeAcceptare, scrieCifra, scrieRata, undeApare,
  DESPRE_STAREA_STOCULUI, stareaStocului,
  type OfertaDinLista, type TotalurileOfertelor,
} from "@/lib/offers/lista";
import { metaTip } from "@/components/dashboard/oferte/tipuri-ui";
import { SertarOferta } from "@/components/dashboard/oferte/SertarOferta";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OFERTE                                                        (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ ACEEAȘI LINIE DE DESIGN ca la Clienți, Coșuri abandonate și Discounturi,
 * cerută de el anume: „păstrăm peste tot aceeași linie de design”. Deci
 * `CardStatistica` sus, `EtichetaStare` pe rânduri, tabel pe desktop și carduri
 * pe telefon, filtre care apar doar când au pe ce cădea, sertar lateral cu fișa,
 * și răsfoire.
 *
 * ⚠⚠ ȘI CIFRELE S-AU SCHIMBAT, nu doar cutiile. Ecranul arăta înainte `👁 405 ·
 * 🖱 29` pe rând, și numai când vreuna nu era zero — două numere fără nume,
 * lângă o singură etichetă cenușie „Inactiv”. O ofertă a cărei perioadă trecuse
 * arăta exact ca una care merge.
 *
 * ⚠⚠ AFIȘĂRILE ERAU PE JUMĂTATE, și codul susținea contrariul. Baliza din
 * browser era legată doar la pagina de produs, deși comentariul ei spunea că
 * „tot așa se numără și pe celelalte două suprafețe”. Măsurat pe producție la
 * 22.09.2026: `cross_sell` 405 afișări / 0 acceptări, `order_bump` 0 afișări /
 * 29 de acceptări. Un ecran redesenat care ar fi arătat mai departe „0 afișări ·
 * 29 acceptate” ar fi fost doar mai frumos, nu mai adevărat — deci baliza s-a
 * legat întâi (vezi `lib/offers/use-afisari-oferte.ts`).
 *
 * ⚠ BANDA „FUNCȚIE ÎN BETA” A IEȘIT. Eticheta Beta fusese deja scoasă din meniu
 * în redesignul ăsta, la cererea lui; o bandă galbenă cât un card, deasupra
 * fiecărei liste de oferte, spunea altceva decât meniul. Ce era adevărat în ea
 * — „verifică ce fac cifrele” — s-a mutat acolo unde se poate face ceva cu el:
 * în explicația fiecărui card și în fișa fiecărei oferte.
 */
export function OffersClient({
  businessId, oferte, cateSunt, pagina, catePeStare, totaluri,
  cautare: cautareDinAdresa, stare, sortare,
}: {
  businessId: string;
  /** ⚠⚠ O PAGINĂ, deja filtrată și sortată în bază. Nu tot magazinul. */
  oferte: OfertaDinLista[];
  /** Câte oferte are mulțimea FILTRATĂ, nu pagina. Din `count(*) over ()`. */
  cateSunt: number;
  pagina: number;
  /** Câte oferte are fiecare stare, numărate PESTE CĂUTARE, în bază. */
  catePeStare: Record<string, number>;
  /** Cifrele din cap, socotite pe TOT magazinul — nu pe pagina adusă. */
  totaluri: TotalurileOfertelor;
  cautare: string;
  stare: FiltruStare;
  sortare: Sortare;
}) {
  const router = useRouter();
  const parametriAdresa = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [deschisa, setDeschisa] = useState<OfertaDinLista | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  /*
   * ⚠⚠ CĂUTAREA STĂ ÎN ADRESĂ, dar câmpul își ține propria stare cât se scrie.
   * Scrisă direct în adresă la fiecare literă, pagina s-ar fi re-adus de șase
   * ori pentru „Recomandări” — șase drumuri la bază și șase randări, iar
   * cursorul ar fi sărit.
   */
  const [cautare, setCautare] = useState(cautareDinAdresa);

  const duLa = useCallback((schimbari: Record<string, string>) => {
    const p = new URLSearchParams(parametriAdresa.toString());
    for (const [k, v] of Object.entries(schimbari)) {
      if (v === "" || (k === "stare" && v === "toate") || (k === "sort" && v === "noi") || (k === "page" && v === "1")) {
        /* ⚠ Implicitele NU se scriu în adresă: altfel fiecare legătură ar fi
           purtat trei parametri care nu spun nimic. */
        p.delete(k);
      } else {
        p.set(k, v);
      }
    }
    const sir = p.toString();
    router.replace(sir ? `?${sir}` : "?", { scroll: false });
  }, [parametriAdresa, router]);

  const asteaptaTastarea = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrieCautarea = useCallback((v: string) => {
    setCautare(v);
    if (asteaptaTastarea.current) clearTimeout(asteaptaTastarea.current);
    asteaptaTastarea.current = setTimeout(() => duLa({ q: v.trim(), page: "1" }), 300);
  }, [duLa]);

  const filtreleCuRost = filtreCuRost(catePeStare as Partial<Record<FiltruStare, number>>, stare);
  const pagini = catePagini(cateSunt, OFERTE_PE_PAGINA);
  const rezumat = rezumatulPaginii(cateSunt, pagina, OFERTE_PE_PAGINA, CUVINTELE_OFERTELOR);

  /*
   * ⚠⚠ O SINGURĂ MĂRIME PENTRU TOT RÂNDUL, dată de cea mai lungă cifră. Lăsată
   * pe seama fiecărui card, „5” rămânea la 44px lângă „30.666,70 lei” la 22px,
   * și cele patru cutii nu mai arătau ca un set. Cerut de el pe 21.09.2026.
   * ⚠ Se dau CHIAR șirurile care ajung pe ecran, nu numerele: `formatPriceValue`
   * adaugă separatori, adică jumătate din lungime.
   */
  const marimeCifre = marimeaRandului([
    scrieCifra(totaluri.active),
    scrieCifra(totaluri.afisari),
    scrieCifra(totaluri.acceptari),
    { valoare: formatPriceValue(totaluri.venit), unitate: "lei" },
  ]);

  const rataPeTot = rataDeAcceptare(totaluri.afisari, totaluri.acceptari);

  function comuta(o: OfertaDinLista) {
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof toggleOffer>>;
      try {
        res = await toggleOffer(o.id, businessId, !o.is_active);
      } catch {
        /* ⚠ Nu se schimbă nimic local: rândul se așază din datele venite de la server. */
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă oferta și-a schimbat starea. "
          + "Pagina se reîncarcă și arată starea adevărată.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  function sterge(id: string) {
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof deleteOffer>>;
      try {
        res = await deleteOffer(id, businessId);
      } catch {
        /* ⚠ `setConfirmId(null)` stă după `try`, deci confirmarea rămâne pe ecran. */
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă oferta s-a șters. "
          + "Lista se reîncarcă: dacă mai apare, nu s-a șters.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Ofertă ștearsă.");
      setConfirmId(null);
      setDeschisa(null);
      router.refresh();
    });
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Oferte</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Crește valoarea comenzii și vezi ce au adus</p>
        </div>
        {/* ⚠ LEGĂTURĂ, nu buton: „deschide în filă nouă” trebuie să meargă. */}
        <Link href="/dashboard/offers/new" className={buttonVariants()}>
          <Plus />
          <span className="hidden xs:inline sm:inline">Ofertă nouă</span>
          <span className="xs:hidden sm:hidden">Nouă</span>
        </Link>
      </div>

      {/*
        ⚠⚠ GOL DIN DOUĂ PRICINI DEOSEBITE, și se spun altfel.
        `totaluri.oferte === 0` înseamnă că magazinul n-are NICIO ofertă — atunci
        se arată invitația de a face prima. `cateSunt === 0` cu oferte în magazin
        înseamnă că doar CĂUTAREA sau FILTRUL n-au găsit nimic, și atunci bara de
        filtre trebuie să rămână pe ecran ca omul să se poată întoarce.
      */}
      {totaluri.oferte === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-1">Nicio ofertă încă</h2>
          <p className="text-sm text-muted-foreground max-w-xs mb-4">
            Sugerează produse care merg împreună, adaugă unul la checkout sau lasă prețul să scadă
            la cantitate. Crește valoarea comenzii fără reclame în plus.
          </p>
          <Link href="/dashboard/offers/new" className={buttonVariants()}><Plus /> Fă prima ofertă</Link>
        </div>
      ) : (
        <>
          {/*
            ═══ CIFRELE DIN CAP ═══

            ⚠ SUNT CHIAR `CardStatistica`, cel de la Panou, Clienți, Statistici,
            Coșuri abandonate și Discounturi — nu patru cutii locale care seamănă
            cu el.

            ⚠⚠ „Afișări" și „Acceptate" sunt CONTOARE care doar cresc: nu scad
            când o comandă se anulează, fiindcă `orders` nu păstrează nicio
            legătură către oferta folosită. Scrisă în explicația fiecărui card,
            nu ascunsă.
          */}
          <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-2 lg:grid-cols-4">
            <CardStatistica marime={marimeCifre}
              icon={Sparkles}
              label="Oferte care merg acum"
              value={scrieCifra(totaluri.active)}
              explicatie="Ofertele pe care un cumpărător le poate vedea chiar în clipa asta: pornite, neexpirate și ajunse la data de pornire."
              empty={totaluri.active === 0}
            />
            <CardStatistica marime={marimeCifre}
              icon={Eye}
              label="Afișări"
              value={scrieCifra(totaluri.afisari)}
              explicatie="De câte ori o ofertă a ajuns pe un ecran, o dată pe vizită. ⚠ Afișările de la checkout și din coș se numără de pe 22.09.2026; înainte se numărau doar cele de pe pagina produsului, deci pe ofertele mai vechi cifra e mai mică decât a fost în realitate."
              empty={totaluri.afisari === 0}
            />
            <CardStatistica marime={marimeCifre}
              icon={MousePointerClick}
              label="Acceptate"
              value={scrieCifra(totaluri.acceptari)}
              subsol={rataPeTot === null ? undefined : `${scrieRata(rataPeTot)} din afișări`}
              explicatie="De câte ori un cumpărător a luat ce i-a propus oferta. Se numără în clipa comenzii. ⚠ NU scade dacă acea comandă se anulează mai târziu: nicăieri nu se păstrează care ofertă a fost pe care comandă."
              empty={totaluri.acceptari === 0}
            />
            <CardStatistica marime={marimeCifre}
              icon={Banknote}
              label="Vânzări în plus"
              value={formatPriceValue(totaluri.venit)}
              unit="lei"
              explicatie="Valoarea produselor luate din oferte. Se adună în clipa comenzii, la fel ca acceptările, și ⚠ NU scade dacă acea comandă se anulează."
              empty={totaluri.venit === 0}
            />
          </div>

          {/*
            ⚠⚠ OFERTELE CARE NU MAI POT VINDE, sus, înaintea listei. Un
            comerciant cu treizeci de oferte n-ar fi găsit rândul ciuntit
            derulând; iar una moartă nu se mai vede DELOC cumpărătorilor, ceea ce
            pe ecran arăta exact ca una care merge.

            ⚠ Două propoziții deosebite, fiindcă cer lucruri deosebite: una e
            „mișcă-te acum”, cealaltă „când ai timp”.
          */}
          {(totaluri.oferteMoarte > 0 || totaluri.oferteCiuntite > 0) && (
            <p className="mb-4 rounded-xl bg-warning/10 p-3 text-xs text-foreground">
              {totaluri.oferteMoarte > 0 && (
                <>
                  <span className="font-semibold">Nu se mai văd:</span>{" "}
                  {totaluri.oferteMoarte === 1
                    ? "o ofertă pornită n-are niciun produs pe stoc"
                    : `${totaluri.oferteMoarte} oferte pornite n-au niciun produs pe stoc`}.
                </>
              )}
              {totaluri.oferteMoarte > 0 && totaluri.oferteCiuntite > 0 ? " " : null}
              {totaluri.oferteCiuntite > 0 && (
                /*
                  ⚠ „ÎNCĂ una" are sens numai DUPĂ prima propoziție. Fără
                  ramura asta, un magazin fără oferte moarte citea „Încă o
                  ofertă a pierdut produse" ca și cum i-ar fi scăpat ceva mai
                  sus. Văzut pe ecran.
                */
                <>
                  {totaluri.oferteMoarte > 0
                    ? (totaluri.oferteCiuntite === 1
                        ? "Încă o ofertă a pierdut produse"
                        : `Alte ${totaluri.oferteCiuntite} oferte au pierdut produse`)
                    : (totaluri.oferteCiuntite === 1
                        ? "O ofertă a pierdut produse"
                        : `${totaluri.oferteCiuntite} oferte au pierdut produse`)}
                  , dar încă se arată.
                </>
              )}
            </p>
          )}

          {/*
            ⚠⚠ O CIFRĂ CARE TREBUIE SĂ SE VADĂ CÂND NU E ZERO — perechea lui
            „comenzi fără legătură" de la Discounturi. Contoarele de mai sus nu
            scad la anulare; rândul ăsta spune CÂT de mult nu scad, cu cifre din
            comenzi. Când nu s-a anulat nicio comandă cu ofertă, nu apare deloc.
          */}
          {totaluri.comenziCazute > 0 && (
            <p className="mb-4 rounded-xl bg-warning/10 p-3 text-xs text-foreground">
              <span className="font-semibold">De știut:</span> {totaluri.comenziCazute}{" "}
              {totaluri.comenziCazute === 1 ? "comandă cu reducere din ofertă a fost anulată" : "de comenzi cu reducere din ofertă au fost anulate"}
              {" "}({formatPrice(totaluri.baniDatiCazuti)} reducere). „Acceptate” și „Vânzări în plus” nu scad
              cu ele: nicăieri nu se păstrează care ofertă a fost pe care comandă.
            </p>
          )}

          {/*
            ═══ CĂUTAREA, FILTRELE ȘI SORTAREA ═══

            ⚠ APAR NUMAI CÂND E CE FILTRA. Sub patru oferte, o bară de filtre
            deasupra unei liste de trei rânduri e mai mult de citit decât lista
            însăși. Măsurat: media pe producție e 3,25 oferte pe magazin.
          */}
          {totaluri.oferte >= 4 && (
            <div className="mb-4 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={cautare}
                  onChange={(e) => scrieCautarea(e.target.value)}
                  placeholder="Caută după nume…"
                  aria-label="Caută după nume"
                  className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <select
                  value={stare}
                  onChange={(e) => duLa({ stare: e.target.value, page: "1" })}
                  aria-label="Starea ofertelor"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none sm:w-auto"
                >
                  {/*
                    ⚠ Cifra de lângă fiecare filtru se numără PESTE CĂUTARE. Altfel
                    omul caută „Vara", vede „Oprite (2)", apasă — și lista iese
                    goală, fiindcă cele două oprite erau alte oferte.
                  */}
                  {filtreleCuRost.map((f) => (
                    <option key={f} value={f}>{NUMELE_FILTRULUI[f]} ({cateLaFiltru(catePeStare, f)})</option>
                  ))}
                </select>

                <select
                  value={sortare}
                  onChange={(e) => duLa({ sort: e.target.value, page: "1" })}
                  aria-label="Ordinea ofertelor"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none sm:w-auto"
                >
                  {SORTARI.map((o) => (
                    <option key={o} value={o}>{NUMELE_SORTARII[o]}</option>
                  ))}
                </select>

                <span className="col-span-2 text-right text-xs text-muted-foreground sm:col-span-1 sm:ml-auto">
                  {rezumat}
                </span>
              </div>
            </div>
          )}

          {/*
            ⚠ GOLUL SPUNE DE CE E GOL. „Nicio ofertă" după un filtru arată exact
            ca o pagină stricată; aici se spune care e pricina.
          */}
          {oferte.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <p className="font-medium text-foreground">Nicio ofertă pentru ce ai ales</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {cautare ? "Încearcă altă căutare" : "Alege altă stare"}
                {cautare && stare !== "toate" ? " sau altă stare." : "."}
              </p>
            </div>
          ) : (
          <>
          {/* Tabel */}
          <div className="hidden bg-card ring-1 ring-foreground/10 rounded-xl overflow-hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ofertă</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tip</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Văzută</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Acceptată</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Până când</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stare</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {oferte.map((o) => {
                    const meta = metaTip(o.type);
                    const Icon = meta.icon;
                    const rata = rataDeAcceptare(o.impressions, o.conversions);
                    /*
                      ⚠⚠ DATA TRECUTĂ SE SCRIE ROȘU CHIAR ȘI CÂND ETICHETA SPUNE
                      ALTCEVA. Legat de `stare`, roșul s-ar fi stins în clipa în
                      care comerciantul oprea oferta — fiindcă „oprit” bate
                      „expirat” pe rând — iar „31 august 2026” ar fi stat scris
                      negru, ca o dată oarecare. Văzut pe ecran la proba din
                      browser. Eticheta spune ce ai de făcut ÎNTÂI; coloana asta
                      spune un FAPT, și faptul nu se schimbă de la un comutator.
                    */
                    const aTrecutData = toateMotiveleOfertei(o).includes("expirat");
                    /* ⚠ Semnul de stoc stă LÂNGĂ starea ofertei, nu în locul ei:
                       sunt două lucruri deosebite. O ofertă poate fi „Activă” și
                       totuși fără stoc — chiar ăsta e cazul care se ascundea. */
                    const stoc = stareaStocului(o);
                    return (
                      <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5">
                          {/*
                            ⚠ APĂSAREA PE NUME DESCHIDE FIȘA. Până acum rândul nu
                            ducea nicăieri: singurul drum către o ofertă era
                            creionul de editare, care arată regulile dar nu și ce
                            a făcut — și nici măcar CARE produse, doar câte.
                          */}
                          <button
                            type="button"
                            onClick={() => setDeschisa(o)}
                            className="text-left font-semibold text-foreground hover:underline"
                          >
                            {o.name}
                          </button>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Apare la {undeApare(o.trigger)}
                            {o.type === "volume" ? ` · ${ceOfera(o)}` : ` · oferă ${ceOfera(o)}`}
                          </p>
                          {/*
                            ═══ ⚠⚠ CIFRELE, CÂND COLOANELE LOR NU ÎNCAP ═══

                            Tabelul pornește de la `sm` (640px), dar „Văzută" și
                            „Acceptată" sunt `hidden md:table-cell` (768px), iar
                            cardurile de telefon sunt `sm:hidden`. Între cele
                            două praguri nu se vedea NICIUN număr: nici coloane,
                            nici carduri. Ecranul vechi arăta perechea ochi/click
                            pe rând, la orice lățime — deci pe o fereastră de
                            vreo 700px cifrele chiar au DISPĂRUT la refacere.
                            Spus de el, verificat în cod.

                            ⚠ Se ascunde de la `md` în sus, unde coloanele își
                            iau locul: altfel aceleași două numere ar fi scrise
                            de două ori pe același rând.
                          */}
                          <p className="mt-1 flex items-center gap-2.5 text-[11px] text-muted-foreground md:hidden">
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Eye className="h-3 w-3" /> {scrieCifra(o.impressions)}
                            </span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <MousePointerClick className="h-3 w-3" /> {scrieCifra(o.conversions)}
                              {rata !== null ? ` · ${scrieRata(rata)}` : ""}
                            </span>
                            {o.revenue_added > 0 && <span className="tabular-nums">{formatPrice(o.revenue_added)}</span>}
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-1 rounded-lg border border-border text-xs font-medium text-foreground">
                            <Icon className="h-3 w-3" />
                            {meta.eticheta}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 hidden md:table-cell tabular-nums">
                          {scrieCifra(o.impressions)}
                        </td>
                        <td className="px-5 py-3.5 hidden whitespace-nowrap md:table-cell tabular-nums">
                          {scrieCifra(o.conversions)}
                          {/*
                            ⚠ Procentul apare NUMAI când oferta chiar a fost
                            văzută. Cu zero afișări, „0%" ar fi însemnat „au
                            văzut-o și n-au vrut-o”.
                          */}
                          {rata !== null && (
                            <span className="ml-1.5 text-xs text-muted-foreground">· {scrieRata(rata)}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 hidden whitespace-nowrap lg:table-cell">
                          {o.ends_at ? (
                            <span className={cn("text-sm", aTrecutData ? "text-destructive" : "text-foreground")}>
                              {formatDate(new Date(o.ends_at))}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Fără capăt</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {/*
                            ⚠ Comutatorul rămâne alături de etichetă: eticheta
                            spune ce e, butonul schimbă ce se poate schimba.
                          */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => comuta(o)}
                              disabled={pending}
                              aria-label={o.is_active ? `Oprește oferta ${o.name}` : `Pornește oferta ${o.name}`}
                              className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                            >
                              {o.is_active
                                ? <ToggleRight className="h-5 w-5 text-primary" />
                                : <ToggleLeft className="h-5 w-5" />}
                            </button>
                            <EtichetaStare ton={TONUL_STARII_OFERTA[o.stare]} marime="mic" title={DESPRE_STAREA_OFERTEI[o.stare].explicatie}>
                              {DESPRE_STAREA_OFERTEI[o.stare].text}
                            </EtichetaStare>
                            {(stoc === "moarta" || stoc === "ciuntita") && (
                              <EtichetaStare ton={stoc === "moarta" ? "rau" : "asteptare"} marime="mic"
                                title={DESPRE_STAREA_STOCULUI[stoc].explicatie}>
                                {DESPRE_STAREA_STOCULUI[stoc].text}
                              </EtichetaStare>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 justify-end">
                            <Link
                              href={`/dashboard/offers/${o.id}/edit`}
                              aria-label={`Editează oferta ${o.name}`}
                              className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                            {confirmId === o.id ? (
                              <button
                                type="button"
                                onClick={() => sterge(o.id)}
                                disabled={pending}
                                className="px-2.5 py-1.5 rounded-lg bg-destructive text-white text-xs font-semibold hover:opacity-90 disabled:opacity-60"
                              >
                                Confirmă
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmId(o.id)}
                                aria-label={`Șterge oferta ${o.name}`}
                                className="p-1.5 rounded-lg hover:bg-destructive/5 transition-colors text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/*
            ═══ ACELEAȘI OFERTE, PE TELEFON ═══

            ⚠ CARDURI SUB `sm`, TABEL DE LA `sm` ÎN SUS — același tipar ca la
            Clienți, Importuri și Discounturi. Un tabel de șapte coloane pe un
            telefon de 390px își pierde jumătate din ele, iar cele ascunse
            (`hidden md:table-cell`) nu se pot ajunge în niciun fel: aici ar fi
            fost tocmai Văzută, Acceptată și Până când.
          */}
          <ul className="space-y-2 sm:hidden">
            {oferte.map((o) => {
              const meta = metaTip(o.type);
              const Icon = meta.icon;
              const rata = rataDeAcceptare(o.impressions, o.conversions);
              const aTrecutData = toateMotiveleOfertei(o).includes("expirat");
              const stoc = stareaStocului(o);
              return (
                <li key={o.id} className="rounded-xl bg-card p-3.5 ring-1 ring-foreground/10">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setDeschisa(o)}
                        className="truncate text-left font-semibold text-foreground hover:underline"
                      >
                        {o.name}
                      </button>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon className="h-3 w-3 shrink-0" />
                        {meta.eticheta}
                      </p>
                    </div>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <EtichetaStare ton={TONUL_STARII_OFERTA[o.stare]} marime="mic" title={DESPRE_STAREA_OFERTEI[o.stare].explicatie}>
                        {DESPRE_STAREA_OFERTEI[o.stare].text}
                      </EtichetaStare>
                      {(stoc === "moarta" || stoc === "ciuntita") && (
                        <EtichetaStare ton={stoc === "moarta" ? "rau" : "asteptare"} marime="mic"
                          title={DESPRE_STAREA_STOCULUI[stoc].explicatie}>
                          {DESPRE_STAREA_STOCULUI[stoc].text}
                        </EtichetaStare>
                      )}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <span className="font-semibold text-foreground">{scrieCifra(o.impressions)}</span> afișări
                    </span>
                    <span>
                      <span className="font-semibold text-foreground">{scrieCifra(o.conversions)}</span> acceptate
                      {rata !== null ? ` · ${scrieRata(rata)}` : ""}
                    </span>
                    {o.revenue_added > 0 && <span>{formatPrice(o.revenue_added)} în plus</span>}
                    {o.ends_at && (
                      <span className={aTrecutData ? "text-destructive" : undefined}>până la {formatDate(new Date(o.ends_at))}</span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
                    <button
                      type="button"
                      onClick={() => comuta(o)}
                      disabled={pending}
                      aria-label={o.is_active ? `Oprește oferta ${o.name}` : `Pornește oferta ${o.name}`}
                      className="p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    >
                      {o.is_active ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <Link
                      href={`/dashboard/offers/${o.id}/edit`}
                      aria-label={`Editează oferta ${o.name}`}
                      className="ml-auto p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    {confirmId === o.id ? (
                      <button
                        type="button"
                        onClick={() => sterge(o.id)}
                        disabled={pending}
                        className="rounded-lg bg-destructive px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        Confirmă
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(o.id)}
                        aria-label={`Șterge oferta ${o.name}`}
                        className="p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/*
            ═══ RĂSFOIREA ═══

            ⚠ APARE NUMAI CÂND CHIAR SUNT MAI MULTE PAGINI. Două butoane stinse
            sub o listă de unsprezece rânduri sunt o promisiune goală.
          */}
          {pagini > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{rezumat}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => duLa({ page: String(pagina - 1) })}
                  disabled={pagina <= 1}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Înapoi
                </button>
                <span className="text-xs text-muted-foreground">{pagina} / {pagini}</span>
                <button
                  type="button"
                  onClick={() => duLa({ page: String(pagina + 1) })}
                  disabled={pagina >= pagini}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Înainte
                </button>
              </div>
            </div>
          )}
          </>
          )}
        </>
      )}

      {deschisa && (
        <SertarOferta
          oferta={deschisa}
          businessId={businessId}
          onEditeaza={() => router.push(`/dashboard/offers/${deschisa.id}/edit`)}
          onClose={() => setDeschisa(null)}
        />
      )}
    </>
  );
}
