import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termeni și condiții | Edinio",
  description:
    "Termenii și condițiile de utilizare a platformei Edinio pentru crearea magazinelor online.",
  alternates: { canonical: "https://www.edinio.com/termeni" },
};

export default function TermeniPage() {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
        Termeni și condiții
      </h1>
      <p className="text-sm text-muted-foreground mb-12">
        Ultima actualizare: 30 mai 2026
      </p>

      <div className="prose prose-gray max-w-none space-y-10 text-foreground/90 leading-relaxed">
        {/* 1 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            1. Identificarea prestatorului
          </h2>
          <p>
            Platforma Edinio (denumită în continuare &quot;Platforma&quot;,
            &quot;Serviciul&quot; sau &quot;Edinio&quot;) este operată de:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>
              <strong>Denumire:</strong> SC VOID SFT GAMES SRL
            </li>
            <li>
              <strong>CUI:</strong> 43474393
            </li>
            <li>
              <strong>Sediu social:</strong> Str. Progresului, Nr. 2, Mătăsari,
              Jud. Gorj, România
            </li>
            <li>
              <strong>Telefon:</strong>{" "}
              <a href="tel:+40750456809" className="text-primary hover:underline">
                0750 456 809
              </a>
            </li>
            <li>
              <strong>Email:</strong>{" "}
              <a
                href="mailto:contact@edinio.com"
                className="text-primary hover:underline"
              >
                contact@edinio.com
              </a>
            </li>
          </ul>
          <p className="mt-3">
            Informațiile de identificare sunt furnizate în conformitate cu Art.
            5 din Legea nr. 365/2002 privind comerțul electronic.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            2. Definiții
          </h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>&quot;Utilizator&quot;</strong> &ndash; orice persoană
              fizică autorizată, persoană juridică sau entitate care își
              creează un cont pe Platformă și utilizează Serviciul.
            </li>
            <li>
              <strong>&quot;Client final&quot;</strong> &ndash; orice persoană
              care vizitează un magazin online creat prin Platformă și/sau
              plasează o comandă prin intermediul acestuia.
            </li>
            <li>
              <strong>&quot;Magazin&quot;</strong> &ndash; magazinul online
              creat și administrat de Utilizator prin intermediul Platformei.
            </li>
            <li>
              <strong>&quot;Cont&quot;</strong> &ndash; contul de utilizator
              creat pe Platformă prin furnizarea datelor de identificare și
              autentificare.
            </li>
            <li>
              <strong>&quot;Abonament&quot;</strong> &ndash; planul tarifar ales
              de Utilizator pentru accesarea Serviciului.
            </li>
          </ul>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            3. Obiectul contractului
          </h2>
          <p>
            Prezentul document reglementează condițiile de utilizare a
            Platformei Edinio, o soluție de tip Software-as-a-Service (SaaS)
            care permite Utilizatorilor să creeze, să configureze și să
            administreze magazine online. Prin crearea unui cont și utilizarea
            Serviciului, Utilizatorul acceptă în mod expres acești Termeni și
            condiții.
          </p>
          <p className="mt-3">
            Contractul la distanță între Utilizator și Prestator se consideră
            încheiat în momentul finalizării procesului de înregistrare, în
            conformitate cu prevederile Legii nr. 365/2002 privind comerțul
            electronic și ale Art. 1766-1771 din Codul Civil român (contractul
            de furnizare).
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            4. Descrierea serviciilor
          </h2>
          <p>Platforma Edinio oferă următoarele funcționalități principale:</p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Crearea și personalizarea unui magazin online (logo, culori, informații)</li>
            <li>Administrarea produselor (adăugare, editare, categorisire, gestionare stoc)</li>
            <li>Primirea și gestionarea comenzilor de la clienții finali</li>
            <li>Integrări cu procesatori de plăți (Stripe, NetOpia)</li>
            <li>Integrări cu servicii de curierat (Cargus, SameDay, DPD, Fan Courier, Colete.ro, Woot)</li>
            <li>Integrări cu servicii de facturare (SmartBill, Oblio, Factura.online)</li>
            <li>Integrări cu servicii de marketing (Google Analytics, Facebook Pixel, TikTok Pixel)</li>
            <li>Notificări prin email și SMS (prin Resend și SMSO)</li>
            <li>Statistici și analize privind traficul și vânzările</li>
            <li>Suport tehnic 7 zile din 7</li>
            <li>Mentenanță gratuită pe toată durata utilizării</li>
          </ul>
          <p className="mt-3">
            Funcționalitățile disponibile pot varia în funcție de planul de
            abonament ales. Prestatorul își rezervă dreptul de a adăuga,
            modifica sau elimina funcționalități, cu notificarea prealabilă a
            Utilizatorilor.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            5. Planuri și tarifare
          </h2>
          <p>Platforma oferă următoarele planuri:</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Plan</th>
                  <th className="text-left py-2 pr-4 font-semibold">Preț</th>
                  <th className="text-left py-2 font-semibold">Limită produse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-4">Testare</td>
                  <td className="py-2 pr-4">Gratuit (15 zile)</td>
                  <td className="py-2">10 produse</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Basic</td>
                  <td className="py-2 pr-4">99 lei/lună</td>
                  <td className="py-2">500 produse</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Premium</td>
                  <td className="py-2 pr-4">249 lei/lună</td>
                  <td className="py-2">2.500 produse</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Ultra</td>
                  <td className="py-2 pr-4">499 lei/lună</td>
                  <td className="py-2">Nelimitat</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            Toate prețurile sunt exprimate în lei (RON) și includ TVA.
            Facturarea se realizează lunar. Plata se efectuează în avans, la
            începutul fiecărei perioade de facturare.
          </p>
          <p className="mt-3">
            Prestatorul își rezervă dreptul de a modifica prețurile, cu
            notificarea Utilizatorilor cu cel puțin 30 de zile înainte de
            aplicarea noilor tarife. Utilizatorul care nu este de acord cu
            noile tarife poate rezilia contractul fără penalități până la data
            intrării în vigoare a noilor prețuri.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            6. Perioada de testare
          </h2>
          <p>
            Edinio oferă o perioadă de testare gratuită de 15 zile
            calendaristice, care începe la momentul creării contului. În
            această perioadă, Utilizatorul are acces la toate funcționalitățile
            Platformei, cu limita de 10 produse.
          </p>
          <p className="mt-3">
            La expirarea perioadei de testare, dacă Utilizatorul nu a ales un
            abonament plătit, accesul la funcționalitățile Platformei va fi
            restricționat. Datele Utilizatorului vor fi păstrate conform
            politicii de retenție a datelor descrise în{" "}
            <Link
              href="/confidentialitate"
              className="text-primary hover:underline"
            >
              Politica de confidențialitate
            </Link>
            .
          </p>
          <p className="mt-3">
            Perioada de testare nu necesită furnizarea datelor de plată (card
            de credit sau alt instrument de plată). Trecerea la un abonament
            plătit se face exclusiv la inițiativa Utilizatorului.
          </p>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            7. Înregistrare și cont
          </h2>
          <p>
            Pentru utilizarea Platformei, este necesară crearea unui cont prin
            furnizarea următoarelor informații: nume complet, adresă de email
            și parolă. Utilizatorul garantează că informațiile furnizate sunt
            corecte, complete și actualizate.
          </p>
          <p className="mt-3">
            Utilizatorul este responsabil pentru păstrarea confidențialității
            datelor de autentificare (email și parolă) și pentru toate
            activitățile desfășurate prin intermediul contului său.
            Utilizatorul se obligă să notifice imediat Prestatorul în cazul
            oricărei utilizări neautorizate a contului.
          </p>
          <p className="mt-3">
            Fiecare Utilizator poate deține un singur cont. Conturile sunt
            netransferabile.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            8. Drepturile și obligațiile Utilizatorului
          </h2>
          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            8.1. Drepturi
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Să utilizeze Platforma conform planului de abonament ales</li>
            <li>Să beneficieze de suport tehnic 7 zile din 7</li>
            <li>Să beneficieze de mentenanță gratuită pe toată durata utilizării</li>
            <li>
              Să solicite exportul datelor sale personale conform{" "}
              <Link href="/gdpr" className="text-primary hover:underline">
                drepturilor GDPR
              </Link>
            </li>
            <li>
              Să rezilieze contractul în orice moment, cu respectarea condițiilor
              din Secțiunea 13
            </li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            8.2. Obligații
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Să furnizeze informații corecte și actualizate</li>
            <li>Să respecte legislația română și europeană în vigoare în activitatea sa comercială</li>
            <li>Să nu utilizeze Platforma în scopuri ilegale, frauduloase sau care încalcă drepturile terților</li>
            <li>Să nu comercializeze produse interzise de legislația în vigoare</li>
            <li>Să respecte drepturile de proprietate intelectuală ale terților</li>
            <li>Să asigure conformitatea magazinului său cu legislația privind protecția consumatorilor (OUG 34/2014, Legea 363/2007)</li>
            <li>
              Să respecte reglementările GDPR în calitate de operator de date
              pentru datele clienților finali colectate prin magazinul său
            </li>
            <li>Să plătească la termen tarifele aferente abonamentului ales</li>
            <li>Să nu încerce să acceseze neautorizat sistemele sau datele altor utilizatori</li>
          </ul>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            9. Drepturile și obligațiile Prestatorului
          </h2>
          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            9.1. Drepturi
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Să suspende sau să restricționeze accesul Utilizatorului în cazul încălcării prezenților Termeni</li>
            <li>Să modifice sau să actualizeze Platforma, inclusiv funcționalități și interfața</li>
            <li>Să efectueze lucrări de mentenanță, cu notificarea prealabilă a Utilizatorilor pentru mentenanță planificată</li>
            <li>Să solicite informații suplimentare pentru verificarea identității Utilizatorului</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            9.2. Obligații
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Să asigure disponibilitatea Platformei în mod rezonabil, cu un nivel țintă de disponibilitate de 99,9%</li>
            <li>Să asigure mentenanță gratuită pe toată durata utilizării Serviciului</li>
            <li>Să ofere suport tehnic 7 zile din 7</li>
            <li>Să protejeze datele Utilizatorilor conform GDPR și legislației aplicabile</li>
            <li>Să notifice Utilizatorii cu privire la orice modificare semnificativă a Serviciului sau a prezenților Termeni cu cel puțin 30 de zile în avans</li>
            <li>Să notifice incidentele de securitate conform Art. 33-34 din GDPR</li>
          </ul>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            10. Conținutul Utilizatorului
          </h2>
          <p>
            Utilizatorul este singurul responsabil pentru conținutul încărcat pe
            Platformă, inclusiv dar fără a se limita la: texte, imagini,
            descrieri de produse, prețuri, politici comerciale și orice alte
            materiale.
          </p>
          <p className="mt-3">
            Utilizatorul garantează că deține toate drepturile necesare asupra
            conținutului publicat și că acesta nu încalcă drepturile de
            proprietate intelectuală ale terților, nu este ilegal, defăimător,
            obscen sau în alt mod contrar legislației în vigoare.
          </p>
          <p className="mt-3">
            Prestatorul nu își asumă responsabilitatea pentru conținutul
            Utilizatorilor, în conformitate cu Art. 14 din Legea 365/2002
            privind răspunderea furnizorilor de servicii de hosting.
            Prestatorul va acționa prompt la notificările privind conținut
            ilegal, conform procedurii de notificare și acțiune.
          </p>
          <p className="mt-3">
            Utilizatorul acordă Prestatorului o licență neexclusivă, gratuită
            și revocabilă de a stoca, afișa și transmite conținutul în scopul
            furnizării Serviciului.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            11. Proprietate intelectuală
          </h2>
          <p>
            Platforma Edinio, inclusiv dar fără a se limita la: codul sursă,
            designul, marca, logo-ul, textele și elementele grafice ale
            Platformei, sunt proprietatea exclusivă a SC VOID SFT GAMES SRL și
            sunt protejate de legislația privind drepturile de autor și
            proprietatea intelectuală.
          </p>
          <p className="mt-3">
            Utilizatorului i se acordă o licență limitată, neexclusivă,
            netransferabilă și revocabilă de a utiliza Platforma conform
            planului de abonament ales. Această licență nu include dreptul de a
            reproduce, distribui, modifica, decomposita sau utiliza în alt mod
            componente ale Platformei.
          </p>
          <p className="mt-3">
            Conținutul creat de Utilizator (produse, texte, imagini proprii)
            rămâne proprietatea Utilizatorului. La încetarea contractului,
            Utilizatorul poate solicita exportul datelor sale.
          </p>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            12. Relația cu clienții finali
          </h2>
          <p>
            Edinio acționează exclusiv ca furnizor de infrastructură tehnică.
            Relația comercială dintre Utilizator și clienții finali ai
            magazinului său este directă și exclusivă. Utilizatorul este
            singurul responsabil pentru:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Respectarea drepturilor consumatorilor conform OUG 34/2014</li>
            <li>Conformitatea produselor vândute cu legislația în vigoare</li>
            <li>Emiterea facturilor și respectarea obligațiilor fiscale</li>
            <li>Gestionarea reclamațiilor, retururilor și garanțiilor</li>
            <li>Respectarea GDPR în calitate de operator de date pentru datele clienților săi</li>
            <li>Afișarea propriilor politici comerciale (termeni, livrare, retur, confidențialitate)</li>
          </ul>
          <p className="mt-3">
            În această relație, Edinio acționează ca persoană împuternicită
            (procesor de date) în sensul Art. 28 din GDPR, prelucrarea datelor
            clienților finali realizându-se exclusiv pe baza instrucțiunilor
            Utilizatorului și în scopul furnizării Serviciului.
          </p>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            13. Dreptul de retragere
          </h2>
          <p>
            În conformitate cu Art. 9 din OUG 34/2014, Utilizatorul
            consumator (persoană fizică) beneficiază de un drept de retragere
            de 14 zile calendaristice de la data încheierii contractului, fără
            a fi necesar să precizeze vreun motiv.
          </p>
          <p className="mt-3">
            Pentru a exercita dreptul de retragere, Utilizatorul trebuie să
            informeze Prestatorul printr-o declarație lipsită de echivoc (de
            exemplu, email la{" "}
            <a
              href="mailto:contact@edinio.com"
              className="text-primary hover:underline"
            >
              contact@edinio.com
            </a>{" "}
            sau scrisoare) cu privire la decizia sa de retragere din contract.
          </p>
          <p className="mt-3">
            În cazul în care Utilizatorul a solicitat în mod expres ca
            furnizarea serviciului să înceapă în perioada de retragere, acesta
            va datora o sumă proporțională cu serviciile furnizate până la data
            la care a informat Prestatorul despre retragere, în conformitate
            cu Art. 16 lit. (a) și lit. (m) din OUG 34/2014.
          </p>
          <p className="mt-3">
            Rambursarea sumelor plătite se va efectua în cel mult 14 zile de la
            data primirii notificării de retragere, utilizând aceeași
            modalitate de plată.
          </p>
        </section>

        {/* 14 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            14. Încetarea contractului
          </h2>
          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            14.1. Rezilierea de către Utilizator
          </h3>
          <p>
            Utilizatorul poate rezilia contractul în orice moment prin
            anularea abonamentului din setările contului sau prin trimiterea
            unui email la{" "}
            <a
              href="mailto:contact@edinio.com"
              className="text-primary hover:underline"
            >
              contact@edinio.com
            </a>
            . Anularea abonamentului nu atrage rambursarea perioadei curente
            deja facturate, dar Utilizatorul va avea acces până la sfârșitul
            perioadei plătite. Procedura de anulare este la fel de accesibilă
            ca procedura de abonare, în conformitate cu OUG 18/2026.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            14.2. Rezilierea de către Prestator
          </h3>
          <p>Prestatorul poate suspenda sau rezilia contractul în cazul în care:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Utilizatorul încalcă prezenții Termeni și condiții</li>
            <li>Utilizatorul utilizează Platforma în scopuri ilegale</li>
            <li>Utilizatorul nu achită tarifele la termen, după o notificare prealabilă de 15 zile</li>
            <li>Utilizatorul desfășoară activități care afectează securitatea sau performanța Platformei</li>
          </ul>
          <p className="mt-3">
            În cazul rezilierii, Prestatorul va notifica Utilizatorul și va
            acorda un termen rezonabil (minimum 15 zile) pentru exportul
            datelor, cu excepția cazurilor de urgență privind securitatea.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            14.3. Efectele încetării
          </h3>
          <p>La încetarea contractului:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Magazinul Utilizatorului va fi dezactivat și nu va mai fi accesibil public</li>
            <li>Utilizatorul poate solicita exportul datelor sale în termen de 30 de zile</li>
            <li>Datele vor fi șterse conform politicii de retenție, cu excepția datelor a căror păstrare este impusă de lege (date fiscale: 10 ani conform Codului Fiscal)</li>
          </ul>
        </section>

        {/* 15 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            15. Limitarea răspunderii
          </h2>
          <p>
            Prestatorul depune eforturi rezonabile pentru a asigura
            disponibilitatea și funcționarea corectă a Platformei. Cu toate
            acestea, Serviciul este furnizat &quot;ca atare&quot; (&quot;as
            is&quot;), iar Prestatorul nu garantează că Platforma va fi
            disponibilă în mod neîntrerupt sau fără erori.
          </p>
          <p className="mt-3">
            În limita permisă de legislația în vigoare, răspunderea
            Prestatorului pentru daune este limitată la valoarea abonamentelor
            plătite de Utilizator în ultimele 12 luni. Această limitare nu se
            aplică în cazul daunelor cauzate cu intenție sau din culpă gravă.
          </p>
          <p className="mt-3">Prestatorul nu este responsabil pentru:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Conținutul publicat de Utilizatori pe magazinele lor</li>
            <li>Tranzacțiile comerciale dintre Utilizatori și clienții lor finali</li>
            <li>Întreruperile cauzate de forță majoră sau de furnizori terți (hosting, plăți, curierat)</li>
            <li>Pierderile de date cauzate de acțiunile sau omisiunile Utilizatorului</li>
            <li>Prejudiciile indirecte, inclusiv pierderi de profit, pierderi de date sau pierderi de reputație</li>
          </ul>
          <p className="mt-3">
            Această clauză de limitare a răspunderii este formulată în
            conformitate cu Legea 193/2000 privind clauzele abuzive și nu
            exclude sau limitează răspunderea pentru daunele cauzate vieții,
            integrității corporale sau sănătății, și nici răspunderea pentru
            dol sau culpă gravă.
          </p>
        </section>

        {/* 16 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            16. Forța majoră
          </h2>
          <p>
            Niciuna dintre părți nu va fi responsabilă pentru neexecutarea sau
            executarea cu întârziere a obligațiilor sale contractuale dacă
            aceasta se datorează unui caz de forță majoră, astfel cum este
            definit de Art. 1351 din Codul Civil român.
          </p>
          <p className="mt-3">
            Partea afectată de un caz de forță majoră va notifica cealaltă
            parte în termen de 5 zile lucrătoare de la producerea evenimentului
            și va depune eforturi rezonabile pentru a limita efectele
            acestuia.
          </p>
        </section>

        {/* 17 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            17. Protecția datelor personale
          </h2>
          <p>
            Prelucrarea datelor cu caracter personal se realizează în
            conformitate cu Regulamentul (UE) 2016/679 (GDPR) și Legea nr.
            190/2018. Detalii complete privind categoriile de date colectate,
            scopurile prelucrării, duratele de stocare și drepturile
            persoanelor vizate sunt disponibile în:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>
              <Link
                href="/confidentialitate"
                className="text-primary hover:underline"
              >
                Politica de confidențialitate
              </Link>
            </li>
            <li>
              <Link href="/cookies" className="text-primary hover:underline">
                Politica cookies
              </Link>
            </li>
            <li>
              <Link href="/gdpr" className="text-primary hover:underline">
                Drepturile GDPR
              </Link>
            </li>
          </ul>
        </section>

        {/* 18 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            18. Modificarea termenilor
          </h2>
          <p>
            Prestatorul își rezervă dreptul de a modifica prezenții Termeni și
            condiții. Orice modificare va fi comunicată Utilizatorilor cu cel
            puțin 30 de zile înainte de intrarea în vigoare, prin email și/sau
            prin notificare în cadrul Platformei.
          </p>
          <p className="mt-3">
            Continuarea utilizării Platformei după intrarea în vigoare a
            modificărilor constituie acceptarea noilor termeni. Utilizatorul
            care nu este de acord cu modificările are dreptul de a rezilia
            contractul fără penalități până la data intrării în vigoare a
            noilor termeni.
          </p>
        </section>

        {/* 19 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            19. Legea aplicabilă și jurisdicția
          </h2>
          <p>
            Prezentul contract este guvernat de legislația română.
          </p>
          <p className="mt-3">
            Orice litigiu decurgând din sau în legătură cu prezenții Termeni și
            condiții va fi soluționat pe cale amiabilă. În cazul în care
            părțile nu ajung la o înțelegere, litigiul va fi supus spre
            soluționare instanțelor judecătorești competente de la sediul
            Prestatorului.
          </p>
        </section>

        {/* 20 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            20. Soluționarea alternativă a litigiilor
          </h2>
          <p>
            În conformitate cu OUG 34/2014 și Regulamentul (UE) 524/2013,
            Utilizatorul consumator poate apela la următoarele mecanisme de
            soluționare alternativă a litigiilor:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>
              <strong>ANPC (Autoritatea Națională pentru Protecția Consumatorilor):</strong>{" "}
              pentru reclamații privind serviciile achiziționate, Utilizatorul
              poate contacta ANPC prin intermediul platformei{" "}
              <a
                href="https://anpc.ro/ce-este-sal/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                SAL (Soluționarea Alternativă a Litigiilor)
              </a>
            </li>
            <li>
              <strong>Platforma SOL a Comisiei Europene:</strong>{" "}
              pentru soluționarea online a litigiilor, Utilizatorul poate
              accesa{" "}
              <a
                href="https://ec.europa.eu/consumers/odr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                platforma SOL
              </a>
            </li>
          </ul>
        </section>

        {/* 21 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            21. Dispoziții finale
          </h2>
          <p>
            În cazul în care o clauză din prezenții Termeni și condiții este
            declarată nulă sau inaplicabilă, celelalte clauze rămân valabile
            și își produc efectele.
          </p>
          <p className="mt-3">
            Faptul că Prestatorul nu exercită un drept prevăzut în prezentul
            contract nu constituie o renunțare la acel drept.
          </p>
          <p className="mt-3">
            Prezenții Termeni și condiții, împreună cu Politica de
            confidențialitate, Politica cookies și pagina Drepturile GDPR,
            constituie întregul acord între părți cu privire la utilizarea
            Platformei.
          </p>
        </section>

        {/* Contact */}
        <section className="bg-muted/50 rounded-xl p-6 mt-12">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Contact
          </h2>
          <p>
            Pentru orice întrebări sau solicitări legate de prezenții Termeni
            și condiții, ne puteți contacta la:
          </p>
          <ul className="mt-3 space-y-1">
            <li>
              Email:{" "}
              <a
                href="mailto:contact@edinio.com"
                className="text-primary hover:underline"
              >
                contact@edinio.com
              </a>
            </li>
            <li>
              Telefon:{" "}
              <a
                href="tel:+40750456809"
                className="text-primary hover:underline"
              >
                0750 456 809
              </a>
            </li>
            <li>
              Adresă: Str. Progresului, Nr. 2, Mătăsari, Jud. Gorj, România
            </li>
          </ul>
        </section>
      </div>
    </article>
  );
}
