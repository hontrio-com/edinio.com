import { adresaGhid } from "@/lib/website/ajutor-cautare";

/**
 * Ghidul complet din Ajutor pentru fiecare integrare, legat din coloana din dreapta a paginii ei
 * („Ghidul complet, pas cu pas"). Cheia e id-ul integrarii (acelasi ca in `IntegrationHeader`).
 *
 * ⚠ Proba `ghiduri-integrari.test.ts` verifica fiecare adresa pe catalogul de ghiduri: un slug
 * schimbat in Ajutor ar fi lasat aici un link mort, fara ca cineva sa-l vada.
 */
const GHIDURI: Record<string, [categorie: string, ghid: string]> = {
  /* Plati si facturare */
  stripe: ["plati-si-facturare", "cum-conectezi-contul-stripe"],
  netopia: ["plati-si-facturare", "cum-conectezi-netopia-payments"],
  ipay: ["plati-si-facturare", "cum-conectezi-bt-ipay"],
  klarna: ["plati-si-facturare", "cum-conectezi-klarna"],
  revolut: ["plati-si-facturare", "cum-conectezi-revolut"],
  tbi: ["plati-si-facturare", "cum-conectezi-tbi-bank"],
  smartbill: ["plati-si-facturare", "cum-conectezi-smartbill"],
  oblio: ["plati-si-facturare", "cum-conectezi-oblio"],
  fgo: ["plati-si-facturare", "cum-conectezi-fgo"],
  facturis: ["plati-si-facturare", "cum-conectezi-facturis"],
  /* Curieri */
  "fan-courier": ["comenzi-si-livrare", "cum-conectezi-fan-courier"],
  dpd: ["comenzi-si-livrare", "cum-conectezi-dpd"],
  cargus: ["comenzi-si-livrare", "cum-conectezi-cargus"],
  sameday: ["comenzi-si-livrare", "cum-conectezi-sameday"],
  gls: ["comenzi-si-livrare", "cum-conectezi-gls"],
  colete: ["comenzi-si-livrare", "cum-conectezi-colete-online"],
  ecolet: ["comenzi-si-livrare", "cum-conectezi-ecolet"],
  posta: ["comenzi-si-livrare", "cum-conectezi-posta-romana"],
  curiera: ["comenzi-si-livrare", "cum-conectezi-curiera"],
  epacket: ["comenzi-si-livrare", "cum-conectezi-e-packet"],
  packeta: ["comenzi-si-livrare", "cum-conectezi-packeta"],
  innoship: ["comenzi-si-livrare", "cum-conectezi-innoship"],
  smartship: ["comenzi-si-livrare", "cum-conectezi-smartship"],
  shipo: ["comenzi-si-livrare", "cum-conectezi-shipo"],
  fedex: ["comenzi-si-livrare", "cum-conectezi-fedex"],
  ups: ["comenzi-si-livrare", "cum-conectezi-ups"],
  dhl: ["comenzi-si-livrare", "cum-conectezi-dhl-express"],
  pallex: ["comenzi-si-livrare", "cum-conectezi-pall-ex"],
  woot: ["marketplace", "cum-configurezi-woot"],
  /* Marketing si SMS */
  mailchimp: ["marketing-si-clienti", "cum-conectezi-mailchimp"],
  brevo: ["marketing-si-clienti", "cum-conectezi-brevo"],
  klaviyo: ["marketing-si-clienti", "cum-conectezi-klaviyo"],
  "facebook-pixel": ["marketing-si-clienti", "cum-conectezi-facebook-pixel"],
  "tiktok-pixel": ["marketing-si-clienti", "cum-conectezi-tiktok-pixel"],
  "google-ads": ["marketing-si-clienti", "cum-conectezi-google-ads"],
  "google-analytics": ["marketing-si-clienti", "cum-conectezi-contul-google-la-google-analytics"],
  notice: ["marketing-si-clienti", "cum-conectezi-notice-ro"],
  /* Marketplace si feeduri */
  emag: ["marketplace", "cum-conectezi-contul-emag"],
  trendyol: ["marketplace", "cum-conectezi-contul-trendyol"],
  aboutyou: ["marketplace", "cum-conectezi-contul-about-you"],
  olx: ["marketplace", "cum-conectezi-contul-olx"],
  easysales: ["marketplace", "cum-conectezi-easysales"],
  "facebook-catalog": ["marketplace", "cum-conectezi-catalogul-facebook"],
  "google-merchant": ["marketplace", "cum-conectezi-google-merchant-center"],
};

export function ghidulIntegrarii(id: string): string | null {
  const g = GHIDURI[id];
  return g ? adresaGhid(g[0], g[1]) : null;
}

/** Pentru proba: perechile (categorie, ghid), ca sa fie verificate pe catalog. */
export const GHIDURI_INTEGRARI = GHIDURI;
