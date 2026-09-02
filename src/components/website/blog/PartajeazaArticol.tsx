"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { urmareste } from "@/lib/edinio-marketing/magistrala";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  PARTAJAREA UNUI ARTICOL
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ FĂRĂ NICIUN SCRIPT DE LA REȚELE. Butoanele oficiale de „share" ale Facebook
  și LinkedIn aduc câte un SDK de zeci de kilobytes care urmărește vizitatorul
  chiar dacă nu apasă nimic — adică exact ce tocmai am pus sub consimțământ.

  Aici sunt legături obișnuite către adresele lor de partajare. Nu se încarcă
  nimic, nu se scrie niciun cookie, și funcționează la fel.

  ⚠ ȘI DE CE NU E `navigator.share` SINGUR. Pe telefon e cea mai bună cale — o
  apăsare și alege omul de unde. Dar pe desktop lipsește la aproape toți, iar un
  buton care nu face nimic e mai rău decât lipsa lui. Deci: butonul nativ apare
  DOAR unde există, lângă celelalte, nu în locul lor.
*/

type Fel = "nativ" | "link" | "facebook" | "linkedin" | "whatsapp" | "x";

const CLASE_BUTON =
  "inline-flex h-10 w-10 items-center justify-center rounded-full border border-hairline " +
  "text-ink-2 transition-colors duration-200 hover:bg-ink/[0.05] hover:text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-ink/20";

