"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCartSessionId } from "@/lib/cart-session";
import { getCartPricing } from "@/lib/actions/store.actions";
import { lineKey, normalizeazaCos, type CartItem } from "@/lib/storefront/cart/normalize";
import { normalizeazaCantitate } from "@/lib/orders/quantity";
import { inlocuiesteLinia } from "@/lib/storefront/cart/editare";
import { cereRevizuire, pretulBucatii, pretulLiniei, rezumatulLiniei } from "@/lib/storefront/cart/pret-linie";
import { rezumatPersonalizare } from "@/lib/storefront/cart/normalize";

/**
 * Cosul storefrontului: stare in memorie oglindita in localStorage, per magazin.
 *
 * Extras din `MiniStoreRenderer` fara nicio schimbare de comportament, ca
 * sectiunile si variantele de design sa poata consuma cosul fara sa importe
 * fisierul de 2900 de linii.
 */

// Forma unei linii sta in modulul pur, langa regula care o curata; aici se
// re-exporta, ca sa nu se schimbe niciun import existent.
export type { CartItem };

// Identitatea unei linii sta tot in modulul pur, langa forma ei; aici se
// re-exporta, ca sa nu se schimbe niciun import existent.
export { lineKey };

export interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, cantitate?: number) => void;
  /**
   * Inlocuieste o linie cu alta — editarea personalizarii, din cos.
   *
   * ⚠ O SINGURA SCRIERE, nu „adauga apoi sterge": vezi implementarea, unde scrie si de ce
   * editarea unei linii NESCHIMBATE ar fi golit-o din cos.
   */
  replaceItem: (cheieVeche: string, item: Omit<CartItem, "quantity">, cantitate?: number) => void;
  removeItem: (key: string) => void;
  updateQty: (key: string, qty: number) => void;
  /**
   * Cat costa o linie, cu treptele de cantitate aplicate.
   *
   * TOATE suprafetele cosului trec pe aici in loc sa inmulteasca ele
   * `pret x cantitate`: altfel fiecare ar putea ajunge la alt numar, iar unul
   * dintre ele ar fi diferit de cel pe care il incaseaza serverul.
   */
  lineTotal: (item: CartItem) => number;
  /**
   * Configuratia liniei nu se mai potriveste cu definitia de ACUM a produsului.
   *
   * ⚠ NU E O EROARE DE PRET, ci un semnal catre om. Pretul cade deja pe catalog cand valorile nu
   * se mai potrivesc — dar tace, iar clientul afla abia la finalizare, cand serverul refuza, ca
   * linia nu se poate comanda. Se intampla cand comerciantul schimba definitia dupa ce omul a pus
   * produsul in cos: sterge o optiune, face un camp obligatoriu, stramteaza o dimensiune.
   *
   * ⚠ `false` si cand nu stim inca: preturile ajung asincron, iar pana atunci o linie perfect buna
   * ar fi fost aratata ca stricata.
   */
  lineNeedsReview: (item: CartItem) => boolean;
  /**
   * Personalizarea liniei, scrisa cum o citeste omul: etichetele optiunilor, unitatile, si
   * comutatoarele pornite. Vezi `rezumatulLiniei` — cel din `normalize.ts` lucreaza pe valorile
   * brute si scria id-uri de optiuni in loc de nume.
   */
  lineSummary: (item: CartItem) => string;
  /**
   * Cat costa O BUCATA din linie, inainte de treptele de cantitate.
   *
   * Are aceeasi sursa ca `lineTotal`, si tocmai de asta exista. Eticheta „N buc x
   * P" si taietura de deasupra reducerii se scriau din `item.price`, adica din
   * instantaneul salvat in localStorage la adaugare, in timp ce totalul de langa
   * ele venea deja de la server: cele doua numere de pe acelasi rand nu se
   * inmulteau. 
   *
   * `lineUnit(item) * item.quantity` e chiar pretul intreg al liniei, acelasi
   * numar din care `pretPeTrepte` scade `savings`. Deci total + economie =
   * unitar x cantitate, si nu mai poate aparea un al treilea numar pe rand.
   *
   * Cat timp preturile de la server nu au ajuns inca (sau produsul a fost sters
   * ori dezactivat, si `getCartPricing` nu-l mai intoarce), intoarce pretul
   * salvat — exact ca `lineTotal`. Randul ramane deci consistent si atunci: ori
   * amandoua numerele sunt vechi, ori amandoua sunt de la server, niciodata unul
   * din fiecare.
   */
  lineUnit: (item: CartItem) => number;
  /** Cat economiseste linia fata de pretul intreg (0 cand nu se aplica nimic). */
  lineSavings: (item: CartItem) => number;
  total: number;
  count: number;
  clear: () => void;
  restoreCart: (items: CartItem[]) => void;
  sessionId: string;
  /**
   * Cosul a fost citit din localStorage.
   *
   * Pana atunci e gol si pe server, si la prima randare din browser — ceea ce e
   * corect pentru hidratare, dar inseamna ca „gol" nu inseamna inca „gol".
   * Paginile de cos si de comanda au nevoie de distinctia asta: fara ea, ar
   * arata „cosul e gol" pret de un cadru la fiecare incarcare si ar valida
   * codurile de reducere pe o comanda de zero lei.
   */
  hydrated: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}

