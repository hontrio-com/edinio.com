"use client";

import { useState, useEffect, useRef } from "react";
import { Truck, MapPin, Package, Loader2, Search, X, ChevronDown } from "lucide-react";
import { getShippingOptions, getLockers, type ShippingOption, type LockerItem } from "@/lib/actions/shipping.actions";

export interface CourierSelection {
  courier: string;
  courierLabel: string;
  deliveryType: "address" | "locker";
  price: number;
  lockerId?: string;
  lockerName?: string;
  lockerAddress?: string;
  wootServiceId?: number;
  wootCourierName?: string;
  wootServiceName?: string;
}

interface Props {
  businessId: string;
  county: string;
  city: string;
  weightKg?: number;
  cod?: number;
  color: string;
  /** EU ISO alpha-2 for international; absent or "RO" = domestic. */
  country?: string;
  /** Required for international (used by DPD to price + create the AWB). */
  postCode?: string;
  onSelect: (selection: CourierSelection | null) => void;
}

export function CourierSelector({ businessId, county, city, weightKg, cod, color, country, postCode, onSelect }: Props) {
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
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

  // Fetch shipping options when the destination is sufficiently filled in
  useEffect(() => {
    const key = `${country ?? "RO"}::${county}::${city}::${postCode ?? ""}::${weightKg ?? ""}`;
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

    getShippingOptions(businessId, { county, city, weightKg, cod, country, postCode })
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
  }, [county, city, country, postCode, weightKg]);

  // Fetch lockers when a locker option is selected
  useEffect(() => {
    if (!selectedKey) return;
    const opt = options.find((o) => optionKey(o) === selectedKey);
    if (!opt || opt.deliveryType !== "locker") {
      setLockers([]);
      setSelectedLocker(null);
      return;
    }
    setLockersLoading(true);
    setSelectedLocker(null);
    setLockerSearch("");
    getLockers(businessId, opt.courier, city)
      .then(setLockers)
      .catch(() => setLockers([]))
      .finally(() => setLockersLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  function optionKey(o: ShippingOption) {
    // Woot returns several offers all under courier "woot" — disambiguate by service.
    return `${o.courier}::${o.deliveryType}::${o.wootServiceId ?? ""}`;
  }

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
      });
    }
  }

  if (!ready) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 bg-gray-50">
        <Loader2 size={16} className="animate-spin text-gray-400" />
        <span className="text-sm text-gray-500">Se calculeaza optiunile de livrare...</span>
      </div>
    );
  }

  if (loadError && options.length === 0) {
    return (
      <div className="p-3 rounded-xl border border-amber-200 bg-amber-50">
        <p className="text-xs text-amber-700">Nu s-au putut calcula optiunile de livrare. Se va folosi tariful standard.</p>
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
      <p className="text-sm font-semibold text-gray-700">Metoda de livrare</p>

      {/* Address delivery options */}
      {addressOpts.map((opt) => {
        const k = optionKey(opt);
        const selected = k === selectedKey;
        return (
          <button
            key={k}
            type="button"
            onClick={() => handleSelect(opt)}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 transition-all text-left"
            style={{
              borderColor: selected ? color : "#E5E7EB",
              background: selected ? `${color}12` : "#fff",
            }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 shrink-0">
              <Truck size={16} className="text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{opt.courierLabel}</p>
              {opt.estimatedDays && (
                <p className="text-xs text-gray-500">{opt.estimatedDays}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-black" style={{ color: selected ? color : "#111" }}>
                {opt.price > 0 ? `${opt.price.toFixed(2)} lei` : "Gratuit"}
              </p>
            </div>
            <div
              className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
              style={
                selected
                  ? { borderColor: color, backgroundColor: color }
                  : { borderColor: "#D1D5DB", backgroundColor: "#fff" }
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
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 transition-all text-left"
            style={{
              borderColor: selected ? color : "#E5E7EB",
              background: selected ? `${color}12` : "#fff",
            }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 shrink-0">
              <Package size={16} className="text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{opt.courierLabel}</p>
              <p className="text-xs text-gray-500">Ridicare din locker</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-black" style={{ color: selected ? color : "#111" }}>
                {opt.price > 0 ? `${opt.price.toFixed(2)} lei` : "Gratuit"}
              </p>
            </div>
            <div
              className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
              style={
                selected
                  ? { borderColor: color, backgroundColor: color }
                  : { borderColor: "#D1D5DB", backgroundColor: "#fff" }
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
            <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50">
              <Loader2 size={14} className="animate-spin text-gray-400" />
              <span className="text-xs text-gray-500">Se incarca lockerele...</span>
            </div>
          ) : lockers.length === 0 ? (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
              <p className="text-xs text-amber-700">Nu au fost gasite lockere in aceasta localitate.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Selected locker display / dropdown trigger */}
              <button
                type="button"
                onClick={() => setLockerDropdownOpen(!lockerDropdownOpen)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors"
                style={{
                  borderColor: selectedLocker ? color : "#D1D5DB",
                  background: selectedLocker ? `${color}08` : "#fff",
                }}
              >
                <MapPin size={14} className="text-gray-500 shrink-0" />
                <span className="flex-1 text-sm truncate" style={{ color: selectedLocker ? "#111" : "#9CA3AF" }}>
                  {selectedLocker ? selectedLocker.name : "Selecteaza un locker..."}
                </span>
                <ChevronDown size={14} className="text-gray-400 shrink-0" />
              </button>

              {selectedLocker && (
                <p className="text-xs text-gray-500 mt-1 ml-0.5">{selectedLocker.address}</p>
              )}

              {/* Dropdown */}
              {lockerDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-64 overflow-hidden flex flex-col">
                  {/* Search */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                    <Search size={14} className="text-gray-400 shrink-0" />
                    <input
                      type="text"
                      value={lockerSearch}
                      onChange={(e) => setLockerSearch(e.target.value)}
                      placeholder="Cauta locker..."
                      className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none bg-transparent"
                    />
                    {lockerSearch && (
                      <button type="button" onClick={() => setLockerSearch("")} className="p-0.5">
                        <X size={12} className="text-gray-400" />
                      </button>
                    )}
                  </div>
                  {/* List */}
                  <div className="overflow-y-auto max-h-52">
                    {filteredLockers.length === 0 ? (
                      <p className="text-xs text-gray-500 p-3 text-center">Niciun locker gasit</p>
                    ) : (
                      filteredLockers.slice(0, 50).map((locker) => (
                        <button
                          key={locker.id}
                          type="button"
                          onClick={() => handleLockerPick(locker)}
                          className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <p className="text-sm font-medium text-gray-900 leading-tight">{locker.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{locker.address}</p>
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
