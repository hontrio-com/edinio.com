"use client";

import { useState } from "react";
import { ChevronDown, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { submitMigrationLead } from "@/lib/actions/migration.actions";

const PLATFORMS = ["Shopify", "Gomag", "MerchantPro", "WooCommerce", "Sellavi", "Alta"];

export function MigrationForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [platform, setPlatform] = useState("");
  const [productsCount, setProductsCount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await submitMigrationLead({ name, phone, platform, productsCount });
    setLoading(false);
    if (res.ok) {
      setDone(true);
    } else {
      setError(res.error);
    }
  }

  if (done) {
    return (
      <div className="text-center py-10 px-6">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-5">
          <CheckCircle2 className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-xl font-bold text-gray-900">Cererea ta a fost trimisa</h3>
        <p className="mt-2 text-gray-500 max-w-sm mx-auto">
          Un membru al echipei Edinio te va suna in cel mai scurt timp pentru a incepe migrarea gratuita.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="mg-name" className="block text-sm font-medium text-gray-700 mb-1.5">
          Nume complet
        </label>
        <input
          id="mg-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ion Popescu"
          className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label htmlFor="mg-phone" className="block text-sm font-medium text-gray-700 mb-1.5">
          Numar de telefon <span className="text-primary">*</span>
        </label>
        <input
          id="mg-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="07XX XXX XXX"
          className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label htmlFor="mg-platform" className="block text-sm font-medium text-gray-700 mb-1.5">
          Pe ce platforma esti acum?
        </label>
        <div className="relative">
          <select
            id="mg-platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full h-12 px-4 pr-10 rounded-xl border border-gray-200 bg-white text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
          >
            <option value="" disabled>
              Alege platforma
            </option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        </div>
      </div>

      <div>
        <label htmlFor="mg-products" className="block text-sm font-medium text-gray-700 mb-1.5">
          Cate produse ai aproximativ?
        </label>
        <input
          id="mg-products"
          type="text"
          inputMode="numeric"
          value={productsCount}
          onChange={(e) => setProductsCount(e.target.value)}
          placeholder="ex. 250"
          className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-white font-semibold transition-colors hover:bg-primary/90 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Se trimite...
          </>
        ) : (
          <>
            Trimite cererea
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <p className="text-center text-xs text-gray-400">
        Te sunam noi. Fara obligatii, fara costuri.
      </p>
    </form>
  );
}
