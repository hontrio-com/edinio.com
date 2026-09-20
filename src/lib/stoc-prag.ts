/*
  Pragul de la care un produs e „sub stoc”, tinut intr-un singur loc.

  ⚠ NU in `stoc-scazut.actions.ts`: acela e un modul `"use server"`, unde fiecare
  export devine un endpoint HTTP, iar constantele nici nu se pot exporta („Only
  async functions are allowed to be exported in a 'use server' file”).

  Se citeste din trei locuri: interogarea panoului principal, citirea listei
  intregi pentru modal, si textele care spun „sub 5 bucati”.
*/
export const PRAG_STOC_SCAZUT = 5;
