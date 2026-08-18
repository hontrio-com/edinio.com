import { Layers, Package, Plug, ShoppingCart, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Arcul de casete de deasupra titlului, în hero-ul paginii „Migrare magazin":
 * ce anume se mută, desenat înainte să fie citit.
 *
 * ═══ DE CE ARC, ȘI DE UNDE VINE ═══
 *
 * Referința dată de client (14.08) e un rând de plăci așezate pe o bandă curbă,
 * fiecare înclinată după curbă. Din ea s-au luat DOUĂ lucruri — arcul și plăcile
 * — și s-a lăsat restul: acolo plăcile sunt colorate fiecare altfel și stau pe o
 * panglică desenată, peste un fundal albastru. Aici fundalul e mesh-ul verde al
 * hero-ului, care e deja al paginii.
 *
 * Plăcile sunt ALBE, cerut explicit: aceleași ca în hero-ul paginii „Integrări".
 * Nu seamănă cu ele, sunt chiar ele — `caseta-sigla` din `globals.css` aduce
 * albul și umbra în patru straturi. Așa cele două hero-uri rămân din aceeași
 * platformă, iar dacă se schimbă cândva umbra, se schimbă în amândouă deodată.
 * (Acolo s-au încercat cândva granule, sticlă, crom și relief, și clientul le-a
 * respins pe toate: alb curat, deosebit de pagină doar prin umbră.)
 *
 * ⚠ FĂRĂ panglica de sub plăci. Pe fundalul din referință banda desparte plăcile
 * de albastru; aici ar fi o a treia formă albă peste un hero care are deja
 * lumina verde și, imediat dedesubt, un titlu de 66px. Arcul se citește oricum
 * din înclinare și din coborârea capetelor — pentru asta n-are nevoie de suport.
 *
 * ═══ GEOMETRIA ═══
 *
 * Cinci plăci pe un cerc, la 9° una de alta: −18°, −9°, 0°, +9°, +18°. Coborârea
 * fiecăreia e cea de pe cerc, `R × (1 − cos θ)`, cu R = 450px:
 *
 *     ±18°  →  450 × 0,0489  ≈  22px
 *     ±9°   →  450 × 0,0123  ≈   6px
 *       0°  →                    0px
 *
 * Adică nu sunt numere alese din ochi: dacă se schimbă unghiul, coborârea se
 * recalculează din aceeași formulă, altfel plăcile ies de pe cerc și arcul se
 * strâmbă într-un fel greu de văzut, dar vizibil.
 *
 * Depărtarea pe orizontală o dă `gap`, egală, nu coarda cercului. Pe hârtie
 * capetele ar trebui strânse cu cos 18° = 0,951, adică 5% — sub un pixel și
 * jumătate la depărtarea de aici. Nu merită o socoteală în plus.
 *
 * ⚠ `transform` NU MIȘCĂ NIMIC ÎN AȘEZARE: rotirea și coborârea sunt desen, deci
 * rândul își păstrează înălțimea plăcii nerotite. De aceea marginea de jos e mai
 * mare decât pare că trebuie — capătul rotit coboară cu ~32px sub cutia lui, iar
 * titlul începe la 24px sub rând. Fără ea, colțul plăcii din margine ar fi intrat
 * peste prima literă.
 *
 * ⚠ ACELEAȘI UNGHIURI PE TOATE LĂȚIMILE, dinadins. Plăcile se micșorează (46 →
 * 64 → 76px), arcul nu: pe telefon rândul e mai îngust, deci aceeași coborâre de
 * 22px se citește ca o curbă puțin mai adâncă — care e chiar ce trebuie acolo. Un
 * arc turtit pe un ecran îngust arată ca un rând drept desenat strâmb.
 *
 * ═══ DE CE PLACA DE BAZĂ E DE 46px, ȘI NU DE 52 ═══
 *
 * Fiindcă trebuie să încapă la 320px, cea mai îngustă lățime pe care o ține
 * site-ul (aceeași cu cea din proba geometrică a câmpului de sigle).
 *
 * ⚠ O PLACĂ ROTITĂ OCUPĂ MAI MULT DECÂT LATURA EI. La 18°, cutia care o cuprinde
 * e `latura × (cos 18° + sin 18°)` = `latura × 1,26` — cu 26% mai lată. E ușor de
 * uitat, fiindcă `getBoundingClientRect` o arată, dar așezarea nu: `transform` nu
 * mișcă nimic în curgere, deci nimic nu se rupe vizibil, doar capetele intră sub
 * marginea ecranului și `overflow-hidden` al hero-ului le taie umbra.
 *
 * Socoteala la 320px, cu marginile de 20px ale hero-ului (deci 280 utili):
 *
 *     5 × 46 + 4 × 6 (depărtarea)  =  254px
 *     capetele rotite, 46 × 0,26   =   12px, adică ~6 de fiecare parte
 *                                     ───────
 *                                      266px  → încap, cu 14px de rezervă
 *
 * La 52px ieșeau 292 + 13 = 305, adică 25 peste. De aceea 46, nu 52.
 */

interface Placa {
  /** Ce se transferă. Se aude la cititoarele de ecran; pe ecran nu se scrie. */
  eticheta: string;
  Icoana: LucideIcon;
  /** Unghiul pe cerc, în grade. */
  rot: number;
  /** Coborârea față de mijloc, `R × (1 − cos rot)` cu R = 450. Vezi nota de sus. */
  dy: number;
}

/**
 * ⚠ ORDINEA E CEA DIN PROPOZIȚIA CLIENTULUI, nu cea în care au fost cerute
 * pictogramele: descrierea de sub titlu zice „Produse, categorii, clienți,
 * comenzi și alte date importante". Ochiul trece peste plăci, citește titlul și
 * dă imediat peste aceleași lucruri în aceeași ordine — o rimă mică, dar
 * gratuită. „Integrări" stă la capăt fiindcă e singurul care nu apare pe nume în
 * propoziție; el e „alte date importante".
 *
 * Pictogramele sunt cele pe care platforma le folosește deja pentru aceleași
 * lucruri: `Package`, `ShoppingCart` și `Users` sunt din meniul din panoul de
 * administrare, `Plug` e cea a „Integrărilor" din mega menu. Nu se aleg altele
 * pentru site: cine vede aici o cutie și în panou tot o cutie știe că e vorba de
 * același lucru.
 *
 * `Layers` e singura nouă — categoriile n-aveau pictogramă nicăieri. Prima
 * alegere a fost `FolderTree`, fiindcă spune și că se păstrează IERARHIA, nu doar
 * lista. Pusă pe ecran, s-a văzut de ce nu merge: desenul ei e un arbore cu trei
 * dosare mici și liniile dintre ele, iar la 34px, alb pe alb, ieșeau niște
 * dreptunghiuri răzlețe, singurul lucru nesimetric din rând. `Layers` spune mai
 * puțin — „lucruri stivuite", nu „arbore" — dar se citește din prima.
 */
const PLACI: Placa[] = [
  { eticheta: "Produse", Icoana: Package, rot: -18, dy: 22 },
  { eticheta: "Categorii", Icoana: Layers, rot: -9, dy: 6 },
  { eticheta: "Clienți", Icoana: Users, rot: 0, dy: 0 },
  { eticheta: "Comenzi", Icoana: ShoppingCart, rot: 9, dy: 6 },
  { eticheta: "Integrări", Icoana: Plug, rot: 18, dy: 22 },
];

export function ArcMigrare() {
  return (
    /*
      Listă, nu un șir de `div`-uri: sunt cinci lucruri de același fel, iar
      cititorul de ecran anunță „listă cu 5 elemente" înainte să le înșire. Cu
      `div`-uri s-ar fi auzit cinci cuvinte răzlețe între titlu și pastilă.
    */
    <ul
      aria-label="Ce se transferă în Edinio"
      className="mx-auto mb-9 flex items-start justify-center gap-1.5 sm:mb-11 sm:gap-3 lg:gap-3.5"
    >
      {PLACI.map(({ eticheta, Icoana, rot, dy }) => (
        <li
          key={eticheta}
          /*
            `caseta-sigla` ADUCE albul și umbra; nu se pune `bg-white` lângă ea.
            Colțul e pe măsura plăcii, în același raport ca pe „Integrări" (20 la
            68, adică 0,29): 13 la 46, 19 la 64, 22 la 76. Un colț nescalat ar fi
            făcut plăcile mici să pară din altă familie.
          */
          className="caseta-sigla flex h-[46px] w-[46px] items-center justify-center rounded-[13px] sm:h-16 sm:w-16 sm:rounded-[19px] lg:h-[76px] lg:w-[76px] lg:rounded-[22px]"
          style={{ transform: `translateY(${dy}px) rotate(${rot}deg)` }}
        >
          {/*
            Cerneală, nu verde. Verdele de pe site e al butonului principal, iar
            cinci pictograme verzi deasupra unui buton verde l-ar fi făcut pe el
            să nu mai fie singurul lucru colorat din primul ecran.

            ⚠ GROSIMEA 1,9, nu 1,5–1,6 ca la pictogramele din rândurile de text.
            Acolo desenul stă lângă cuvântul care-l explică; aici e singurul lucru
            din placă, cu alb în jur și alb dedesubt, și trebuie să țină singur
            greutatea unui titlu de 66px care începe la 36px mai jos. La 1,6 rândul
            se vedea spălăcit — nu mic, ci fără cerneală în el.

            Mărimea, tot pe măsura plăcii: 21 la 46, 29 la 64, 34 la 76, adică
            0,45 din latură peste tot. Nescalată, pictograma ar fi părut că plutește
            în placa mare și că sufocă placa mică.
          */}
          <Icoana
            aria-hidden="true"
            strokeWidth={1.9}
            className="h-[21px] w-[21px] text-ink-2 sm:h-[29px] sm:w-[29px] lg:h-[34px] lg:w-[34px]"
          />
          {/*
            Numele, doar pentru cititoarele de ecran.

            ⚠ NU e de prisos, deși descrierea de sub titlu enumeră aproape
            aceleași cuvinte: „Integrări" nu apare acolo. Iar o pictogramă de
            arbore nu se aude în niciun fel — fără rândul ăsta, cine ascultă
            pagina ar fi auzit „listă cu 5 elemente" și cinci elemente goale.
          */}
          <span className="sr-only">{eticheta}</span>
        </li>
      ))}
    </ul>
  );
}
