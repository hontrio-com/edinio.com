"use client";

import {
  X, Phone,
  MapPin, Mail, ChevronRight, Package, User, Home, Loader2, Banknote, CreditCard,
  Truck, Tag, BadgePercent,
} from "lucide-react";
import { EU_COUNTRIES } from "@/lib/eu-countries";
import { CourierSelector } from "@/components/ministore/CourierSelector";
import { OrderBump } from "@/components/ministore/OrderBump";
import type { CheckoutEngine } from "./checkout-core";
import type { CheckoutPreview } from "./checkout-preview";
import { CheckoutCartLines, CheckoutTotals } from "./CheckoutSummary";

/**
 * Campurile finalizarii comenzii — exact aceleasi in modal si pe pagina.
 *
 * Motorul (stare, calcule, trimitere) vine ca prop, deci formularul e scris o
 * singura data si doar asezat in doua feluri. `suprafata` scoate din curgerea
 * lui rezumatul cosului si caseta de totaluri, pe care pagina le arata separat,
 * in coloana din dreapta; altfel ar aparea de doua ori.
 */
const JUDETE = [
  "Municipiul Bucuresti","Alba","Arad","Arges","Bacau","Bihor","Bistrita-Nasaud","Botosani",
  "Braila","Brasov","Buzau","Calarasi","Cluj","Constanta","Covasna","Dambovita","Dolj",
  "Galati","Giurgiu","Gorj","Harghita","Hunedoara","Ialomita","Iasi","Ilfov","Maramures",
  "Mehedinti","Mures","Neamt","Olt","Prahova","Salaj","Satu Mare","Sibiu","Suceava",
  "Teleorman","Timis","Tulcea","Vaslui","Valcea","Vrancea",
];

const fieldCls = "flex-1 px-3 py-2.5 text-sm text-foreground bg-surface placeholder:text-muted-foreground focus:outline-none";

