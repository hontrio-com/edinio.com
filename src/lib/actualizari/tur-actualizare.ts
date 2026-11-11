/*
  Turul actualizarii: fereastra „Ce e nou în Edinio”, aratata o singura data, la prima intrare in panou dupa lansare.

  Cinci pasi, fiecare cu un clip scurt (motion design facut din capturi reale ale editorului, randat cadru cu cadru) si
  doua randuri de text. Clipurile stau in `public/actualizari/editor-2026-11/`, in MP4 (H.264, 1600x900, 60 de cadre pe
  secunda), cu poza de inceput alaturi. Un pas fara clip arata doar poza.

  ⚠ „VAZUT” STA IN `users_profile.announcements_seen_at`, coloana sistemului „Noutăți” (pana acum nefolosita: in productie
  avea valoare la 1 din 202 conturi, la 11.11.2026). Utilizatorul o poate scrie pe randul lui (drept pe coloana, verificat
  si in productie), deci nu trebuie nicio migratie. Fereastra se deschide singura cat timp valoarea lipseste sau e
  dinaintea lansarii; la inchidere devine „acum”. Un tur viitor isi pune data lui de lansare si se vede din nou.
*/

export type PasTur = {
  cheie: string;
  titlu: string;
  text: string;
  /** Clipul pasului; fara el, pasul arata doar poza. */
  video?: { mp4: string };
  /** Poza de dinainte de pornirea clipului (si cea afisata cand miscarea e redusa). */
  poster: string;
};

export type TurActualizare = {
  id: string;
  /** Momentul lansarii: conturile facute dupa el nu vad turul, iar „vazut” dinainte de el nu conteaza. */
  lansare: string;
  eticheta: string;
  pasi: PasTur[];
  final: { eticheta: string; href: string };
};

const DOSAR = "/actualizari/editor-2026-11";
/*
  Un singur format, MP4 (H.264): merge in toate browserele. La 60 de cadre pe secunda WebM-ul (VP9) nu iesea mai mic
  (la pasul 3 chiar mai mare, 4,8 fata de 4,1 MB), iar Chrome l-ar fi ales pe el primul; doua formate dublau dosarul.
*/
const clip = (nume: string) => ({ mp4: `${DOSAR}/${nume}.mp4` });

export const TUR_ACTUALIZARE: TurActualizare = {
  id: "editor-2026-11",
  lansare: "2026-11-11T00:00:00.000Z",
  eticheta: "Ce e nou în Edinio",
  // Textele, a doua versiune (11.11, observatia lui: „suna foarte AI”): spun simplu ce e si unde se apasa.
  pasi: [
    {
      cheie: "editorul",
      titlu: "Editorul nou al magazinului",
      text: "Îl găsești la „Editează magazinul”. În stânga ai secțiunile paginii, în dreapta vezi magazinul. Dai clic pe ce vrei să schimbi și vezi rezultatul pe loc, pe calculator sau pe telefon.",
      video: clip("1-editorul"),
      poster: `${DOSAR}/1-editorul.jpg`,
    },
    {
      cheie: "teme",
      titlu: "30 de teme gata făcute",
      text: "O temă schimbă aspectul întregului magazin: culorile, fonturile și felul în care sunt așezate paginile. O aplici dintr-un clic, iar dacă te răzgândești, revii la ce aveai cu „Pune la loc”.",
      video: clip("2-teme"),
      poster: `${DOSAR}/2-teme.jpg`,
    },
    {
      cheie: "sectiuni",
      titlu: "Adaugi și muți secțiuni",
      text: "Pagina e făcută din secțiuni: bannere, categorii, rânduri de produse. Apeși „+” ca să adaugi una nouă, iar cu clic dreapta o muți mai sus, mai jos sau o ascunzi.",
      video: clip("3-sectiuni"),
      poster: `${DOSAR}/3-sectiuni.jpg`,
    },
    {
      cheie: "pagini",
      titlu: "Pagini noi și pagina de produs",
      text: "Paginile ca „Despre noi” sau „Contact” le faci pornind de la un model gata făcut. Pagina de produs o aranjezi tot din editor și poate arăta altfel pentru fiecare categorie.",
      video: clip("4-pagini"),
      poster: `${DOSAR}/4-pagini.jpg`,
    },
    {
      cheie: "publica",
      titlu: "Publici când ești gata",
      text: "Ce schimbi în editor e o ciornă și nu se vede la clienți până nu apeși „Publică”. Dacă nu-ți place cum a ieșit, din „Istoric” readuci o versiune de dinainte.",
      video: clip("5-publica"),
      poster: `${DOSAR}/5-publica.jpg`,
    },
  ],
  final: { eticheta: "Deschide editorul", href: "/dashboard/editor" },
};

/**
 * Se deschide singura la intrare? Doar daca:
 * - contul e mai vechi decat lansarea (cine se inscrie dupa n-are nimic „nou” de vazut, are inrolarea);
 * - n-a inchis-o inca: `announcements_seen_at` lipseste sau e dinaintea lansarii;
 * - nu e o impersonare: adminul care intra in locul comerciantului nu trebuie sa i-o consume.
 */
export function deschideLaIntrare(
  o: { contCreatLa?: string | null; vazutLa?: string | null; impersonare: boolean },
  tur: Pick<TurActualizare, "lansare"> = TUR_ACTUALIZARE,
): boolean {
  if (o.impersonare) return false;
  const lansare = Date.parse(tur.lansare);
  const creat = o.contCreatLa ? Date.parse(o.contCreatLa) : NaN;
  if (!Number.isFinite(lansare) || !Number.isFinite(creat) || creat >= lansare) return false;
  if (!o.vazutLa) return true;
  const vazut = Date.parse(o.vazutLa);
  return !Number.isFinite(vazut) || vazut < lansare;
}
