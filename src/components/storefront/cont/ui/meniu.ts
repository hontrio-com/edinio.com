import { Bell, House, Package, ReceiptText, Undo2, UserRound, type LucideIcon } from "lucide-react";

/**
 * Meniul contului, intr-un singur loc: bara laterala (desktop) si filele
 * (telefon) citesc aceeasi lista, ca sa nu se desparta.
 *
 * ⚠ Activul vine ca PROP din pagina de server, nu ghicit cu `usePathname`: pe
 * domeniul propriu proxy-ul rescrie calea sub `/{slug}`, deci o comparatie exacta
 * ar putea da alt raspuns pe server si pe client.
 */

export type CheieMeniu = "acasa" | "comenzi" | "facturi" | "retururi" | "date" | "preferinte";

export type IntrareMeniu = {
  cheie: CheieMeniu;
  eticheta: string;
  /** Pe file, unde locul e putin. */
  scurt: string;
  href: string;
  icon: LucideIcon;
  /** Grupul 1: ce tine de cumparaturi; grupul 2: contul insusi. */
  grup: 1 | 2;
};

export const MENIU: IntrareMeniu[] = [
  { cheie: "acasa", eticheta: "Prezentare", scurt: "Prezentare", href: "/cont", icon: House, grup: 1 },
  { cheie: "comenzi", eticheta: "Comenzile mele", scurt: "Comenzi", href: "/cont/comenzi", icon: Package, grup: 1 },
  { cheie: "facturi", eticheta: "Facturi", scurt: "Facturi", href: "/cont/facturi", icon: ReceiptText, grup: 1 },
  { cheie: "retururi", eticheta: "Retururi", scurt: "Retururi", href: "/cont/retururi", icon: Undo2, grup: 1 },
  { cheie: "date", eticheta: "Datele mele", scurt: "Date", href: "/cont/date", icon: UserRound, grup: 2 },
  { cheie: "preferinte", eticheta: "Preferinte", scurt: "Preferinte", href: "/cont/preferinte", icon: Bell, grup: 2 },
];
