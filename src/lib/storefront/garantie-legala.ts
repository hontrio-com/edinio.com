/*
 * Notificarea armonizata privind garantia legala de conformitate (28.09.2026).
 *
 * Obligatorie din 27.09.2026 pentru orice magazin care vinde bunuri: OUG 34/2014
 * art. 4 alin. (1) lit. e) si art. 6 alin. (1) lit. l), in forma data de OUG 18/2026
 * (aplicabila de la 27.09.2026, art. IV alin. (2)). Designul e cel din anexa I la
 * Regulamentul de punere in aplicare (UE) 2025/1960. Lipsa ei se amendeaza cu
 * 7.000-35.000 lei (OUG 34/2014, art. 28 alin. (5) lit. f)).
 *
 * ⚠ IMAGINEA E FISIERUL OFICIAL, NESCHIMBAT: `Legal guarantee_notice_RO.png` (RGB,
 * color) din pachetul Comisiei. Ghidul Comisiei interzice orice modificare, inclusiv
 * conversia de format. Proba `garantie-legala.test.ts` ii tine amprenta.
 *
 * ⚠ SE AFISEAZA LA NIVEL DE MAGAZIN, nu pe fiecare produs („shop level" in ghid):
 * link in subsol, o linie langa butoanele de comanda si in checkout, plus emailul
 * de confirmare. Notificarea intreaga apare la clic, cum arata exemplele din ghid.
 */

export const NOTIFICARE_GARANTIE = {
  src: "/legal/garantie-legala-ro.png",
  latime: 1654,
  inaltime: 2339,
  /* Aceeasi destinatie ca in codul QR din notificare (ghidul cere mereu si un link pe care se poate apasa). */
  url: "https://europa.eu/youreurope/garan%C8%9Bii",
  urlAfisat: "europa.eu/youreurope/garanții",
} as const;

/* Eticheta din exemplele Comisiei („Your legal guarantee rights"). */
export const ETICHETA_GARANTIE = "Drepturile tale privind garanția legală";

/*
 * Textul notificarii, transcris exact din imaginea oficiala: il citesc cititoarele de
 * ecran, pentru care imaginea singura n-ar spune nimic.
 */
export const TEXT_NOTIFICARE_GARANTIE = [
  "GARANȚIA LEGALĂ",
  "Protecția oferită de garanția legală minimă de doi ani pentru bunurile vândute în Uniunea Europeană.",
  "Consumatorii își pot exercita drepturile în baza garanției legale de conformitate, de exemplu în cazul în care bunurile: nu corespund descrierii; nu funcționează astfel cum a fost prevăzut.",
  "Vânzătorii sunt răspunzători pentru orice neconformitate care exista în momentul livrării bunurilor și care este constatată în timpul perioadei de garanție legală. Vânzătorii care se află într-o astfel de situație au obligația să ofere: repararea gratuită sau înlocuirea gratuită a bunului în cauză; în unele cazuri, o reducere de preț sau rambursarea integrală.",
  "În unele țări, perioada de garanție legală este mai lungă. Pentru bunurile de ocazie, se poate aplica o perioadă mai scurtă, însă aceasta nu poate fi mai mică de un an.",
  "Pentru mai multe informații cu privire la drepturile pe care le aveți într-o anumită țară, scanați codul QR de mai jos sau adresați-vă vânzătorului. europa.eu/youreurope/garanții",
  "Ce puteți face dacă bunurile primite sunt neconforme: 1. contactați-l cât mai curând posibil pe vânzător pentru a-i semnala problema; 2. furnizați o dovadă care să ateste achiziționarea bunului, de exemplu o chitanță, o factură sau un extras de cont.",
  "Vânzătorii și producătorii pot oferi și garanții comerciale, care se aplică independent de garanția legală. De exemplu, puteți vedea această etichetă GARAN, care reprezintă o garanție comercială de durabilitate oferită fără costuri suplimentare de către producător și care acoperă întregul bun.",
] as const;
