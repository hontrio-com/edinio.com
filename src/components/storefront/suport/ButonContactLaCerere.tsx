"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { ButonContact as ButonContactIntreg } from "./ButonContact";

/*
 * Butonul de contact, adus la cerere.
 *
 * ⚠ DE CE EXISTA. Layoutul vitrinei e o componenta de server, iar ce importa el drept componenta de client ajunge
 * in ACELASI pachet de JavaScript, descarcat de fiecare magazin, cu sau fara chat. Masurat pe build-ul de
 * productie (22.11.2026): codul butonului venea si la magazinele fara chat, la pachet cu bannerul de cookie-uri.
 *
 * `next/dynamic` chemat dintr-o componenta de server NU desparte codul (ghidul Next „Lazy loading”: „automatic
 * code splitting is currently not supported”); chemat dintr-una de client, da. Deci layoutul importa doar
 * invelisul asta, de cateva randuri, iar butonul sta in bucata lui, ceruta numai de magazinele care il deseneaza.
 *
 * `ssr: false`: butonul oricum nu se randeaza pe server (sta sub `DoarInMagazinReal`, care la hidratare raspunde
 * „nu e magazinul real”), deci nu are ce cauta nici in pachetul de server al paginii.
 */
const ButonContact = dynamic(() => import("./ButonContact").then((m) => m.ButonContact), { ssr: false });

export function ButonContactLaCerere(props: ComponentProps<typeof ButonContactIntreg>) {
  return <ButonContact {...props} />;
}
