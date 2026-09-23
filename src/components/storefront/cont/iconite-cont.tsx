import {
  CircleUser, CircleUserRound, KeyRound, LogIn, SquareUser, User, UserCheck, UserRound, type LucideIcon,
} from "lucide-react";
import type { IconitaCont } from "@/lib/cont/config";

/**
 * Iconitele butonului „Contul meu", cheie -> componenta.
 *
 * ⚠ Importuri EXPLICITE si o harta statica, nu `import *`: pachetul vitrinei ar
 * fi tras toate cele peste o mie de iconite lucide. Cheile sunt exact lista alba
 * din `src/lib/cont/config.ts`; o cheie necunoscuta nu poate ajunge aici, fiindca
 * valoarea din baza trece prin `curataContClientConfig`.
 * ⚠ Aceeasi harta o foloseste si selectorul din Setari, ca ce vede comerciantul
 * sa fie exact ce apare pe vitrina.
 */
export const ICONITA_CONT: Record<IconitaCont, LucideIcon> = {
  "user-round": UserRound,
  user: User,
  "circle-user-round": CircleUserRound,
  "circle-user": CircleUser,
  "square-user": SquareUser,
  "user-check": UserCheck,
  "log-in": LogIn,
  "key-round": KeyRound,
};
