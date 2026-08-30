import { Rocket } from "lucide-react";
import type { CategorieAjutor } from "../ajutor-tipuri";

/**
 * Categoria „Primii pași” din centrul de ajutor.
 *
 * ⚠ TEXTELE SUNT CIORNĂ, scrise dintr-un audit al codului panoului, nu din cap.
 * Vezi `../ajutor.ts` pentru cum s-a făcut auditul și ce reguli de scriere se
 * aplică. Clientul le corectează.
 */
export const PRIMII_PASI: CategorieAjutor = {
  slug: "primii-pasi",
  titlu: "Primii pași",
  descriere: "Cont nou, panoul de administrare și publicarea magazinului.",
  icon: Rocket,
  grupuri: [
    {
      titlu: "Intrarea în cont și configurarea magazinului",
      ghiduri: [
        {
          slug: "cum-confirmi-conectarea-cu-codul-primit-pe-email",
          titlu: "Cum confirmi conectarea cu codul primit pe email",
          rezumat: "Cu verificarea în doi pași activă, după parolă introduci un cod de 6 cifre primit pe email.",
          pasi: [
            "Conectează-te cu emailul și parola. Dacă ai verificarea în doi pași activă, ajungi pe ecranul \"Verificare în doi pași\".",
            "Deschide emailul primit. Codul de 6 cifre apare chiar în subiectul mesajului.",
            {
              text: "Scrie codul în câmpul \"Cod de verificare\".",
              captura: { alt: "Ecranul de verificare în doi pași, cu câmpul pentru codul de 6 cifre.", src: "/capturi/ajutor/primii-pasi/cum-confirmi-conectarea-cu-codul-primit-pe-email.webp", raport: 16 / 10 },
            },
            "Apasă \"Verifică\".",
            "Intri în panoul de administrare, sau la pasul 1 de configurare dacă nu l-ai terminat.",
          ],
          detalii: [
            { titlu: "Cât e valabil codul", text: "Zece minute. Pe ecran scrie \"Codul este valabil 10 minute. Dacă nu ai primit emailul, verifică folderul Spam.\"." },
            { titlu: "Dacă butonul nu se apasă", text: "Butonul \"Verifică\" rămâne inactiv până introduci 6 cifre. Câmpul primește doar cifre, literele și semnele sunt ignorate automat." },
            { titlu: "Dacă a expirat sau codul e greșit", text: "Vezi \"Cod incorect sau expirat.\", \"Codul a expirat. Autentifică-te din nou.\" sau \"Sesiune expirată. Autentifică-te din nou.\". Pe acest ecran nu există buton de retrimitere. Reia conectarea de la pagina de conectare și primești un cod nou." },
            { titlu: "Cât timp nu confirmi codul", text: "Orice pagină din panou te aduce înapoi pe ecranul de verificare. Nu poți intra în panou până nu introduci codul." },
          ],
          termeni: ["2FA", "cod de 6 cifre", "verificare în doi pași", "nu primesc codul", "spam"],
        },
        {
          slug: "cum-iti-resetezi-parola-uitata",
          titlu: "Cum îți resetezi parola dacă ai uitat-o",
          rezumat: "Ceri un link pe email din pagina de conectare, apoi setezi parola nouă din acel link.",
          pasi: [
            "Pe pagina de conectare apasă \"Ai uitat parola?\", linkul din dreptul câmpului de parolă.",
            "Pe pagina \"Resetare parolă\" completează \"Adresa de email\".",
            "Apasă \"Trimite link de resetare\".",
            "Ecranul se schimbă în confirmarea \"Email trimis\".",
            "Deschide emailul primit și apasă linkul de resetare. Ajungi pe pagina \"Parolă nouă\".",
            "Completează \"Parolă nouă\" și \"Confirmă parola nouă\".",
            "Apasă \"Setează parola nouă\". Cât timp salvează, butonul scrie \"Se salvează...\".",
            "La confirmarea \"Parola a fost resetată\" apasă \"Mergi la autentificare\" și intră cu parola nouă.",
          ],
          detalii: [
            { titlu: "Ce reguli are parola nouă", text: "Minim 8 caractere, cel puțin o literă mare și cel puțin o cifră, iar cele două câmpuri trebuie să fie identice. Pagina de resetare nu afișează bifele de la înregistrare, deci verifici singur regulile înainte să salvezi. La nepotrivire apare \"Parolele nu coincid\"." },
            { titlu: "De ce mesajul de confirmare e la fel de fiecare dată", text: "Textul \"Dacă există un cont cu această adresă, vei primi un email cu instrucțiunile de resetare a parolei.\" apare indiferent dacă adresa există sau nu în platformă. Așa nu se poate afla din afară cine are cont. Dacă nu primești nimic, verifică folderul Spam și dacă ai scris adresa corect." },
            { titlu: "Dacă linkul nu mai merge", text: "Vezi \"Nu am putut reseta parola. Link-ul poate fi expirat.\". Întoarce-te la \"Ai uitat parola?\" și cere un link nou." },
            { titlu: "Dacă emailul nu pleacă", text: "Apare \"Nu am putut trimite email-ul de resetare. Încearcă din nou.\". Mai încearcă o dată butonul." },
          ],
          termeni: ["am uitat parola", "resetare", "link pe email", "parolă nouă", "recuperare cont"],
        },
        {
          slug: "cum-completezi-datele-magazinului-la-pasul-1",
          titlu: "Cum completezi datele magazinului la pasul 1 din configurare",
          rezumat: "Numele magazinului, telefonul și adresa online sunt cele trei date cu care pornește magazinul.",
          intro: "Pasul 1 apare imediat după ce îți faci contul. Ecranul se numește \"Creează-ți magazinul\", iar sus scrie \"Pasul 1 din 2\".",
          pasi: [
            "Completează \"Numele magazinului\". Este numele pe care îl văd clienții.",
            "Completează \"Numărul de telefon\" în formatul 07XXXXXXXX. La acest număr te contactează clienții.",
            "Verifică \"Adresa magazinului online\". Se completează singură din numele magazinului, dar o poți schimba.",
            "Uită-te sub câmp, unde vezi adresa finală în forma edinio.com/adresa-ta.",
            "Așteaptă verificarea. Bifa verde din dreapta câmpului înseamnă că adresa e liberă, X-ul roșu că e deja folosită.",
            "Apasă \"Continuă\" și treci la alegerea planului.",
          ],
          detalii: [
            { titlu: "Regulile fiecărui câmp", text: "Numele magazinului are între 2 și 100 de caractere, la mai puțin apare \"Minim 2 caractere\". Telefonul se acceptă doar ca număr de 10 cifre care începe cu 07, altfel apare \"Format invalid: 07XXXXXXXX\". Spațiile, liniuțele, parantezele și semnul plus sunt eliminate automat. Adresa online are între 3 și 50 de caractere și primește doar litere mici, cifre și liniuțe." },
            { titlu: "Cum se construiește adresa online", text: "Diacriticele și spațiile din numele magazinului sunt transformate automat, ă devine a, ș devine s, ț devine t. Dacă magazinul se numește Florăria Mirei, adresa propusă este floraria-mirei, iar linkul devine edinio.com/floraria-mirei. Caracterele nepermise sunt șterse pe măsură ce scrii." },
            { titlu: "Când butonul Continuă nu se apasă", text: "Butonul stă inactiv cât timp se verifică adresa și cât timp adresa e ocupată. Schimbă adresa și așteaptă bifa verde." },
            { titlu: "Atenție la adresele care seamănă cu paginile platformei", text: "Verificarea se uită doar în lista de magazine. Cuvinte ca blog, contact sau integrari sunt pagini ale platformei și nu ar funcționa ca adresă de magazin, chiar dacă apar ca disponibile. Alege ceva legat de numele magazinului tău." },
            { titlu: "Ce nu se cere la acest pas", text: "Nu se cer logo, culori sau descriere. Sub buton scrie \"Poți adăuga logo, descriere și toate detaliile din dashboard după creare\"." },
          ],
          nota: "Pasul se poate deschide doar cât timp configurarea nu e terminată. După ce magazinul e creat, adresele de configurare te duc în panoul de administrare.",
          termeni: ["onboarding", "link magazin", "slug", "număr de telefon", "adresă online", "nume magazin"],
        },
        {
          slug: "cum-alegi-planul-si-creezi-magazinul",
          titlu: "Cum alegi planul și creezi magazinul la pasul 2",
          rezumat: "Alegi intervalul de facturare și planul, apoi magazinul se creează, cu plată sau pe testare gratuită.",
          pasi: [
            "După \"Continuă\" ajungi pe ecranul \"Alege planul potrivit\", cu \"Pasul 2 din 2\" sus.",
            "Alege intervalul din comutatorul de sus: \"Lunar\" sau \"Anual\". Lângă \"Anual\" scrie \"3 luni gratis\".",
            "Apasă pe cartonașul planului dorit. Cartonașul ales afișează jos \"Selectat\", celelalte \"Selectează\".",
            "Verifică sub preț cum se facturează, \"Facturat lunar\" sau \"Facturat anual\" cu totalul pe an.",
            "Apasă butonul din dreapta jos. Pentru testare gratuită scrie \"Creează magazinul gratuit\", pentru un plan plătit \"Plătește și creează magazinul\".",
            "La plan plătit ești trimis la pagina de plată cu cardul. După plată te întorci și pe ecran apare \"Se creează magazinul tău...\".",
            "Vezi confirmarea că magazinul a fost creat și intri în panoul de administrare.",
          ],
          detalii: [
            { titlu: "Ce conține fiecare plan", text: "\"Testare gratuită\" este gratuită 15 zile și permite până la 10 produse. \"Basic\" costă 99 lei pe lună și merge până la 500 de produse. \"Premium\" costă 249 lei pe lună, merge până la 2.500 de produse și adaugă manager dedicat. \"Ultra\" costă 499 lei pe lună și are produse nelimitate. Toate au comenzi nelimitate și suport 7 zile din 7, iar planurile plătite includ mentenanță gratuită pe viață." },
            { titlu: "Cum se calculează planul anual", text: "La facturare anuală plătești 9 luni pentru 12, adică 891 lei la Basic, 2241 lei la Premium și 4491 lei la Ultra, o dată pe an. Economia este echivalentul a 3 luni." },
            { titlu: "Ce se întâmplă cu testarea gratuită", text: "Ține 15 zile de la crearea magazinului și acceptă maxim 10 produse. După ce expiră, panoul se blochează pe ecranul de reactivare, de unde alegi un plan plătit. Datele rămân la locul lor." },
            { titlu: "Limita de produse se aplică efectiv", text: "Când o depășești, apare mesajul \"Ai atins limita de ... produse pentru planul tău. Upgradează planul pentru mai multe produse.\". Limitele sunt 10 pe testare, 500 pe Basic, 2500 pe Premium și fără limită pe Ultra." },
            { titlu: "De ce butonul principal nu se apasă", text: "Cât timp nu ai selectat niciun plan, butonul scrie \"Creează magazinul gratuit\" și stă inactiv. Devine \"Plătește și creează magazinul\" doar după ce selectezi un plan plătit." },
            { titlu: "Dacă renunți la pagina de plată", text: "Revii pe pagina de planuri cu mesajul \"Plata a fost anulată. Selectează un plan pentru a continua.\", iar planul ales rămâne selectat. De acolo poți alege alt plan, inclusiv testarea gratuită." },
            { titlu: "Mesaje care pot opri crearea", text: "\"Planul anual nu este disponibil momentan.\" înseamnă că trebuie să treci pe \"Lunar\". \"Această adresă de magazin este deja folosită. Alege alta.\" înseamnă că cineva a luat adresa între timp, întoarce-te cu \"Înapoi\" și schimb-o. Mai pot apărea \"Nu am putut crea magazinul. Încearcă din nou.\", \"Eroare la inițializarea plății.\" sau \"A apărut o eroare. Încearcă din nou.\"." },
            { titlu: "Cum te întorci la pasul 1", text: "Butonul \"Înapoi\" este jos în stânga pe ecrane late. Pe telefon apare sub butonul principal." },
            { titlu: "Cum arată magazinul imediat după creare", text: "Magazinul pornește cu verdele platformei ca și culoare principală. Logo, culori și restul detaliilor le schimbi apoi din panoul de administrare. Primești și emailul care anunță că magazinul tău este live." },
          ],
          nota: "Pagina de plan se deschide doar dacă ai trecut prin pasul 1 în aceeași navigare. Dacă o deschizi direct, ești trimis înapoi la datele magazinului.",
          termeni: ["abonament", "prețuri", "plată card", "testare gratuită", "facturare anuală", "limita de produse"],
        },
        {
          slug: "cum-reactivezi-contul-dupa-expirare",
          titlu: "Cum reactivezi contul după expirarea testării sau a abonamentului",
          rezumat: "Alegi un plan plătit din ecranul de reactivare și accesul la panou revine după plată.",
          pasi: [
            "Când testarea sau abonamentul a expirat, în locul panoului vezi ecranul cu titlul \"Perioada de testare a expirat\" sau \"Abonamentul tău a expirat\".",
            "Alege intervalul de facturare: \"Lunar\" sau \"Anual\".",
            "Alege unul dintre planurile plătite: \"Basic\", \"Premium\" sau \"Ultra\".",
            "Apasă \"Reactivează și plătește\".",
            "Plătește cu cardul pe pagina de plată.",
            "Te întorci pe ecranul \"Se activează abonamentul...\", care se reîmprospătează singur până se deschide accesul.",
            "Când accesul e gata intri în panoul de administrare. Dacă durează, apare și linkul \"Mergi la dashboard\".",
          ],
          detalii: [
            { titlu: "Ce se întâmplă cu datele tale", text: "Pe ecran scrie \"Datele tale (produse, comenzi, setări) sunt păstrate integral.\". Produsele, comenzile și setările rămân acolo unde le-ai lăsat." },
            { titlu: "Aici nu poți alege testarea gratuită", text: "Ecranul afișează doar planuri plătite. Planul propus este cel pe care îl aveai, iar dacă nu era unul plătit, apare preselectat \"Premium\"." },
            { titlu: "Cât se reîmprospătează pagina după plată", text: "Se reîncarcă la fiecare 3 secunde, de cel mult 20 de ori, adică în jur de un minut. Dacă tot nu intri, reîncarcă pagina din browser." },
            { titlu: "Dacă plata nu pornește", text: "Vezi \"Eroare la inițializarea plății.\" sau \"Eroare de rețea. Încearcă din nou.\". Mai apasă o dată butonul, iar dacă se repetă, scrie la contact@edinio.com." },
            { titlu: "Ce mai poți face din acest ecran", text: "Din josul paginii poți apăsa \"Deconectează-te\" sau poți cere ajutor la contact@edinio.com." },
          ],
          nota: "Ecranul apare doar cât timp contul e inactiv. Când abonamentul este activ, ești trimis direct în panoul de administrare.",
          termeni: ["trial expirat", "abonament expirat", "blocat", "plată", "reactivare cont"],
        },
      ],
    },
    {
      titlu: "Panoul principal",
      ghiduri: [
        {
          slug: "cum-parcurgi-lista-configureaza-ti-magazinul",
          titlu: "Cum parcurgi lista \"Configurează-ți magazinul\"",
          rezumat: "Cei patru pași de pornire din Panoul principal, ce face fiecare buton și când se bifează fiecare pas.",
          intro: "Sub bara de status găsești cardul \"Configurează-ți magazinul\", cu un contor de forma bifate/total și o bară de progres.",
          pasi: [
            {
              text: "Intră în Panou principal și uită-te la cardul \"Configurează-ți magazinul\".",
              captura: { alt: "Cardul \"Configurează-ți magazinul\" cu bara de progres și cei patru pași, unul bifat și marcat \"Gata\".", src: "/capturi/ajutor/primii-pasi/cum-parcurgi-lista-configureaza-ti-magazinul.webp", raport: 16 / 10 },
            },
            "Pasul \"Adaugă primul produs\": apasă \"Adaugă\" și ajungi în formularul de produs nou, la /dashboard/products/new.",
            "Pasul \"Personalizează magazinul\": apasă \"Personalizează\" și ajungi în /dashboard/editor.",
            "Pasul \"Publică magazinul\": apasă \"Publică\" și ajungi tot în /dashboard/editor.",
            "Pasul \"Primește prima comandă\": apasă \"Distribuie\" și linkul magazinului se copiază.",
          ],
          detalii: [
            { titlu: "Ce scrie la fiecare pas", text: "\"Adaugă primul produs\" are descrierea \"Fără produse, clienții nu au ce cumpăra.\". \"Personalizează magazinul\" are \"Adaugă logo, culori și detaliile magazinului tău.\". \"Publică magazinul\" are \"Fă magazinul vizibil pentru clienții tăi.\". \"Primește prima comandă\" are \"Distribuie link-ul pe WhatsApp și rețele sociale.\"." },
            { titlu: "Când se bifează fiecare pas", text: "Primul pas se bifează când există cel puțin un produs pe magazin, activ sau nu. Al doilea se bifează fie când magazinul are logo încărcat, fie când ai intrat o dată în pagina Editează magazinul. Al treilea se bifează când magazinul este publicat. Al patrulea se bifează când există cel puțin o comandă pe magazin, în orice stare." },
            { titlu: "Butonul \"Publică\" nu publică din listă", text: "La pasul \"Publică magazinul\", butonul te duce în editor. Dacă vrei să publici dintr-un singur clic, folosește \"Publică acum\" din bara de status a Panoului principal." },
            { titlu: "Pasul 2 se ține minte în browserul curent", text: "Bifarea prin vizitarea editorului este salvată local, în browserul de pe care ai intrat. Pe alt calculator sau în alt browser pasul poate apărea din nou nebifat, dacă magazinul nu are logo încărcat." },
            { titlu: "Cum arată un pas terminat", text: "Un pas bifat apare tăiat și are eticheta \"Gata\". Primul pas nebifat este evidențiat și are butonul plin, ca să știi de unde continui." },
            { titlu: "Ce se întâmplă când bifezi tot", text: "Pe un plan plătit, cardul dispare complet din panou după ce toți cei patru pași sunt bifați. Pe plan gratuit sau trial, în locul lui apare cardul cu îndemnul de a alege un plan." },
          ],
          termeni: ["checklist", "lista de activare", "primii pasi", "progres magazin", "gata", "configurare initiala"],
        },
        {
          slug: "cum-verifici-notificarile-din-clopotel",
          titlu: "Cum verifici notificările din clopoțelul barii de sus",
          rezumat: "Clopoțelul adună comenzile în așteptare și anunțurile platformei, cu filtre și marcare ca citite.",
          pasi: [
            "Apasă butonul cu clopoțel din bara de sus. Eticheta pentru cititoarele de ecran este \"Notificări\", iar pe buton apare numărul de necitite.",
            "În panoul deschis vezi titlul \"Notificări\" și, dacă ai necitite, eticheta cu numărul de notificări noi.",
            "Filtrează cu butoanele \"Toate\", \"Comenzi\" și \"Anunțuri\".",
            "Apasă pe o notificare de comandă, de forma \"Comandă nouă de la numele clientului\", ca să deschizi comanda.",
            "Apasă \"Marchează ca citite\" ca să ștergi toate punctele de necitit.",
            "Jos în panou, apasă \"Vezi toate comenzile\" ca să mergi la /dashboard/orders.",
          ],
          detalii: [
            { titlu: "Ce arată numărul de pe clopoțel", text: "Numărul total de notificări necitite. Când trece de 9, pe buton scrie 9+." },
            { titlu: "De unde vin notificările de comandă", text: "Doar din comenzile aflate în starea în așteptare. O comandă confirmată sau livrată nu mai generează o notificare aici. Fiecare rând arată clientul, suma și cât timp a trecut." },
            { titlu: "Cât se încarcă", text: "Se aduc cel mult 20 de comenzi în așteptare și cel mult 20 de notificări de platformă." },
            { titlu: "Cum se citește vechimea", text: "Scurt: acum, apoi în minute cu m, în ore cu h și în zile cu z." },
            { titlu: "Anunțurile nu se deschid", text: "Un anunț din listă se marchează citit când apeși pe el, dar nu duce nicăieri. Conținutul lui îl citești în secțiunea \"Noutăți\" din josul Panoului principal." },
            { titlu: "Butoane care apar doar în anumite cazuri", text: "\"Marchează ca citite\" apare doar când ai cel puțin o notificare necitită. Butoanele de filtrare apar doar când ai cel puțin o notificare. \"Vezi toate comenzile\" apare doar când există comenzi în listă." },
            { titlu: "Când nu ai nimic", text: "În panou scrie \"Nicio notificare\" și, sub, \"Comenzile și anunțurile vor apărea aici\"." },
          ],
          termeni: ["notificari", "clopotel", "comanda noua", "necitite", "marcheaza ca citite", "9+"],
        },
        {
          slug: "cum-reactionezi-la-bannerele-de-abonament",
          titlu: "Cum reacționezi la bannerele de abonament din capul panoului",
          rezumat: "Cele patru benzi colorate care pot apărea deasupra panoului și ce buton apeși la fiecare.",
          pasi: [
            "Uită-te la banda colorată din capul paginii, deasupra conținutului panoului.",
            "Dacă ești în perioada de testare, bannerul îți spune câte zile mai ai. Apasă \"Alege un plan\" ca să mergi la /dashboard/settings#abonament.",
            "Dacă testarea a expirat, scrie \"Perioada de testare a expirat. Magazinul tău nu mai este vizibil clienților.\". Apasă \"Alege un plan acum\".",
            "Dacă ai abonament plătit și plata a eșuat, scrie \"Plata abonamentului a eșuat și abonamentul a expirat. Reia plata ca să îți păstrezi magazinul activ.\". Apasă \"Reia plata\", care te duce la factura restantă.",
            "Dacă ești în perioada de grație, bannerul îți spune în câte zile va fi suspendat magazinul. Apasă \"Actualizează plata\". Dacă magazinul este deja suspendat, butonul se numește \"Reactivează acum\". Ambele duc la /dashboard/settings.",
          ],
          detalii: [
            { titlu: "Textul exact al bannerului de testare", text: "Când mai ai cel mult 3 zile, mesajul devine urgent, cu altă culoare, și scrie \"Doar 1 zi rămasă din testarea gratuită!\" sau \"Doar 5 zile rămase din testarea gratuită!\", după caz. Peste 3 zile, mesajul este de forma \"7 zile rămase din testarea gratuită\", fără semnul de exclamare." },
            { titlu: "Când nu vezi bannerul de testare", text: "Nu se afișează dacă mai ai peste 15 zile din perioada de testare. Apare doar pe planul gratuit și doar dacă există o dată de expirare setată pe cont." },
            { titlu: "Textul bannerului de grație", text: "\"Plata abonamentului a eșuat. Magazinul tău va fi suspendat în câteva zile dacă nu actualizezi metoda de plată.\", cu numărul de zile în text. Când mai este o singură zi, scrie că magazinul va fi suspendat mâine. Dacă magazinul este deja suspendat, mesajul devine \"Magazinul tău este suspendat și nu mai este vizibil clienților. Actualizează metoda de plată pentru a-l reactiva.\"." },
            { titlu: "Când apare fiecare banner", text: "Bannerul de plată eșuată apare doar pe un plan plătit, fără magazin suspendat, și doar când pe cont există o marcă de plată eșuată. Bannerul de grație apare doar când magazinul are o dată de suspendare setată." },
            { titlu: "Dacă \"Reia plata\" nu deschide nimic", text: "Cât timp se încarcă, pe buton scrie \"Se deschide...\". Dacă nu reușește, apare \"Eroare la deschiderea portalului de plată.\" sau, la probleme de rețea, \"Eroare de rețea. Încearcă din nou.\" Încearcă din nou după câteva momente sau intră în Setări, la secțiunea de abonament." },
            { titlu: "Bannerele nu se pot închide", text: "Nu există buton de închidere. Banda dispare când situația care a generat-o este rezolvată." },
          ],
          termeni: ["banner", "trial expirat", "plata esuata", "perioada de gratie", "suspendat", "reia plata", "reactiveaza"],
        },
      ],
    },
  ],
};
