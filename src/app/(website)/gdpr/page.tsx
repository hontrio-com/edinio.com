import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Drepturile GDPR | Edinio",
  description:
    "Drepturile dumneavoastra privind protectia datelor personale conform Regulamentului (UE) 2016/679 (GDPR).",
};

export default function GDPRPage() {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
        Drepturile dumneavoastra GDPR
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        Ultima actualizare: 30 mai 2026
      </p>
      <p className="text-muted-foreground mb-12">
        Regulamentul General privind Protectia Datelor (Regulamentul (UE)
        2016/679, denumit &quot;GDPR&quot;) va confera o serie de drepturi cu
        privire la datele dumneavoastra personale. Aceasta pagina descrie
        fiecare drept in detaliu si modul in care il puteti exercita.
      </p>

      <div className="prose prose-gray max-w-none space-y-10 text-foreground/90 leading-relaxed">
        {/* 1 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            1. Dreptul de acces (Art. 15 GDPR)
          </h2>
          <p>
            Aveti dreptul de a obtine de la Edinio o confirmare ca datele
            dumneavoastra personale sunt sau nu prelucrate si, in caz
            afirmativ, acces la datele respective si la urmatoarele informatii:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Scopurile prelucrarii</li>
            <li>Categoriile de date personale vizate</li>
            <li>Destinatarii sau categoriile de destinatari carora le-au fost sau le vor fi comunicate datele</li>
            <li>Durata prevazuta de stocare sau criteriile utilizate pentru determinarea acesteia</li>
            <li>Existenta dreptului de a solicita rectificarea, stergerea sau restrictionarea prelucrarii</li>
            <li>Dreptul de a depune o plangere la ANSPDCP</li>
            <li>Sursa datelor (daca nu au fost colectate direct de la dumneavoastra)</li>
            <li>Existenta unui proces decizional automatizat, inclusiv profilare</li>
          </ul>
          <p className="mt-3">
            Va vom furniza o copie a datelor personale prelucrate, in format
            electronic, in mod gratuit. Pentru copii suplimentare, putem
            percepe un cost rezonabil bazat pe costurile administrative.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            2. Dreptul la rectificare (Art. 16 GDPR)
          </h2>
          <p>
            Aveti dreptul de a obtine, fara intarziere, rectificarea datelor
            personale inexacte care va privesc. De asemenea, aveti dreptul de a
            obtine completarea datelor personale incomplete.
          </p>
          <p className="mt-3">
            <strong>Cum procedati:</strong> Multe date pot fi corectate direct
            din contul dumneavoastra (Setari &rarr; Profil / Setari &rarr;
            Magazin). Pentru datele care nu pot fi modificate din interfata,
            trimiteti o solicitare la{" "}
            <a href="mailto:contact@edinio.com" className="text-primary hover:underline">
              contact@edinio.com
            </a>.
          </p>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            3. Dreptul la stergere &ndash; &quot;Dreptul de a fi uitat&quot;
            (Art. 17 GDPR)
          </h2>
          <p>
            Aveti dreptul de a solicita stergerea datelor personale care va
            privesc, fara intarziere nejustificata, in urmatoarele situatii:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Datele nu mai sunt necesare in raport cu scopurile pentru care au fost colectate</li>
            <li>Va retrageti consimtamantul si nu exista alt temei legal pentru prelucrare</li>
            <li>Va opuneti prelucrarii si nu exista motive legitime prevalente</li>
            <li>Datele au fost prelucrate ilegal</li>
            <li>Datele trebuie sterse pentru respectarea unei obligatii legale</li>
          </ul>
          <p className="mt-3">
            <strong>Ce se intampla la stergerea contului:</strong>
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Magazinul dumneavoastra va fi dezactivat imediat si nu va mai fi accesibil public</li>
            <li>Datele de profil, afacere, produse si configurari vor fi sterse in termen de 30 de zile</li>
            <li>Datele de autentificare vor fi sterse permanent</li>
          </ul>
          <p className="mt-3">
            <strong>Exceptii:</strong> Anumite date nu pot fi sterse inainte de
            expirarea termenelor legale de pastrare:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Datele fiscale si facturile: 10 ani (conform Codului Fiscal roman)</li>
            <li>Datele necesare pentru constatarea, exercitarea sau apararea unui drept in instanta</li>
          </ul>
          <p className="mt-3">
            Stergerea contului se poate realiza din Setari &rarr; Cont &rarr;
            Stergere cont sau prin solicitare la{" "}
            <a href="mailto:contact@edinio.com" className="text-primary hover:underline">
              contact@edinio.com
            </a>.
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            4. Dreptul la restrictionarea prelucrarii (Art. 18 GDPR)
          </h2>
          <p>
            Aveti dreptul de a solicita restrictionarea prelucrarii datelor
            dumneavoastra personale in urmatoarele cazuri:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Contestati exactitatea datelor &ndash; pe durata verificarii de catre noi</li>
            <li>Prelucrarea este ilegala, dar preferati restrictionarea in locul stergerii</li>
            <li>Nu mai avem nevoie de date, dar dumneavoastra le solicitati pentru constatarea, exercitarea sau apararea unui drept in instanta</li>
            <li>V-ati opus prelucrarii &ndash; pe durata verificarii daca interesele noastre legitime prevaleaza</li>
          </ul>
          <p className="mt-3">
            In perioada de restrictionare, datele vor fi stocate dar nu vor fi
            prelucrate (cu exceptia stocarii), fara consimtamantul
            dumneavoastra.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            5. Dreptul la portabilitatea datelor (Art. 20 GDPR)
          </h2>
          <p>
            Aveti dreptul de a primi datele personale pe care ni le-ati
            furnizat intr-un format structurat, utilizat in mod curent si care
            poate fi citit automat (de ex. JSON, CSV). De asemenea, aveti
            dreptul de a transmite aceste date altui operator.
          </p>
          <p className="mt-3">
            Acest drept se aplica datelor prelucrate pe baza consimtamantului
            sau a executarii contractului si care sunt prelucrate prin
            mijloace automatizate.
          </p>
          <p className="mt-3">
            <strong>Ce date puteti exporta:</strong>
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Datele de profil (nume, email, telefon)</li>
            <li>Datele afacerii (nume, adresa, configurari)</li>
            <li>Lista de produse (nume, descrieri, preturi, imagini)</li>
            <li>Istoricul comenzilor (detalii comenzi, clienti, sume)</li>
            <li>Datele analitice (statistici trafic si vanzari)</li>
          </ul>
          <p className="mt-3">
            Solicitarile de export se trimit la{" "}
            <a href="mailto:contact@edinio.com" className="text-primary hover:underline">
              contact@edinio.com
            </a>
            . Vom furniza datele in termen de 30 de zile.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            6. Dreptul la opozitie (Art. 21 GDPR)
          </h2>
          <p>
            Aveti dreptul de a va opune, in orice moment, prelucrarii datelor
            personale care va privesc, atunci cand prelucrarea se bazeaza pe
            interesul nostru legitim (Art. 6 alin. 1 lit. f din GDPR).
          </p>
          <p className="mt-3">
            In cazul exercitarii dreptului la opozitie, vom inceta prelucrarea
            datelor, cu exceptia cazului in care demonstram motive legitime si
            imperioase care prevaleaza asupra intereselor, drepturilor si
            libertatilor dumneavoastra sau daca prelucrarea este necesara
            pentru constatarea, exercitarea sau apararea unui drept in instanta.
          </p>
          <p className="mt-3">
            <strong>Opozitia la marketing direct:</strong> Aveti dreptul de a
            va opune in orice moment prelucrarii datelor in scopuri de
            marketing direct, inclusiv profilarea in masura in care aceasta
            este legata de marketingul direct. In caz de opozitie, datele nu
            vor mai fi prelucrate in acest scop.
          </p>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            7. Dreptul de a nu fi supus deciziilor automate (Art. 22 GDPR)
          </h2>
          <p>
            Aveti dreptul de a nu fi supus unei decizii bazate exclusiv pe
            prelucrare automatizata, inclusiv profilare, care produce efecte
            juridice care va privesc sau va afecteaza in mod similar
            semnificativ.
          </p>
          <p className="mt-3">
            <strong>Situatia curenta:</strong> Edinio nu utilizeaza procese
            decizionale automatizate care produc efecte juridice sau similare
            asupra Utilizatorilor. Platforma nu ia decizii automate privind
            aprobarea sau respingerea conturilor, comenzilor sau altor
            servicii pe baza exclusiva a procesarii automate a datelor
            personale.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            8. Dreptul de retragere a consimtamantului (Art. 7 GDPR)
          </h2>
          <p>
            In cazul in care prelucrarea datelor se bazeaza pe consimtamantul
            dumneavoastra, aveti dreptul de a retrage consimtamantul in orice
            moment, fara a afecta legalitatea prelucrarii efectuate pe baza
            consimtamantului inainte de retragerea acestuia.
          </p>
          <p className="mt-3">
            Retragerea consimtamantului este la fel de simpla ca si acordarea
            lui. Puteti retrage consimtamantul prin:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Modificarea preferintelor de cookie-uri (prin bannerul de cookie-uri)</li>
            <li>Dezabonarea de la comunicarile de marketing (link-ul din email)</li>
            <li>Trimiterea unui email la{" "}
              <a href="mailto:contact@edinio.com" className="text-primary hover:underline">
                contact@edinio.com
              </a>
            </li>
          </ul>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            9. Cum exercitati drepturile
          </h2>
          <p>
            Pentru a exercita oricare dintre drepturile descrise mai sus,
            puteti trimite o solicitare prin urmatoarele canale:
          </p>
          <div className="bg-muted/50 rounded-xl p-5 mt-3">
            <ul className="space-y-2">
              <li>
                <strong>Email:</strong>{" "}
                <a href="mailto:contact@edinio.com" className="text-primary hover:underline">
                  contact@edinio.com
                </a>{" "}
                (cu subiectul &quot;Solicitare GDPR&quot;)
              </li>
              <li>
                <strong>Posta:</strong> SC VOID SFT GAMES SRL, Str.
                Progresului, Nr. 2, Matasari, Jud. Gorj, Romania
              </li>
              <li>
                <strong>Telefon:</strong>{" "}
                <a href="tel:+40750456809" className="text-primary hover:underline">
                  0750 456 809
                </a>
              </li>
            </ul>
          </div>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            9.1. Ce trebuie sa includa solicitarea
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Numele dumneavoastra complet</li>
            <li>Adresa de email asociata contului Edinio</li>
            <li>Dreptul pe care doriti sa il exercitati</li>
            <li>Orice detalii suplimentare relevante pentru solicitare</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            9.2. Verificarea identitatii
          </h3>
          <p>
            Pentru protectia datelor dumneavoastra, este posibil sa va
            solicitam sa va confirmati identitatea inainte de a procesa
            cererea. Acest lucru se poate face prin confirmarea adresei de
            email asociata contului sau prin furnizarea de informatii
            suplimentare.
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            10. Termenul de raspuns
          </h2>
          <p>
            Vom raspunde solicitarilor dumneavoastra in termen de{" "}
            <strong>30 de zile calendaristice</strong> de la primirea
            cererii, in conformitate cu Art. 12 alin. 3 din GDPR.
          </p>
          <p className="mt-3">
            In cazul cererilor complexe sau al unui numar mare de solicitari,
            termenul poate fi prelungit cu inca{" "}
            <strong>60 de zile calendaristice</strong>. In aceasta situatie,
            va vom informa despre prelungire si motivele acesteia in termen
            de 30 de zile de la primirea cererii initiale.
          </p>
          <p className="mt-3">
            Exercitarea drepturilor este <strong>gratuita</strong>. In cazul
            cererilor vadit nefondate sau excesive (in special din cauza
            caracterului repetitiv), putem fie percepe un cost rezonabil,
            fie refuza sa dam curs cererii, cu motivarea deciziei.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            11. Depunerea unei plangeri la ANSPDCP
          </h2>
          <p>
            Daca considerati ca prelucrarea datelor dumneavoastra personale
            incalca prevederile GDPR sau ale Legii 190/2018, aveti dreptul de
            a depune o plangere la autoritatea de supraveghere din Romania:
          </p>
          <div className="bg-muted/50 rounded-xl p-5 mt-3">
            <p className="font-semibold text-foreground">
              Autoritatea Nationala de Supraveghere a Prelucrarii Datelor cu
              Caracter Personal (ANSPDCP)
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              <li>
                <strong>Adresa:</strong> B-dul G-ral. Gheorghe Magheru 28-30,
                Sector 1, cod postal 010336, Bucuresti, Romania
              </li>
              <li>
                <strong>Telefon:</strong> +40.318.059.211 / +40.318.059.212
              </li>
              <li>
                <strong>Email:</strong> anspdcp@dataprotection.ro
              </li>
              <li>
                <strong>Website:</strong> www.dataprotection.ro
              </li>
              <li>
                <strong>Program registratura:</strong> Luni-Vineri, 09:00-13:00
              </li>
            </ul>
          </div>
          <p className="mt-3">
            Inainte de a depune o plangere la ANSPDCP, va incurajam sa ne
            contactati pentru a incerca rezolvarea situatiei pe cale amiabila.
          </p>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            12. Notificarea incidentelor de securitate
          </h2>
          <p>
            In conformitate cu Art. 33 si 34 din GDPR, in cazul unei incalcari
            a securitatii datelor cu caracter personal, Edinio:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>
              Va notifica <strong>ANSPDCP in termen de 72 de ore</strong> de la
              data la care a luat cunostinta de incident, cu exceptia cazului in
              care este improbabil ca incalcarea sa genereze un risc pentru
              drepturile si libertatile persoanelor vizate
            </li>
            <li>
              Va notifica <strong>persoanele vizate afectate fara intarziere
              nejustificata</strong> daca incalcarea este susceptibila sa
              genereze un risc ridicat pentru drepturile si libertatile acestora
            </li>
          </ul>
          <p className="mt-3">
            Notificarea catre persoanele vizate va include:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Natura incalcarii securitatii datelor</li>
            <li>Consecintele probabile ale incalcarii</li>
            <li>Masurile luate sau propuse pentru remedierea incalcarii</li>
            <li>Datele de contact pentru obtinerea de informatii suplimentare</li>
          </ul>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            13. Principiile prelucrarii datelor
          </h2>
          <p>
            Edinio prelucreaza datele personale cu respectarea principiilor
            stabilite la Art. 5 din GDPR:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>
              <strong>Legalitate, echitate si transparenta</strong> &ndash;
              datele sunt prelucrate in mod legal, echitabil si transparent fata
              de persoana vizata
            </li>
            <li>
              <strong>Limitarea scopului</strong> &ndash; datele sunt colectate
              in scopuri determinate, explicite si legitime si nu sunt
              prelucrate ulterior intr-un mod incompatibil cu aceste scopuri
            </li>
            <li>
              <strong>Reducerea la minimum a datelor</strong> &ndash; datele
              colectate sunt adecvate, relevante si limitate la ceea ce este
              necesar in raport cu scopurile prelucrarii
            </li>
            <li>
              <strong>Exactitate</strong> &ndash; datele sunt exacte si, daca
              este necesar, actualizate
            </li>
            <li>
              <strong>Limitarea stocarii</strong> &ndash; datele sunt pastrate
              intr-o forma care permite identificarea persoanelor vizate pe o
              perioada care nu depaseste perioada necesara scopurilor prelucrarii
            </li>
            <li>
              <strong>Integritate si confidentialitate</strong> &ndash; datele
              sunt prelucrate intr-un mod care asigura securitatea adecvata,
              inclusiv protectia impotriva prelucrarii neautorizate sau ilegale
            </li>
            <li>
              <strong>Responsabilitate</strong> &ndash; operatorul este
              responsabil de respectarea principiilor si trebuie sa poata
              demonstra conformitatea
            </li>
          </ul>
        </section>

        {/* 14 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            14. Informatii suplimentare
          </h2>
          <p>
            Pentru informatii detaliate despre datele colectate, scopurile
            prelucrarii si duratele de stocare, consultati{" "}
            <Link href="/confidentialitate" className="text-primary hover:underline">
              Politica de confidentialitate
            </Link>
            . Pentru informatii despre cookie-uri, consultati{" "}
            <Link href="/cookies" className="text-primary hover:underline">
              Politica cookies
            </Link>
            .
          </p>
        </section>

        {/* Contact */}
        <section className="bg-muted/50 rounded-xl p-6 mt-12">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Contact pentru protectia datelor
          </h2>
          <p>
            Pentru orice solicitare legata de datele dumneavoastra personale:
          </p>
          <ul className="mt-3 space-y-1">
            <li>
              <strong>Email:</strong>{" "}
              <a href="mailto:contact@edinio.com" className="text-primary hover:underline">
                contact@edinio.com
              </a>
            </li>
            <li>
              <strong>Telefon:</strong>{" "}
              <a href="tel:+40750456809" className="text-primary hover:underline">
                0750 456 809
              </a>
            </li>
            <li>
              <strong>Adresa:</strong> SC VOID SFT GAMES SRL, Str. Progresului,
              Nr. 2, Matasari, Jud. Gorj, Romania
            </li>
          </ul>
        </section>
      </div>
    </article>
  );
}