/**
 * Pentru componentele care apar si acolo unde nu exista cos.
 *
 * Miniaturile din catalogul de design-uri randeaza pagina de produs fara
 * `CartProvider`; cu `useCart()` ar arunca, iar cardul ar ramane alb.
 */
export function useCartOptional(): CartContextValue | null {
  return useContext(CartContext);
}

export function CartProvider({ children, slug, businessId }: { children: ReactNode; slug: string; businessId?: string }) {
  const STORAGE_KEY = `cart_${slug}`;
  const [items, setItems] = useState<CartItem[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Cosul se citeste din localStorage DUPA montare, nu la initializarea starii:
  // pe server nu exista localStorage, iar o stare initiala diferita intre server
  // si client ar produce eroare de hidratare. Regula de lint care interzice
  // setState in efect nu are cum sa acopere cazul asta.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setItems(normalizeazaCos(JSON.parse(stored)));
    } catch {}
    setSessionId(getCartSessionId(slug));
    setHydrated(true);
  }, [STORAGE_KEY, slug]);

  // Alta fila a aceluiasi magazin poate scrie in cos (o pagina custom deschisa
  // fara provider scrie direct in `cart_<slug>`). Fara ascultatorul asta, fila de fata ramane cu
  // vectorul ei vechi si prima apasare pe „+" il scrie peste cel din localStorage:
  // produsul adaugat in cealalta fila dispare, fara niciun semn. Evenimentul
  // `storage` nu se declanseaza in fila care a scris, deci nu se poate face bucla.
  useEffect(() => {
    function laStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      try {
        setItems(e.newValue ? normalizeazaCos(JSON.parse(e.newValue)) : []);
      } catch {}
    }
    window.addEventListener("storage", laStorage);
    return () => window.removeEventListener("storage", laStorage);
  }, [STORAGE_KEY]);

  /**
   * Orice scriere pleaca din forma functionala, niciodata din `items` prins in
   * inchiderea randarii curente: doua apasari pe „+" mai rapide decat un ciclu de
   * randare ar porni amandoua de la acelasi vector, iar a doua ar suprascrie-o pe
   * prima — cantitatea creste cu 1 in loc de 2, si valoarea gresita ajunge si in
   * localStorage.
   */
  function save(schimba: (prev: CartItem[]) => CartItem[]) {
    setItems((prev) => {
      const next = schimba(prev);
      // `setItem` arunca la cota depasita sau in navigare privata, iar de aici ar
      // arunca din INTERIORUL randarii: singura plasa e error boundary-ul de
      // radacina, deci tot magazinul ar deveni pagina de eroare. Cosul degradeaza
      // la „doar in memorie", ca in `cart-session.ts` si in `AddToCartButton`.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  /**
   * `cantitate` exista pentru paginile de produs, care au selector de bucati.
   * Implicit ramane 1, deci apelurile din grila si din quick-add sunt neatinse.
   * Valorile sub 1 sau nefinite cad tot pe 1: o adaugare nu poate scadea cosul.
   */
  function addItem(item: Omit<CartItem, "quantity">, cantitate = 1) {
    const n = normalizeazaCantitate(cantitate);
    save((prev) => {
      const key = lineKey(item);
      const exists = prev.find((i) => lineKey(i) === key);
      return exists
        // Se clemeaza SUMA, nu incrementul: altfel o mie de apasari pe „+" duc
        // linia peste plafon, iar serverul refuza acum toata comanda.
        ? prev.map((i) => (lineKey(i) === key ? { ...i, quantity: normalizeazaCantitate(i.quantity + n) } : i))
        : [...prev, { ...item, quantity: n }];
    });
  }

  /**
   * Inlocuieste linia `cheieVeche` cu una noua — editarea din cos.
   *
   * ⚠ REGULA E IN MODULUL PUR, nu aici: e singura parte din cos in care o gresala scrie in
   * `localStorage` o linie in plus sau una in minus, deci trebuie sa se poata proba fara browser.
   * Vezi `inlocuiesteLinia`, unde stau si cele trei cazuri, si de ce nu „adauga apoi sterge".
   */
  function replaceItem(cheieVeche: string, item: Omit<CartItem, "quantity">, cantitate = 1) {
    save((prev) => inlocuiesteLinia(prev, cheieVeche, item, cantitate));
  }

  function removeItem(key: string) {
    save((prev) => prev.filter((i) => lineKey(i) !== key));
  }

  function updateQty(key: string, qty: number) {
    if (qty <= 0) {
      removeItem(key);
      return;
    }
    // Butoanele „+/-" nu inventeaza o fractie, dar functia e in contextul public
    // al cosului, deci o poate chema orice pagina custom. Fara clema, valoarea
    // primita se si SCRIA in localStorage, de mana noastra.
    const n = normalizeazaCantitate(qty);
    save((prev) => prev.map((i) => (lineKey(i) === key ? { ...i, quantity: n } : i)));
  }

  function clear() {
    save(() => []);
  }

  function restoreCart(next: CartItem[]) {
    save(() => normalizeazaCos(next));
  }

  /**
   * Preturile autoritare ale produselor din cos, citite de la server.
   *
   * Cosul din localStorage tine ce s-a salvat la adaugare, deci un pret vechi de
   * zile daca intre timp comerciantul l-a schimbat. Serverul recalculeaza oricum
   * la plasarea comenzii, deci fara pasul asta cosul arata un numar si comanda
   * pleaca cu altul. Tot de aici vin si treptele de cantitate.
   *
   * Cade pe preturile salvate cand cererea esueaza: un cos care afiseaza ceva
   * usor vechi e mai bun decat unul care nu afiseaza nimic.
   */
  const [preturi, setPreturi] = useState<Awaited<ReturnType<typeof getCartPricing>>>({});
  const cheieProduse = items.map((i) => i.productId).sort().join(",");
  useEffect(() => {
    if (!hydrated || !businessId || !cheieProduse) return;
    let activ = true;
    getCartPricing(businessId, cheieProduse.split(","))
      .then((r) => { if (activ) setPreturi(r); })
      .catch(() => {});
    return () => { activ = false; };
  }, [hydrated, businessId, cheieProduse]);

  /*
   * ⚠ SOCOTEALA S-A MUTAT IN `cart/pret-linie.ts`, si nu de dragul ordinii.
   *
   * Cat traia aici, in componenta, nu putea fi probata fara browser — iar proiectul n-are jsdom.
   * Asa a putut sa intre in productie un cos care arata pretul de CATALOG pentru un produs
   * personalizat, in timp ce serverul incasa pretul adevarat: 89 de lei pe ecran, 778,75 in
   * comanda. Acum e o functie pura, langa o proba care pune fata in fata numarul cosului cu chiar
   * formula pe care o foloseste poarta comenzii.
   */
  const linie = useMemo(() => (item: CartItem) => pretulLiniei(item, preturi[item.productId]), [preturi]);

  const lineTotal = (item: CartItem) => linie(item).subtotal;
  const lineSavings = (item: CartItem) => linie(item).savings;
  // Aceeasi sursa din care porneste si `linie`, expusa ca sa nu mai fie nevoie
  // de `item.price` nicaieri in afara.
  //
  // ⚠ POARTA SI PERSONALIZAREA. Fara ea randul scria „2 buc x 89 lei" langa un
  // total de 1.557,50, si invariantul „unitar x cantitate = total + economie"
  // cadea tocmai pe liniile la care se vede cel mai bine.
  const lineUnit = (item: CartItem) => pretulBucatii(item, preturi[item.productId]);
  /*
   * ⚠ Linia a carei configuratie nu mai e valida fata de definitia de ACUM a produsului.
   *
   * Pretul cade deja pe catalog cand valorile nu se mai potrivesc — dar tace. Fara semnalul asta,
   * clientul vede o suma plauzibila si afla abia la finalizare, cand serverul refuza, ca linia nu
   * se poate comanda. Se intampla cand comerciantul schimba definitia dupa ce omul a pus produsul
   * in cos, iar nimic din asta nu e vina lui.
   */
  const lineNeedsReview = (item: CartItem) => cereRevizuire(item, preturi[item.productId]);
  /*
   * ⚠ Rezumatul se face DIN DEFINITIE, nu din valorile brute — vezi `rezumatulLiniei`. Fara ea,
   * cosul arata id-ul optiunii („91c8409f-8bdf-4a…") in loc de „Premium", si sarea peste
   * comutatoarele pornite, deci „Protectie: Da" nu aparea niciodata.
   */
  const lineSummary = (item: CartItem) => rezumatulLiniei(item, preturi[item.productId]);

  const total = items.reduce((s, i) => s + linie(i).subtotal, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, replaceItem, removeItem, updateQty, lineTotal, lineUnit, lineSavings, lineNeedsReview, lineSummary, total, count, clear, restoreCart, sessionId, hydrated }}
    >
      {children}
    </CartContext.Provider>
  );
}

