import { formatPrice } from "@/lib/utils/format";

/*
  ═══════════════════════════════════════════════════════════════════════════
  O SUMA INTR-UN TABEL STRAMT
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ EXISTA FIINDCA PE TELEFON „3.413,88 lei" NU INCAPE. Tabelele de statistici
  au cinci coloane; la 390 de pixeli, suma se rupea in doua randuri („3.413,88"
  si „lei" dedesubt) sau iesea de tot din cadru, iar coloana pentru care se
  deschide tabelul ramanea taiata.

  Pe telefon se rotunjeste la leu (banii n-au ce spune intr-o comparatie intre
  surse), de la `sm` in sus se scrie intreaga. Amandoua ies din ACEEASI cifra,
  intr-un singur loc: scrise de mana in fiecare tabel, s-ar fi despartit.
*/
export function Bani({ valoare }: { valoare: number }) {
  return (
    <>
      <span className="whitespace-nowrap sm:hidden">
        {`${Math.round(valoare).toLocaleString("ro-RO")} lei`}
      </span>
      <span className="hidden whitespace-nowrap sm:inline">{formatPrice(valoare)}</span>
    </>
  );
}
