/**
 * Ce anume n-a placut la Sameday, scos din arborele lor de validare.
 *
 * ═══ ⚠ DE CE EXISTA ═══
 *
 * Cand un AWB e respins pentru o adresa pe care nomenclatorul lor n-o cunoaste, ei nu
 * intorc o propozitie. Intorc un arbore, in care mesajul adevarat sta pe frunza:
 *
 *     {"error":{"code":400,"message":"Validation Failed",
 *       "errors":{"children":{"awbRecipient":{"children":{
 *         "cityString":{"errors":["This value is not valid."]}}}}}}}
 *
 * `mesajulLor` citeste doar `error.message`, deci comerciantul primea „Validation Failed",
 * sau, cand nici atat nu venea, blocul de JSON intreg, pus in fereastra ca text. Din el nu
 * se putea afla NICIODATA care camp e de vina.
 *
 * Masurat pe 15.09.2026: la magazinele cu Sameday configurat sunt 47 de comenzi
 * bucurestene, din care 3 nu poarta sectorul nicaieri, nici in oras, nici in adresa.
 * `localitateSameday` refuza pe buna dreptate sa-l ghiceasca, deci exact acele 3 comenzi
 * lovesc drumul asta. Reparatia nu e sa inventam sectorul, ci sa-i SPUNEM omului ca
 * localitatea e de vina, ca sa o poata scrie el.
 *
 * ⚠ FORMA E RECURSIVA SI SE REPETA PE DOUA CHEI. Parserul din SDK-ul lor oficial
 * (`Sameday/Exceptions/SamedayBadRequestException.php::parseErrors`) coboara si pe
 * `errors.children`, si pe `children` gol. Amandoua, fiindca nivelul de sus le are pe
 * primele si nivelurile de jos pe a doua.
 */

/** O frunza: drumul pana la campul vinovat si ce s-a spus despre el. */
export type GreseealaSameday = { camp: string; mesaje: string[] };

const ADANCIME_MAX = 12;

function esteObiect(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function siruri(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((m) => (typeof m === "string" ? m.trim() : "")).filter(Boolean);
}

function coboara(nod: unknown, drum: string[], adunate: GreseealaSameday[], adancime: number): void {
  if (!esteObiect(nod) || adancime > ADANCIME_MAX) return;

  const erori = nod.errors;

  /*
   * ⚠ `errors` poate fi ORI lista de mesaje, ORI un obiect cu alti copii. Tratat orbeste ca
   * lista, un nivel intreg de copii s-ar pierde tacut; tratat orbeste ca obiect, mesajul
   * adevarat n-ar fi citit niciodata. De-aia se cerceteaza ce e, nu se presupune.
   */
  if (esteObiect(erori)) {
    coboara(erori, drum, adunate, adancime + 1);
  } else {
    const mesaje = siruri(erori);
    if (mesaje.length) adunate.push({ camp: drum.join("."), mesaje });
  }

  const copii = nod.children;
  if (esteObiect(copii)) {
    for (const [nume, sub] of Object.entries(copii)) {
      coboara(sub, [...drum, nume], adunate, adancime + 1);
    }
  }
}

/** Toate frunzele cu mesaj, in ordinea in care le-au scris ei. */
export function greselileSameday(raspuns: unknown): GreseealaSameday[] {
  const adunate: GreseealaSameday[] = [];
  if (!esteObiect(raspuns)) return adunate;
  coboara(raspuns, [], adunate, 0);
  /* Nivelul de sus isi poarta arborele sub `error`, nu langa el. */
  if (esteObiect(raspuns.error)) coboara(raspuns.error, [], adunate, 0);
  return adunate;
}

/**
 * Propozitia pe care o vede comerciantul.
 *
 * ⚠ `null` cand raspunsul nu poarta nicio validare: atunci apelantul isi pastreaza
 * mesajul lui, care poate fi mai bun decat un sir gol.
 */
export function mesajulDeValidareSameday(raspuns: unknown): string | null {
  const greseli = greselileSameday(raspuns);
  if (!greseli.length) return null;

  /*
   * ⚠ Campul se traduce cand il stim, dar textul lor RAMANE. Ei schimba mesajele fara sa
   * ne spuna, iar o traducere pe dinafara ar ascunde tocmai ce e nou.
   */
  const bucati = greseli.map((g) => {
    const nume = NUME_OMENESTI[g.camp] ?? g.camp;
    return nume ? `${nume}: ${g.mesaje.join(" ")}` : g.mesaje.join(" ");
  });

  return bucati.join(" | ");
}

/**
 * Campurile pe care le trimitem NOI, pe romaneste.
 *
 * ⚠ Numai cele pe care chiar le construim. Un dictionar care incearca sa acopere tot
 * API-ul lor ar ramane in urma la prima schimbare, iar campul netradus se vede oricum:
 * cade pe cheia lor, neatinsa.
 */
const NUME_OMENESTI: Readonly<Record<string, string>> = {
  "awbRecipient.cityString": "Localitatea destinatarului",
  "awbRecipient.countyString": "Judetul destinatarului",
  "awbRecipient.address": "Adresa destinatarului",
  "awbRecipient.name": "Numele destinatarului",
  "awbRecipient.phoneNumber": "Telefonul destinatarului",
  "awbRecipient.email": "E-mailul destinatarului",
  "awbRecipient.postalCode": "Codul postal al destinatarului",
  "awbRecipient.companyName": "Numele firmei destinatare",
  "thirdParty.cityString": "Localitatea de ridicare",
  "thirdParty.countyString": "Judetul de ridicare",
  "thirdParty.address": "Adresa de ridicare",
  "thirdParty.phoneNumber": "Telefonul de la ridicare",
  cashOnDelivery: "Valoarea rambursului",
  insuredValue: "Valoarea asigurata",
  packageWeight: "Greutatea",
  packageNumber: "Numarul de colete",
  service: "Serviciul Sameday",
  pickupPoint: "Punctul de ridicare",
  contactPerson: "Persoana de contact",
  lockerLastMile: "Easybox-ul de livrare",
  oohLastMile: "Punctul Sameday de livrare",
  lockerFirstMile: "Easybox-ul de predare",
};
