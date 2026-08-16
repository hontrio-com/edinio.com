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
  /*
   * ⚠ Cheia trebuie sa cuprinda TOT ce deosebeste doua oferte ale aceluiasi
   * curier. La Innoship asta inseamna trei campuri: el intoarce cate o oferta
   * per curier real, toate sub acelasi `courier: "innoship"` si acelasi
   * `deliveryType: "address"` — deci fara ele s-ar prabusi una peste alta, iar
   * clientul ar alege una si ar primi alta.
   */
  /*
   * ⚠ La SmartShip sunt DOUA parti, si a doua e usor de trecut cu vederea: cu
   * `show_byoc` acelasi curier apare o data pe contractul comerciantului si o
   * data pe cel SmartShip, la preturi diferite. Iar reteaua de lockere (easybox
   * / FANbox) tine tot de cheie: sunt nomenclatoare separate.
   */
  /*
   * ⚠ La FedEx deosebirea e SERVICIUL: `FEDEX_PRIORITY`, `FEDEX_PRIORITY_EXPRESS`
   * si `FEDEX_FIRST` vin toate sub `courier: "fedex"` si `deliveryType: "address"`,
   * la preturi si termene diferite. Fara el, cele trei s-ar prabusi una peste alta.
   */
  return `${o.courier}::${o.deliveryType}::${o.wootServiceId ?? ""}::${o.coleteServiceId ?? ""}::${o.ecoletServiceSlug ?? ""}::${o.innoshipCourierId ?? ""}::${o.innoshipServiceId ?? ""}::${o.innoshipOptionId ?? ""}::${o.smartshipCourierId ?? ""}::${o.smartshipOwnContract ? "byoc" : ""}::${o.smartshipLockerNet ?? ""}::${o.shipoRateId ?? ""}::${o.fedexServiceType ?? ""}`;
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
  /** Codul postal al punctului; GLS il cere obligatoriu pe adresa de livrare. */
  lockerPostCode?: string;
  wootServiceId?: number;
  wootCourierName?: string;
  wootServiceName?: string;
  coleteServiceId?: number;
  coleteServiceName?: string;
  /* ⚠ La eColet cheia serviciului e un SLUG, nu un id numeric. */
  ecoletServiceSlug?: string;
  ecoletCourierName?: string;
  ecoletServiceName?: string;
  /* ⚠ Cheia ofertei Innoship are TREI parti. Vezi . */
  innoshipCourierId?: number;
  innoshipServiceId?: number;
  innoshipOptionId?: string;
  innoshipCourierName?: string;
  innoshipServiceName?: string;
  /* ⚠ Cheia ofertei SmartShip are DOUA parti: curierul si CONTRACTUL pe care a
     fost cotata. Vezi lib/smartship/preturi.ts. */
  smartshipCourierId?: number;
  smartshipCourierName?: string;
  smartshipOwnContract?: boolean;
  /** Care retea de lockere: easybox (Sameday) sau FANbox (FAN Courier). */
  smartshipLockerNet?: "easybox" | "fanbox";
  /* ⚠ Cheia ofertei Shipo are O SINGURA parte, dar ea nu e curierul: e serviciul.
     Acelasi curier apare la adresa, in locker si in PUDO, la preturi diferite,
     iar `rate_id` e si identitatea ofertei, si ce se trimite la emitere.
     Vezi lib/shipo/preturi.ts. */
  shipoRateId?: number;
  shipoCourierSlug?: string;
  shipoCourierName?: string;
  /* ⚠ Cheia ofertei FedEx e SERVICIUL, si e de ajuns: FedEx e transportator, nu
     broker, deci acelasi `serviceType` nu apare de doua ori. Vezi lib/fedex/preturi.ts. */
  fedexServiceType?: string;
  fedexServiceName?: string;
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
    /*
     * ⚠ Ce alesese clientul se tine minte peste reincarcare.
     *
     * Reincarcarea se declanseaza si de `cod`, adica de METODA DE PLATA — nu doar
     * de adresa. Aruncand selectia neconditionat, un simplu clic pe alta metoda de
     * plata ii schimba clientului si curierul, pe cel mai ieftin din lista (opts
     * vin sortate dupa pret). La Pall-Ex asta devenea o bucla completa: alegerea
     * lui scoate rambursul din metodele de plata (Pall-Ex nu incaseaza), schimbarea
     * metodei schimba `cod`, iar reincercarea arunca tocmai alegerea Pall-Ex si
     * cadea pe un curier de COLETE — care nu poate duce un palet.
     *
     * Se pastreaza deci cheia curenta si se re-potriveste in lista noua; abia daca
     * optiunea a disparut cu adevarat se cade pe prima.
     */
    const cheieAnterioara = selectedKey;
    setSelectedKey(null);
    setSelectedLocker(null);
    onSelect(null);

    getShippingOptions(businessId, { county, city, cod, country, postCode, cart, subtotal })
      .then((opts) => {
        if (thisReq !== reqId.current) return; // stale response
        setOptions(opts);
        // Auto-select: intai ce alesese clientul, si abia apoi prima optiune.
        if (opts.length > 0) {
          const pastrata = cheieAnterioara
            ? opts.find((o) => optionKey(o) === cheieAnterioara)
            : undefined;
          const ales = pastrata ?? opts[0];
          const k = optionKey(ales);
          setSelectedKey(k);
          onSelect({
            courier: ales.courier,
            courierLabel: ales.courierLabel,
            deliveryType: ales.deliveryType,
            price: ales.price,
            wootServiceId: ales.wootServiceId,
            wootCourierName: ales.wootCourierName,
            wootServiceName: ales.wootServiceName,
            coleteServiceId: ales.coleteServiceId,
            coleteServiceName: ales.coleteServiceName,
            ecoletServiceSlug: ales.ecoletServiceSlug,
            ecoletCourierName: ales.ecoletCourierName,
            ecoletServiceName: ales.ecoletServiceName,
            innoshipCourierId: ales.innoshipCourierId,
            innoshipServiceId: ales.innoshipServiceId,
            innoshipOptionId: ales.innoshipOptionId,
            innoshipCourierName: ales.innoshipCourierName,
            innoshipServiceName: ales.innoshipServiceName,
            smartshipCourierId: ales.smartshipCourierId,
            smartshipCourierName: ales.smartshipCourierName,
            smartshipOwnContract: ales.smartshipOwnContract,
            smartshipLockerNet: ales.smartshipLockerNet,
            shipoRateId: ales.shipoRateId,
            shipoCourierSlug: ales.shipoCourierSlug,
            shipoCourierName: ales.shipoCourierName,
            fedexServiceType: ales.fedexServiceType,
            fedexServiceName: ales.fedexServiceName,
            token: ales.token,
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
    /*
     * ⚠ Al cincilea argument poarta doua lucruri diferite, dupa curier.
     *
     * La SmartShip e RETEAUA de lockere (easybox / FANbox), fiindca sunt
     * nomenclatoare separate. La Shipo e SERVICIUL (`rate_id`), fiindca acolo
     * punctele nu se cer pe curier: curierul si tipul punctului sunt deduse de ei
     * din serviciu, iar doua servicii ale aceluiasi curier dau liste diferite.
     * Vezi `getLockers` — valoarea se ingusteaza acolo, la primire.
     */
    getLockers(
      businessId, opt.courier, city, cod,
      opt.courier === "shipo" ? String(opt.shipoRateId ?? "") : opt.smartshipLockerNet,
    )
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
        ecoletServiceSlug: opt.ecoletServiceSlug,
        ecoletCourierName: opt.ecoletCourierName,
        ecoletServiceName: opt.ecoletServiceName,
        innoshipCourierId: opt.innoshipCourierId,
        innoshipServiceId: opt.innoshipServiceId,
        innoshipOptionId: opt.innoshipOptionId,
        innoshipCourierName: opt.innoshipCourierName,
        innoshipServiceName: opt.innoshipServiceName,
        smartshipCourierId: opt.smartshipCourierId,
        smartshipCourierName: opt.smartshipCourierName,
        smartshipOwnContract: opt.smartshipOwnContract,
        smartshipLockerNet: opt.smartshipLockerNet,
        shipoRateId: opt.shipoRateId,
        shipoCourierSlug: opt.shipoCourierSlug,
        shipoCourierName: opt.shipoCourierName,
        fedexServiceType: opt.fedexServiceType,
        fedexServiceName: opt.fedexServiceName,
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
        lockerPostCode: locker.postCode,
        /* ⚠ La SmartShip optiunea de locker POARTA curierul (12 easybox / 3
           FANbox) si reteaua. Pierdute aici, emiterea n-ar mai sti cu ce curier
           sa trimita coletul in punctul ales de client. */
        smartshipCourierId: opt.smartshipCourierId,
        smartshipCourierName: opt.smartshipCourierName,
        smartshipOwnContract: opt.smartshipOwnContract,
        smartshipLockerNet: opt.smartshipLockerNet,
        shipoRateId: opt.shipoRateId,
        shipoCourierSlug: opt.shipoCourierSlug,
        shipoCourierName: opt.shipoCourierName,
        fedexServiceType: opt.fedexServiceType,
        fedexServiceName: opt.fedexServiceName,
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

  /*
   * ⚠ La Posta Romana punctul NU e un locker, e un OFICIU POSTAL.
   *
   * Livrarea „post-restant" merge pe acelasi drum ca lockerele (`deliveryType:
   * "locker"`, alegerea in `locker_id`), fiindca pentru cumparator arata la fel:
   * alege un loc de unde isi ia coletul. Dar cuvantul nu se poate imprumuta —
   * „Selecteaza un locker" pentru un ghiseu de posta il pune pe om sa caute un
   * dulap care nu exista.
   *
   * Se schimba DOAR substantivul, si doar pentru Posta: ceilalti curieri raman
   * exact cum erau.
   */
  const laOficiuPostal = selectedOpt?.courier === "posta";
  const punctul = laOficiuPostal ? "oficiu poștal" : "locker";
  const punctele = laOficiuPostal ? "oficii poștale" : "lockere";

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
              {/* Per OPTIUNE, nu dupa cea selectata: randul asta se vede si inainte de a alege. */}
              <p className="text-xs text-muted-foreground">
                {opt.courier === "posta" ? "Ridicare de la oficiu poștal" : "Ridicare din locker"}
              </p>
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
              <span className="text-xs text-muted-foreground">Se incarca {punctele}...</span>
            </div>
          ) : lockers.length === 0 ? (
            <div className="p-3 rounded-lg border border-warning/20 bg-warning/10">
              <p className="text-xs text-warning">Nu au fost gasite {punctele} in aceasta localitate.</p>
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
                  {selectedLocker ? selectedLocker.name : `Selecteaza un ${punctul}...`}
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
                      placeholder={`Cauta ${punctul}...`}
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
                      <p className="text-xs text-muted-foreground p-3 text-center">Niciun rezultat</p>
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
