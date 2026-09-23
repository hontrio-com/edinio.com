"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useContulMagazinului } from "./ContulMagazinului";
import { ICONITA_CONT } from "./iconite-cont";

/**
 * Butonul „Contul meu" din antetul vitrinei, reglat din Setari.
 *
 * ⚠ NU E IN LISTA DE ICONITE A ANTETULUI (`HeaderAction`), si dinadins: acolo o
 * actiune noua se aprinde SINGURA la toate magazinele (resolveActions o adauga
 * la coada ca pornita, in trei locuri), iar 70 din 71 de vitrine ar fi primit un
 * buton catre un /cont care le da 404. In plus, 61 din 71 de magazine au antetul
 * „classic", care n-are deloc lista. Deci butonul sta fix in fiecare varianta si
 * se aprinde NUMAI din Setari (vezi `ContulMagazinului`).
 *
 * ⚠ Legatura e statica, spre `/cont`: nu citeste cookie-ul si nu stie daca omul e
 * logat. `/cont` il trimite singur la intrare cand nu e.
 *
 * ⚠ In modul „text", pe telefon se arata iconita: un text de 24 de caractere nu
 * incape langa cos. Numele accesibil e mereu eticheta, oricum ar arata.
 */
export function ActiuneCont({
  clasa,
  stil,
  marime = 20,
  stroke = 1.7,
  clasaText = "text-sm font-medium",
}: {
  clasa: string;
  stil?: CSSProperties;
  marime?: number;
  stroke?: number;
  clasaText?: string;
}) {
  const { buton } = useContulMagazinului();
  if (!buton) return null;
  const Icon = ICONITA_CONT[buton.iconita];
  const iconita = (
    <Icon aria-hidden="true" strokeWidth={stroke} style={{ width: marime, height: marime }} className="shrink-0" />
  );
  return (
    <Link href="/cont" className={clasa} style={stil} aria-label={buton.eticheta} title={buton.eticheta}>
      {buton.afisare === "text" ? <span className="sm:hidden">{iconita}</span> : iconita}
      {buton.afisare !== "iconita" && <span className={`hidden whitespace-nowrap sm:inline ${clasaText}`}>{buton.eticheta}</span>}
    </Link>
  );
}

/**
 * Randul „Contul meu" din sertarul de pe telefon. Tot numai cand e pornit.
 */
export function RandContInSertar({ clasa, clasaInvelis, laClic }: { clasa: string; clasaInvelis?: string; laClic?: () => void }) {
  const { buton } = useContulMagazinului();
  if (!buton) return null;
  const Icon = ICONITA_CONT[buton.iconita];
  return (
    <div className={clasaInvelis}>
      <Link href="/cont" className={clasa} onClick={laClic}>
        <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
        <span>{buton.eticheta}</span>
      </Link>
    </div>
  );
}
