import { ChevronDown, ImageIcon } from "lucide-react";

/**
 * Cele cinci miniaturi din plăcile arcului de pe pagina „Migrare magazin":
 * bucăți din panoul Edinio, nu pictograme.
 *
 * ═══ DE CE BUCĂȚI DE INTERFAȚĂ, ȘI NU SUBSTANTIVE DESENATE ═══
 *
 * O pictogramă de cutie e aceeași cutie de pe orice site din lume. E limpede, dar
 * anonimă: spune „produse", nu spune nimic despre unde ajung ele. O bucată din
 * panoul propriu spune „datele tale aterizează AICI, și uite cum arată" înainte
 * de primul cuvânt citit — și e singurul lucru de pe pagină care nu putea fi luat
 * de altundeva.
 *
 * Nu e o invenție a paginii ăsteia: site-ul desenează deja interfețe în cod pe
 * „Optimizare" — `PanouCautareGoogle`, `PanouSitemap`, `PanouIndexare`,
 * `PaginaProdusMobil`. Aceeași școală, la altă mărime.
 *
 * ═══ SE RECUNOSC, NU SE CITESC ═══
 *
 * Regula e chiar cea scrisă la `PaginaProdusMobil`, și aici contează și mai mult:
 * placa are 78–112px. Din primul ecran nimeni nu va citi „149 lei" — dar toată
 * lumea va vedea o poză, un rând și un preț sub ea, adică un produs. Textele sunt
 * acolo pentru cei care se apropie, nu pentru cei care trec.
 *
 * De aceea nu s-a pus niciun cuvânt care să CEARĂ să fie citit: nicio denumire de
 * produs, nicio categorie inventată. Unde ar fi stat un nume stă o bară — forma
 * unui rând de text, fără textul lui. Așa nu se inventează nici marfă, nici
 * taxonomie pe o pagină comercială.
 *
 * ═══ TOT ÎN `cqw`, CA SĂ EXISTE UN SINGUR DESEN ═══
 *
 * Adică în procente din lățimea PLĂCII, nu în pixeli. Placa are trei mărimi
 * (78 pe telefon, 92 de la `sm`, 112 de la `lg`); cu pixeli ficși ar fi trebuit
 * trei desene, iar al doilea schimbat le-ar fi despărțit.
 *
 * ⚠ `@container` NU se aplică propriului element. De aceea containerul e PLACA
 * (`.arc-placa`, în `ArcMigrare`), iar `cqw` se măsoară abia aici, înăuntru. Pusă
 * pe același element, spațierea s-ar fi raportat la containerul de deasupra —
 * greșeala e scrisă și la `PanouIndexare`, unde a fost prinsă prima dată.
 *
 * ═══ TOATE CINCI SUNT LA ACEEAȘI SCARĂ ═══
 *
 * Adică arată ca cinci capturi din același panou, făcute cu aceeași mărire — nu ca
 * cinci desene făcute separat. Practic: barele au 5cqw peste tot, textele stau
 * între 7 și 9,5cqw, iar rândurile sunt la fel de îndesate.
 *
 * ⚠ E cea mai ușoară regulă de călcat, fiindcă se calcă uitându-te la o singură
 * placă. Prima formă avea prețul la 12cqw: singur, arăta bine; în rând, era cel
 * mai mare text din tot arcul, iar placa se citea ca un afiș cu un preț, lângă
 * patru bucăți de interfață. Diferența de scară se vede imediat ce le pui
 * alături, și niciodată înainte.
 *
 * ⚠ TOATE SUNT `aria-hidden`. Sunt desen, nu conținut: rostite, ar fi ieșit „149
 * lei diez 1042 livrată" între titlu și descriere. Ce se aude e eticheta plăcii
 * (`sr-only` în `ArcMigrare`) — „Produse", „Categorii", și așa mai departe.
 */

