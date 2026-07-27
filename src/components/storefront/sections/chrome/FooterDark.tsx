"use client";

import { FooterColumns } from "./FooterColumns";

/**
 * Footerul clasic, varianta „dark".
 *
 * Aceeasi structura ca varianta deschisa — identitate, categorii, pagini,
 * contact — doar pe fundalul inchis al magazinului. Structura pe coloane s-a
 * dovedit mai buna decat blocul de dinainte, iar doua asezari diferite pentru
 * acelasi lucru ar fi insemnat doua locuri de intretinut.
 */
export function FooterDark() {
  return <FooterColumns ton="inchis" />;
}
