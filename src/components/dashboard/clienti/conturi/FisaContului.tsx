import Link from "next/link";
import {
  ArrowLeft, Ban, ExternalLink, History, KeyRound, Mail, MonitorSmartphone, Phone, ShieldCheck,
  ShoppingBag, SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";

import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { orderStatus } from "@/lib/orders/status";
import { acumCatTimp, formatDate, formatDateTime, formatPhoneDisplay, formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
  descrieFapta, etichetaTemeiului, numeleContului, type FisaCont,
} from "@/lib/cont/panou-texte";
import { ActiuniCont } from "./ActiuniCont";
import { LeagaComanda } from "./LeagaComanda";
import { DezleagaComanda } from "./DezleagaComanda";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FISA UNUI CONT DE CLIENT, IN PANOU                            (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tot ce stie magazinul despre contul omului, fara nimic secret: parola, codurile
 * si cheile sesiunilor nu ajung niciodata aici (vezi `cont_panou_fisa`). IP-urile
 * din istoric vin ascunse pe jumatate.
 *
 * ⚠ Actiunile stau la vedere, dar fiecare cere o confirmare: suspendarea si
 * stergerea il scot pe om din cont pe loc.
 */
export function FisaContului({
  businessId,
  fisa,
  pornite,
  inapoi,
}: {
  businessId: string;
  fisa: FisaCont;
  pornite: boolean | null;
  /** Lista de unde s-a venit, cu cautarea, filtrul si pagina ei. */
  inapoi: string;
}) {
  const email = fisa.contacte.find((c) => c.fel === "email" && c.verificatLa)?.valoare
    ?? fisa.contacte.find((c) => c.fel === "email")?.valoare
    ?? null;
  const telefon = fisa.contacte.find((c) => c.fel === "telefon")?.valoare ?? null;
  const nume = numeleContului(fisa.nume, email);
  const acum = new Date();
  /* Id-urile de comanda din istoric se arata ca numere, cand comanda e in lista. */
  const numere = new Map(fisa.comenzi.map((c) => [c.orderId, c.numar]));
  const cautareClient = email ?? telefon;

  return (
    <div>
      <Link
        href={inapoi}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Toate conturile
      </Link>

      {/* ═══ Antetul ═══ */}
      <div className="mb-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
            {nume[0]?.toUpperCase() ?? "C"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-foreground">{nume}</h1>
              {fisa.suspendatLa
                ? <EtichetaStare ton="rau">Suspendat</EtichetaStare>
                : <EtichetaStare ton="bun">Activ</EtichetaStare>}
            </div>
            <p className="mt-1 break-all text-sm text-muted-foreground">
              {email ?? "fără email"}
              {telefon && ` · ${formatPhoneDisplay(telefon)}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cont creat pe {formatDate(fisa.creatLa)}
              {" · "}
              {fisa.ultimaIntrare
                ? `ultima intrare ${acumCatTimp(fisa.ultimaIntrare, acum)}`
                : "nu a intrat în ultimele 12 luni"}
            </p>
          </div>
          {cautareClient && (
            <Link
              href={`/dashboard/customers?q=${encodeURIComponent(cautareClient)}`}
              className="inline-flex flex-shrink-0 items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              Vezi clientul în listă <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {fisa.suspendatLa && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs text-foreground">
            <Ban className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
            <p>
              Suspendat de tine pe {formatDateTime(fisa.suspendatLa)}. Clientul nu poate intra în cont și nu-și poate
              reseta parola până nu-l reactivezi; comenzile lui rămân legate.
              {fisa.motivSuspendare && <><br /><span className="font-semibold">Motivul notat:</span> {fisa.motivSuspendare}</>}
            </p>
          </div>
        )}

        {pornite === false && (
          <p className="mt-4 rounded-lg bg-muted/50 px-3.5 py-2.5 text-xs text-muted-foreground">
            Conturile de client sunt oprite în Setări, deci acum nimeni nu poate intra. Datele contului rămân.
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          {/* ═══ Comenzile din cont ═══ */}
          <Sectiune
            icon={ShoppingBag}
            titlu={`Comenzi în cont (${fisa.comenziTotal})`}
            descriere="Comenzile pe care clientul le vede în contul lui: plasate din cont, făcute de pe adresa lui confirmată, sau legate de tine."
          >
            {fisa.comenzi.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nicio comandă în cont încă.</p>
            ) : (
              <ul className="divide-y divide-border">
                {fisa.comenzi.map((c) => {
                  const st = orderStatus(c.stare);
                  return (
                    <li key={c.orderId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                      <Link
                        href={`/dashboard/orders/${c.orderId}`}
                        className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {c.numar || "comandă"}
                      </Link>
                      <EtichetaStare ton={st.ton} marime="mic">{st.label}</EtichetaStare>
                      <span className="text-xs text-muted-foreground">{formatDate(c.creataLa)}</span>
                      <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">{formatPrice(c.total)}</span>
                      <span className="flex w-full items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{etichetaTemeiului(c.temei)}</span>
                        {/* ⚠ Numai ce ai legat TU se poate dezlega: restul s-ar lega la loc singur. */}
                        {c.temei === "legat-de-comerciant" && (
                          <DezleagaComanda businessId={businessId} contId={fisa.id} orderId={c.orderId} numar={c.numar} />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {fisa.comenziTotal > fisa.comenzi.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                Se văd cele mai noi {fisa.comenzi.length} din {fisa.comenziTotal}.
              </p>
            )}
            <LeagaComanda businessId={businessId} contId={fisa.id} />
          </Sectiune>

          {/* ═══ Istoricul ═══ */}
          <Sectiune
            icon={History}
            titlu="Istoric"
            descriere="Intrările, schimbările de parolă, adresele adăugate și ce ai făcut tu pe cont. Se păstrează 12 luni; aici se văd ultimele 100."
          >
            {fisa.jurnal.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nimic în ultimele 12 luni.</p>
            ) : (
              <ol className="space-y-2.5">
                {fisa.jurnal.map((j, i) => {
                  const d = descrieFapta(j.fapta, j.detalii, numere);
                  return (
                    <li key={`${j.creatLa}-${i}`} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 h-2 w-2 flex-shrink-0 rounded-full",
                          d.ton === "atentie" ? "bg-warning" : d.ton === "magazin" ? "bg-primary" : "bg-muted-foreground/40",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">
                          {d.titlu}
                          {d.detaliu && <span className="text-muted-foreground"> · {d.detaliu}</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateTime(j.creatLa)}
                          {j.ip && <> · de pe <span className="tabular-nums">{j.ip}</span></>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Sectiune>
        </div>

        <div className="min-w-0 space-y-5">
          {/* ═══ Contactele ═══ */}
          <Sectiune icon={Mail} titlu="Contacte" descriere="Adresele contului. Clientul intră cu emailul confirmat.">
            {fisa.contacte.length === 0 ? (
              <p className="text-sm text-muted-foreground">Niciun contact.</p>
            ) : (
              <ul className="space-y-2">
                {fisa.contacte.map((c) => (
                  <li key={`${c.fel}-${c.valoare}`} className="flex items-start gap-2">
                    {c.fel === "telefon"
                      ? <Phone className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      : <Mail className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
                    <div className="min-w-0">
                      <p className="break-all text-sm text-foreground">{c.valoare}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.verificatLa ? `confirmat pe ${formatDate(c.verificatLa)}` : "neconfirmat"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Sectiune>

          {/* ═══ Securitatea ═══ */}
          <Sectiune icon={ShieldCheck} titlu="Securitate">
            <dl className="space-y-2 text-sm">
              <Rand eticheta="Parolă">
                {fisa.areParola
                  ? fisa.parolaSchimbataLa ? `setată, ultima schimbare pe ${formatDate(fisa.parolaSchimbataLa)}` : "setată"
                  : "fără parolă (cont creat înainte de intrarea cu parolă)"}
              </Rand>
              <Rand eticheta="Sesiuni deschise">{fisa.sesiuniDeschise}</Rand>
              <Rand eticheta="Dispozitive ținute minte">{fisa.dispozitive}</Rand>
              <Rand eticheta="Parole greșite (24 h)" atentie={fisa.paroleGresite24h >= 3}>
                {fisa.paroleGresite24h}
              </Rand>
            </dl>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Parola n-o vede nimeni, nici tu, nici noi: se păstrează numai o amprentă din care nu se poate reface.
            </p>
          </Sectiune>

          {/* ═══ Preferintele ═══ */}
          <Sectiune icon={SlidersHorizontal} titlu="Mesaje de marketing" descriere="Ce a ales clientul în contul lui, la Preferințe.">
            <dl className="space-y-2 text-sm">
              <Rand eticheta="Emailuri despre coșul abandonat">{alegerea(fisa.primesteEmail, "fără adresă confirmată")}</Rand>
              <Rand eticheta="SMS-uri">{alegerea(fisa.primesteSms, "fără telefon confirmat")}</Rand>
            </dl>
          </Sectiune>

          {/* ═══ Actiunile ═══ */}
          <Sectiune icon={KeyRound} titlu="Acțiuni">
            <ActiuniCont
              businessId={businessId}
              contId={fisa.id}
              suspendat={fisa.suspendatLa !== null}
              comenzi={fisa.comenziTotal}
              sesiuni={fisa.sesiuniDeschise}
              dispozitive={fisa.dispozitive}
            />
          </Sectiune>

          <p className="flex items-start gap-1.5 px-1 text-[11px] text-muted-foreground">
            <MonitorSmartphone className="mt-0.5 h-3 w-3 flex-shrink-0" />
            IP-urile din istoric se văd pe jumătate: îți ajung ca să știi de unde s-a intrat.
          </p>
        </div>
      </div>
    </div>
  );
}

function alegerea(v: boolean | null, lipsa: string): string {
  if (v === null) return lipsa;
  return v ? "le primește" : "le-a oprit";
}

function Sectiune({
  icon: Icon,
  titlu,
  descriere,
  children,
}: {
  icon: typeof Mail;
  titlu: string;
  descriere?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" /> {titlu}
      </h2>
      {descriere && <p className="mt-0.5 text-xs text-muted-foreground">{descriere}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Rand({ eticheta, atentie = false, children }: { eticheta: string; atentie?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{eticheta}</dt>
      <dd className={cn("text-right tabular-nums", atentie ? "font-semibold text-destructive" : "text-foreground")}>{children}</dd>
    </div>
  );
}