/* Verdele de brand, pe post de accent, NU de suprafață.
   Stă pe două capsule de câțiva pixeli — o stare de comandă și un comutator
   pornit — adică exact unde stă și în panoul adevărat. Nu calcă regula „un singur
   buton verde plin": aia e despre butoane, iar aici verdele nu cere să fie apăsat,
   ci spune „mergE". Fără el, plăcile ar fi arătat a schelet de încărcare, care e
   chiar capcana pe care o evită miniaturile. */

/** Un rând de text care nu are text: forma lui, atât. */
function Bara({ latime, clasa = "bg-hairline" }: { latime: string; clasa?: string }) {
  return <span className={`block h-[5cqw] rounded-full ${clasa}`} style={{ width: latime }} />;
}

/**
 * PRODUSE — un card de produs: poza, numele, prețul.
 *
 * Poza e un loc gol cu semnul de imagine, nu o fotografie: la 112px o fotografie
 * adevărată ar fi fost o pată de culoare: singurul lucru colorat din rând și, pe
 * deasupra, un produs anume, ales de mine.
 */
export function MiniaturaProduse() {
  return (
    <div aria-hidden="true" className="flex h-full w-full flex-col justify-center px-[12cqw]">
      <span className="flex h-[42cqw] items-center justify-center rounded-[6cqw] bg-tint-2">
        <ImageIcon className="h-[14cqw] w-[14cqw] text-ink-3" strokeWidth={1.6} />
      </span>
      <span className="mt-[8cqw] block">
        <Bara latime="70%" />
      </span>
      {/* Prețul e singurul lucru scris cu litere pline din placa asta: într-un card
          de produs, el e ce se vede primul, iar fără el rămâneau două bare peste o
          poză — adică orice card, nu unul de magazin.

          ⚠ 9,5cqw, nu 12. La 12 era cel mai mare text din TOT arcul: placa arăta
          ca un afiș cu un preț, nu ca un card de produs, și rupea scara față de
          celelalte patru. Vezi nota despre scara comună de mai jos. */}
      <span className="mt-[6cqw] block text-[9.5cqw] font-semibold leading-none tracking-[-0.02em] text-ink">
        149 lei
      </span>
    </div>
  );
}

/**
 * CATEGORII — un arbore: un părinte și doi copii, indentați.
 *
 * Indentarea e tot mesajul. O listă de trei bare drepte ar fi spus „trei lucruri";
 * două bare trase la dreapta sub prima spun că se păstrează IERARHIA, care e chiar
 * ce te doare când muți un magazin.
 */
export function MiniaturaCategorii() {
  return (
    <div aria-hidden="true" className="flex h-full w-full flex-col justify-center gap-[10cqw] px-[13cqw]">
      <span className="flex items-center gap-[4cqw]">
        {/* Chevronul deschis: dosarul e desfăcut, de-aia se văd copiii dedesubt.
            ⚠ `text-ink-2` și 2,6 grosime, nu `ink-3` la 2,4: e SINGURUL semn din
            placă, iar stins se pierdea între bare și rămâneau trei dungi. */}
        <ChevronDown className="h-[8cqw] w-[8cqw] shrink-0 text-ink-2" strokeWidth={2.6} />
        <Bara latime="58%" />
      </span>
      {/*
        ⚠ Copiii sunt DOAR indentați, fără bulină în față. Prima formă avea câte un
        punct de 4cqw înaintea fiecărei bare: la mărimea asta punctul și bara se
        citeau ca un singur obiect mai lung, deci indentarea — adică tot mesajul —
        se pierdea. Trasă la 18cqw, fără nimic în față, se vede din prima că cele
        două atârnă de prima.
      */}
      <span className="ml-[18cqw] block">
        <Bara latime="46%" />
      </span>
      <span className="ml-[18cqw] block">
        <Bara latime="56%" />
      </span>
    </div>
  );
}

/**
 * CLIENȚI — două rânduri dintr-o listă de clienți: bulina cu inițiale și numele.
 *
 * Inițialele nu se citesc la mărimea asta, și nici nu trebuie: două litere într-un
 * cerc sunt semnul universal pentru „om", iar asta se vede și de la trei metri.
 */
