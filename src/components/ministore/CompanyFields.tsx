"use client";

import { useState, useId, useRef } from "react";
import { Building2, Search, Loader2, MapPin, Home, FileText, AlertTriangle, Check } from "lucide-react";
import { lookupCuiPublic } from "@/lib/actions/anaf.actions";
import { isValidCui, normalizeCui } from "@/lib/anaf/cui";
import { JUDETE } from "@/lib/ro/judete";
import type { BillingCompanyInput } from "@/lib/billing/company";

/**
 * Comanda pe firma: alegerea „persoana fizica / persoana juridica" si datele de
 * facturare, cu autocompletare din ANAF.
 *
 * Scrisa o singura data fiindca formularul de comanda exista in DOUA
 * implementari care nu s-au unit niciodata: motorul pe cos (`checkout-core.ts` +
 * `CheckoutForm.tsx`) si modalul „cumpara acum" (`OrderModal.tsx`). O a doua
 * copie a campurilor astea ar insemna, peste cateva luni, doua reguli de
 * validare a CUI-ului si doua feluri de a completa o factura.
 *
 * DATELE DE AICI NU ATING ADRESA DE LIVRARE. Judetul si orasul de facturare sunt
 * ale sediului fiscal; livrarea isi pastreaza campurile ei. Amestecate, ar fi
 * schimbat destinatia dupa ce clientul si-a ales curierul, iar cotatia de
 * transport e semnata pe destinatie: pretul afisat si cel incasat ar fi ajuns sa
 * difere in tacere.
 */

export interface CompanyBillingState {
  entityType: "pf" | "pj";
  cui: string;
  companyName: string;
  regCom: string;
  address: string;
  city: string;
  county: string;
  vatPayer: boolean;
  /** ANAF a confirmat CUI-ul exact asa cum e scris acum in camp. */
  verified: boolean;
  /** Firma e declarata inactiva fiscal. Se spune, nu se opreste comanda. */
  inactive: boolean;
}

export const COMPANY_INITIAL: CompanyBillingState = {
  entityType: "pf",
  cui: "",
  companyName: "",
  regCom: "",
  address: "",
  city: "",
  county: "",
  vatPayer: false,
  verified: false,
  inactive: false,
};

/** Starea, cautarea ANAF si validarea. Fara niciun pic de marcaj. */
export function useCompanyBilling(activ: boolean) {
  const [company, setCompany] = useState<CompanyBillingState>(COMPANY_INITIAL);
  const [anafLoading, setAnafLoading] = useState(false);
  const [anafError, setAnafError] = useState("");
  /**
   * Codul pentru care e in zbor o cautare. Un `ref`, nu o stare: se citeste DUPA
   * `await`, iar o stare citita acolo ar fi cea din randarea in care a pornit
   * cererea, adica exact valoarea invechita de care ne aparam.
   */
  const cuiCerut = useRef("");

  const ePj = activ && company.entityType === "pj";

  /**
   * Tastarea in campul de CUI sterge ce nu mai are cum sa fie adevarat.
   *
   * `vatPayer` se goleste fiindca e SINGURUL camp fara niciun control pe ecran:
   * clientul nu-l poate corecta, nu-l poate vedea si nu-l poate scrie. Lasat pe
   * loc, cineva care cauta firma A (platitoare de TVA) si apoi tasteaza CUI-ul
   * firmei B fara sa mai apese butonul trimitea „platitor de TVA" pentru B — un
   * „RO" pe factura pentru cineva neinregistrat.
   *
   * Denumirea, numarul de la registrul comertului si adresa RAMAN. Toate trei au
   * casuta lor, in care clientul poate scrie singur — iar cand ANAF e cazut,
   * formularul chiar asta ii cere. Golite la fiecare tasta din campul de CUI, s-ar
   * sterge sub ochii lui exact ce tocmai a completat de mana.
   */
  function scrieCui(valoare: string) {
    setAnafError("");
    // Orice raspuns aflat in zbor devine, din clipa asta, pentru alt cod.
    cuiCerut.current = "";
    setCompany((c) => ({ ...c, cui: valoare, verified: false, inactive: false, vatPayer: false }));
  }

  async function cautaCui() {
    const cifre = normalizeCui(company.cui);
    if (!isValidCui(cifre)) {
      setAnafError("CUI invalid. Verifica cifrele.");
      return;
    }
    cuiCerut.current = cifre;
    setAnafLoading(true);
    setAnafError("");
    try {
      const r = await lookupCuiPublic(cifre);
      // Raspunsul se aplica doar daca in camp mai sta codul pentru care a fost
      // cerut. Cererea poate dura pana la zece secunde, iar clientul are timp sa
      // corecteze codul intre timp; fara garda, „CUI negasit" pentru codul VECHI
      // ar aparea rosu sub codul NOU, care e perfect valid.
      if (cuiCerut.current !== cifre) return;

      if (!r.ok) {
        setAnafError(r.error);
        setCompany((c) => ({ ...c, verified: false }));
        return;
      }
      const d = r.company;
      setCompany((c) => ({
          ...c,
          cui: d.cui,
          companyName: d.business_name,
          regCom: d.reg_com || c.regCom,
          // Campurile de adresa se completeaza doar daca ANAF chiar are ce pune:
          // sters peste ce a scris clientul de mana ar fi o pierdere, nu un ajutor.
          address: d.address || c.address,
          city: d.city || c.city,
          county: d.county || c.county,
          vatPayer: d.vat_payer,
          inactive: d.inactive,
          verified: true,
      }));
    } catch {
      setAnafError("Eroare la interogarea ANAF. Completeaza datele manual.");
    } finally {
      setAnafLoading(false);
    }
  }

  /**
   * Cheia primului camp gresit, sau `null`. Aceeasi conventie ca restul
   * formularului: motorul muta focusul pe campul cu `name` egal cu cheia.
   *
   * Confirmarea ANAF NU e obligatorie ca sa se poata comanda. Daca serviciul
   * statului e cazut — se intampla — o comanda buna nu are de ce sa se piarda;
   * serverul reverifica oricum inainte de a scrie ceva pe factura.
   */
  function validateCompany(): Record<string, string> {
    if (!ePj) return {};
    const e: Record<string, string> = {};
    if (!isValidCui(company.cui)) e.cui = "CUI invalid";
    if (company.companyName.trim().length < 2) e.companyName = "Introduceti denumirea firmei";
    return e;
  }

  /** Ce pleaca spre server. `null` pentru persoana fizica: comanda ramane ca azi. */
  function billingPayload(): BillingCompanyInput | null {
    if (!ePj) return null;
    return {
      cui: normalizeCui(company.cui),
      company_name: company.companyName.trim(),
      reg_com: company.regCom.trim(),
      address: company.address.trim(),
      city: company.city.trim(),
      county: company.county.trim(),
      vat_payer: company.vatPayer,
    };
  }

  return { company, setCompany, scrieCui, ePj, anafLoading, anafError, cautaCui, validateCompany, billingPayload };
}