function FieldWrap({ icon: Icon, error, children }: { icon: React.ElementType; error?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex overflow-hidden rounded-lg border ${error ? "border-red-400" : "border-border"} focus-within:border-foreground/40 transition-colors`}>
      <span className="flex items-center justify-center w-10 shrink-0 bg-muted/40">
        <Icon size={15} className="text-muted-foreground" />
      </span>
      {children}
    </div>
  );
}

export function CheckoutForm({
  motor,
  color,
  businessId,
  freeShippingThreshold,
  preview = null,
  suprafata = "modal",
}: {
  motor: CheckoutEngine;
  color: string;
  businessId: string;
  freeShippingThreshold: number | null;
  preview?: CheckoutPreview | null;
  suprafata?: "modal" | "pagina";
}) {
  const {
    acceptedBumps,
    appliedDiscount,
    availablePaymentMethods,
    bumps,
    customFields,
    customValues,
    discountAmount,
    discountError,
    discountInput,
    dpdUseWeight,
    emailField,
    errors,
    extras,
    form,
    goodsTotal,
    grandTotal,
    handleApplyDiscount,
    handleRemoveDiscount,
    handleSubmit,
    hasCouriers,
    hiddenFields,
    intlEnabled,
    isIntl,
    isPending,
    isValidatingDiscount,
    items,
    newsletterOffer,
    newsletterOptIn,
    paymentMethod,
    paymentMethods,
    selectedExtras,
    setCourierSelection,
    setCustomValues,
    setDiscountError,
    setDiscountInput,
    setForm,
    setNewsletterOptIn,
    setPaymentMethod,
    setSelectedExtras,
    setShowDiscountField,
    showDiscountField,
    toggleBump,
    total,
    totalWeightKg,
  } = motor;
  const inFormular = suprafata === "modal";

  return (
        <form onSubmit={preview ? (e) => e.preventDefault() : handleSubmit} className="px-5 pt-4 pb-6 space-y-4">
          {/* Pe pagina, rezumatul comenzii si totalurile stau in coloana din
              dreapta; aici ar aparea a doua oara, cu aceleasi numere. */}
          {inFormular && <CheckoutCartLines motor={motor} color={color} />}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1">Nume complet <span className="text-red-500">*</span></label>
            <FieldWrap icon={User} error={!!errors.name}>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Prenume Nume" className={fieldCls} />
            </FieldWrap>
            {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1">Numar de telefon <span className="text-red-500">*</span></label>
            <FieldWrap icon={Phone} error={!!errors.phone}>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="07XXXXXXXX" type="tel" className={fieldCls} />
            </FieldWrap>
            {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
          </div>
          {(emailField.enabled || isIntl) && (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">
                Email{" "}
                {(emailField.required || isIntl)
                  ? <span className="text-red-500">*</span>
                  : <span className="text-xs font-normal text-muted-foreground">(optional — pentru confirmare comanda)</span>
                }
              </label>
              <FieldWrap icon={Mail} error={!!errors.email}>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="adresa@email.ro" type="email" className={fieldCls} />
              </FieldWrap>
              {errors.email && <p className="text-xs text-red-500 mt-0.5">{errors.email}</p>}
              {newsletterOffer && (
                <label className="flex items-start gap-2 mt-2 cursor-pointer select-none">
                  <input type="checkbox" checked={newsletterOptIn} onChange={e => setNewsletterOptIn(e.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ accentColor: color }} />
                  <span className="text-xs text-muted-foreground">Vreau sa primesc oferte si noutati pe email.</span>
                </label>
              )}
            </div>
          )}
          {intlEnabled && (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">Tara <span className="text-red-500">*</span></label>
              <FieldWrap icon={MapPin}>
                <select aria-label="Tara" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} className={`${fieldCls} bg-surface`}>
                  <option value="RO">Romania</option>
                  {EU_COUNTRIES.map(c => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}
                </select>
              </FieldWrap>
            </div>
          )}
          {isIntl ? (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">Cod postal <span className="text-red-500">*</span></label>
              <FieldWrap icon={MapPin} error={!!errors.postCode}>
                <input value={form.postCode} onChange={e => setForm(f => ({ ...f, postCode: e.target.value }))} placeholder="Cod postal" className={fieldCls} />
              </FieldWrap>
              {errors.postCode && <p className="text-xs text-red-500 mt-0.5">{errors.postCode}</p>}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">Judet <span className="text-red-500">*</span></label>
              <FieldWrap icon={MapPin} error={!!errors.county}>
                <select aria-label="Judet" value={form.county} onChange={e => setForm(f => ({ ...f, county: e.target.value }))} className={`${fieldCls} bg-surface`}>
                  <option value="">Selecteaza judetul</option>
                  {JUDETE.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </FieldWrap>
              {errors.county && <p className="text-xs text-red-500 mt-0.5">{errors.county}</p>}
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1">Oras <span className="text-red-500">*</span></label>
            <FieldWrap icon={MapPin} error={!!errors.city}>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Oras / Localitate" className={fieldCls} />
            </FieldWrap>
            {errors.city && <p className="text-xs text-red-500 mt-0.5">{errors.city}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1">Adresa <span className="text-red-500">*</span></label>
            <FieldWrap icon={Home} error={!!errors.address}>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Strada, nr., bloc, ap." className={fieldCls} />
            </FieldWrap>
            {errors.address && <p className="text-xs text-red-500 mt-0.5">{errors.address}</p>}
          </div>
          {/* Courier selection */}
          {hasCouriers && (
            <CourierSelector
              businessId={businessId}
              county={form.county}
              city={form.city}
              color={color}
              country={isIntl ? form.country : undefined}
              postCode={isIntl ? form.postCode : undefined}
              weightKg={isIntl && dpdUseWeight && totalWeightKg > 0 ? totalWeightKg : undefined}
              cod={paymentMethod === "cash_on_delivery" ? total : 0}
              cart={items.map((i) => ({ productId: i.productId, quantity: i.quantity }))}
              subtotal={Math.max(0, goodsTotal - discountAmount)}
              onSelect={setCourierSelection}
              optiuniDemo={preview?.courierOptions}
            />
          )}
          {errors.courier && <p className="text-xs text-red-500 mt-0.5">{errors.courier}</p>}
          {/* Custom fields */}
          {customFields.map(field => (
            <div key={field.id}>
              <label className="block text-sm font-semibold text-foreground mb-1">
                {field.label || "Camp"} {field.required && <span className="text-red-500">*</span>}
              </label>
              {field.type === "text" && (
                <FieldWrap icon={Package} error={!!errors[field.id]}>
                  <input value={customValues[field.id] ?? ""} placeholder={field.placeholder ?? ""}
                    onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.value }))}
                    className={fieldCls} />
                </FieldWrap>
              )}
              {field.type === "textarea" && (
                <textarea value={customValues[field.id] ?? ""} rows={3}
                  placeholder={field.placeholder ?? ""}
                  onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm text-foreground bg-surface border border-border rounded-lg focus:outline-none focus:border-foreground/40 resize-none" />
              )}
              {field.type === "select" && (
                <FieldWrap icon={Package} error={!!errors[field.id]}>
                  <select aria-label={field.label} value={customValues[field.id] ?? ""}
                    onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.value }))}
                    className={`${fieldCls} bg-surface`}>
                    <option value="">Selecteaza...</option>
                    {(field.options ?? "").split(",").map(opt => opt.trim()).filter(Boolean).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </FieldWrap>
              )}
              {field.type === "checkbox" && (
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={customValues[field.id] === "da"}
                    onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.checked ? "da" : "nu" }))}
                    className="w-4 h-4 rounded" style={{ accentColor: color }} />
                  <span className="text-sm text-foreground">{field.placeholder || field.label}</span>
                </label>
              )}
              {errors[field.id] && <p className="text-xs text-red-500 mt-0.5">{errors[field.id]}</p>}
            </div>
          ))}

          {/* Order bumps — a real discounted product added with one tap */}
          <OrderBump bumps={bumps} color={color} acceptedIds={acceptedBumps} onToggle={toggleBump} />

          {/* Extras */}
          {extras.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Optiuni suplimentare</p>
              {extras.map(extra => {
                const checked = !!selectedExtras[extra.id];
                return (
                  <button key={extra.id} type="button"
                    onClick={() => setSelectedExtras(s => ({ ...s, [extra.id]: !s[extra.id] }))}
                    className="w-full text-left rounded-xl border-2 border-dashed p-3.5 transition-all"
                    style={checked
                      ? { borderColor: color, backgroundColor: `${color}08` }
                      : { borderColor: "var(--color-border)", backgroundColor: "transparent" }}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors"
                          style={checked ? { borderColor: color, backgroundColor: color } : { borderColor: "var(--color-border)" }}>
                          {checked && (
                            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-tight">{extra.label}</p>
                          {extra.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{extra.description}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-bold flex-shrink-0" style={{ color }}>+{extra.price} lei</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Discount code — collapsed behind a link until needed */}
          {!hiddenFields.includes("discount") && (appliedDiscount || showDiscountField ? <div>
            <label className="block text-sm font-semibold text-foreground mb-1">
              Cod discount
            </label>
            {appliedDiscount ? (
              /* Applied discount banner */
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border-2" style={{ borderColor: `${color}55`, backgroundColor: `${color}12` }}>
                {appliedDiscount.type === "free_shipping"
                  ? <Truck size={15} className="flex-shrink-0" style={{ color }} />
                  : <BadgePercent size={15} className="flex-shrink-0" style={{ color }} />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold font-mono" style={{ color }}>{appliedDiscount.code}</p>
                  <p className="text-xs text-muted-foreground">
                    {appliedDiscount.type === "percent" && `${appliedDiscount.value}% reducere`}
                    {appliedDiscount.type === "fixed" && `${appliedDiscount.value} lei reducere`}
                    {appliedDiscount.type === "free_shipping" && "Transport gratuit aplicat"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveDiscount}
                  className="p-1 rounded-full hover:bg-muted transition-colors flex-shrink-0"
                >
                  <X size={14} style={{ color }} />
                </button>
              </div>
            ) : (
              /* Input + Apply button */
              <div className="flex gap-2">
                <div className="flex flex-1 overflow-hidden rounded-lg border border-border focus-within:border-foreground/40 transition-colors">
                  <span className="flex items-center justify-center w-10 shrink-0 bg-muted/40">
                    <Tag size={15} className="text-muted-foreground" />
                  </span>
                  <input
                    value={discountInput}
                    onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(""); }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleApplyDiscount(); } }}
                    placeholder="COD DISCOUNT"
                    className="flex-1 px-3 py-2.5 text-sm text-foreground bg-surface placeholder:text-muted-foreground focus:outline-none font-mono tracking-widest"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyDiscount}
                  disabled={isValidatingDiscount || !discountInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
                  style={{ backgroundColor: color }}
                >
                  {isValidatingDiscount
                    ? <Loader2 size={14} className="animate-spin" />
                    : <ChevronRight size={14} />}
                  Aplica
                </button>
              </div>
            )}
            {discountError && <p className="text-xs text-red-500 mt-1">{discountError}</p>}
          </div> : (
            <button type="button" onClick={() => setShowDiscountField(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Tag size={14} /> Ai un cod de reducere?
            </button>
          ))}

          {inFormular && <CheckoutTotals motor={motor} color={color} freeShippingThreshold={freeShippingThreshold} />}
          {/* Payment method toggle */}
          {availablePaymentMethods.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Metoda de plata</p>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(availablePaymentMethods.length, 3)}, minmax(0, 1fr))` }}>
                {availablePaymentMethods.map((m) => (
                  <button key={m.type} type="button" onClick={() => setPaymentMethod(m.type)}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
                    style={paymentMethod === m.type
                      ? { borderColor: color, backgroundColor: `${color}12`, color: "var(--color-foreground)" }
                      : { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-muted-foreground)" }}>
                    {m.type === "cash_on_delivery" ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {errors._ && <p className="text-sm text-red-500 text-center">{errors._}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center justify-center gap-3 py-4 font-bold text-base text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
            style={{ backgroundColor: color, boxShadow: `0px 2px 12px ${color}55` }}
          >
            {isPending
              ? <><Loader2 className="h-[18px] w-[18px] animate-spin" />Se proceseaza...</>
              : paymentMethod === "cash_on_delivery"
                ? <><Banknote className="h-5 w-5" />Plata la livrare - {grandTotal} lei</>
                : <><CreditCard className="h-5 w-5" />{paymentMethods.find((m) => m.type === paymentMethod)?.label ?? "Plateste"} - {grandTotal} lei</>
            }
          </button>
          <p className="text-center text-xs text-muted-foreground">
            {paymentMethod === "cash_on_delivery"
              ? "Platesti cash curierului - Fara card necesar"
              : "Vei fi redirectionat pentru plata securizata"}
          </p>
        </form>
  );
}
