import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, LogOut, Mail, MessageCircle, Phone } from "lucide-react";
import type { RezumatCont } from "@/lib/cont/rezumat";
import { formatPhoneDisplay, whatsappLink } from "@/lib/utils/format";
import { adresaPozei } from "@/lib/cont/profil";
import { avatarUtilizator } from "@/lib/avatar-blob";
import { MENIU, type CheieMeniu } from "./meniu";
import { MeniuFile } from "./MeniuFile";
import { Pastila } from "./piese";
import { BUTON_SECUNDAR, CARD, FOCUS, TEXT_CONT, TITLU } from "./clase";

/**
 * Cadrul oricarei pagini de cont dupa intrare: meniul (lateral pe desktop, file
 * pe telefon), antetul paginii si continutul.
 *
 * ⚠ E un cadru, NU o poarta. Fiecare pagina isi verifica singura sesiunea prin
 * `incarcaPaginaDeCont`; cadrul doar deseneaza. (Un `layout.tsx` sub `cont/` nu
 * s-ar fi reranduit la navigarea intre pagini, deci n-ar fi putut pazi nimic.)
 */

export type ContactMagazin = { telefon: string | null; email: string | null; whatsapp: string | null };

export type PropsCadru = {
  activ: CheieMeniu;
  /** Samanta avatarului implicit (ca in panou): id-ul, nu numele, ca sa nu se schimbe cand omul isi schimba numele. */
  contId: string | null;
  nume: string | null;
  numeMagazin: string;
  rezumat: RezumatCont;
  contact: ContactMagazin;
  greutateTitlu: "font-normal" | "font-semibold";
  titlu: string;
  supratitlu?: string;
  subtitlu?: ReactNode;
  inapoi?: { href: string; eticheta: string };
  actiuni?: ReactNode;
  /** Pagina isi arata singura ajutorul magazinului (pagina comenzii), deci cadrul nu-l mai pune jos pe telefon. */
  ajutorInPagina?: boolean;
  children: ReactNode;
};

function initiale(nume: string | null): string {
  const parti = (nume ?? "").trim().split(/\s+/).filter(Boolean);
  if (parti.length === 0) return "";
  return (parti[0][0] + (parti.length > 1 ? parti[parti.length - 1][0] : "")).toUpperCase();
}

function numere(r: RezumatCont): Partial<Record<CheieMeniu, number>> {
  return { comenzi: r.comenzi, facturi: r.facturi, retururi: r.retururi };
}

