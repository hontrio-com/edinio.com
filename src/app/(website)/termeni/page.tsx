import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termeni si conditii | Edinio",
  description:
    "Termenii si conditiile de utilizare a platformei Edinio pentru crearea magazinelor online.",
};

export default function TermeniPage() {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
        Termeni si conditii
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
            Platforma Edinio (denumita in continuare &quot;Platforma&quot;,
            &quot;Serviciul&quot; sau &quot;Edinio&quot;) este operata de:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>
              <strong>Denumire:</strong> SC VOID SFT GAMES SRL
            </li>
            <li>
              <strong>CUI:</strong> 43474393
            </li>
            <li>
              <strong>Sediu social:</strong> Str. Progresului, Nr. 2, Matasari,
              Jud. Gorj, Romania
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
            Informatiile de identificare sunt furnizate in conformitate cu Art.
            5 din Legea nr. 365/2002 privind comertul electronic.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            2. Definitii
          </h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>&quot;Utilizator&quot;</strong> &ndash; orice persoana
              fizica autorizata, persoana juridica sau entitate care isi
              creeaza un cont pe Platforma si utilizeaza Serviciul.
            </li>
            <li>
              <strong>&quot;Client final&quot;</strong> &ndash; orice persoana
              care viziteaza un magazin online creat prin Platforma si/sau
              plaseaza o comanda prin intermediul acestuia.
            </li>
            <li>
              <strong>&quot;Magazin&quot;</strong> &ndash; magazinul online
              creat si administrat de Utilizator prin intermediul Platformei.
            </li>
            <li>
              <strong>&quot;Cont&quot;</strong> &ndash; contul de utilizator
              creat pe Platforma prin furnizarea datelor de identificare si
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
            Prezentul document reglementeaza conditiile de utilizare a
            Platformei Edinio, o solutie de tip Software-as-a-Service (SaaS)
            care permite Utilizatorilor sa creeze, sa configureze si sa
            administreze magazine online. Prin crearea unui cont si utilizarea
            Serviciului, Utilizatorul accepta in mod expres acesti Termeni si
            conditii.
          </p>
          <p className="mt-3">
            Contractul la distanta intre Utilizator si Prestator se considera
            incheiat in momentul finalizarii procesului de inregistrare, in
            conformitate cu prevederile Legii nr. 365/2002 privind comertul
            electronic si ale Art. 1766-1771 din Codul Civil roman (contractul
            de furnizare).
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            4. Descrierea serviciilor
          </h2>
          <p>Platforma Edinio ofera urmatoarele functionalitati principale:</p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Crearea si personalizarea unui magazin online (logo, culori, informatii)</li>
            <li>Administrarea produselor (adaugare, editare, categorisire, gestionare stoc)</li>
            <li>Primirea si gestionarea comenzilor de la clientii finali</li>
            <li>Integrari cu procesatori de plati (Stripe, NetOpia)</li>
            <li>Integrari cu servicii de curierat (Cargus, SameDay, DPD, Fan Courier, Colete.ro, Woot)</li>
            <li>Integrari cu servicii de facturare (SmartBill, Oblio, Factura.online)</li>
            <li>Integrari cu servicii de marketing (Google Analytics, Facebook Pixel, TikTok Pixel)</li>
            <li>Notificari prin email si SMS (prin Resend si SMSO)</li>
            <li>Statistici si analize privind traficul si vanzarile</li>
            <li>Suport tehnic 7 zile din 7</li>
            <li>Mentenanta gratuita pe toata durata utilizarii</li>
          </ul>
          <p className="mt-3">
            Functionaltatile disponibile pot varia in functie de planul de
            abonament ales. Prestatorul isi rezerva dreptul de a adauga,
            modifica sau elimina functionalitati, cu notificarea prealabila a
            Utilizatorilor.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            5. Planuri si tarifare
          </h2>
          <p>Platforma ofera urmatoarele planuri:</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Plan</th>
                  <th className="text-left py-2 pr-4 font-semibold">Pret</th>
                  <th className="text-left py-2 font-semibold">Limita produse</th>
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
                  <td className="py-2 pr-4">99 lei/luna</td>
                  <td className="py-2">500 produse</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Premium</td>
                  <td className="py-2 pr-4">249 lei/luna</td>
                  <td className="py-2">2.500 produse</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Ultra</td>
                  <td className="py-2 pr-4">499 lei/luna</td>
                  <td className="py-2">Nelimitat</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            Toate preturile sunt exprimate in lei (RON) si includ TVA.
            Facturarea se realizeaza lunar. Plata se efectueaza in avans, la
            inceputul fiecarei perioade de facturare.
          </p>
          <p className="mt-3">
            Prestatorul isi rezerva dreptul de a modifica preturile, cu
            notificarea Utilizatorilor cu cel putin 30 de zile inainte de
            aplicarea noilor tarife. Utilizatorul care nu este de acord cu
            noile tarife poate rezilia contractul fara penalitati pana la data
            intrarii in vigoare a noilor preturi.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            6. Perioada de testare
          </h2>
          <p>
            Edinio ofera o perioada de testare gratuita de 15 zile
            calendaristice, care incepe la momentul crearii contului. In
            aceasta perioada, Utilizatorul are acces la toate functionaliatile
            Platformei, cu limita de 10 produse.
          </p>
          <p className="mt-3">
            La expirarea perioadei de testare, daca Utilizatorul nu a ales un
            abonament platit, accesul la functionalitatile Platformei va fi
            restrictionat. Datele Utilizatorului vor fi pastrate conform
            politicii de retentie a datelor descrise in{" "}
            <Link
              href="/confidentialitate"
              className="text-primary hover:underline"
            >
              Politica de confidentialitate
            </Link>
            .
          </p>
          <p className="mt-3">
            Perioada de testare nu necesita furnizarea datelor de plata (card
            de credit sau alt instrument de plata). Trecerea la un abonament
            platit se face exclusiv la initiativa Utilizatorului.
          </p>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            7. Inregistrare si cont
          </h2>
          <p>
            Pentru utilizarea Platformei, este necesara crearea unui cont prin
            furnizarea urmatoarelor informatii: nume complet, adresa de email
            si parola. Utilizatorul garanteaza ca informatiile furnizate sunt
            corecte, complete si actualizate.
          </p>
          <p className="mt-3">
            Utilizatorul este responsabil pentru pastrarea confidentialitatii
            datelor de autentificare (email si parola) si pentru toate
            activitatile desfasurate prin intermediul contului sau.
            Utilizatorul se obliga sa notifice imediat Prestatorul in cazul
            oricarei utilizari neautorizate a contului.
          </p>
          <p className="mt-3">
            Fiecare Utilizator poate detine un singur cont. Conturile sunt
            netransferabile.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            8. Drepturile si obligatiile Utilizatorului
          </h2>
          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            8.1. Drepturi
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Sa utilizeze Platforma conform planului de abonament ales</li>
            <li>Sa beneficieze de suport tehnic 7 zile din 7</li>
            <li>Sa beneficieze de mentenanta gratuita pe toata durata utilizarii</li>
            <li>
              Sa solicite exportul datelor sale personale conform{" "}
              <Link href="/gdpr" className="text-primary hover:underline">
                drepturilor GDPR
              </Link>
            </li>
            <li>
              Sa rezilieze contractul in orice moment, cu respectarea conditiilor
              din Sectiunea 13
            </li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            8.2. Obligatii
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Sa furnizeze informatii corecte si actualizate</li>
            <li>Sa respecte legislatia romana si europeana in vigoare in activitatea sa comerciala</li>
            <li>Sa nu utilizeze Platforma in scopuri ilegale, frauduloase sau care incalca drepturile tertilor</li>
            <li>Sa nu comercializeze produse interzise de legislatia in vigoare</li>
            <li>Sa respecte drepturile de proprietate intelectuala ale tertilor</li>
            <li>Sa asigure conformitatea magazinului sau cu legislatia privind protectia consumatorilor (OUG 34/2014, Legea 363/2007)</li>
            <li>
              Sa respecte reglementarile GDPR in calitate de operator de date
              pentru datele clientilor finali colectate prin magazinul sau
            </li>
            <li>Sa plateasca la termen tarifele aferente abonamentului ales</li>
            <li>Sa nu incerce sa acceseze neautorizat sistemele sau datele altor utilizatori</li>
          </ul>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            9. Drepturile si obligatiile Prestatorului
          </h2>
          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            9.1. Drepturi
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Sa suspende sau sa restrictioneze accesul Utilizatorului in cazul incalcarii prezentilor Termeni</li>
            <li>Sa modifice sau sa actualizeze Platforma, inclusiv functionalitati si interfata</li>
            <li>Sa efectueze lucrari de mentenanta, cu notificarea prealabila a Utilizatorilor pentru mentenanta planificata</li>
            <li>Sa solicite informatii suplimentare pentru verificarea identitatii Utilizatorului</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            9.2. Obligatii
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Sa asigure disponibilitatea Platformei in mod rezonabil, cu un nivel tinta de disponibilitate de 99,9%</li>
            <li>Sa asigure mentenanta gratuita pe toata durata utilizarii Serviciului</li>
            <li>Sa ofere suport tehnic 7 zile din 7</li>
            <li>Sa protejeze datele Utilizatorilor conform GDPR si legislatiei aplicabile</li>
            <li>Sa notifice Utilizatorii cu privire la orice modificare semnificativa a Serviciului sau a prezentilor Termeni cu cel putin 30 de zile in avans</li>
            <li>Sa notifice incidentele de securitate conform Art. 33-34 din GDPR</li>
          </ul>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            10. Continutul Utilizatorului
          </h2>
          <p>
            Utilizatorul este singurul responsabil pentru continutul incarcat pe
            Platforma, inclusiv dar fara a se limita la: texte, imagini,
            descrieri de produse, preturi, politici comerciale si orice alte
            materiale.
          </p>
          <p className="mt-3">
            Utilizatorul garanteaza ca detine toate drepturile necesare asupra
            continutului publicat si ca acesta nu incalca drepturile de
            proprietate intelectuala ale tertilor, nu este ilegal, defaimator,
            obscen sau in alt mod contrar legislatiei in vigoare.
          </p>
          <p className="mt-3">
            Prestatorul nu isi asuma responsabilitatea pentru continutul
            Utilizatorilor, in conformitate cu Art. 14 din Legea 365/2002
            privind raspunderea furnizorilor de servicii de hosting.
            Prestatorul va actiona prompt la notificarile privind continut
            ilegal, conform procedurii de notificare si actiune.
          </p>
          <p className="mt-3">
            Utilizatorul acorda Prestatorului o licenta neexclusiva, gratuita
            si revocabila de a stoca, afisa si transmite continutul in scopul
            furnizarii Serviciului.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            11. Proprietate intelectuala
          </h2>
          <p>
            Platforma Edinio, inclusiv dar fara a se limita la: codul sursa,
            designul, marca, logo-ul, textele si elementele grafice ale
            Platformei, sunt proprietatea exclusiva a SC VOID SFT GAMES SRL si
            sunt protejate de legislatia privind drepturile de autor si
            proprietatea intelectuala.
          </p>
          <p className="mt-3">
            Utilizatorului i se acorda o licenta limitata, neexclusiva,
            netransferabila si revocabila de a utiliza Platforma conform
            planului de abonament ales. Aceasta licenta nu include dreptul de a
            reproduce, distribui, modifica, decomposita sau utiliza in alt mod
            componente ale Platformei.
          </p>
          <p className="mt-3">
            Continutul creat de Utilizator (produse, texte, imagini proprii)
            ramane proprietatea Utilizatorului. La incetarea contractului,
            Utilizatorul poate solicita exportul datelor sale.
          </p>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            12. Relatia cu clientii finali
          </h2>
          <p>
            Edinio actioneaza exclusiv ca furnizor de infrastructura tehnica.
            Relatia comerciala dintre Utilizator si clientii finali ai
            magazinului sau este directa si exclusiva. Utilizatorul este
            singurul responsabil pentru:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Respectarea drepturilor consumatorilor conform OUG 34/2014</li>
            <li>Conformitatea produselor vandute cu legislatia in vigoare</li>
            <li>Emiterea facturilor si respectarea obligatiilor fiscale</li>
            <li>Gestionarea reclamatiilor, retururilor si garantiilor</li>
            <li>Respectarea GDPR in calitate de operator de date pentru datele clientilor sai</li>
            <li>Afisarea propriilor politici comerciale (termeni, livrare, retur, confidentialitate)</li>
          </ul>
          <p className="mt-3">
            In aceasta relatie, Edinio actioneaza ca persoana imputernicita
            (procesor de date) in sensul Art. 28 din GDPR, prelucrarea datelor
            clientilor finali realizandu-se exclusiv pe baza instructiunilor
            Utilizatorului si in scopul furnizarii Serviciului.
          </p>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            13. Dreptul de retragere
          </h2>
          <p>
            In conformitate cu Art. 9 din OUG 34/2014, Utilizatorul
            consumator (persoana fizica) beneficiaza de un drept de retragere
            de 14 zile calendaristice de la data incheierii contractului, fara
            a fi necesar sa precizeze vreun motiv.
          </p>
          <p className="mt-3">
            Pentru a exercita dreptul de retragere, Utilizatorul trebuie sa
            informeze Prestatorul printr-o declaratie lipsita de echivoc (de
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
            In cazul in care Utilizatorul a solicitat in mod expres ca
            furnizarea serviciului sa inceapa in perioada de retragere, acesta
            va datora o suma proportionala cu serviciile furnizate pana la data
            la care a informat Prestatorul despre retragere, in conformitate
            cu Art. 16 lit. (a) si lit. (m) din OUG 34/2014.
          </p>
          <p className="mt-3">
            Rambursarea sumelor platite se va efectua in cel mult 14 zile de la
            data primirii notificarii de retragere, utilizand aceeasi
            modalitate de plata.
          </p>
        </section>

        {/* 14 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            14. Incetarea contractului
          </h2>
          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            14.1. Rezilierea de catre Utilizator
          </h3>
          <p>
            Utilizatorul poate rezilia contractul in orice moment prin
            anularea abonamentului din setarile contului sau prin trimiterea
            unui email la{" "}
            <a
              href="mailto:contact@edinio.com"
              className="text-primary hover:underline"
            >
              contact@edinio.com
            </a>
            . Anularea abonamentului nu atrage rambursarea perioadei curente
            deja facturate, dar Utilizatorul va avea acces pana la sfarsitul
            perioadei platite. Procedura de anulare este la fel de accesibila
            ca procedura de abonare, in conformitate cu OUG 18/2026.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            14.2. Rezilierea de catre Prestator
          </h3>
          <p>Prestatorul poate suspenda sau rezilia contractul in cazul in care:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Utilizatorul incalca prezentii Termeni si conditii</li>
            <li>Utilizatorul utilizeaza Platforma in scopuri ilegale</li>
            <li>Utilizatorul nu achita tarifele la termen, dupa o notificare prealabila de 15 zile</li>
            <li>Utilizatorul desfasoara activitati care afecteaza securitatea sau performanta Platformei</li>
          </ul>
          <p className="mt-3">
            In cazul rezilierii, Prestatorul va notifica Utilizatorul si va
            acorda un termen rezonabil (minimum 15 zile) pentru exportul
            datelor, cu exceptia cazurilor de urgenta privind securitatea.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            14.3. Efectele incetarii
          </h3>
          <p>La incetarea contractului:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Magazinul Utilizatorului va fi dezactivat si nu va mai fi accesibil public</li>
            <li>Utilizatorul poate solicita exportul datelor sale in termen de 30 de zile</li>
            <li>Datele vor fi sterse conform politicii de retentie, cu exceptia datelor a caror pastrare este impusa de lege (date fiscale: 10 ani conform Codului Fiscal)</li>
          </ul>
        </section>

        {/* 15 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            15. Limitarea raspunderii
          </h2>
          <p>
            Prestatorul depune eforturi rezonabile pentru a asigura
            disponibilitatea si functionarea corecta a Platformei. Cu toate
            acestea, Serviciul este furnizat &quot;ca atare&quot; (&quot;as
            is&quot;), iar Prestatorul nu garanteaza ca Platforma va fi
            disponibila in mod neintrerupt sau fara erori.
          </p>
          <p className="mt-3">
            In limita permisa de legislatia in vigoare, raspunderea
            Prestatorului pentru daune este limitata la valoarea abonamentelor
            platite de Utilizator in ultimele 12 luni. Aceasta limitare nu se
            aplica in cazul daunelor cauzate cu intentie sau din culpa grava.
          </p>
          <p className="mt-3">Prestatorul nu este responsabil pentru:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Continutul publicat de Utilizatori pe magazinele lor</li>
            <li>Tranzactiile comerciale dintre Utilizatori si clientii lor finali</li>
            <li>Intreruperile cauzate de forta majora sau de furnizori terti (hosting, plati, curierat)</li>
            <li>Pierderile de date cauzate de actiunile sau omisiunile Utilizatorului</li>
            <li>Prejudiciile indirecte, inclusiv pierderi de profit, pierderi de date sau pierderi de reputatie</li>
          </ul>
          <p className="mt-3">
            Aceasta clauza de limitare a raspunderii este formulata in
            conformitate cu Legea 193/2000 privind clauzele abuzive si nu
            exclude sau limiteaza raspunderea pentru daunele cauzate vietii,
            integritatii corporale sau sanatatii, si nici raspunderea pentru
            dol sau culpa grava.
          </p>
        </section>

        {/* 16 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            16. Forta majora
          </h2>
          <p>
            Niciuna dintre parti nu va fi responsabila pentru neexecutarea sau
            executarea cu intarziere a obligatiilor sale contractuale daca
            aceasta se datoreaza unui caz de forta majora, astfel cum este
            definit de Art. 1351 din Codul Civil roman.
          </p>
          <p className="mt-3">
            Partea afectata de un caz de forta majora va notifica cealalta
            parte in termen de 5 zile lucratoare de la producerea evenimentului
            si va depune eforturi rezonabile pentru a limita efectele
            acestuia.
          </p>
        </section>

        {/* 17 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            17. Protectia datelor personale
          </h2>
          <p>
            Prelucrarea datelor cu caracter personal se realizeaza in
            conformitate cu Regulamentul (UE) 2016/679 (GDPR) si Legea nr.
            190/2018. Detalii complete privind categoriile de date colectate,
            scopurile prelucrarii, duratele de stocare si drepturile
            persoanelor vizate sunt disponibile in:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>
              <Link
                href="/confidentialitate"
                className="text-primary hover:underline"
              >
                Politica de confidentialitate
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
            Prestatorul isi rezerva dreptul de a modifica prezentii Termeni si
            conditii. Orice modificare va fi comunicata Utilizatorilor cu cel
            putin 30 de zile inainte de intrarea in vigoare, prin email si/sau
            prin notificare in cadrul Platformei.
          </p>
          <p className="mt-3">
            Continuarea utilizarii Platformei dupa intrarea in vigoare a
            modificarilor constituie acceptarea noilor termeni. Utilizatorul
            care nu este de acord cu modificarile are dreptul de a rezilia
            contractul fara penalitati pana la data intrarii in vigoare a
            noilor termeni.
          </p>
        </section>

        {/* 19 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            19. Legea aplicabila si jurisdictia
          </h2>
          <p>
            Prezentul contract este guvernat de legislatia romana.
          </p>
          <p className="mt-3">
            Orice litigiu decurgand din sau in legatura cu prezentii Termeni si
            conditii va fi solutionat pe cale amiabila. In cazul in care
            partile nu ajung la o intelegere, litigiul va fi supus spre
            solutionare instantelor judecatoresti competente de la sediul
            Prestatorului.
          </p>
        </section>

        {/* 20 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            20. Solutionarea alternativa a litigiilor
          </h2>
          <p>
            In conformitate cu OUG 34/2014 si Regulamentul (UE) 524/2013,
            Utilizatorul consumator poate apela la urmatoarele mecanisme de
            solutionare alternativa a litigiilor:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>
              <strong>ANPC (Autoritatea Nationala pentru Protectia Consumatorilor):</strong>{" "}
              pentru reclamatii privind serviciile achizitionate, Utilizatorul
              poate contacta ANPC prin intermediul platformei{" "}
              <a
                href="https://anpc.ro/ce-este-sal/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                SAL (Solutionarea Alternativa a Litigiilor)
              </a>
            </li>
            <li>
              <strong>Platforma SOL a Comisiei Europene:</strong>{" "}
              pentru solutionarea online a litigiilor, Utilizatorul poate
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
            21. Dispozitii finale
          </h2>
          <p>
            In cazul in care o clauza din prezentii Termeni si conditii este
            declarata nula sau inaplicabila, celelalte clauze raman valabile
            si isi produc efectele.
          </p>
          <p className="mt-3">
            Faptul ca Prestatorul nu exercita un drept prevazut in prezentul
            contract nu constituie o renuntare la acel drept.
          </p>
          <p className="mt-3">
            Prezentii Termeni si conditii, impreuna cu Politica de
            confidentialitate, Politica cookies si pagina Drepturile GDPR,
            constituie intregul acord intre parti cu privire la utilizarea
            Platformei.
          </p>
        </section>

        {/* Contact */}
        <section className="bg-muted/50 rounded-xl p-6 mt-12">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Contact
          </h2>
          <p>
            Pentru orice intrebari sau solicitari legate de prezentii Termeni
            si conditii, ne puteti contacta la:
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
              Adresa: Str. Progresului, Nr. 2, Matasari, Jud. Gorj, Romania
            </li>
          </ul>
        </section>
      </div>
    </article>
  );
}
