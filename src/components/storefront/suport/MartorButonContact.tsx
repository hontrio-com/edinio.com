import { PictogramaChat } from "./PictogramaChat";

/**
 * Butonul de contact DESENAT, pentru previzualizarea din editor.
 *
 * In editor nu se incarca scripturile furnizorilor si nu se cere niciun acord (`DoarInMagazinReal`), deci
 * butonul adevarat nu se monteaza acolo. Fara desenul asta, comerciantul cu chatul pornit nu ar fi vazut in
 * editor niciun buton de contact: stiva veche (WhatsApp, telefon) nu se mai deseneaza cand exista butonul
 * magazinului, iar cel nou lipsea. Ar fi parut ca au disparut amandoua.
 *
 * ⚠ E doar un desen: nu se poate apasa (`pointer-events-none`), nu ia focusul si e ascuns de cititoarele de
 * ecran. Sta exact unde sta butonul adevarat si urca la fel deasupra barelor de jos (`--bara-de-jos`).
 *
 * ⚠ Numai pentru butonul MAGAZINULUI. Cel al furnizorului il deseneaza scriptul lui, cu forma si culoarea
 * alese in contul de acolo: nu avem ce desena in locul lui.
 */
export function MartorButonContact({ culoare, culoareText, stanga, text, peTelefon }: {
  culoare: string;
  culoareText: string;
  stanga: boolean;
  /** Textul de langa buton, cum l-a scris comerciantul. */
  text: string;
  /** „Arata si pe telefon”: oprit, desenul dispare si el sub latimea unui telefon. */
  peTelefon: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      data-edinio-chat-martor=""
      className={`pointer-events-none fixed z-30 flex items-center gap-2.5 print:hidden ${peTelefon ? "" : "max-sm:hidden "}${stanga ? "left-4 flex-row-reverse" : "right-4"}`}
      style={{ bottom: "calc(1.25rem + var(--bara-de-jos, 0px))" }}
    >
      {text && (
        <span className="hidden rounded-full border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-900 shadow-md md:block">
          {text}
        </span>
      )}
      <span className="flex h-14 w-14 items-center justify-center rounded-full shadow-lg" style={{ backgroundColor: culoare, color: culoareText }}>
        <PictogramaChat className="h-7 w-7" />
      </span>
    </div>
  );
}
