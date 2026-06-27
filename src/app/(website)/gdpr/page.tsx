import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Drepturile GDPR",
  description:
    "Drepturile dumneavoastră privind protecția datelor personale conform Regulamentului (UE) 2016/679 (GDPR).",
  alternates: { canonical: "https://www.edinio.com/gdpr" },
};

export default function GDPRPage() {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
        Drepturile dumneavoastră GDPR
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        Ultima actualizare: 30 mai 2026
      </p>
      <p className="text-muted-foreground mb-12">
        Regulamentul General privind Protecția Datelor (Regulamentul (UE)
        2016/679, denumit &quot;GDPR&quot;) vă conferă o serie de drepturi cu
        privire la datele dumneavoastră personale. Această pagină descrie
        fiecare drept în detaliu și modul în care îl puteți exercita.
      </p>

      <div className="prose prose-gray max-w-none space-y-10 text-foreground/90 leading-relaxed">
        {/* 1 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            1. Dreptul de acces (Art. 15 GDPR)
          </h2>
          <p>
            Aveți dreptul de a obține de la Edinio o confirmare că datele
            dumneavoastră personale sunt sau nu prelucrate și, în caz
            afirmativ, acces la datele respective și la următoarele informații:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Scopurile prelucrării</li>
            <li>Categoriile de date personale vizate</li>
            <li>Destinatarii sau categoriile de destinatari cărora le-au fost sau le vor fi comunicate datele</li>
            <li>Durata prevăzută de stocare sau criteriile utilizate pentru determinarea acesteia</li>
            <li>Existența dreptului de a solicita rectificarea, ștergerea sau restricționarea prelucrării</li>
            <li>Dreptul de a depune o plângere la ANSPDCP</li>
            <li>Sursa datelor (dacă nu au fost colectate direct de la dumneavoastră)</li>
            <li>Existența unui proces decizional automatizat, inclusiv profilare</li>
          </ul>
          <p className="mt-3">
            Vă vom furniza o copie a datelor personale prelucrate, în format
            electronic, în mod gratuit. Pentru copii suplimentare, putem
            percepe un cost rezonabil bazat pe costurile administrative.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            2. Dreptul la rectificare (Art. 16 GDPR)
          </h2>
          <p>
            Aveți dreptul de a obține, fără întârziere, rectificarea datelor
            personale inexacte care vă privesc. De asemenea, aveți dreptul de a
            obține completarea datelor personale incomplete.
          </p>
          <p className="mt-3">
            <strong>Cum procedați:</strong> Multe date pot fi corectate direct
            din contul dumneavoastră (Setări &rarr; Profil / Setări &rarr;
            Magazin). Pentru datele care nu pot fi modificate din interfață,
            trimiteți o solicitare la{" "}
            <a href="mailto:contact@edinio.com" className="text-primary hover:underline">
              contact@edinio.com
            </a>.
          </p>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            3. Dreptul la ștergere &ndash; &quot;Dreptul de a fi uitat&quot;
            (Art. 17 GDPR)
          </h2>
          <p>
            Aveți dreptul de a solicita ștergerea datelor personale care vă
            privesc, fără întârziere nejustificată, în următoarele situații:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Datele nu mai sunt necesare în raport cu scopurile pentru care au fost colectate</li>
            <li>Vă retrageți consimțământul și nu există alt temei legal pentru prelucrare</li>
            <li>Vă opuneți prelucrării și nu există motive legitime prevalente</li>
            <li>Datele au fost prelucrate ilegal</li>
            <li>Datele trebuie șterse pentru respectarea unei obligații legale</li>
          </ul>
          <p className="mt-3">
            <strong>Ce se întâmplă la ștergerea contului:</strong>
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Magazinul dumneavoastră va fi dezactivat imediat și nu va mai fi accesibil public</li>
            <li>Datele de profil, afacere, produse și configurări vor fi șterse în termen de 30 de zile</li>
            <li>Datele de autentificare vor fi șterse permanent</li>
          </ul>
          <p className="mt-3">
            <strong>Excepții:</strong> Anumite date nu pot fi șterse înainte de
            expirarea termenelor legale de păstrare:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Datele fiscale și facturile: 10 ani (conform Codului Fiscal român)</li>
            <li>Datele necesare pentru constatarea, exercitarea sau apărarea unui drept în instanță</li>
          </ul>
          <p className="mt-3">
            Ștergerea contului se poate realiza din Setări &rarr; Cont &rarr;
            Ștergere cont sau prin solicitare la{" "}
            <a href="mailto:contact@edinio.com" className="text-primary hover:underline">
              contact@edinio.com
            </a>.
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            4. Dreptul la restricționarea prelucrării (Art. 18 GDPR)
          </h2>
          <p>
            Aveți dreptul de a solicita restricționarea prelucrării datelor
            dumneavoastră personale în următoarele cazuri:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Contestați exactitatea datelor &ndash; pe durata verificării de către noi</li>
            <li>Prelucrarea este ilegală, dar preferați restricționarea în locul ștergerii</li>
            <li>Nu mai avem nevoie de date, dar dumneavoastră le solicitați pentru constatarea, exercitarea sau apărarea unui drept în instanță</li>
            <li>V-ați opus prelucrării &ndash; pe durata verificării dacă interesele noastre legitime prevalează</li>
          </ul>
          <p className="mt-3">
            În perioada de restricționare, datele vor fi stocate dar nu vor fi
            prelucrate (cu excepția stocării), fără consimțământul
            dumneavoastră.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            5. Dreptul la portabilitatea datelor (Art. 20 GDPR)
          </h2>
          <p>
            Aveți dreptul de a primi datele personale pe care ni le-ați
            furnizat într-un format structurat, utilizat în mod curent și care
            poate fi citit automat (de ex. JSON, CSV). De asemenea, aveți
            dreptul de a transmite aceste date altui operator.
          </p>
          <p className="mt-3">
            Acest drept se aplică datelor prelucrate pe baza consimțământului
            sau a executării contractului și care sunt prelucrate prin
            mijloace automatizate.
          </p>
          <p className="mt-3">
            <strong>Ce date puteți exporta:</strong>
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Datele de profil (nume, email, telefon)</li>
            <li>Datele afacerii (nume, adresă, configurări)</li>
            <li>Lista de produse (nume, descrieri, prețuri, imagini)</li>
            <li>Istoricul comenzilor (detalii comenzi, clienți, sume)</li>
            <li>Datele analitice (statistici trafic și vânzări)</li>
          </ul>
          <p className="mt-3">
            Solicitările de export se trimit la{" "}
            <a href="mailto:contact@edinio.com" className="text-primary hover:underline">
              contact@edinio.com
            </a>
            . Vom furniza datele în termen de 30 de zile.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            6. Dreptul la opoziție (Art. 21 GDPR)
          </h2>
          <p>
            Aveți dreptul de a vă opune, în orice moment, prelucrării datelor
            personale care vă privesc, atunci când prelucrarea se bazează pe
            interesul nostru legitim (Art. 6 alin. 1 lit. f din GDPR).
          </p>
          <p className="mt-3">
            În cazul exercitării dreptului la opoziție, vom înceta prelucrarea
            datelor, cu excepția cazului în care demonstrăm motive legitime și
            imperioase care prevalează asupra intereselor, drepturilor și
            libertăților dumneavoastră sau dacă prelucrarea este necesară
            pentru constatarea, exercitarea sau apărarea unui drept în instanță.
          </p>
          <p className="mt-3">
            <strong>Opoziția la marketing direct:</strong> Aveți dreptul de a
            vă opune în orice moment prelucrării datelor în scopuri de
            marketing direct, inclusiv profilarea în măsura în care aceasta
            este legată de marketingul direct. În caz de opoziție, datele nu
            vor mai fi prelucrate în acest scop.
          </p>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            7. Dreptul de a nu fi supus deciziilor automate (Art. 22 GDPR)
          </h2>
          <p>
            Aveți dreptul de a nu fi supus unei decizii bazate exclusiv pe
            prelucrare automatizată, inclusiv profilare, care produce efecte
            juridice care vă privesc sau vă afectează în mod similar
            semnificativ.
          </p>
          <p className="mt-3">
            <strong>Situația curentă:</strong> Edinio nu utilizează procese
            decizionale automatizate care produc efecte juridice sau similare
            asupra Utilizatorilor. Platforma nu ia decizii automate privind
            aprobarea sau respingerea conturilor, comenzilor sau altor
            servicii pe baza exclusivă a procesării automate a datelor
            personale.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            8. Dreptul de retragere a consimțământului (Art. 7 GDPR)
          </h2>
          <p>
            În cazul în care prelucrarea datelor se bazează pe consimțământul
            dumneavoastră, aveți dreptul de a retrage consimțământul în orice
            moment, fără a afecta legalitatea prelucrării efectuate pe baza
            consimțământului înainte de retragerea acestuia.
          </p>
          <p className="mt-3">
            Retragerea consimțământului este la fel de simplă ca și acordarea
            lui. Puteți retrage consimțământul prin:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Modificarea preferințelor de cookie-uri (prin bannerul de cookie-uri)</li>
            <li>Dezabonarea de la comunicările de marketing (link-ul din email)</li>
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
            9. Cum exercitați drepturile
          </h2>
          <p>
            Pentru a exercita oricare dintre drepturile descrise mai sus,
            puteți trimite o solicitare prin următoarele canale:
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
                <strong>Poștă:</strong> SC VOID SFT GAMES SRL, Str.
                Progresului, Nr. 2, Mătăsari, Jud. Gorj, România
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
            9.1. Ce trebuie să includă solicitarea
          </h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Numele dumneavoastră complet</li>
            <li>Adresa de email asociată contului Edinio</li>
            <li>Dreptul pe care doriți să îl exercitați</li>
            <li>Orice detalii suplimentare relevante pentru solicitare</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
            9.2. Verificarea identității
          </h3>
          <p>
            Pentru protecția datelor dumneavoastră, este posibil să vă
            solicităm să vă confirmați identitatea înainte de a procesa
            cererea. Acest lucru se poate face prin confirmarea adresei de
            email asociată contului sau prin furnizarea de informații
            suplimentare.
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            10. Termenul de răspuns
          </h2>
          <p>
            Vom răspunde solicitărilor dumneavoastră în termen de{" "}
            <strong>30 de zile calendaristice</strong> de la primirea
            cererii, în conformitate cu Art. 12 alin. 3 din GDPR.
          </p>
          <p className="mt-3">
            În cazul cererilor complexe sau al unui număr mare de solicitări,
            termenul poate fi prelungit cu încă{" "}
            <strong>60 de zile calendaristice</strong>. În această situație,
            vă vom informa despre prelungire și motivele acesteia în termen
            de 30 de zile de la primirea cererii inițiale.
          </p>
          <p className="mt-3">
            Exercitarea drepturilor este <strong>gratuită</strong>. În cazul
            cererilor vădit nefondate sau excesive (în special din cauza
            caracterului repetitiv), putem fie percepe un cost rezonabil,
            fie refuza să dăm curs cererii, cu motivarea deciziei.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            11. Depunerea unei plângeri la ANSPDCP
          </h2>
          <p>
            Dacă considerați că prelucrarea datelor dumneavoastră personale
            încalcă prevederile GDPR sau ale Legii 190/2018, aveți dreptul de
            a depune o plângere la autoritatea de supraveghere din România:
          </p>
          <div className="bg-muted/50 rounded-xl p-5 mt-3">
            <p className="font-semibold text-foreground">
              Autoritatea Națională de Supraveghere a Prelucrării Datelor cu
              Caracter Personal (ANSPDCP)
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              <li>
                <strong>Adresă:</strong> B-dul G-ral. Gheorghe Magheru 28-30,
                Sector 1, cod poștal 010336, București, România
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
                <strong>Program registratură:</strong> Luni-Vineri, 09:00-13:00
              </li>
            </ul>
          </div>
          <p className="mt-3">
            Înainte de a depune o plângere la ANSPDCP, vă încurajăm să ne
            contactați pentru a încerca rezolvarea situației pe cale amiabilă.
          </p>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            12. Notificarea incidentelor de securitate
          </h2>
          <p>
            În conformitate cu Art. 33 și 34 din GDPR, în cazul unei încălcări
            a securității datelor cu caracter personal, Edinio:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>
              Va notifica <strong>ANSPDCP în termen de 72 de ore</strong> de la
              data la care a luat cunoștință de incident, cu excepția cazului în
              care este improbabil ca încălcarea să genereze un risc pentru
              drepturile și libertățile persoanelor vizate
            </li>
            <li>
              Va notifica <strong>persoanele vizate afectate fără întârziere
              nejustificată</strong> dacă încălcarea este susceptibilă să
              genereze un risc ridicat pentru drepturile și libertățile acestora
            </li>
          </ul>
          <p className="mt-3">
            Notificarea către persoanele vizate va include:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Natura încălcării securității datelor</li>
            <li>Consecințele probabile ale încălcării</li>
            <li>Măsurile luate sau propuse pentru remedierea încălcării</li>
            <li>Datele de contact pentru obținerea de informații suplimentare</li>
          </ul>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            13. Principiile prelucrării datelor
          </h2>
          <p>
            Edinio prelucrează datele personale cu respectarea principiilor
            stabilite la Art. 5 din GDPR:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>
              <strong>Legalitate, echitate și transparență</strong> &ndash;
              datele sunt prelucrate în mod legal, echitabil și transparent față
              de persoana vizată
            </li>
            <li>
              <strong>Limitarea scopului</strong> &ndash; datele sunt colectate
              în scopuri determinate, explicite și legitime și nu sunt
              prelucrate ulterior într-un mod incompatibil cu aceste scopuri
            </li>
            <li>
              <strong>Reducerea la minimum a datelor</strong> &ndash; datele
              colectate sunt adecvate, relevante și limitate la ceea ce este
              necesar în raport cu scopurile prelucrării
            </li>
            <li>
              <strong>Exactitate</strong> &ndash; datele sunt exacte și, dacă
              este necesar, actualizate
            </li>
            <li>
              <strong>Limitarea stocării</strong> &ndash; datele sunt păstrate
              într-o formă care permite identificarea persoanelor vizate pe o
              perioadă care nu depășește perioada necesară scopurilor prelucrării
            </li>
            <li>
              <strong>Integritate și confidențialitate</strong> &ndash; datele
              sunt prelucrate într-un mod care asigură securitatea adecvată,
              inclusiv protecția împotriva prelucrării neautorizate sau ilegale
            </li>
            <li>
              <strong>Responsabilitate</strong> &ndash; operatorul este
              responsabil de respectarea principiilor și trebuie să poată
              demonstra conformitatea
            </li>
          </ul>
        </section>

        {/* 14 */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            14. Informații suplimentare
          </h2>
          <p>
            Pentru informații detaliate despre datele colectate, scopurile
            prelucrării și duratele de stocare, consultați{" "}
            <Link href="/confidentialitate" className="text-primary hover:underline">
              Politica de confidențialitate
            </Link>
            . Pentru informații despre cookie-uri, consultați{" "}
            <Link href="/cookies" className="text-primary hover:underline">
              Politica cookies
            </Link>
            .
          </p>
        </section>

        {/* Contact */}
        <section className="bg-muted/50 rounded-xl p-6 mt-12">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Contact pentru protecția datelor
          </h2>
          <p>
            Pentru orice solicitare legată de datele dumneavoastră personale:
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
              <strong>Adresă:</strong> SC VOID SFT GAMES SRL, Str. Progresului,
              Nr. 2, Mătăsari, Jud. Gorj, România
            </li>
          </ul>
        </section>
      </div>
    </article>
  );
}
