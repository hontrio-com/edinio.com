import type { ShippingOption } from "@/lib/actions/shipping.actions";
import type { CardDiscountConfig, PaymentMethodType } from "@/lib/payment-methods";
import type { VatConfig } from "@/lib/utils/vat";
import type { StorePageContent } from "@/lib/storefront/store-content.types";

/**
 * Ce inlocuieste, intr-o miniatura, tot ce formularul de comanda afla de la
 * server dupa deschidere.
 *
 * Formularul real cere configuratia magazinului, ofertele de checkout si
 * cotatii LIVE de la curieri. Intr-o galerie de design-uri asta ar insemna
 * zeci de apeluri pe server si spre API-urile curierilor, plus cosuri abandonate
 * false scrise in baza magazinului — la fiecare card. Cu obiectul asta,
 * formularul primeste totul de-a gata si nu mai iese in retea deloc.
 *
 * E un SEED, nu o a doua componenta de prezentare: valorile intra in aceleasi
 * stari pe care le-ar fi umplut serverul, deci miniatura randeaza exact
 * formularul livrat, nu o schita a lui.
 */
export interface CheckoutPreview {
  checkoutConfig: StorePageContent["checkout_config"];
  vatConfig: VatConfig;
  paymentMethods: { type: PaymentMethodType; label: string }[];
  cardDiscount: CardDiscountConfig;
  codDiscount: CardDiscountConfig;
  newsletterOffer: boolean;
  intlEnabled: boolean;
  /** Optiunile de livrare, randate de `CourierSelector` cu marcajul lui real. */
  courierOptions: ShippingOption[];
  form: {
    name: string;
    phone: string;
    email: string;
    county: string;
    city: string;
    address: string;
    country: string;
    postCode: string;
  };
}

/**
 * Datele demonstrative ale miniaturii.
 *
 * Alese ca sa se vada cat mai multe parti ale formularului deodata: eticheta
 * „(optional)" de la email si bifa de newsletter, doua optiuni de livrare (una
 * la adresa, una la locker), linkul de cod de reducere si selectorul cu doua
 * metode de plata. Campurile personalizate si optiunile suplimentare lipsesc
 * deliberat: aproape niciun magazin nu le are, iar in miniatura ar impinge
 * caseta de totaluri si butonul afara din cadru.
 *
 * Telefonul si emailul raman goale ca sa se vada si campurile necompletate.
 */
export const CHECKOUT_DEMO: CheckoutPreview = {
  checkoutConfig: {
    email_field: { enabled: true, required: false },
    custom_fields: [],
    extras: [],
    hidden_fields: [],
  } as StorePageContent["checkout_config"],
  vatConfig: { vat_enabled: false, vat_rate: 19, prices_include_vat: true, show_vat_breakdown: true },
  paymentMethods: [
    { type: "cash_on_delivery", label: "Plata la livrare" },
    { type: "stripe", label: "Card bancar" },
  ],
  cardDiscount: { enabled: false, type: "percent", value: 0 },
  codDiscount: { enabled: false, type: "percent", value: 0 },
  newsletterOffer: true,
  intlEnabled: false,
  courierOptions: [
    { courier: "sameday", courierLabel: "Sameday", deliveryType: "address", price: 19.99, estimatedDays: "1-2 zile" },
    { courier: "sameday", courierLabel: "Sameday easybox", deliveryType: "locker", price: 14.99, estimatedDays: "1-2 zile" },
  ],
  form: {
    name: "Andrei Popescu",
    phone: "",
    email: "",
    county: "Cluj",
    city: "Cluj-Napoca",
    address: "Str. Exemplu nr. 12",
    country: "RO",
    postCode: "",
  },
};
