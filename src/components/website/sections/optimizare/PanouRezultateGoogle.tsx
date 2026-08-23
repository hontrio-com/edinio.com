import { cn } from "@/lib/utils/cn";
import { REZULTATE_ORGANICE, type RezultatOrganic } from "@/lib/website/seo";

/**
 * Ilustrația celui de-al doilea card SEO: trei rezultate obișnuite pe Google,
 * din care unul e al magazinului.
 *
 * ═══ DESENUL E AL LOR, COPIAT ═══
 *
 * Un rezultat pe Google are, de sus în jos:
 *
 *   [bulină cu pictograma site-ului]  Numele site-ului
 *                                     gazda › calea › paginii
 *   Titlul, ALBASTRU, cel mai mare lucru din rezultat
 *   Descrierea, cenușie, două rânduri
 *
 * Titlul e albastru fiindcă e legătura pe care dai clic, și e singurul lucru
 * albastru. Rândul cu adresa e DEASUPRA titlului, nu dedesubt — așa l-au mutat
 * ei acum câțiva ani, iar cine ține minte desenul vechi îl pune greșit.
 *
 * ═══ CUM SE VEDE CĂ AL NOSTRU E ALTFEL ═══
 *
 * ⚠ NU PRIN ALT DESEN. Toate trei sunt desenate identic: aceeași bulină, același
 * albastru, aceleași mărimi. Dacă al nostru ar avea alt chip, comparația n-ar mai
 * spune nimic — ar arăta doar că i-am dat noi altă înfățișare. Singura deosebire
 * e CE SCRIE în ele, adică exact lucrul despre care e cardul.
 *
 * Ce se adaugă e doar sublinierea: cele două din jur se sting, al nostru capătă
 * un chenar verde și o etichetă. Sublinierea stă PE DEASUPRA desenului lor, nu
 * în el.
 */

/* Culorile sunt ale Google, luate din rezultatele lor. Nu se înlocuiesc cu
   tokenurile noastre: aici desenul trebuie să fie al lor. */
const ALBASTRU_LEGATURA = "#1a0dab";
/*
  ⚠ VERDELE SE IA DIN VARIABILA, NU DINTR-UN UTILITAR `ring-brand`.

  Culorile de brand stau ca variabile pe `:root`, nu într-un bloc `@theme`, deci
  Tailwind NU generează din ele o gamă întreagă de utilitare: există `.bg-brand`
  și `.border-brand` fiindcă sunt scrise de mână în `globals.css`, dar `ring-brand`
  nu există. Iar o clasă de inel fără culoare nu dă nicio eroare — cade pe culoarea
  ei din oficiu. Prima formă a ieșit cu chenarul NEGRU, și doar poza a spus-o.
*/
const VERDE = "var(--primary)";
const CENUSIU_TEXT = "#4d5156";
const NEGRU_SITE = "#202124";