export function PartajeazaArticol({
  articolId,
  titlu,
  adresa,
}: {
  articolId: string;
  titlu: string;
  /** Adresa canonică, dată de server. Vezi nota de mai jos. */
  adresa: string;
}) {
  const [copiat, setCopiat] = useState(false);
  const [esuat, setEsuat] = useState(false);

  /*
    ⚠ `useSyncExternalStore`, nu un efect care pune stare.

    „Există `navigator.share`?" e o întrebare despre lumea din afara React-ului,
    la care serverul și browserul răspund diferit. Hook-ul ăsta cere EXACT asta:
    o poză pentru server (`false`) și una pentru browser. Așa randarea de pe
    server și prima din browser ies identice, iar butonul apare abia după
    hidratare — fără să strice potrivirea și fără o a doua randare pentru toată
    lumea.

    Abonarea e goală: răspunsul nu se schimbă cât trăiește pagina.
  */
  const areNativ = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );

  useEffect(() => {
    if (!copiat) return;
    const ceas = setTimeout(() => setCopiat(false), 2000);
    return () => clearTimeout(ceas);
  }, [copiat]);

  function masoara(fel: Fel) {
    urmareste({ name: "article_share", article_id: articolId, share_method: fel });
  }

  async function copiaza() {
    masoara("link");
    try {
      await navigator.clipboard.writeText(adresa);
      setCopiat(true);
    } catch {
      /*
        ⚠ CLIPBOARD-UL POATE REFUZA, si nu din vina omului: cere context sigur, si
        la unele browsere un drept pe care nu l-a dat.

        ⚠ SI NU SE CHEAMA `window.prompt` AICI. Prima formă o făcea, si era gresit
        de doua ori: o fereastra modala opreste tot ce face pagina, iar pe telefon
        arata a eroare de sistem. In locul ei se arata adresa intr-un camp de
        text, deja selectata — omul o copiaza singur, cu o apasare, si pagina
        ramane vie.
      */
      setEsuat(true);
    }
  }

  async function partajeazaNativ() {
    masoara("nativ");
    try {
      await navigator.share({ title: titlu, url: adresa });
    } catch {
      /* Omul a închis foaia de partajare. Nu e o eroare. */
    }
  }

  const codat = encodeURIComponent(adresa);
  const titluCodat = encodeURIComponent(titlu);

  const retele: Array<{ fel: Fel; eticheta: string; href: string; cale: string }> = [
    {
      fel: "facebook", eticheta: "Partajează pe Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${codat}`,
      cale: "M13.5 9H15V6.5h-1.9C11 6.5 10.3 7.8 10.3 9.3V11H8.6v2.6h1.7V20h2.9v-6.4h2l.3-2.6h-2.3V9.6c0-.4.2-.6.6-.6Z",
    },
    {
      fel: "linkedin", eticheta: "Partajează pe LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${codat}`,
      cale: "M7.2 9.6H9.6V19H7.2V9.6Zm1.2-3.8a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM11.4 9.6h2.3v1.3h.1c.3-.6 1.1-1.3 2.3-1.3 2.5 0 2.9 1.6 2.9 3.7V19h-2.4v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2V19h-2.2V9.6Z",
    },
    {
      fel: "whatsapp", eticheta: "Trimite pe WhatsApp",
      href: `https://wa.me/?text=${titluCodat}%20${codat}`,
      cale: "M12 5.5a6.4 6.4 0 0 0-5.5 9.7L5.6 18.6l3.5-.9A6.4 6.4 0 1 0 12 5.5Zm3.6 8.9c-.2.4-.9.8-1.2.8-.3 0-.7.1-2.3-.6a8 8 0 0 1-3.2-3c-.2-.4-.8-1.2-.8-2.2s.5-1.5.7-1.7c.2-.2.4-.3.6-.3h.4c.1 0 .3 0 .5.4l.6 1.5c0 .1.1.3 0 .4l-.3.4-.2.3c-.1.1-.2.2 0 .4a6 6 0 0 0 1.1 1.4c.7.6 1.2.8 1.4.9.2.1.3 0 .4 0l.6-.7c.2-.2.3-.2.4-.1l1.4.7c.2.1.3.2.4.3v.6Z",
    },
    {
      fel: "x", eticheta: "Partajează pe X",
      href: `https://twitter.com/intent/tweet?text=${titluCodat}&url=${codat}`,
      cale: "M17.2 6h-1.9l-3.1 3.6L9.5 6H6l4.4 6-4.2 5h1.9l3.3-3.8L14.5 17H18l-4.6-6.3L17.2 6Zm-1.4 9.8h-1L8.1 7.1h1.1l6.6 8.7Z",
    },
  ];

  return (
    <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-hairline pt-6">
      <span className="text-[14px] font-medium text-ink-2">Ți-a fost de folos? Trimite-l mai departe:</span>

      <div className="flex items-center gap-2">
        {areNativ && (
          <button type="button" onClick={partajeazaNativ} className={CLASE_BUTON} aria-label="Partajează">
            <Share2 className="h-[18px] w-[18px]" aria-hidden />
          </button>
        )}

        {retele.map((r) => (
          <a
            key={r.fel}
            href={r.href}
            target="_blank"
            /*
              ⚠ `noopener` NU E DE FORMĂ: fără el, pagina deschisă poate ajunge la
              `window.opener` și schimba adresa filei noastre sub omul care citea.
            */
            rel="noopener noreferrer"
            onClick={() => masoara(r.fel)}
            className={CLASE_BUTON}
            aria-label={r.eticheta}
            title={r.eticheta}
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
              <path d={r.cale} />
            </svg>
          </a>
        ))}

        <button
          type="button"
          onClick={copiaza}
          className={CLASE_BUTON}
          aria-label={copiat ? "Adresa a fost copiată" : "Copiază adresa articolului"}
          title={copiat ? "Copiat" : "Copiază adresa"}
        >
          {copiat
            ? <Check className="h-[18px] w-[18px] text-primary" aria-hidden />
            : <Link2 className="h-[18px] w-[18px]" aria-hidden />}
        </button>
      </div>

      {/* ⚠ Confirmarea și pentru cine nu vede culoarea butonului. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copiat ? "Adresa articolului a fost copiată." : ""}
      </span>

      {esuat && (
        <label className="mt-2 flex w-full flex-col gap-1 text-[13px] text-ink-3">
          Browserul n-a lăsat copierea. Adresa e aici, gata de copiat:
          <input
            readOnly
            value={adresa}
            onFocus={(e) => e.currentTarget.select()}
            ref={(el) => el?.select()}
            className="w-full rounded-[8px] border border-hairline bg-white px-3 py-2 text-[13px] text-ink"
          />
        </label>
      )}
    </div>
  );
}
