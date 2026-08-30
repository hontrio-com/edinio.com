/**
 * Textele paginii de start a centrului de ajutor.
 *
 * ⚠ STAU SEPARAT DE DATE, ȘI ĂSTA E TOT ROSTUL FIȘIERULUI. `CautareGhiduri` e
 * componentă de client și are nevoie de textul substituentului din câmp. Luat din
 * `ajutor.ts`, ar fi tras după el toate cele 406 de ghiduri în pachetul trimis
 * browserului, adică exact lucrul pe care indexul separat îl repară.
 *
 * Din schița clientului, cuvânt cu cuvânt. Singura schimbare sunt diacriticele,
 * pe care schița nu le avea fiindcă era scrisă într-un editor de desen.
 */

export const AJUTOR_TITLU = "Cu ce te putem ajuta?";
export const AJUTOR_CAUTARE = "Caută răspunsul la întrebarea ta";
export const AJUTOR_CATEGORII_TITLU = "Găsește răspunsuri rapide în funcție de categorie";
export const AJUTOR_CONTACT_TITLU = "Nu găsești răspunsul la întrebarea ta?";
export const AJUTOR_CONTACT_SUBTITLU = "Contactează-ne";
