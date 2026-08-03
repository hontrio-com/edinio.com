"use client";

import { useState, useEffect, useRef } from "react";
import { Truck, MapPin, Package, Loader2, Search, X, ChevronDown } from "lucide-react";
import { getShippingOptions, getLockers, type ShippingOption, type LockerItem } from "@/lib/actions/shipping.actions";

/**
 * Brokers (Woot, Colete Online) return several offers under one courier id —
 * disambiguate by service.
 *
 * La nivel de modul, nu in componenta: e o functie pura de argumentul ei si e
 * nevoie de ea si la initializarea starii, inainte de corpul componentei.
 */
function optionKey(o: ShippingOption) {
  return `${o.courier}::${o.deliveryType}::${o.wootServiceId ?? ""}::${o.coleteServiceId ?? ""}`;
}

export interface CourierSelection {
  courier: string;
  courierLabel: string;
  deliveryType: "address" | "locker";
  price: number;
  lockerId?: string;
  lockerName?: string;
  lockerAddress?: string;
  // Locker's own city/county — couriers (FAN Courier) require the AWB to carry
  // the locker's locality, not the customer's, so they must survive into the order.
  lockerCity?: string;
  lockerCounty?: string;
  wootServiceId?: number;
  wootCourierName?: string;
  wootServiceName?: string;
  coleteServiceId?: number;
  coleteServiceName?: string;
  /** Semnatura pretului cotat, dusa mai departe pana la plasarea comenzii. */
  token?: string;
}

interface Props {
  businessId: string;
  county: string;
  city: string;
  cod?: number;
  color: string;
  /** EU ISO alpha-2 for international; absent or "RO" = domestic. */
  country?: string;
  /** Required for international (used by DPD to price + create the AWB). */
  postCode?: string;
  /** Cart lines for conditional shipping rules (weight/value/class-based pricing). */
  cart?: { productId: string; quantity: number }[];
  /** Goods value after promo — feeds value-based shipping rules. */
  subtotal?: number;
  onSelect: (selection: CourierSelection | null) => void;
  /**
   * Optiuni date de-a gata, pentru miniatura din catalogul de design-uri: nu se
   * mai cere nicio cotatie. Fara ele, fiecare card din galerie ar intreba live
   * Sameday, FAN, Cargus, DPD, Woot si Colete cu contul comerciantului.
   */
  optiuniDemo?: ShippingOption[];
}

