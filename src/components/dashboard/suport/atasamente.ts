import {
  CreditCard, Package, Palette, Plug, ShoppingBag, UserCog, Users, Wrench, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

/* Iconita fiecarei categorii. Cheile vechi (billing, feature, other) cad pe `LifeBuoy` la apelant. */
export const ICONITA_CATEGORIEI: Record<string, LucideIcon> = {
  store_design: Palette,
  products: Package,
  orders: ShoppingBag,
  customers: Users,
  payments: CreditCard,
  integrations: Plug,
  account: UserCog,
  technical: Wrench,
};

/*
  ⚠⚠ TIPURILE SUNT CELE PE CARE LE PRIMESTE `/api/upload`, nu mai multe.
  Formularul vechi lasa sa se aleaga si `.txt` si `.zip`, iar serverul le
  refuza: omul scria tot tichetul, apasa „Trimite" si primea abia atunci
  „Tipul fisierului nu este permis". Vezi `ALL_ALLOWED_TYPES` in ruta.
*/
const TIPURI = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf"];
export const ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf";
const MARIME_MAXIMA = 10 * 1024 * 1024;
export const CATE_FISIERE = 5;

/** Adauga fisierele alese la cele de dinainte, spunand pe nume ce s-a lasat pe dinafara. */
export function adaugaFisiere(existente: File[], noi: FileList | File[] | null): File[] {
  if (!noi) return existente;
  const bune: File[] = [];
  for (const f of Array.from(noi)) {
    if (!TIPURI.includes(f.type)) { toast.error(`${f.name}: se pot atașa doar poze și PDF-uri.`); continue; }
    if (f.size > MARIME_MAXIMA) { toast.error(`${f.name} trece de 10 MB.`); continue; }
    bune.push(f);
  }
  const toate = [...existente, ...bune];
  if (toate.length > CATE_FISIERE) toast.error(`Poți atașa cel mult ${CATE_FISIERE} fișiere.`);
  return toate.slice(0, CATE_FISIERE);
}

/** Incarca fisierele si intoarce adresele lor. Arunca la primul care nu trece. */
export async function incarcaFisiere(fisiere: File[]): Promise<string[]> {
  if (fisiere.length === 0) return [];
  const { uploadImage } = await import("@/lib/upload");
  return Promise.all(
    fisiere.map(async (f) => {
      const r = await uploadImage(f, "avatars", "support");
      if ("error" in r) throw new Error(`${f.name}: ${r.error}`);
      return r.url;
    }),
  );
}

export function marimeaFisierului(octeti: number): string {
  return octeti < 1024 * 1024 ? `${Math.max(1, Math.round(octeti / 1024))} KB` : `${(octeti / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
