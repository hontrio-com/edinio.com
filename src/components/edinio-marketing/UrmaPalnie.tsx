"use client";

import { useEffect, useRef } from "react";
import { urmareste } from "@/lib/edinio-marketing/magistrala";
import { desfaJeton } from "@/lib/edinio-marketing/jeton-cont-nou";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  PALNIA NOASTRA: CONT NOU SI PASII DE ONBOARDING
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ ASTA E SINGURA PARTE UNDE MASURAREA NOASTRA TRECE DE PE SITE-UL DE PREZENTARE
  IN APLICATIE. Si tot masurarea NOASTRA ramane: e palnia Edinio, nu a vreunui
  comerciant. Magazinele lor n-au nicio legatura cu ce se intampla aici.
*/

const CHEIE_SEMNAL = "edinio_signup";

function citesteJeton(): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${CHEIE_SEMNAL}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function stergeJeton(): void {
  try {
    document.cookie = `${CHEIE_SEMNAL}=; Max-Age=0; path=/`;
  } catch { /* fara cookie-uri: n-are ce sterge */ }
}

/**
 * Contul nou, masurat O SINGURA DATA.
 *
 * ⚠ DE CE NU LA SOSIREA PE ONBOARDING. Acolo ajunge si cine revine peste o
 * saptamana la un cont vechi — conversia s-ar numara de fiecare data, iar
 * numarul de conturi noi ar fi de cateva ori mai mare decat adevarul. Fara sa
 * cada nimic, si crescand, deci nimeni nu l-ar pune la indoiala.
 *
 * Semnalul vine de la SERVER, din doua locuri: `register()` pentru email si
 * parola, si aterizarea OAuth pentru Google. Se citeste o data si se sterge.
 *
 * ⚠ COMPONENTA NU MAI PRIMESTE ORIGINEA CA PROP. Layoutul scria `"register"`
 * pentru toata lumea — corect cat timp singura cale era emailul, mincinos din
 * clipa in care se numara si Google. Iar despartirea aia e tocmai ce ne
 * intereseaza: 28 din 168 de conturi vin prin Google. Serverul stie adevarul,
 * deci el il spune, in chiar jetonul pe care il scrie.
 */
export function UrmaContNou() {
  const tras = useRef(false);

  useEffect(() => {
    if (tras.current) return;
    const jeton = citesteJeton();
    if (!jeton) return;
    tras.current = true;
    stergeJeton();

    /*
      ⚠ `event_id` E AMPRENTA CONTULUI, calculata pe server din id-ul lui. Cand se
      adauga Meta CAPI, serverul o poate calcula din nou, identic, fara sa care
      nimeni nimic prin cookie-uri — altfel un singur cont nou ar aparea ca doua
      conversii. Vezi `lib/edinio-marketing/cont-nou.ts`.
    */
    const { id, origine } = desfaJeton(jeton);
    urmareste({ name: "sign_up", signup_origin: origine, event_id: id });
  }, []);

  return null;
}

/**
 * Un pas de onboarding, vazut.
 *
 * ⚠ VAZUT, nu terminat. Cele doua se confunda usor si dau rapoarte care spun ca
 * toata lumea termina tot: „a ajuns la pasul 2" nu inseamna „a terminat pasul 1"
 * daca omul poate sari inapoi. Terminarea se masoara separat, de la actiunea care
 * chiar salveaza.
 */
export function UrmaPasOnboarding({ pas, index }: { pas: string; index: number }) {
  const vazut = useRef<string | null>(null);

  useEffect(() => {
    if (vazut.current === pas) return;
    vazut.current = pas;
    urmareste({ name: "onboarding_step_view", onboarding_step: pas, onboarding_step_index: index });
  }, [pas, index]);

  return null;
}
