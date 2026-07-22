/**
 * Company legal identification block shown in the storefront footer.
 *
 * Romanian e-commerce law (and card payment processors such as Netopia) require
 * the trader's full identification data to be publicly visible on the site:
 * company name, CUI, Trade Register number (Nr. Reg. Com.), registered office
 * (sediu social) and place of business (punct de lucru).
 *
 * Renders nothing unless the store has a CUI on file — i.e. it only appears for
 * registered entities, never for stores that haven't entered legal data yet.
 */
export interface CompanyIdentityBusiness {
  business_name: string;
  cui: string | null;
  reg_com: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  store_address: string | null;
  store_city: string | null;
  store_county: string | null;
}

function joinAddress(parts: (string | null)[]): string {
  return parts.map((p) => p?.trim()).filter(Boolean).join(", ");
}

export function CompanyIdentity({ business }: { business: CompanyIdentityBusiness }) {
  const cui = business.cui?.trim();
  // Only registered entities (with a fiscal code) show the legal block.
  if (!cui) return null;

  const sediu = joinAddress([business.address, business.city, business.county]);
  const punctLucru = joinAddress([business.store_address, business.store_city, business.store_county]);
  // Show "punct de lucru" only when set and materially different from the seat.
  const showPunctLucru = punctLucru && punctLucru !== sediu;

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Date de identificare</p>
      <div className="space-y-1 text-[12px] leading-relaxed text-white/50">
        <p className="text-white/70 font-medium">{business.business_name}</p>
        <p>CUI: {cui}</p>
        {business.reg_com?.trim() && <p>Nr. Reg. Com.: {business.reg_com.trim()}</p>}
        {sediu && <p>Sediu social: {sediu}</p>}
        {showPunctLucru && <p>Punct de lucru: {punctLucru}</p>}
      </div>
    </div>
  );
}