export function MiniaturaClienti() {
  return (
    <div aria-hidden="true" className="flex h-full w-full flex-col justify-center gap-[10cqw] px-[13cqw]">
      <Client initiale="AP" latime="58%" />
      {/* Al doilea rând, mai stins: o listă are mai multe rânduri, dar primul e cel
          care se citește. Stinsul face din două rânduri o listă, nu o pereche. */}
      <Client initiale="MI" latime="46%" stins />
    </div>
  );
}

function Client({ initiale, latime, stins }: { initiale: string; latime: string; stins?: boolean }) {
  return (
    <span className={`flex items-center gap-[6cqw] ${stins ? "opacity-45" : ""}`}>
      <span className="flex h-[18cqw] w-[18cqw] shrink-0 items-center justify-center rounded-full bg-tint-2 text-[7.5cqw] font-semibold leading-none text-ink-2">
        {initiale}
      </span>
      <Bara latime={latime} />
    </span>
  );
}

/**
 * COMENZI — două rânduri dintr-o listă de comenzi: numărul și starea.
 *
 * Aici stau litere adevărate fiindcă numărul de comandă ARE forma unui număr de
 * comandă — „#1042" se recunoaște ca atare chiar și necitit, cum nu s-ar fi
 * recunoscut o bară. Iar pastila colorată e felul în care orice magazin arată o
 * stare, în orice panou.
 */
export function MiniaturaComenzi() {
  return (
    <div aria-hidden="true" className="flex h-full w-full flex-col justify-center gap-[9cqw] px-[11cqw]">
      <Comanda numar="#1042" stare="Livrată" />
      <Comanda numar="#1041" stare="Nouă" nelivrata />
    </div>
  );
}

function Comanda({ numar, stare, nelivrata }: { numar: string; stare: string; nelivrata?: boolean }) {
  return (
    <span className="flex items-center justify-between gap-[4cqw]">
      <span className="text-[9cqw] font-medium leading-none tracking-[-0.02em] text-ink-2">
        {numar}
      </span>
      {/* Două stări, nu aceeași de două ori: cu ambele verzi ar fi părut un
          ornament repetat, nu o coloană de stări. */}
      <span
        className={`rounded-full px-[5cqw] py-[3cqw] text-[7cqw] font-semibold leading-none ${
          nelivrata ? "bg-hairline text-ink-3" : "bg-primary text-white"
        }`}
      >
        {stare}
      </span>
    </span>
  );
}

/**
 * INTEGRĂRI — două rânduri de integrări, cu comutatorul pornit.
 *
 * Pătratul din stânga e gol, nu o siglă adevărată: la 112px o siglă e o mâzgălitură,
 * iar una anume ar fi ridicat întrebarea „de ce tocmai aia". Comutatorul verde e
 * ce contează — el spune „conectat", și e chiar forma din panou.
 */
export function MiniaturaIntegrari() {
  return (
    <div aria-hidden="true" className="flex h-full w-full flex-col justify-center gap-[10cqw] px-[12cqw]">
      <Integrare latime="34%" />
      <Integrare latime="26%" stins />
    </div>
  );
}

function Integrare({ latime, stins }: { latime: string; stins?: boolean }) {
  return (
    <span className={`flex items-center gap-[5cqw] ${stins ? "opacity-45" : ""}`}>
      <span className="h-[15cqw] w-[15cqw] shrink-0 rounded-[4cqw] border border-hairline bg-tint" />
      <Bara latime={latime} />
      {/* Comutatorul: capsulă verde cu bila la dreapta, adică pornit. La mărimea
          asta forma e tot ce rămâne — și forma asta n-o are nimic altceva. */}
      <span className="ml-auto flex h-[10cqw] w-[18cqw] shrink-0 items-center justify-end rounded-full bg-primary px-[1.5cqw]">
        <span className="h-[7cqw] w-[7cqw] rounded-full bg-white" />
      </span>
    </span>
  );
}