/**
 * Un cos demonstrativ, tinut doar in memorie.
 *
 * Miniaturile din catalogul de design-uri trebuie sa arate un cos plin, dar
 * ruleaza in dashboard, pe aceeasi origine cu magazinul: orice scriere ar
 * ateriza in cheia `cart_<slug>` a comerciantului si i-ar aparea produsele
 * demonstrative in cosul lui adevarat. Aici nu se citeste si nu se scrie nimic.
 *
 * Sta in acelasi fisier pentru ca `CartContext` e privat modulului — asa
 * `useCart()` merge nemodificat in sertar si in formularul de comanda.
 */
export function CartDemoProvider({ items: initiale, children }: { items: CartItem[]; children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(initiale);

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem: (item, cantitate = 1) => {
          const n = normalizeazaCantitate(cantitate);
          setItems((prev) =>
            prev.some((i) => lineKey(i) === lineKey(item))
              ? prev.map((i) => (lineKey(i) === lineKey(item) ? { ...i, quantity: normalizeazaCantitate(i.quantity + n) } : i))
              : [...prev, { ...item, quantity: n }],
          );
        },
        /*
         * Miniatura de design n-are pagina de produs, deci n-are de unde porni o editare. Ramane
         * definita fiindca tipul contextului o cere, si se poarta cinstit: pune linia noua in
         * LOCUL celei vechi, ca in cosul adevarat.
         */
        replaceItem: (cheieVeche, item, cantitate = 1) => {
          const n = normalizeazaCantitate(cantitate);
          setItems((prev) => {
            const pozitie = prev.findIndex((i) => lineKey(i) === cheieVeche);
            if (pozitie < 0) return [...prev, { ...item, quantity: n }];
            return prev.map((i, idx) => (idx === pozitie ? { ...item, quantity: n } : i));
          });
        },
        // Miniatura nu citeste nimic de la server, deci nu are trepte: pretul de
        // linie ramane inmultirea simpla. Si aici cele doua numere trebuie sa
        // vina din aceeasi sursa, altfel miniatura ar arata comerciantului chiar
        // contradictia pe care tocmai am scos-o din cosul adevarat.
        lineTotal: (item) => item.price * item.quantity,
        lineUnit: (item) => item.price,
        lineSavings: () => 0,
        /* In afara unui `CartProvider` nu exista preturi, deci nici cum sa stim ca ceva s-a stricat. */
        lineNeedsReview: () => false,
        /* Fara `CartProvider` nu exista definitii, deci se cade pe rezumatul din valorile brute. */
        lineSummary: (item) => rezumatPersonalizare(item.customization as Record<string, unknown> | undefined),
        removeItem: (key) => setItems((prev) => prev.filter((i) => lineKey(i) !== key)),
        updateQty: (key, qty) =>
          setItems((prev) =>
            qty <= 0 ? prev.filter((i) => lineKey(i) !== key) : prev.map((i) => (lineKey(i) === key ? { ...i, quantity: qty } : i)),
          ),
        total,
        count,
        clear: () => setItems([]),
        restoreCart: setItems,
        sessionId: "",
        // Cosul demonstrativ e gata din prima randare: nu vine de nicaieri.
        hydrated: true,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
