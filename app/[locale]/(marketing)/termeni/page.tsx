import { LegalPage, LSection, LSubSection, LList, LCompanyBox } from '@/components/marketing/legal-page'

export const metadata = {
  title: 'Termeni și Condiții | Edinio',
  description: 'Termeni și Condiții de utilizare a platformei Edinio.com — SC VOID SFT GAMES SRL',
}

export default function TermeniPage() {
  return (
    <LegalPage title="Termeni și Condiții" lastUpdated="09 mai 2026">

      <LSection num="1" title="Informații despre operator">
        <LCompanyBox />
        <p>
          Societate înregistrată în Registrul Comerțului, înmatriculată conform legilor din România.
          Platforma Edinio.com este operată de SC VOID SFT GAMES SRL.
        </p>
      </LSection>

      <LSection num="2" title="Definiții">
        <div className="space-y-2">
          <p><strong>„Platforma"</strong> — site-ul web Edinio.com și toate paginile, funcționalitățile și conținuturile asociate acestuia.</p>
          <p><strong>„Servicii"</strong> — cursurile online, materialele educaționale digitale și orice alte produse digitale oferite prin Platformă.</p>
          <p><strong>„Utilizator"</strong> — orice persoană fizică sau juridică care accesează, navighează sau utilizează Platforma.</p>
          <p><strong>„Cursant"</strong> — Utilizatorul care a achiziționat unul sau mai multe cursuri de pe Platformă.</p>
          <p><strong>„Conținut digital"</strong> — cursurile video, materialele descărcabile, resursele educaționale și orice alt conținut furnizat în format electronic.</p>
        </div>
      </LSection>

      <LSection num="3" title="Acceptarea termenilor">
        <p>
          Prin accesarea și utilizarea Platformei Edinio.com, confirmați că ați citit, înțeles și acceptat în totalitate
          prezentele Termeni și Condiții, precum și Politica de Confidențialitate și Politica privind Cookie-urile.
        </p>
        <p>Dacă nu sunteți de acord cu oricare dintre prevederile de mai jos, vă rugăm să nu utilizați Platforma.</p>
        <p>
          SC VOID SFT GAMES SRL își rezervă dreptul de a modifica acești Termeni în orice moment. Modificările intră
          în vigoare la data publicării pe Platformă. Continuarea utilizării Platformei după publicarea modificărilor
          constituie acceptul dumneavoastră.
        </p>
      </LSection>

      <LSection num="4" title="Crearea contului">
        <div className="space-y-3">
          <p><strong>4.1.</strong> Accesul la cursurile achiziționate necesită crearea unui cont pe Platforma Edinio.com.</p>
          <p><strong>4.2.</strong> Vă obligați să furnizați informații corecte, complete și actualizate la înregistrare.</p>
          <p><strong>4.3.</strong> Sunteți responsabil pentru confidențialitatea datelor de autentificare (email și parolă) și pentru toate activitățile desfășurate prin contul dumneavoastră.</p>
          <p><strong>4.4.</strong> În cazul în care suspectați că accesul la contul dumneavoastră a fost compromis, aveți obligația de a ne notifica imediat la <a href="mailto:iroby027@gmail.com" className="underline" style={{ color: '#16a34a' }}>iroby027@gmail.com</a>.</p>
          <p><strong>4.5.</strong> SC VOID SFT GAMES SRL nu va fi răspunzătoare pentru pierderile cauzate de utilizarea neautorizată a contului dumneavoastră, dacă nu ați notificat operatorul în timp util.</p>
          <p><strong>4.6.</strong> Ne rezervăm dreptul de a suspenda sau șterge contul oricărui utilizator care încalcă prezentele Termeni, fără notificare prealabilă și fără nicio obligație de rambursare.</p>
        </div>
      </LSection>

      <LSection num="5" title="Achiziționarea cursurilor">
        <div className="space-y-3">
          <p><strong>5.1.</strong> Toate prețurile afișate pe Platformă sunt exprimate în lei românești (RON) și includ TVA, acolo unde este aplicabil.</p>
          <p><strong>5.2.</strong> Plata se efectuează integral în momentul achiziției, prin mijloacele de plată disponibile pe Platformă (card bancar prin procesatorul Stripe).</p>
          <p><strong>5.3.</strong> Prin finalizarea achiziției, confirmați că aveți vârsta minimă de 18 ani sau că aveți acordul părinților/tutorilor legali.</p>
          <p><strong>5.4.</strong> Comanda este considerată confirmată în momentul în care primiți emailul de confirmare a plății și obțineți accesul la cursul achiziționat.</p>
          <p><strong>5.5.</strong> SC VOID SFT GAMES SRL își rezervă dreptul de a refuza sau anula orice comandă în cazul unor erori tehnice, de prețuri sau disponibilitate, cu rambursarea integrală a sumelor plătite.</p>
        </div>
      </LSection>

      <LSection num="6" title="Dreptul de retragere și politica de rambursare">
        <LSubSection id="6.1." title="Natura produsului digital">
          <p>
            Cursurile oferite pe Edinio.com sunt produse digitale furnizate prin internet, conform prevederilor
            Ordonanței de Urgență nr. 34/2014 privind drepturile consumatorilor și ale Directivei UE 2011/83.
          </p>
        </LSubSection>
        <LSubSection id="6.2." title="Excepția de la dreptul de retragere">
          <p>
            În conformitate cu art. 16 lit. m) din OUG 34/2014, dreptul de retragere de 14 zile nu se aplică
            contractelor de furnizare de conținut digital care nu este livrat pe un suport material, dacă:
          </p>
          <LList items={[
            'executarea contractului a început cu acordul prealabil expres al consumatorului; și',
            'consumatorul a recunoscut că va pierde dreptul de retragere odată ce contractul a fost executat.',
          ]} />
        </LSubSection>
        <LSubSection id="6.3." title="Consimțământul explicit">
          <p>
            La momentul finalizării comenzii, vi se solicită să bifați în mod expres căsuța:{' '}
            <em>„Înțeleg că prin accesarea imediată a cursului pierd dreptul de retragere de 14 zile, conform art. 16 lit. m) din OUG 34/2014."</em>
          </p>
          <p>
            Prin bifarea acestei căsuțe și finalizarea plății, renunțați expres la dreptul de retragere și nu
            veți putea solicita rambursarea sumei plătite pe motiv că v-ați răzgândit.
          </p>
        </LSubSection>
        <LSubSection id="6.4." title="Garanție de satisfacție — 30 de zile">
          <p>
            Deși dreptul legal de retragere nu se aplică, SC VOID SFT GAMES SRL oferă o garanție voluntară de
            satisfacție de 30 de zile calendaristice de la data achiziției, în următoarele condiții stricte:
          </p>
          <LList items={[
            'Ați finalizat cel puțin 50% din lecțiile cursului și considerați că materialul nu corespunde descrierii publicate;',
            'Solicitarea de rambursare este transmisă în scris la iroby027@gmail.com, cu subiectul „Solicitare rambursare — [numele cursului]", în termenul de 30 de zile;',
            'Cererea este analizată individual de SC VOID SFT GAMES SRL în termen de 5 zile lucrătoare.',
          ]} />
        </LSubSection>
        <LSubSection id="6.5." title="Cazuri în care rambursarea NU se acordă">
          <LList items={[
            'Cursul a fost achiziționat de mai mult de 30 de zile;',
            'Ați finalizat mai puțin de 50% din lecțiile cursului;',
            'Motivul invocat este schimbarea preferințelor personale sau lipsa timpului de vizionare;',
            'Contul a fost suspendat sau restricționat din cauza încălcării prezentelor Termeni;',
            'Solicitarea provine de la o persoană juridică (companie), aceasta neavând calitate de consumator.',
          ]} />
        </LSubSection>
        <LSubSection id="6.6." title="Procesarea rambursării aprobate">
          <p>
            În cazul în care rambursarea este aprobată, suma va fi restituită prin același mijloc de plată utilizat
            la achiziție, în termen de maximum 14 zile calendaristice de la aprobare.
          </p>
        </LSubSection>
      </LSection>

      <LSection num="7" title="Proprietatea intelectuală">
        <div className="space-y-3">
          <p>
            <strong>7.1.</strong> Tot conținutul disponibil pe Platforma Edinio.com — inclusiv, dar fără a se limita
            la: cursuri video, texte, imagini, grafice, logo-uri, structura cursurilor, materialele descărcabile —
            este proprietatea exclusivă a SC VOID SFT GAMES SRL sau a licențiatorilor săi și este protejat de
            legislația română și internațională privind drepturile de autor.
          </p>
          <p>
            <strong>7.2.</strong> Prin achiziționarea unui curs, primiți o licență personală, neexclusivă,
            netransferabilă și revocabilă de acces și vizionare a conținutului, exclusiv în scop personal și non-comercial.
          </p>
          <p><strong>7.3.</strong> Este strict interzis:</p>
          <LList items={[
            'Descărcarea, copierea, reproducerea sau distribuirea conținutului cursurilor;',
            'Partajarea datelor de cont cu alte persoane;',
            'Revânzarea, sublicențierea sau comercializarea conținutului;',
            'Utilizarea conținutului pentru crearea unor produse sau servicii concurente;',
            'Înregistrarea ecranului (screen recording) în timp ce vizionați cursurile.',
          ]} />
          <p>
            <strong>7.4.</strong> Orice încălcare a drepturilor de proprietate intelectuală va atrage răspunderea
            civilă și penală conform legislației aplicabile.
          </p>
        </div>
      </LSection>

      <LSection num="8" title="Utilizarea platformei">
        <div className="space-y-3">
          <p><strong>8.1.</strong> Vă obligați să utilizați Platforma exclusiv în scopuri legale și să nu desfășurați activități care ar putea:</p>
          <LList items={[
            'Deteriora, dezactiva sau supraîncărca serverele sau infrastructura Platformei;',
            'Compromite securitatea altor utilizatori;',
            'Transmite conținut ofensator, ilegal sau care încalcă drepturile terților;',
            'Utiliza roboți, scraper-e sau alte metode automate de accesare a Platformei.',
          ]} />
          <p>
            <strong>8.2.</strong> SC VOID SFT GAMES SRL are dreptul de a monitoriza utilizarea Platformei și de a
            lua măsurile necesare, inclusiv suspendarea accesului, în cazul încălcării prezentelor prevederi.
          </p>
        </div>
      </LSection>

      <LSection num="9" title="Limitarea răspunderii">
        <div className="space-y-3">
          <p>
            <strong>9.1.</strong> Cursurile oferite pe Edinio.com sunt destinate exclusiv scopurilor educaționale
            și informaționale. SC VOID SFT GAMES SRL nu garantează rezultate financiare, profesionale sau de
            orice altă natură în urma parcurgerii cursurilor.
          </p>
          <p>
            <strong>9.2.</strong> Platforma este furnizată „ca atare" (as-is). SC VOID SFT GAMES SRL nu garantează
            că Platforma va fi disponibilă neîntrerupt sau fără erori tehnice.
          </p>
          <p><strong>9.3.</strong> SC VOID SFT GAMES SRL nu va fi răspunzătoare pentru:</p>
          <LList items={[
            'Pierderi indirecte, incidentale sau de profit rezultate din utilizarea sau imposibilitatea utilizării Platformei;',
            'Modificări ale tool-urilor terțe prezentate în cursuri (KIE.AI, Google Veo, Kling etc.), acestea fiind produse independente față de care SC VOID SFT GAMES SRL nu are nicio afiliere sau control;',
            'Pierderi de date cauzate de factori externi.',
          ]} />
          <p>
            <strong>9.4.</strong> Răspunderea totală a SC VOID SFT GAMES SRL față de orice cursant nu va depăși,
            în nicio circumstanță, suma plătită de acesta pentru achiziționarea cursului.
          </p>
        </div>
      </LSection>

      <LSection num="10" title="Programul de referral">
        <div className="space-y-3">
          <p><strong>10.1.</strong> Edinio.com oferă un program de referral prin care cursanții pot recomanda cursurile altor persoane și pot primi recompense bănești.</p>
          <p><strong>10.2.</strong> Recompensa reprezintă 50% din prețul cursului plătit de persoana recomandată, creditată automat în balanța contului referrer-ului.</p>
          <p><strong>10.3.</strong> Recompensele se pot retrage prin transfer bancar (IBAN) sau PayPal, la solicitarea expresă a cursantului, în termen de 1-3 zile lucrătoare.</p>
          <p><strong>10.4.</strong> SC VOID SFT GAMES SRL își rezervă dreptul de a modifica sau suspenda programul de referral în orice moment, cu notificarea utilizatorilor afectați.</p>
          <p><strong>10.5.</strong> Orice tentativă de fraudare a programului de referral (conturi false, auto-referral etc.) va atrage suspendarea imediată a contului și anularea recompenselor acumulate.</p>
        </div>
      </LSection>

      <LSection num="11" title="Legea aplicabilă și soluționarea litigiilor">
        <div className="space-y-3">
          <p><strong>11.1.</strong> Prezentele Termeni și Condiții sunt guvernate de legislația română în vigoare.</p>
          <p>
            <strong>11.2.</strong> Orice litigiu apărut în legătură cu utilizarea Platformei va fi soluționat pe
            cale amiabilă. Vă rugăm să ne contactați la{' '}
            <a href="mailto:iroby027@gmail.com" className="underline" style={{ color: '#16a34a' }}>iroby027@gmail.com</a>{' '}
            înainte de a iniția orice procedură judiciară.
          </p>
          <p><strong>11.3.</strong> În cazul în care litigiul nu poate fi soluționat amiabil, acesta va fi deferit instanțelor judecătorești competente din România.</p>
          <p>
            <strong>11.4.</strong> Conform OUG 34/2014, consumatorii din UE au dreptul de a utiliza platforma de
            soluționare online a litigiilor (SOL) disponibilă la:{' '}
            <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: '#16a34a' }}>
              ec.europa.eu/consumers/odr
            </a>
          </p>
        </div>
      </LSection>

      <LSection num="12" title="Forța majoră">
        <p>
          SC VOID SFT GAMES SRL nu va fi răspunzătoare pentru neexecutarea sau executarea defectuoasă a obligațiilor
          asumate în cazul în care aceasta este cauzată de evenimente de forță majoră, astfel cum sunt definite de
          legislația română (calamități naturale, conflicte militare, decizii guvernamentale, pene de curent de
          amploare etc.).
        </p>
      </LSection>

      <LSection num="13" title="Dispoziții finale">
        <div className="space-y-3">
          <p><strong>13.1.</strong> Dacă oricare dintre prevederile prezentelor Termeni este declarată nulă sau inaplicabilă, aceasta nu afectează valabilitatea celorlalte prevederi.</p>
          <p><strong>13.2.</strong> Neexercitarea unui drept prevăzut în prezentele Termeni nu constituie o renunțare la acel drept.</p>
          <p>
            <strong>13.3.</strong> Pentru orice întrebări legate de prezentele Termeni și Condiții, ne puteți
            contacta la{' '}
            <a href="mailto:iroby027@gmail.com" className="underline" style={{ color: '#16a34a' }}>iroby027@gmail.com</a>{' '}
            sau <a href="tel:0750456096" className="underline" style={{ color: '#16a34a' }}>0750 456 096</a>.
          </p>
        </div>
        <div className="mt-6 pt-6" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
          <p className="text-xs" style={{ color: 'rgba(10,26,15,0.38)' }}>
            SC VOID SFT GAMES SRL — Edinio.com · Termeni și Condiții valabili începând cu 09 mai 2026
          </p>
        </div>
      </LSection>

    </LegalPage>
  )
}
