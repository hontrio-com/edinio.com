"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Ce fel de buton de chat are magazinul, spus componentelor de dedesubt.
 *
 *   - `fara`: magazinul nu are chat. E si valoarea din afara providerului, deci un magazin fara chat nu
 *     primeste niciun element in plus in pagina: totul ramane ca inainte;
 *   - `magazin`: butonul nostru, montat in layout pe TOATE paginile. El tine la un loc chatul, WhatsApp si
 *     telefonul, deci stiva veche „Contact rapid” din `MiniStoreRenderer` nu se mai deseneaza;
 *   - `furnizor`: butonul furnizorului (Tidio, tawk.to, Intercom, Zendesk), pus de scriptul lui in coltul de
 *     jos. Stiva veche ramane, dar urca deasupra lui.
 *
 * ⚠ Se hotaraste O SINGURA DATA, in layoutul magazinului, din randul pe care il citeste deja.
 */
export type ModChat = "fara" | "magazin" | "furnizor";

const Context = createContext<ModChat>("fara");

export function ChatInMagazinProvider({ mod, children }: { mod: ModChat; children: ReactNode }) {
  return <Context.Provider value={mod}>{children}</Context.Provider>;
}

export function useChatInMagazin(): ModChat {
  return useContext(Context);
}
