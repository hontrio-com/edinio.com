/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANONIMIZAREA UNUI CLIENT: CE SE SPUNE OMULUI               (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de proprietar: „trebuie sa avem posibilitatea de stergere a
 * utilizatorului". Intrebat ce inseamna pentru cineva care ARE comenzi, a ales
 * ANONIMIZAREA.
 *
 * ⚠⚠ E O OPERATIE CARE NU SE POATE LUA INAPOI, si atinge randuri din cinci
 * tabele. De-aia tot ce se vede pe ecran inaintea ei se scrie aici, o data, si
 * se probeaza: confirmarea trebuie sa spuna CE RAMANE, nu doar ce dispare.
 * Un om care crede ca sterge un client si vede apoi comenzile lui mai departe in
 * rapoarte se sperie si cheama suportul.
 */

/** Ce a atins anonimizarea, asa cum raspunde `customer_anonymize`. */
export interface UrmaAnonimizarii {
  comenzi: number;
  contacte: number;
  cosuri: number;
  retururi: number;
  mesaje: number;
}

export const URMA_GOALA: UrmaAnonimizarii = {
  comenzi: 0, contacte: 0, cosuri: 0, retururi: 0, mesaje: 0,
};

/**
 * Cati clienti se pot anonimiza deodata.
 *
 * ⚠ STA AICI, NU IN FISIERUL DE ACTIUNI. Intr-un fisier `"use server"` se pot
 * exporta NUMAI functii async: o constanta exportata acolo rupe compilarea cu
 * „Only async functions are allowed to be exported". `tsc` nu prinde asta —
 * a prins-o serverul de dezvoltare.
 *
 * ⚠ Si nu e o cifra de prudenta abstracta: functia parcurge cinci tabele pe
 * fiecare cheie, iar o selectie de cinci sute ar tine tranzactia deschisa peste
 * limita de timp a rutei si s-ar da inapoi dupa un minut de asteptare.
 */
export const CATI_DEODATA = 100;

/** Numele pus in locul celui adevarat. Acelasi si in SQL. */
export const NUMELE_ANONIM = "Client șters";

/**
 * Ce se sterge, pe intelesul comerciantului.
 *
 * ⚠ Se scriu LUCRURI, nu tabele. „Se curata `orders.shipping_address`" nu spune
 * nimic cuiva care vinde lumanari.
 */
export const CE_SE_STERGE = [
  "numele, telefonul, emailul și adresa, din toate comenzile lui",
  "contul lui de client de pe magazin, dacă are unul: contactele, parola, sesiunile",
  "coșurile lui abandonate, găsite după telefon și după e-mail",
  "numărul de telefon din jurnalul de SMS-uri",
  "datele lui din cererile de retur; IBAN-ul și motivul, doar din retururile încheiate",
  "identificatorii de urmărire (Google, Meta, TikTok), adresa IP și paginile vizitate, de pe comenzi",
] as const;

/**
 * Ce RAMANE, si de ce.
 *
 * ⚠⚠ RANDUL CU DEZABONAREA E CEL MAI IMPORTANT DIN TOATA LISTA. Un om care a
 * cerut sa nu mai primeasca mesaje si apoi cere sa fie sters: daca i-am sterge
 * si randul de dezabonare, prima campanie de maine l-ar gasi din nou. Adica
 * „stergerea" ar avea ca urmare exact lucrul de care fugea.
 */
export const CE_RAMANE = [
  "comenzile, cu sumele și statusurile lor — veniturile tale nu se schimbă",
  "facturile și AWB-urile, care oricum au plecat deja la client",
  "județul de pe comenzi, ca să nu se strice rapoartele pe județe",
  "dezabonarea lui de la emailuri și SMS-uri, ca să nu ajungă din nou pe listă",
  "IBAN-ul din retururile încă deschise, ca să poți face rambursarea",
  "sursa comenzii la nivel de campanie (de exemplu „Facebook”), ca rapoartele pe canale să rămână corecte",
  "etichetele de curier deja generate și datele primite de la marketplace-uri (eMAG, Trendyol, Pepita, About You), în forma în care au venit",
  "textele de personalizare ale produselor comandate și folosirile codurilor de reducere",
] as const;

/** Ce NU putem face, si trebuie spus inainte, nu dupa. */
export const CE_NU_PUTEM_FACE =
  "Facturile deja trimise la client și la contabilitate poartă mai departe numele lui: "
  + "acelea nu se pot schimba, și legea cere să fie păstrate zece ani.";

/**
 * Intrebarea de confirmare pentru un singur client.
 *
 * ⚠ Spune NUMELE si spune ca nu se poate lua inapoi. O confirmare care intreaba
 * doar „ești sigur?" nu e o confirmare, e un buton in plus.
 */
export function intrebareaAnonimizarii(nume: string, cateComenzi: number): string {
  const comenzi = cateComenzi === 1 ? "1 comandă" : `${cateComenzi} comenzi`;
  return (
    `Ștergi datele lui „${nume}”?\n\n`
    + `Numele, telefonul, emailul și adresa dispar din ${comenzi}, din coșuri, din SMS-uri și din contul lui de client.\n\n`
    + "RĂMÂN: comenzile cu sumele lor, facturile și AWB-urile, și dezabonarea lui de la mesaje.\n\n"
    + "Nu se poate lua înapoi."
  );
}

/** Aceeasi intrebare, pentru mai multi deodata. */
export function intrebareaAnonimizariiInMasa(cati: number): string {
  return (
    `Ștergi datele a ${cati} ${cati === 1 ? "client" : "clienți"}?\n\n`
    + "Numele, telefoanele, emailurile și adresele lor dispar din toate comenzile.\n\n"
    + "RĂMÂN: comenzile cu sumele lor, facturile și AWB-urile, și dezabonările lor.\n\n"
    + "Nu se poate lua înapoi."
  );
}

/**
 * Ce s-a intamplat, dupa.
 *
 * ⚠ SE SPUN CIFRELE ADEVARATE, nu „gata". Un comerciant care tocmai a facut ceva
 * ce nu se poate lua inapoi are nevoie sa vada ca s-a atins exact ce credea el.
 * Si daca iese `0 comenzi` acolo unde se asteptau trei, se vede pe loc.
 */
export function rezumatulAnonimizarii(u: UrmaAnonimizarii): string {
  const parti: string[] = [];
  if (u.comenzi) parti.push(`${u.comenzi} ${u.comenzi === 1 ? "comandă" : "comenzi"}`);
  if (u.contacte) parti.push(`${u.contacte} ${u.contacte === 1 ? "contact" : "contacte"}`);
  if (u.cosuri) parti.push(`${u.cosuri} ${u.cosuri === 1 ? "coș" : "coșuri"}`);
  if (u.retururi) parti.push(`${u.retururi} ${u.retururi === 1 ? "retur" : "retururi"}`);
  if (u.mesaje) parti.push(`${u.mesaje} ${u.mesaje === 1 ? "SMS" : "SMS-uri"}`);

  if (parti.length === 0) return "Nu era nimic de șters: datele erau deja curățate.";
  return `Date șterse din: ${parti.join(", ")}.`;
}

/** A atins ceva? Folosit ca sa nu se spuna „gata" peste zero randuri. */
export function aAtinsCeva(u: UrmaAnonimizarii): boolean {
  return u.comenzi + u.contacte + u.cosuri + u.retururi + u.mesaje > 0;
}

/**
 * Citeste raspunsul bazei, oricat de ciudat ar fi.
 *
 * ⚠ NU SE CREDE PE CUVANT. Un raspuns gol ar fi fost citit ca `NaN` peste tot,
 * iar rezumatul ar fi scris „NaN comenzi" dupa o operatie fara intoarcere.
 */
export function citesteUrma(x: unknown): UrmaAnonimizarii {
  if (typeof x !== "object" || x === null) return { ...URMA_GOALA };
  const o = x as Record<string, unknown>;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);
  return {
    comenzi: n(o.comenzi), contacte: n(o.contacte), cosuri: n(o.cosuri),
    retururi: n(o.retururi), mesaje: n(o.mesaje),
  };
}