export function CourierSelector({ businessId, county, city, cod, color, country, postCode, cart, subtotal, onSelect, optiuniDemo }: Props) {
  const [options, setOptions] = useState<ShippingOption[]>(optiuniDemo ?? []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(optiuniDemo?.[0] ? optionKey(optiuniDemo[0]) : null);
  const [lockers, setLockers] = useState<LockerItem[]>([]);
  const [lockersLoading, setLockersLoading] = useState(false);
  const [lockerSearch, setLockerSearch] = useState("");
  const [selectedLocker, setSelectedLocker] = useState<LockerItem | null>(null);
  const [lockerDropdownOpen, setLockerDropdownOpen] = useState(false);
  const prevKey = useRef("");
  const reqId = useRef(0);

  const isIntl = !!country && country.toUpperCase() !== "RO";
  // Domestic needs county+city; international needs country+postCode+city.
  const ready = isIntl
    ? (!!postCode && postCode.trim().length >= 3 && city.trim().length >= 2)
    : (!!county && city.trim().length >= 2);

  // Stable signature of the cart — recomputes options when contents/value change
  // (conditional rules depend on weight/classes/value derived from the cart).
  const cartSig = (cart ?? []).map((c) => `${c.productId}x${c.quantity}`).join(",");

  // Fetch shipping options when the destination is sufficiently filled in
  useEffect(() => {
    // cod is part of the key: COD switches FAN to "Cont Colector" (extra fee)
    // and changes Woot repayment quotes, so prices must refresh with payment.
    if (optiuniDemo) return;
    const key = `${country ?? "RO"}::${county}::${city}::${postCode ?? ""}::${cod ?? ""}::${subtotal ?? ""}::${cartSig}`;
    if (!ready) {
      setOptions([]);
      setSelectedKey(null);
      onSelect(null);
      prevKey.current = "";
      return;
    }
    if (key === prevKey.current) return;
    prevKey.current = key;

    const thisReq = ++reqId.current;
    setLoading(true);
    setLoadError(false);
    setSelectedKey(null);
    setSelectedLocker(null);
    onSelect(null);

    getShippingOptions(businessId, { county, city, cod, country, postCode, cart, subtotal })
      .then((opts) => {
        if (thisReq !== reqId.current) return; // stale response
        setOptions(opts);
        // Auto-select first option
        if (opts.length > 0) {
          const first = opts[0];
          const k = optionKey(first);
          setSelectedKey(k);
          onSelect({
            courier: first.courier,
            courierLabel: first.courierLabel,
            deliveryType: first.deliveryType,
            price: first.price,
            wootServiceId: first.wootServiceId,
            wootCourierName: first.wootCourierName,
            wootServiceName: first.wootServiceName,
            coleteServiceId: first.coleteServiceId,
            coleteServiceName: first.coleteServiceName,
            token: first.token,
          });
        }
      })
      .catch(() => {
        if (thisReq !== reqId.current) return;
        setOptions([]);
        setLoadError(true);
      })
      .finally(() => {
        if (thisReq === reqId.current) setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [county, city, country, postCode, cod, subtotal, cartSig]);

  // Fetch lockers when a locker option is selected
  useEffect(() => {
    if (optiuniDemo || !selectedKey) return;
    const opt = options.find((o) => optionKey(o) === selectedKey);
    if (!opt || opt.deliveryType !== "locker") {
      setLockers([]);
      setSelectedLocker(null);
      return;
    }
    setLockersLoading(true);
    setSelectedLocker(null);
    setLockerSearch("");
    getLockers(businessId, opt.courier, city, cod)
      .then(setLockers)
      .catch(() => setLockers([]))
      .finally(() => setLockersLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  function handleSelect(opt: ShippingOption) {
    const k = optionKey(opt);
    setSelectedKey(k);
    setSelectedLocker(null);
    if (opt.deliveryType === "locker") {
      // Don't report selection yet — need locker pick
      onSelect(null);
    } else {
      onSelect({
        courier: opt.courier,
        courierLabel: opt.courierLabel,
        deliveryType: "address",
        price: opt.price,
        wootServiceId: opt.wootServiceId,
        wootCourierName: opt.wootCourierName,
        wootServiceName: opt.wootServiceName,
        coleteServiceId: opt.coleteServiceId,
        coleteServiceName: opt.coleteServiceName,
        token: opt.token,
      });
    }
  }

  function handleLockerPick(locker: LockerItem) {
    setSelectedLocker(locker);
    setLockerDropdownOpen(false);
    const opt = options.find((o) => optionKey(o) === selectedKey);
    if (opt) {
      onSelect({
        courier: opt.courier,
        courierLabel: opt.courierLabel,
        deliveryType: "locker",
        price: opt.price,
        lockerId: locker.id,
        lockerName: locker.name,
        lockerAddress: locker.address,
        lockerCity: locker.city,
        lockerCounty: locker.county,
        token: opt.token,
      });
    }
  }

  if (!ready && !optiuniDemo) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-muted/40">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Se calculeaza optiunile de livrare...</span>
      </div>
    );
  }

  if (loadError && options.length === 0) {
    return (
      <div className="p-3 rounded-xl border border-warning/20 bg-warning/10">
        <p className="text-xs text-warning">Nu s-au putut calcula optiunile de livrare. Se va folosi tariful standard.</p>
      </div>
    );
  }

  if (options.length === 0) return null;

  // Group: address options, then locker options
  const addressOpts = options.filter((o) => o.deliveryType === "address");
  const lockerOpts = options.filter((o) => o.deliveryType === "locker");

  const filteredLockers = lockerSearch
    ? lockers.filter((l) =>
        l.name.toLowerCase().includes(lockerSearch.toLowerCase()) ||
        l.address.toLowerCase().includes(lockerSearch.toLowerCase()),
      )
    : lockers;

  const selectedOpt = options.find((o) => optionKey(o) === selectedKey);
  const isLockerSelected = selectedOpt?.deliveryType === "locker";

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">Metoda de livrare</p>

      {/* Address delivery options */}
      {addressOpts.map((opt) => {
        const k = optionKey(opt);
        const selected = k === selectedKey;
        return (
          <button
            key={k}
            type="button"
            onClick={() => handleSelect(opt)}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
            style={{
              borderColor: selected ? color : "var(--color-border)",
              background: selected ? `${color}12` : "var(--color-surface)",
            }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted shrink-0">
              <Truck size={16} className="text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{opt.courierLabel}</p>
              {opt.estimatedDays && (
                <p className="text-xs text-muted-foreground">{opt.estimatedDays}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold" style={{ color: selected ? color : "var(--color-foreground)" }}>
                {opt.price > 0 ? `${opt.price.toFixed(2)} lei` : "Gratuit"}
              </p>
            </div>
            <div
              className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
              style={
                selected
                  ? { borderColor: color, backgroundColor: color }
                  : { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }
              }
            >
              {selected && (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </button>
        );
      })}

      {/* Locker delivery options */}
      {lockerOpts.map((opt) => {
        const k = optionKey(opt);
        const selected = k === selectedKey;
        return (
          <button
            key={k}
            type="button"
            onClick={() => handleSelect(opt)}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
            style={{
              borderColor: selected ? color : "var(--color-border)",
              background: selected ? `${color}12` : "var(--color-surface)",
            }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted shrink-0">
              <Package size={16} className="text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{opt.courierLabel}</p>
              <p className="text-xs text-muted-foreground">Ridicare din locker</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold" style={{ color: selected ? color : "var(--color-foreground)" }}>
                {opt.price > 0 ? `${opt.price.toFixed(2)} lei` : "Gratuit"}
              </p>
            </div>
            <div
              className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
              style={
                selected
                  ? { borderColor: color, backgroundColor: color }
                  : { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }
              }
            >
              {selected && (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </button>
        );
      })}

      {/* Locker picker — shown when a locker option is selected */}
      {isLockerSelected && (
        <div className="ml-1 space-y-2">
          {lockersLoading ? (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/40">
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Se incarca lockerele...</span>
            </div>
          ) : lockers.length === 0 ? (
            <div className="p-3 rounded-lg border border-warning/20 bg-warning/10">
              <p className="text-xs text-warning">Nu au fost gasite lockere in aceasta localitate.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Selected locker display / dropdown trigger */}
              <button
                type="button"
                onClick={() => setLockerDropdownOpen(!lockerDropdownOpen)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors"
                style={{
                  borderColor: selectedLocker ? color : "var(--color-border)",
                  background: selectedLocker ? `${color}08` : "var(--color-surface)",
                }}
              >
                <MapPin size={14} className="text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm truncate" style={{ color: selectedLocker ? "var(--color-foreground)" : "var(--color-muted-foreground)" }}>
                  {selectedLocker ? selectedLocker.name : "Selecteaza un locker..."}
                </span>
                <ChevronDown size={14} className="text-muted-foreground shrink-0" />
              </button>

              {selectedLocker && (
                <p className="text-xs text-muted-foreground mt-1 ml-0.5">{selectedLocker.address}</p>
              )}

              {/* Dropdown */}
              {lockerDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-lg z-10 max-h-64 overflow-hidden flex flex-col">
                  {/* Search */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                    <Search size={14} className="text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={lockerSearch}
                      onChange={(e) => setLockerSearch(e.target.value)}
                      placeholder="Cauta locker..."
                      className="flex-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none bg-transparent"
                    />
                    {lockerSearch && (
                      <button type="button" onClick={() => setLockerSearch("")} className="p-0.5">
                        <X size={12} className="text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  {/* List */}
                  <div className="overflow-y-auto max-h-52">
                    {filteredLockers.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3 text-center">Niciun locker gasit</p>
                    ) : (
                      filteredLockers.slice(0, 50).map((locker) => (
                        <button
                          key={locker.id}
                          type="button"
                          onClick={() => handleLockerPick(locker)}
                          className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors border-b border-border last:border-0"
                        >
                          <p className="text-sm font-medium text-foreground leading-tight">{locker.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{locker.address}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
