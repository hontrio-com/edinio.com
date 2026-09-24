import Link from "next/link";
import { ArrowRight, Ban, ChevronLeft, ChevronRight, LogIn, ShoppingBag, UserRound } from "lucide-react";

import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { marimeaRandului } from "@/lib/dashboard/cifra-pe-un-rand";
import { acumCatTimp, formatDateShort, formatPhoneDisplay } from "@/lib/utils/format";
import { conturilePornite, listaConturilor, sumarulConturilor } from "@/lib/cont/panou";
import {
  CONTURI_PE_PAGINA, adresaListei, numeleContului, type OrdineCont, type StareCont,
} from "@/lib/cont/panou-texte";
import { BaraConturi } from "./BaraConturi";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILA „CONTURI”                                                (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de proprietar: „si comerciantul poate vedea toate conturile create in
 * magazinul lui si detalii despre fiecare cont in parte?". Pana azi vedea numai
 * CATE sunt, intr-o fraza din Setari.
 *
 * ⚠ Se arata si cu conturile OPRITE: oprirea inchide accesul clientilor, dar
 * datele raman, iar comerciantul trebuie sa le poata vedea si sterge.
 *
 * ⚠ Cautarea, filtrul si pagina stau in ADRESA, ca la „Toti clientii”: se pot
 * trimite prin legatura, iar „inapoi” din fisa se intoarce la aceeasi lista.
 */
export async function FilaConturi({
  businessId,
  q,
  stare,
  ordine,
  pagina,
}: {
  businessId: string;
  q: string;
  stare: StareCont;
  ordine: OrdineCont;
  pagina: number;
}) {
  const [pornite, sumar, { conturi, total }] = await Promise.all([
    conturilePornite(businessId),
    sumarulConturilor(businessId),
    listaConturilor(businessId, { cautare: q, stare, ordine, pagina }),
  ]);

  const pagini = Math.max(1, Math.ceil(total / CONTURI_PE_PAGINA));
  const filtrat = q !== "" || stare !== "toate";
  const acum = new Date();

  const adresa = (p: number) => adresaListei({ q, stare, ordine, pagina: p });

  const marime = marimeaRandului([
    String(sumar.conturi), String(sumar.activi30Zile), String(sumar.cuComenzi), String(sumar.suspendate),
  ]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Conturile clienților</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Conturile pe care clienții și le-au făcut în magazinul tău: cu ce adresă intră, ce comenzi au în
            cont și ce s-a întâmplat cu ele. Parola clientului nu o vede nimeni, nici tu, nici noi.
          </p>
        </div>
        <Link
          href="/dashboard/settings?sectiune=conturi-clienti"
          className="inline-flex flex-shrink-0 items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          Setările conturilor <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/*
        ⚠ Oprite, se spune pe fata: altfel comerciantul care vede o lista plina ar
        crede ca oamenii pot intra. `null` = n-am putut citi setarea; atunci tacem.
      */}
      {pornite === false && (
        <div className="mb-4 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
          Conturile de client sunt <span className="font-semibold text-foreground">oprite</span>: clienții nu pot
          intra și nu-și pot face cont nou. Datele de mai jos rămân până le ștergi.{" "}
          <Link href="/dashboard/settings?sectiune=conturi-clienti" className="font-semibold text-foreground hover:underline">
            Pornește-le din Setări
          </Link>
        </div>
      )}

      {sumar.conturi === 0 ? (
        <div className="rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
          <UserRound className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-sm text-foreground">Niciun client nu și-a făcut încă un cont.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {pornite === false
              ? "Pornește conturile din Setări, Conturi de client. Clienții își pot face cont din antetul magazinului sau la comandă."
              : "Conturile apar aici imediat după ce clienții își confirmă emailul, din butonul „Contul meu” din antetul magazinului sau la comandă."}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CardStatistica marime={marime} icon={UserRound} label="Conturi" value={String(sumar.conturi)}
              explicatie="Conturile care există azi în magazin. Cele șterse nu se mai numără." />
            <CardStatistica marime={marime} icon={LogIn} label="Au intrat în ultimele 30 de zile" value={String(sumar.activi30Zile)}
              explicatie="Conturi cu cel puțin o intrare reușită în ultimele 30 de zile, de pe orice dispozitiv." />
            <CardStatistica marime={marime} icon={ShoppingBag} label="Au comenzi în cont" value={String(sumar.cuComenzi)}
              explicatie={
                "Conturi cu cel puțin o comandă legată: plasată din cont, făcută de pe adresa lor confirmată, "
                + "sau legată de tine. Comenzile de pe marketplace-uri nu intră în conturi."
              } />
            <CardStatistica marime={marime} icon={Ban} label="Suspendate" value={String(sumar.suspendate)}
              explicatie="Conturi pe care le-ai suspendat tu. Clienții lor nu pot intra până nu le reactivezi." />
          </div>

          <BaraConturi q={q} stare={stare} ordine={ordine} />

          <p className="mb-2 text-right text-xs text-muted-foreground">
            {total} {total === 1 ? "cont" : "conturi"}
            {filtrat && ` (din ${sumar.conturi})`}
          </p>

          {conturi.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-14 text-center">
              {pagina > 1 ? (
                /* O pagina de dupa capatul listei (legatura veche, `?page=` scris de mana). */
                <>
                  <p className="text-sm font-medium text-foreground">Pagina asta e după capătul listei</p>
                  <Link href={adresa(1)} className="mt-1 inline-block text-xs font-semibold text-primary hover:underline">
                    Mergi la prima pagină
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">Niciun cont pentru ce ai ales</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {q ? "Încearcă altă căutare: după nume, email, telefon sau numărul unei comenzi." : "Alege alt filtru."}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              <div className="hidden items-center gap-3 bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:flex">
                <span className="w-9 flex-shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">Client</span>
                <span className="w-32 flex-shrink-0">Cont făcut</span>
                <span className="w-36 flex-shrink-0">Ultima intrare</span>
                <span className="w-20 flex-shrink-0 text-right">Comenzi</span>
                <span className="w-24 flex-shrink-0 text-right">Stare</span>
                <span className="w-4 flex-shrink-0" aria-hidden="true" />
              </div>
              {conturi.map((c) => {
                const nume = numeleContului(c.nume, c.email);
                return (
                  <Link
                    key={c.contId}
                    /* Fisa primeste si adresa listei, ca „Toate conturile” sa se intoarca exact aici. */
                    href={`/dashboard/customers/conturi/${c.contId}?lista=${encodeURIComponent(adresa(pagina))}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {nume[0]?.toUpperCase() ?? "C"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{nume}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.email ?? "fără email"}
                        {c.email && !c.emailConfirmat && " (neconfirmat)"}
                        {c.telefon && <span className="hidden sm:inline"> · {formatPhoneDisplay(c.telefon)}</span>}
                      </p>
                      {/* Pe telefon, ce pe desktop sta in coloane: un rand scurt sub nume. */}
                      <p className="mt-0.5 text-[11px] text-muted-foreground lg:hidden">
                        {c.ultimaIntrare ? `a intrat ${acumCatTimp(c.ultimaIntrare, acum)}` : "n-a intrat în ultimul an"}
                        {" · "}
                        {c.comenzi} {c.comenzi === 1 ? "comandă" : "comenzi"}
                      </p>
                    </div>
                    <span className="hidden w-32 flex-shrink-0 text-xs text-muted-foreground lg:block">
                      {formatDateShort(c.creatLa)}
                    </span>
                    <span className="hidden w-36 flex-shrink-0 text-xs text-muted-foreground lg:block">
                      {/*
                        ⚠ Jurnalul se pastreaza 12 luni, deci „niciodata” ar fi o
                        minciuna pentru un cont mai vechi: se spune cat stim.
                      */}
                      {c.ultimaIntrare ? acumCatTimp(c.ultimaIntrare, acum) : "n-a intrat în ultimul an"}
                    </span>
                    <span className="hidden w-20 flex-shrink-0 text-right text-sm tabular-nums text-foreground lg:block">
                      {c.comenzi}
                    </span>
                    <span className="w-24 flex-shrink-0 text-right">
                      {c.suspendatLa ? (
                        <EtichetaStare ton="rau" marime="mic">Suspendat</EtichetaStare>
                      ) : (
                        <EtichetaStare ton="bun" marime="mic">Activ</EtichetaStare>
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          )}

          {pagini > 1 && (
            <nav aria-label="Paginare" className="mt-3 flex items-center justify-between">
              {pagina > 1 ? (
                <Link href={adresa(pagina - 1)} rel="prev"
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                  <ChevronLeft className="h-3.5 w-3.5" /> Înapoi
                </Link>
              ) : <span />}
              <span className="text-xs tabular-nums text-muted-foreground">Pagina {pagina} din {pagini}</span>
              {pagina < pagini ? (
                <Link href={adresa(pagina + 1)} rel="next"
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                  Înainte <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : <span />}
            </nav>
          )}

        </>
      )}
    </div>
  );
}