function MeniuLateral({ activ, contId, nume, numeMagazin, rezumat, contact }: Omit<PropsCadru, "titlu" | "children" | "greutateTitlu">) {
  const n = numere(rezumat);
  const init = initiale(nume);
  const poza = adresaPozei(rezumat.pozaLa);
  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <div className="flex items-center gap-3">
          {poza ? (
            // eslint-disable-next-line @next/next/no-img-element -- poza e privata (cu sesiune), nu trece prin optimizatorul de imagini
            <img src={poza} alt="" className="h-11 w-11 shrink-0 rounded-full border border-[var(--st-border)] object-cover" />
          ) : contId ? (
            /* Avatarul implicit, acelasi desen ca in panou (`blobatar`), facut pe server din id: nimic scris de om nu ajunge in SVG. */
            <span
              aria-hidden="true"
              className="block h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[var(--st-border)] bg-[var(--st-surface)] [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: avatarUtilizator(contId, 44) }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold"
              style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}
            >
              {init || "?"}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--st-text)]">{nume || "Contul meu"}</p>
            <p className="truncate text-xs text-[var(--st-muted)]">Client la {numeMagazin}</p>
          </div>
        </div>
      </div>

      <nav aria-label="Contul meu" className={`${CARD} p-2`}>
        {[1, 2].map((grup) => (
          <ul key={grup} className={`space-y-0.5 ${grup === 2 ? "mt-2 border-t border-[var(--st-border)] pt-2" : ""}`}>
            {MENIU.filter((m) => m.grup === grup).map((m) => {
              const este = m.cheie === activ;
              const Icon = m.icon;
              const numar = n[m.cheie];
              return (
                <li key={m.cheie}>
                  <Link
                    href={m.href}
                    aria-current={este ? "page" : undefined}
                    className={`relative flex min-h-11 items-center gap-3 rounded-[var(--st-radius-sm)] px-3 text-sm transition-colors ${FOCUS} ${
                      este
                        ? "bg-[var(--st-primary-soft)] font-semibold text-[var(--st-text)]"
                        : "font-medium text-[var(--st-muted)] hover:bg-[var(--st-primary-soft)] hover:text-[var(--st-text)]"
                    }`}
                  >
                    {este && (
                      <span aria-hidden="true" className="absolute inset-y-2.5 left-0 w-0.5 rounded-full" style={{ backgroundColor: "var(--st-primary)" }} />
                    )}
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} aria-hidden="true" />
                    <span className="flex-1 truncate">{m.eticheta}</span>
                    {typeof numar === "number" && numar > 0 && <Pastila>{numar}</Pastila>}
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
        <div className="mt-2 border-t border-[var(--st-border)] pt-2">
          {/* ⚠ Formular, nu legatura: iesirea trece prin POST si merge si fara JavaScript. */}
          <form method="post" action="/api/cont/iesire">
            <button
              type="submit"
              className={`flex min-h-11 w-full items-center gap-3 rounded-[var(--st-radius-sm)] px-3 text-sm font-medium text-[var(--st-muted)] transition-colors hover:bg-[var(--st-primary-soft)] hover:text-[var(--st-text)] ${FOCUS}`}
            >
              <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} aria-hidden="true" />
              Iesi din cont
            </button>
          </form>
        </div>
      </nav>

      <AjutorMagazin contact={contact} numeMagazin={numeMagazin} />
    </div>
  );
}

/**
 * Cum ajunge omul la magazin. Numai canalele pe care magazinul chiar le are.
 * `subiect` pune numarul comenzii in subiectul emailului, ca magazinul sa n-o caute.
 */
export function AjutorMagazin({ contact, numeMagazin, subiect }: { contact: ContactMagazin; numeMagazin: string; subiect?: string }) {
  if (!contact.telefon && !contact.email && !contact.whatsapp) return null;
  const rand = `flex min-h-10 items-center gap-2.5 rounded-[var(--st-radius-sm)] px-2 text-sm font-medium text-[var(--st-text)] transition-colors hover:bg-[var(--st-primary-soft)] ${FOCUS}`;
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-sm font-semibold text-[var(--st-text)]" style={TITLU}>Ai nevoie de ajutor?</p>
      <p className="mt-0.5 text-xs leading-relaxed text-[var(--st-muted)]">Echipa {numeMagazin} iti raspunde.</p>
      <ul className="mt-3 space-y-1">
        {contact.telefon && (
          <li>
            <a href={`tel:${contact.telefon.replace(/[^\d+]/g, "")}`} className={rand}>
              <Phone className="h-4 w-4 shrink-0 text-[var(--st-muted)]" strokeWidth={1.7} aria-hidden="true" />
              <span className="truncate">{formatPhoneDisplay(contact.telefon)}</span>
            </a>
          </li>
        )}
        {contact.email && (
          <li>
            <a href={`mailto:${contact.email}${subiect ? `?subject=${encodeURIComponent(subiect)}` : ""}`} className={rand}>
              <Mail className="h-4 w-4 shrink-0 text-[var(--st-muted)]" strokeWidth={1.7} aria-hidden="true" />
              <span className="truncate">{contact.email}</span>
            </a>
          </li>
        )}
        {contact.whatsapp && (
          <li>
            <a href={whatsappLink(contact.whatsapp)} target="_blank" rel="noopener noreferrer" className={rand}>
              <MessageCircle className="h-4 w-4 shrink-0 text-[var(--st-muted)]" strokeWidth={1.7} aria-hidden="true" />
              <span className="truncate">WhatsApp</span>
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}

export function CadruCont(p: PropsCadru) {
  return (
    <main className="flex-1 text-[var(--st-text)]" style={TEXT_CONT}>
      <div className="mx-auto w-full px-4 pb-16 pt-6 sm:px-6 lg:pb-24 lg:pt-10" style={{ maxWidth: "min(var(--st-container), 78rem)" }}>
        <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-10 xl:gap-12">
          {/* ⚠ Bara nu se lipeste la derulare: antetul magazinului e lipit si are
              inaltimi deosebite de la o tema la alta, iar variabila lui nu se emite. */}
          <aside className="hidden lg:block">
            <MeniuLateral activ={p.activ} contId={p.contId} nume={p.nume} numeMagazin={p.numeMagazin} rezumat={p.rezumat} contact={p.contact} />
          </aside>

          <div className="@container min-w-0">
            <MeniuFile activ={p.activ} numere={numere(p.rezumat)} />

            {/* ⚠ Antetul sta DIRECT pe fundalul magazinului, deci foloseste `--st-on-bg`,
                nu `--st-text`: pe un fundal inchis (#5b2067 pe productie) textul temei
                ar fi iesit la 1,56:1. */}
            <header className="mb-6 text-[var(--st-on-bg)] lg:mb-8">
              {p.inapoi && (
                <Link
                  href={p.inapoi.href}
                  className={`mb-3 inline-flex items-center gap-1 rounded-sm text-sm font-medium opacity-75 transition-opacity hover:opacity-100 ${FOCUS}`}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  {p.inapoi.eticheta}
                </Link>
              )}
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                <div className="min-w-0">
                  {p.supratitlu && (
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest opacity-70">{p.supratitlu}</p>
                  )}
                  <h1 className={`text-2xl tracking-tight lg:text-[1.75rem] ${p.greutateTitlu}`} style={TITLU}>
                    {p.titlu}
                  </h1>
                  {/* ⚠ Transparenta numai pe TEXT: un subtitlu cu eticheta de stare ar fi stins-o si pe ea. */}
                  {p.subtitlu && (
                    <div className="mt-1.5 text-sm">
                      {typeof p.subtitlu === "string" ? <span className="opacity-75">{p.subtitlu}</span> : p.subtitlu}
                    </div>
                  )}
                </div>
                {p.actiuni && <div className="flex flex-wrap items-center gap-2">{p.actiuni}</div>}
              </div>
            </header>

            <div className="space-y-5">{p.children}</div>

            {/*
              ⚠ Pe telefon meniul lateral nu exista, deci iesirea din cont si datele
              magazinului ar fi fost la o fila distanta sau deloc. Stau aici, jos, pe
              orice pagina. Pagina comenzii are ajutorul ei (cu numarul comenzii in
              subiect), deci acolo nu se dubleaza.
            */}
            <div className="mt-8 space-y-4 lg:hidden">
              {!p.ajutorInPagina && <AjutorMagazin contact={p.contact} numeMagazin={p.numeMagazin} />}
              <form method="post" action="/api/cont/iesire">
                <button type="submit" className={`${BUTON_SECUNDAR} w-full`}>
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Iesi din cont
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
