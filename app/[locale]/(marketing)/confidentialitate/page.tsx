import { LegalPage, LSection, LSubSection, LList, LTable, LCompanyBox } from '@/components/marketing/legal-page'

export const metadata = {
  title: 'Politică de Confidențialitate | Edinio',
  description: 'Politica de confidențialitate a platformei Edinio.com — SC VOID SFT GAMES SRL',
}

export default function ConfidentialitatePage() {
  return (
    <LegalPage title="Politică de Confidențialitate" lastUpdated="09 mai 2026">

      <LSection num="1" title="Informații generale">
        <LCompanyBox />
        <p>
          SC VOID SFT GAMES SRL, în calitate de operator de date cu caracter personal, se angajează să protejeze
          confidențialitatea și securitatea datelor dumneavoastră personale. Prezenta Politică descrie ce date
          colectăm, cum le utilizăm, cu cine le partajăm și care sunt drepturile dumneavoastră, în conformitate cu:
        </p>
        <LList items={[
          'Regulamentul (UE) 2016/679 — Regulamentul General privind Protecția Datelor (GDPR)',
          'Legea nr. 190/2018 privind măsurile de punere în aplicare a GDPR în România',
          'Legea nr. 506/2004 privind prelucrarea datelor cu caracter personal în sectorul comunicațiilor electronice',
        ]} />
        <p>
          Pentru orice întrebări legate de prelucrarea datelor dumneavoastră, ne puteți contacta la{' '}
          <a href="mailto:iroby027@gmail.com" className="underline" style={{ color: '#16a34a' }}>iroby027@gmail.com</a>{' '}
          sau <a href="tel:0750456096" className="underline" style={{ color: '#16a34a' }}>0750 456 096</a>.
        </p>
      </LSection>

      <LSection num="2" title="Ce date colectăm">
        <LSubSection id="2.1." title="Date furnizate direct de dumneavoastră">
          <p className="font-medium mb-1" style={{ color: '#0a1a0f' }}>La crearea contului:</p>
          <LList items={['Nume și prenume', 'Adresă de email', 'Parolă (stocată exclusiv în format criptat, ireversibil)', 'Limba preferată']} />
          <p className="font-medium mb-1 mt-3" style={{ color: '#0a1a0f' }}>La efectuarea unei achiziții:</p>
          <LList items={[
            'Datele de facturare (nume, adresă, dacă sunt solicitate de procesatorul de plăți)',
            'Datele cardului bancar — acestea nu sunt stocate pe serverele noastre, ci prelucrate exclusiv de Stripe Inc., procesator certificat PCI-DSS',
          ]} />
          <p className="font-medium mb-1 mt-3" style={{ color: '#0a1a0f' }}>La utilizarea programului de referral:</p>
          <LList items={['Codul IBAN sau adresa de email PayPal (doar dacă solicitați retragerea recompenselor)']} />
          <p className="font-medium mb-1 mt-3" style={{ color: '#0a1a0f' }}>La contactarea suportului:</p>
          <LList items={['Conținutul mesajelor transmise']} />
        </LSubSection>

        <LSubSection id="2.2." title="Date colectate automat">
          <p>Când accesați Platforma, colectăm automat:</p>
          <LList items={[
            'Adresa IP',
            'Tipul și versiunea browserului',
            'Sistemul de operare',
            'Paginile vizitate și timpul petrecut pe fiecare pagină',
            'Data și ora accesului',
            'Sursa traficului (ex: link de referral, reclame Meta)',
            'Progresul în cadrul cursurilor (lecții vizionate, timp de vizionare, lecții finalizate)',
          ]} />
        </LSubSection>

        <LSubSection id="2.3." title="Date din surse terțe">
          <p>
            Dacă vă autentificați prin Google (dacă această funcție este disponibilă), primim de la Google:
            numele, adresa de email și fotografia de profil, conform permisiunilor acordate.
          </p>
        </LSubSection>
      </LSection>

      <LSection num="3" title="Scopul și temeiul legal al prelucrării">
        <LTable
          heads={['Scop', 'Date utilizate', 'Temei legal (GDPR)']}
          rows={[
            ['Crearea și gestionarea contului', 'Email, nume, parolă', 'Art. 6(1)(b) — executarea contractului'],
            ['Procesarea plăților', 'Date tranzacție, email', 'Art. 6(1)(b) — executarea contractului'],
            ['Furnizarea accesului la cursuri', 'Email, date cont, progres', 'Art. 6(1)(b) — executarea contractului'],
            ['Trimiterea emailurilor tranzacționale', 'Email', 'Art. 6(1)(b) — executarea contractului'],
            ['Trimiterea emailurilor de marketing', 'Email', 'Art. 6(1)(a) — consimțământ'],
            ['Procesarea programului de referral', 'Email, IBAN/PayPal', 'Art. 6(1)(b) — executarea contractului'],
            ['Analiza comportamentului pe platformă', 'Date tehnice, progres', 'Art. 6(1)(f) — interes legitim'],
            ['Prevenirea fraudelor și securitate', 'IP, date tehnice', 'Art. 6(1)(f) — interes legitim'],
            ['Îndeplinirea obligațiilor legale', 'Date facturare, tranzacții', 'Art. 6(1)(c) — obligație legală'],
          ]}
        />
      </LSection>

      <LSection num="4" title="Cu cine partajăm datele">
        <p>
          Nu vindem, nu închiriem și nu comercializăm datele dumneavoastră personale către terți.
          Partajăm date exclusiv cu:
        </p>

        <LSubSection id="4.1." title="Furnizori de servicii (procesatori de date)">
          <div className="space-y-4">
            {[
              { name: 'Stripe Inc.', scop: 'Procesarea plăților cu cardul', date: 'Date tranzacție, email', sediu: 'SUA — transfer acoperit de Clauze Contractuale Standard UE', politica: 'stripe.com/privacy' },
              { name: 'Supabase Inc.', scop: 'Stocarea datelor platformei (baza de date, autentificare, fișiere)', date: 'Toate datele contului și ale cursantului', sediu: 'SUA — transfer acoperit de Clauze Contractuale Standard UE', politica: 'supabase.com/privacy' },
              { name: 'Resend Inc.', scop: 'Trimiterea emailurilor tranzacționale și de marketing', date: 'Email, nume', sediu: 'SUA — transfer acoperit de Clauze Contractuale Standard UE', politica: 'resend.com/privacy' },
              { name: 'Vercel Inc.', scop: 'Găzduirea platformei web', date: 'Adresă IP, date tehnice de acces', sediu: 'SUA — transfer acoperit de Clauze Contractuale Standard UE', politica: 'vercel.com/legal/privacy-policy' },
              { name: 'Meta Platforms Ireland Ltd.', scop: 'Măsurarea conversiilor campaniilor publicitare (Meta Pixel + Conversions API)', date: 'Email (hashed), IP, date eveniment', sediu: 'Irlanda (UE)', politica: 'facebook.com/privacy/policy' },
              { name: 'Google LLC', scop: 'Analiză trafic (Google Analytics 4)', date: 'Date tehnice anonimizate, comportament pe site', sediu: 'SUA — transfer acoperit de Clauze Contractuale Standard UE', politica: 'policies.google.com/privacy' },
            ].map((p) => (
              <div key={p.name} className="p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)' }}>
                <p className="font-semibold text-sm mb-2" style={{ color: '#0a1a0f' }}>{p.name}</p>
                <div className="space-y-1 text-xs" style={{ color: 'rgba(10,26,15,0.6)' }}>
                  <p><strong>Scop:</strong> {p.scop}</p>
                  <p><strong>Date transmise:</strong> {p.date}</p>
                  <p><strong>Sediu:</strong> {p.sediu}</p>
                  <p><strong>Politică:</strong> {p.politica}</p>
                </div>
              </div>
            ))}
          </div>
        </LSubSection>

        <LSubSection id="4.2." title="Autorități publice">
          <p>
            Putem divulga datele dumneavoastră autorităților publice competente (ANAF, instanțe judecătorești,
            organe de cercetare penală) dacă suntem obligați legal să facem acest lucru.
          </p>
        </LSubSection>

        <LSubSection id="4.3." title="Succesori în afaceri">
          <p>
            În cazul unei fuziuni, achiziții sau vânzări a activelor SC VOID SFT GAMES SRL, datele dumneavoastră
            pot fi transferate succesorului, cu notificarea prealabilă a utilizatorilor afectați.
          </p>
        </LSubSection>
      </LSection>

      <LSection num="5" title="Transferul datelor în afara UE">
        <p>
          Unii dintre furnizorii noștri de servicii sunt localizați în Statele Unite ale Americii. Toate transferurile
          de date în afara Spațiului Economic European se realizează cu respectarea prevederilor GDPR, prin unul
          dintre mecanismele legale aplicabile:
        </p>
        <LList items={[
          'Clauze Contractuale Standard (SCC) adoptate de Comisia Europeană',
          'Certificarea furnizorului conform cadrelor de confidențialitate aplicabile',
        ]} />
      </LSection>

      <LSection num="6" title="Cât timp păstrăm datele">
        <LTable
          heads={['Categorie de date', 'Perioadă de retenție']}
          rows={[
            ['Date cont activ', 'Pe durata existenței contului + 3 ani după ștergere'],
            ['Date tranzacții și facturare', '10 ani (obligație legală contabilă — Legea 82/1991)'],
            ['Progres cursuri', 'Pe durata existenței contului'],
            ['Date marketing (emailuri)', 'Până la retragerea consimțământului'],
            ['Date tehnice (logs, IP)', '12 luni'],
            ['Date referral și plăți', '5 ani (termen prescripție generală)'],
          ]}
        />
        <p>La expirarea perioadei de retenție, datele sunt șterse sau anonimizate ireversibil.</p>
      </LSection>

      <LSection num="7" title="Drepturile dumneavoastră">
        <p>În conformitate cu GDPR, aveți următoarele drepturi:</p>
        <div className="space-y-4">
          {[
            { art: 'Art. 15', titlu: 'Dreptul de acces', desc: 'Aveți dreptul de a obține confirmarea că prelucrăm datele dumneavoastră și de a primi o copie a acestora.' },
            { art: 'Art. 16', titlu: 'Dreptul la rectificare', desc: 'Aveți dreptul de a solicita corectarea datelor inexacte sau completarea datelor incomplete. Multe date pot fi actualizate direct din secțiunea Setări a contului.' },
            { art: 'Art. 17', titlu: 'Dreptul la ștergere („dreptul de a fi uitat")', desc: 'Aveți dreptul de a solicita ștergerea datelor dumneavoastră, cu excepția cazurilor în care prelucrarea este necesară pentru respectarea unei obligații legale (ex: date de facturare păstrate 10 ani).' },
            { art: 'Art. 18', titlu: 'Dreptul la restricționarea prelucrării', desc: 'Aveți dreptul de a solicita restricționarea prelucrării datelor dumneavoastră în anumite circumstanțe (ex: contestați exactitatea datelor, prelucrarea este ilegală dar nu doriți ștergerea).' },
            { art: 'Art. 20', titlu: 'Dreptul la portabilitatea datelor', desc: 'Aveți dreptul de a primi datele dumneavoastră într-un format structurat, utilizat frecvent și lizibil automat.' },
            { art: 'Art. 21', titlu: 'Dreptul la opoziție', desc: 'Aveți dreptul de a vă opune prelucrării datelor în scop de marketing direct sau bazate pe interesul legitim al operatorului.' },
            { art: '', titlu: 'Dreptul de a retrage consimțământul', desc: 'Când prelucrarea se bazează pe consimțământul dumneavoastră (ex: emailuri de marketing), îl puteți retrage oricând, fără a afecta legalitatea prelucrării anterioare retragerii. Vă puteți dezabona din orice email prin link-ul „Dezabonare" din footer sau scriindu-ne la iroby027@gmail.com.' },
          ].map((d) => (
            <div key={d.titlu} className="flex gap-3">
              {d.art && (
                <span className="flex-shrink-0 text-xs font-bold px-2 py-1 rounded-md h-fit" style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a' }}>
                  {d.art}
                </span>
              )}
              <div>
                <p className="font-semibold text-sm mb-1" style={{ color: '#0a1a0f' }}>{d.titlu}</p>
                <p>{d.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <LSubSection id="" title="Dreptul de a depune o plângere">
          <p>
            Aveți dreptul de a depune o plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor
            cu Caracter Personal (ANSPDCP):
          </p>
          <LList items={[
            'Website: www.dataprotection.ro',
            'Email: anspdcp@dataprotection.ro',
            'Adresă: B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, București',
          ]} />
        </LSubSection>

        <div className="p-4 rounded-xl" style={{ background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.15)' }}>
          <p className="font-semibold text-sm mb-1" style={{ color: '#0a1a0f' }}>Cum vă exercitați drepturile</p>
          <p>
            Trimiteți o cerere scrisă la{' '}
            <a href="mailto:iroby027@gmail.com" className="underline" style={{ color: '#16a34a' }}>iroby027@gmail.com</a>{' '}
            cu subiectul „Exercitare drepturi GDPR". Vom răspunde în termen de 30 de zile calendaristice.
            Serviciul este gratuit.
          </p>
        </div>
      </LSection>

      <LSection num="8" title="Securitatea datelor">
        <p>SC VOID SFT GAMES SRL implementează măsuri tehnice și organizatorice adecvate:</p>
        <LList items={[
          'Criptare SSL/TLS pentru toate comunicațiile dintre browser și server',
          'Parole stocate exclusiv în format hash (bcrypt) — nu avem acces la parolele dumneavoastră',
          'Acces restricționat la datele personale — doar personalul autorizat al operatorului',
          'URL-uri signed cu expirare pentru accesul la video-urile cursurilor',
          'Monitorizare continuă a activității suspecte pe platformă',
          'Backup automat al datelor cu stocare criptată',
        ]} />
        <p>
          În cazul unui incident de securitate care prezintă un risc ridicat pentru drepturile și libertățile
          dumneavoastră, vă vom notifica în termen de 72 de ore de la descoperirea incidentului, conform art. 34 GDPR.
        </p>
      </LSection>

      <LSection num="9" title="Date privind minorii">
        <p>
          Platforma Edinio.com este destinată exclusiv persoanelor cu vârsta de minimum 18 ani. Nu colectăm
          intenționat date cu caracter personal de la minori. Dacă descoperim că am colectat date de la o
          persoană sub 18 ani fără consimțământul părinților, vom șterge imediat aceste date.
        </p>
        <p>
          Dacă sunteți un părinte sau tutore legal și credeți că copilul dumneavoastră minor ne-a furnizat
          date personale, vă rugăm să ne contactați la{' '}
          <a href="mailto:iroby027@gmail.com" className="underline" style={{ color: '#16a34a' }}>iroby027@gmail.com</a>.
        </p>
      </LSection>

      <LSection num="10" title="Cookie-uri">
        <p>
          Utilizăm cookie-uri și tehnologii similare pe Platforma Edinio.com. Informații detaliate despre
          tipurile de cookie-uri utilizate, scopul acestora și modalitățile de control se regăsesc în{' '}
          <a href="/cookies" className="underline font-medium" style={{ color: '#16a34a' }}>Politica privind Cookie-urile</a>.
        </p>
      </LSection>

      <LSection num="11" title="Modificări ale politicii">
        <p>
          Ne rezervăm dreptul de a modifica prezenta Politică de Confidențialitate în orice moment. Modificările
          semnificative vor fi comunicate prin email și prin notificare vizibilă pe Platformă.
          Continuarea utilizării Platformei după publicarea modificărilor constituie acceptul dumneavoastră.
        </p>
      </LSection>

      <LSection num="12" title="Contact">
        <LCompanyBox />
        <div className="mt-6 pt-6" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
          <p className="text-xs" style={{ color: 'rgba(10,26,15,0.38)' }}>
            Politică de Confidențialitate valabilă începând cu 09 mai 2026 · SC VOID SFT GAMES SRL — Edinio.com
          </p>
        </div>
      </LSection>

    </LegalPage>
  )
}
