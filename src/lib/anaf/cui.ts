/**
 * Codul de identificare fiscala: curatare si verificare, fara nicio retea.
 *
 * Exista separat de `lookup.ts` dinadins. Verificarea de aici e singurul lucru
 * care sta intre un camp de formular public si un serviciu al statului: fara ea,
 * orice sir tastat gresit ar pleca spre ANAF, iar endpointul nostru ar deveni un
 * releu gratuit catre webservicesp.anaf.ro. Fiind pura, se poate chema si in
 * browser (ca sa nu asteptam degeaba o cerere), si pe server (unde e obligatorie,
 * fiindca actiunile `use server` sunt endpointuri publice), si din teste.
 */

/**
 * Cheia oficiala de control, aplicata de la DREAPTA la stanga peste cifrele
 * dinaintea celei de control. Are noua pozitii, deci un CUI mai scurt se aliniaza
 * la dreapta completand cu zerouri in fata — de aceea `padStart` mai jos si nu o
 * bucla care porneste din capat.
 */
const CHEIE = [7, 5, 3, 2, 1, 7, 5, 3, 2];

/** Doar cifrele: scoate prefixul „RO", spatiile, punctele si liniutele. */
export function normalizeCui(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

/**
 * Forma de afisare si de stocare: „RO" doar daca platitorul chiar e inregistrat
 * in scopuri de TVA. Prefixul nu e decorativ — pe factura el spune ca furnizorul
 * are voie sa deduca, iar pus la un neplatitor e o informatie falsa.
 */
export function formatCui(cifre: string, platitorTva: boolean): string {
  const n = normalizeCui(cifre);
  if (!n) return "";
  return platitorTva ? `RO${n}` : n;
}

/**
 * Cifra de control, dupa algoritmul Ministerului Finantelor.
 *
 * Un CUI romanesc are intre 2 si 10 cifre, ultima fiind de control: restul
 * cifrelor, inmultite cu cheia si insumate, ori 10, modulo 11, iar 10 se citeste
 * ca 0. Verificarea prinde greselile de tastare (o cifra schimbata, doua
 * inversate), NU spune ca firma exista — asta o afla doar ANAF.
 */
export function isValidCui(input: string): boolean {
  const n = normalizeCui(input);
  if (n.length < 2 || n.length > 10) return false;
  // Un CUI de zerouri trece aritmetica, dar nu e al nimanui. SmartBill foloseste
  // chiar „0000000000000" ca marcaj de persoana fizica, deci trebuie respins aici
  // ca sa nu poata fi introdus ca firma.
  if (/^0+$/.test(n)) return false;

  const control = Number(n[n.length - 1]);
  const corp = n.slice(0, -1).padStart(9, "0");

  let suma = 0;
  for (let i = 0; i < 9; i++) suma += Number(corp[i]) * CHEIE[i];

  const calculat = (suma * 10) % 11;
  return (calculat === 10 ? 0 : calculat) === control;
}