export type CompanyBillingEngine = ReturnType<typeof useCompanyBilling>;

// ─── Marcaj ───────────────────────────────────────────────────────────────────

export function CompanyFields({
  motor,
  color,
  errors,
  fieldCls,
  Wrap,
}: {
  motor: CompanyBillingEngine;
  color: string;
  errors: Record<string, string>;
  /** Clasele campurilor formularului gazda, ca sa arate ca el, nu ca altceva. */
  fieldCls: string;
  /** Invelisul cu iconita al formularului gazda (`FieldWrap` / `IconInput`). */
  Wrap: React.ComponentType<{ icon: React.ElementType; error?: boolean; children: React.ReactNode }>;
}) {
  const { company, setCompany, scrieCui, ePj, anafLoading, anafError, cautaCui } = motor;
  const uid = useId();

  return (
    <div className="space-y-4">
      <div>
        <span className="block text-sm font-semibold text-foreground mb-1.5">Tip client</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tip client">
          {([
            { id: "pf", label: "Persoana fizica" },
            { id: "pj", label: "Persoana juridica" },
          ] as const).map((opt) => {
            const activ = company.entityType === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={activ}
                onClick={() => setCompany((c) => ({ ...c, entityType: opt.id }))}
                className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                  activ ? "text-white" : "border-border text-muted-foreground bg-surface hover:border-foreground/30"
                }`}
                style={activ ? { backgroundColor: color, borderColor: color } : undefined}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {ePj && (
        <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">
            Datele de mai jos apar pe factura. Livrarea se face la adresa completata mai sus.
          </p>

          <div>
            <label htmlFor={`${uid}-cui`} className="block text-sm font-semibold text-foreground mb-1">
              CUI <span className="text-red-500">*</span>
            </label>
            {/* `min-w-0` NU e cosmetica. Intr-un rand flex, elementul are implicit
                `min-width: auto`, adica nu coboara sub latimea intrinseca a
                input-ului din el (un <input> are o latime proprie de ~20 de
                caractere). Butonul de alaturi e `shrink-0`, deci pe coloana
                ingusta a formularului de comanda randul iesea din card si butonul
                aparea taiat. Cu `min-w-0` campul cedeaza latime, nu butonul. */}
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <Wrap icon={Building2} error={!!errors.cui}>
                  <input
                    id={`${uid}-cui`}
                    name="cui"
                    value={company.cui}
                    onChange={(e) => scrieCui(e.target.value)}
                    // Fara asta, Enter in campul de CUI trimitea FORMULARUL, adica
                    // plasa comanda: butonul de langa e `type="button"`, deci
                    // trimiterea implicita a formularului ramanea singura actiune
                    // legata de tasta. Aici Enter face ce arata butonul de langa.
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (!anafLoading && company.cui.trim()) void cautaCui();
                    }}
                    placeholder="ex: RO12345678"
                    inputMode="numeric"
                    aria-invalid={errors.cui ? true : undefined}
                    aria-describedby={errors.cui ? `${uid}-cui-err` : undefined}
                    // Acelasi motiv o treapta mai jos: input-ul e la randul lui
                    // element flex in interiorul invelisului cu iconita.
                    className={`${fieldCls} min-w-0`}
                  />
                </Wrap>
              </div>
              <button
                type="button"
                onClick={cautaCui}
                disabled={anafLoading || !company.cui.trim()}
                className="flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-50 whitespace-nowrap shrink-0"
                style={{ backgroundColor: color }}
              >
                {anafLoading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Search className="h-3.5 w-3.5 shrink-0" />}
                <span className="hidden min-[380px]:inline">{anafLoading ? "Se cauta..." : "Completeaza automat"}</span>
                <span className="sr-only min-[380px]:hidden">Completeaza automat din ANAF</span>
              </button>
            </div>
            {errors.cui && <p id={`${uid}-cui-err`} role="alert" className="text-xs text-red-500 mt-0.5">{errors.cui}</p>}
            {anafError && <p role="alert" className="text-xs text-red-500 mt-0.5">{anafError}</p>}
            {!anafError && company.verified && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 shrink-0" />
                Date preluate din ANAF{company.vatPayer ? ", platitor de TVA" : ", neplatitor de TVA"}.
              </p>
            )}
            {/* Sub 380px butonul ramane doar cu lupa, deci indrumarea nu are voie
                sa-l numeasca: clientul ar cauta pe ecran un text care nu exista. */}
            {!anafError && !company.verified && (
              <p className="mt-1 text-xs text-muted-foreground">
                Apasa{" "}
                <span className="hidden min-[380px]:inline">&bdquo;Completeaza automat&rdquo;</span>
                <span className="min-[380px]:hidden">butonul cu lupa de langa camp</span>{" "}
                ca sa preiei datele firmei din ANAF.
              </p>
            )}
            {company.inactive && (
              <p role="alert" className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                Firma figureaza ca inactiva fiscal in registrul ANAF.
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${uid}-companyName`} className="block text-sm font-semibold text-foreground mb-1">
              Denumire firma <span className="text-red-500">*</span>
            </label>
            <Wrap icon={Building2} error={!!errors.companyName}>
              <input
                id={`${uid}-companyName`}
                name="companyName"
                autoComplete="organization"
                value={company.companyName}
                onChange={(e) => setCompany((c) => ({ ...c, companyName: e.target.value }))}
                placeholder="ex: SC Exemplu SRL"
                aria-invalid={errors.companyName ? true : undefined}
                aria-describedby={errors.companyName ? `${uid}-companyName-err` : undefined}
                className={fieldCls}
              />
            </Wrap>
            {errors.companyName && (
              <p id={`${uid}-companyName-err`} role="alert" className="text-xs text-red-500 mt-0.5">{errors.companyName}</p>
            )}
          </div>

          <div>
            <label htmlFor={`${uid}-regCom`} className="block text-sm font-semibold text-foreground mb-1">
              Nr. registrul comertului <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <Wrap icon={FileText}>
              <input
                id={`${uid}-regCom`}
                name="regCom"
                value={company.regCom}
                onChange={(e) => setCompany((c) => ({ ...c, regCom: e.target.value }))}
                placeholder="ex: J40/1234/2020"
                className={fieldCls}
              />
            </Wrap>
          </div>

          <div>
            <label htmlFor={`${uid}-companyCounty`} className="block text-sm font-semibold text-foreground mb-1">
              Judet sediu <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <Wrap icon={MapPin}>
              <select
                id={`${uid}-companyCounty`}
                name="companyCounty"
                aria-label="Judet sediu"
                value={company.county}
                onChange={(e) => setCompany((c) => ({ ...c, county: e.target.value }))}
                className={`${fieldCls} bg-surface`}
              >
                <option value="">Selecteaza judetul</option>
                {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>
            </Wrap>
          </div>

          <div>
            <label htmlFor={`${uid}-companyCity`} className="block text-sm font-semibold text-foreground mb-1">
              Oras sediu <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <Wrap icon={MapPin}>
              <input
                id={`${uid}-companyCity`}
                name="companyCity"
                value={company.city}
                onChange={(e) => setCompany((c) => ({ ...c, city: e.target.value }))}
                placeholder="Oras / Localitate"
                className={fieldCls}
              />
            </Wrap>
          </div>

          <div>
            <label htmlFor={`${uid}-companyAddress`} className="block text-sm font-semibold text-foreground mb-1">
              Adresa sediu <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <Wrap icon={Home}>
              <input
                id={`${uid}-companyAddress`}
                name="companyAddress"
                value={company.address}
                onChange={(e) => setCompany((c) => ({ ...c, address: e.target.value }))}
                placeholder="Strada, nr., bloc, ap."
                className={fieldCls}
              />
            </Wrap>
          </div>
        </div>
      )}
    </div>
  );
}
