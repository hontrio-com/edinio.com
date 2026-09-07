"use client";

import { useCallback, useEffect, useState } from "react";
import type { CartItem } from "@/components/storefront/cart/CartProvider";
import { cheiaDeEditat, incheie, liniaDeEditat } from "@/lib/storefront/cart/editare";

/**
 * ═══ PAGINA DE PRODUS, DESCHISA CA SA REPARE O LINIE DIN COS ═══
 *
 * Cele DOUA modele de pagina de produs au nevoie de exact aceeasi purtare, iar scrisa de doua ori
 * ea ar fi ajuns sa difere — chiar tiparul pe care proiectul l-a mai prins la `numeroteaza`, unde
 * un model asculta reglajul si celalalt nu. Aici deosebirea ar fi fost mai scumpa: jumatate din
 * magazine ar fi ADAUGAT o linie in loc s-o inlocuiasca, deci omul ar fi platit de doua ori.
 */
export interface EditareLinie {
  /** Cheia liniei pe care o edităm, sau `null` cand pagina e deschisa obisnuit. */
  cheie: string | null;
  /** Linia gasita in cos. `null` cat timp cosul nu s-a citit inca, si daca a disparut. */
  linie: CartItem | null;
  /**
   * Suntem in editare SI stim ce editam.
   *
   * ⚠ Numai asta are voie sa schimbe butonul in „Salveaza modificarile". Un ecran care spune
   * „salveaza" fara sa aiba o linie in mana ar fi ADAUGAT una noua langa cea veche.
   */
  activ: boolean;
  /**
   * Am venit sa editam, cosul s-a citit, dar linia nu mai e.
   *
   * Se intampla cand omul o sterge din alta fila, sau cand goleste cosul intre timp. Pagina spune
   * asta si se poarta mai departe ca o pagina obisnuita de produs — ce a completat nu se pierde.
   */
  disparuta: boolean;
  /** Editarea s-a incheiat (salvata sau anulata): cheia nu mai are ce cauta in fila. */
  incheieEditarea: () => void;
}

export function useEditareLinie(
  items: CartItem[],
  hydrated: boolean,
  productId: string,
): EditareLinie {
  /*
   * ⚠ SE CITESTE DUPA MONTARE, nu la initializarea starii. Pagina se randeaza si pe server, unde
   * nu exista nici adresa filei, nici `sessionStorage`; o stare initiala diferita intre server si
   * client ar fi facut React sa arunce eroarea de hidratare pe FIECARE pagina de produs.
   */
  const [cheie, setCheie] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCheie(cheiaDeEditat(window.location.search));
  }, []);

  const gasita = liniaDeEditat(items, cheie);

  /*
   * ⚠ SI LINIA TREBUIE SA FIE A ACESTUI PRODUS.
   *
   * Cheia poarta `productId` la inceput, dar ea vine din `sessionStorage` — deci dintr-un loc pe
   * care il poate scrie orice cod din fila. Fara verificarea asta, o cheie ramasa de la alt produs
   * (sau pusa anume) ar fi facut ca „Salveaza modificarile" de pe pagina cănii sa INLOCUIASCA
   * fototapetul din cos: linia veche disparea, si in locul ei aparea alt produs, la alt pret.
   */
  const linie = gasita && gasita.productId === productId ? gasita : null;

  const incheieEditarea = useCallback(() => {
    incheie();
    setCheie(null);
  }, []);

  return {
    cheie,
    linie,
    activ: !!cheie && !!linie,
    disparuta: !!cheie && hydrated && !linie,
    incheieEditarea,
  };
}