export function PanouRezultateGoogle() {
  const alNostru = REZULTATE_ORGANICE.find((r) => r.alNostru);

  return (
    <div className="@container">
      {/*
        Ce se aude și ce se indexează. Restul e ascuns: sunt rezultate INVENTATE,
        puse ca desen, iar textul lor — „Camere", „Produse", un meniu cules de
        Google — n-are ce căuta în ce citește un motor de căutare despre pagina
        asta. Cardul 1 face la fel.
      */}
      <p className="sr-only">
        Exemplu de rezultate Google: două magazine cu titluri și descrieri
        nelucrate, iar la mijloc unul cu titlu și descriere scrise pentru
        căutare&nbsp;— „{alNostru?.titlu}&rdquo;.
      </p>

      <div
        aria-hidden="true"
        className="rounded-[14px] border border-hairline bg-white p-[18px] sm:p-6"
      >
        <ul className="flex flex-col gap-5 sm:gap-6">
          {REZULTATE_ORGANICE.map((r) => (
            <li key={r.cale}>
              <Rezultat rezultat={r} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Rezultat({ rezultat }: { rezultat: RezultatOrganic }) {
  const nostru = rezultat.alNostru === true;

  return (
    <div
      className={cn(
        "relative",
        /*
          Al nostru stă într-o casetă cu chenar verde; celelalte două n-au nimic
          în jur. Ca textul să înceapă totuși pe aceeași verticală la toate trei,
          caseta iese în afară cu cât are spațiere înăuntru — altfel rândul cu
          adresa de la al nostru ar fi împins la dreapta față de vecini, și s-ar
          citi ca o greșeală de aliniere, nu ca o subliniere.
        */
        nostru && "-mx-3 rounded-[10px] px-3 pt-[14px] pb-3 sm:-mx-4 sm:px-4",
        /*
          Vecinii se sting. NU sunt cenușii — sunt aceleași culori, mai palide:
          un rezultat gri ar arăta ca unul dezactivat, iar aici nu e dezactivat
          nimic, doar că nu despre el e vorba.
        */
        !nostru && "opacity-45",
      )}
      style={nostru ? { boxShadow: "0 1px 2px rgba(10,10,10,0.05)" } : undefined}
    >
      {nostru ? (
        <>
          {/* Chenarul verde, pe `ring`, ca să nu miște nimic în așezare. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[10px] ring-2"
            style={{ ["--tw-ring-color" as string]: VERDE }}
          />
          {/*
            Eticheta. Spune CE e lucrat — titlul și descrierea — fiindcă altfel
            un chenar verde ar putea fi citit ca „ăsta e primul", adică o promisiune
            despre loc în rezultate, pe care n-o face nimeni.
          */}
          <span className="absolute -top-2 left-3 rounded-full bg-primary px-2 py-[3px] text-[9px] font-semibold uppercase tracking-[0.04em] text-white sm:left-4 sm:text-[10px]">
            Titlu și descriere optimizate
          </span>
        </>
      ) : null}

      {/* ── Rândul de sus: pictograma, numele site-ului, calea ── */}
      <div className="flex items-center gap-[10px]">
        {/*
          Bulina pictogramei. La toate trei e la fel, o literă pe fond cenușiu:
          o pictogramă adevărată ar fi însemnat o siglă inventată pentru un
          magazin care nu există.
        */}
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#f1f3f4] text-[11px] font-medium text-[#5f6368]">
          {rezultat.initiala}
        </span>

        <span className="min-w-0">
          <span
            className="block truncate text-[12px] leading-[1.25] sm:text-[13px]"
            style={{ color: NEGRU_SITE }}
          >
            {rezultat.site}
          </span>
          <span
            className="block truncate text-[11px] leading-[1.25] sm:text-[12px]"
            style={{ color: CENUSIU_TEXT }}
          >
            {rezultat.cale}
          </span>
        </span>
      </div>

      {/*
        Titlul, pe cel mult DOUĂ rânduri — cum îl arată Google pe o coloană
        îngustă, adică pe telefon.

        ⚠ Prima formă îl tăia la un rând, cu trei puncte, cum face Google pe
        coloana lată de desktop. Măsurat, panoul de aici e de 243-438px, iar
        titlul NOSTRU ieșea tăiat la toate lățimile până în 1024. Adică tocmai
        titlul lucrat, cel pentru care există cardul, se vedea ciuntit, în timp
        ce „Produse" încăpea întreg. Desenul spunea fix pe dos.

        ⚠ FĂRĂ înălțime de rezervă. O cutie de două rânduri ținea un rând gol sub
        fiecare titlu la lățimile unde toate trei încap pe unul — se vedea în poză
        ca o gaură între titlu și descriere. Rezultatele pe Google au oricum
        înălțimi diferite: sunt trei blocuri, nu un tabel.
      */}
      <p
        className="mt-[6px] line-clamp-2 text-[15px] leading-[1.3] sm:text-[17px]"
        style={{ color: ALBASTRU_LEGATURA }}
      >
        {rezultat.titlu}
      </p>

      {/*
        Descrierea, tăiată la TREI rânduri — atâtea arată Google pe telefon, și
        panoul ăsta e cam cât o coloană de telefon: măsurat, între 196 și 438px.

        ⚠ La două rânduri se tăia și descrierea NOASTRĂ, adică singura scrisă
        anume ca să se citească. Aceeași scăpare ca la titlu: tăierea lovea exact
        lucrul pe care cardul îl arată. Descrierea noastră a fost scurtată până
        încape întreagă pe lățimea de la calculator; pe telefoanele mici tot se
        taie cu trei puncte, ca la ei.

      */}
      <p
        className="mt-[3px] line-clamp-3 text-[12.5px] leading-[1.55] sm:text-[13.5px]"
        style={{ color: CENUSIU_TEXT }}
      >
        {rezultat.descriere}
      </p>
    </div>
  );
}
