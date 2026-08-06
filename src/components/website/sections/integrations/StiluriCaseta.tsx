import { IntegrationsBenzi, type StilCaseta } from "./IntegrationsBenzi";

/**
 * Aceeași secțiune, de patru ori, cu casetele tratate diferit. De ales una.
 *
 * ═══ ASTA E O SCHELĂ, NU O SECȚIUNE ═══
 *
 * Când clientul alege, aici rămâne nimic: fișierul se ȘTERGE, pagina cheamă
 * direct `<IntegrationsBenzi />`, prop-ul `stil` dispare din componentă, iar din
 * `globals.css` rămâne o singură clasă din cele patru.
 *
 * Secțiunea se repetă întreagă, cu titlu și tot, dinadins: un tratament de casetă
 * nu se judecă pe o casetă singură, ci pe două benzi întregi în mișcare, lângă
 * text. Într-un tabel de patru pătrățele ar fi arătat toate bine.
 */

const STILURI: { stil: StilCaseta; nume: string; nota: string }[] = [
  {
    stil: "granule",
    nume: "Mesh + granule",
    nota: "mat, cu o variație moale de culoare și zgomot vizibil",
  },
  {
    stil: "sticla",
    nume: "Liquid Glass",
    nota: "placă de sticlă, muchia de sus aprinsă și o sclipire oblică",
  },
  {
    stil: "metal",
    nume: "Liquid Metal",
    nota: "crom deschis, cu benzi de reflexie și textură fină",
  },
  {
    stil: "relief",
    nume: "3D / relief",
    nota: "ridicată de pe pagină, luminată din stânga-sus",
  },
];

export function StiluriCaseta() {
  return (
    <>
      {STILURI.map(({ stil, nume, nota }, i) => (
        <div key={stil}>
          <div className="mx-auto max-w-[1200px] px-5 pt-16 sm:px-6 lg:px-8">
            {/* `select-none` ca sa nu fie luata la copierea textului paginii. */}
            <p className="select-none border-t border-hairline pt-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3">
              Stil {i + 1} — {nume}
              <span className="ms-2 font-normal normal-case tracking-normal opacity-80">
                {nota}
              </span>
            </p>
          </div>
          <IntegrationsBenzi stil={stil} />
        </div>
      ))}
    </>
  );
}
