import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = process.env.EMAIL_FROM ?? "Edinio <noreply@edinio.com>";
const SITE = "https://www.edinio.com";

const CONTACT_BLOCK = `
  <div style="margin-top:24px;padding:16px 18px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;">
    <p style="margin:0;font-size:13px;color:#71717a;">Ai nevoie de ajutor? Suntem aici 7 zile din 7:</p>
    <p style="margin:6px 0 0 0;font-size:13px;color:#71717a;">
      <a href="mailto:contact@edinio.com" style="color:#1AB554;text-decoration:none;font-weight:600;">contact@edinio.com</a>
      &nbsp;&middot;&nbsp;
      <a href="tel:+40750456809" style="color:#1AB554;text-decoration:none;font-weight:600;">0750 456 809</a>
      &nbsp;&middot;&nbsp;
      <a href="https://wa.me/40750456809" style="color:#1AB554;text-decoration:none;font-weight:600;">WhatsApp</a>
    </p>
  </div>
`;

function btn(text: string, href: string): string {
  return `
    <div style="text-align:center;margin:24px 0 8px 0;">
      <a href="${SITE}${href}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        ${text}
      </a>
    </div>
  `;
}

function wrap(content: string): string {
  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td align="center" style="padding-bottom:24px;">
        <a href="${SITE}" style="text-decoration:none;">
          <img src="${SITE}/logo.png" width="44" height="44" alt="Edinio" style="display:inline-block;width:44px;height:auto;border:0;" />
        </a>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e4e4e7;">
        ${content}
      </td></tr>
      <tr><td align="center" style="padding-top:20px;">
        <p style="margin:0;font-size:12px;color:#a1a1aa;">
          Edinio &mdash; Platforma ta de e-commerce &middot;
          <a href="${SITE}" style="color:#1AB554;text-decoration:none;">edinio.com</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ─── Email definitions ────────────────────────────────────────────────────────

export interface AutomationEmail {
  key: string;
  subject: string;
  html: string;
}

// A1: Cont creat, nu a inceput onboarding (+2h)
export function emailOnboardingNotStarted(name: string): AutomationEmail {
  return {
    key: "onboarding_not_started_2h",
    subject: "Magazinul tau online e gata in 2 minute",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Magazinul tau e la un click distanta</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Ai facut primul pas - ti-ai creat contul pe Edinio. Acum mai ai nevoie de doar 2 minute sa iti lansezi magazinul online.</p>
      <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;color:#18181b;">Ce te asteapta:</p>
      <ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;color:#3f3f46;line-height:1.8;">
        <li>Alegi un nume si o adresa pentru magazin</li>
        <li>Incarci logo-ul si alegi culorile</li>
        <li>Gata, magazinul e online!</li>
      </ul>
      <p style="margin:0 0 0 0;font-size:14px;color:#3f3f46;">Nu ai nevoie de cunostinte tehnice. Totul e ghidat pas cu pas.</p>
      ${btn("Creeaza magazinul acum", "/onboarding/details")}
      ${CONTACT_BLOCK}
    `),
  };
}

// A2: Blocat la detalii/personalizare (+24h)
export function emailOnboardingStuck(name: string): AutomationEmail {
  return {
    key: "onboarding_stuck_24h",
    subject: "Ai ramas la jumatate - magazinul tau te asteapta",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Continua de unde ai ramas</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Am observat ca ai inceput sa iti configurezi magazinul pe Edinio dar nu ai finalizat. Nu iti face griji, progresul tau e salvat si poti continua exact de unde ai ramas.</p>
      <p style="margin:0 0 0 0;font-size:14px;color:#3f3f46;line-height:1.6;">Esti la un singur pas de a avea magazin online.</p>
      ${btn("Continua configurarea", "/onboarding/details")}
      ${CONTACT_BLOCK}
    `),
  };
}

// A3: Cont creat, niciun magazin (+3 zile)
export function emailOnboardingHelp(name: string): AutomationEmail {
  return {
    key: "onboarding_help_3d",
    subject: "Ai nevoie de ajutor cu magazinul?",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Suntem aici sa te ajutam</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Am vazut ca ti-ai creat cont pe Edinio acum 3 zile dar inca nu ai lansat magazinul. Vrem sa ne asiguram ca totul e in regula.</p>
      <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;color:#18181b;">Raspunsuri la cele mai frecvente intrebari:</p>
      <ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;color:#3f3f46;line-height:1.8;">
        <li><strong>Cat dureaza sa creez magazinul?</strong> Sub 2 minute.</li>
        <li><strong>Cat costa?</strong> Testarea e gratuita 15 zile, fara card.</li>
        <li><strong>Am nevoie de cunostinte tehnice?</strong> Nu, totul e simplu si ghidat.</li>
        <li><strong>Pot sa vand orice?</strong> Da, de la produse fizice la servicii.</li>
      </ul>
      ${btn("Lanseaza magazinul acum", "/onboarding/details")}
      ${CONTACT_BLOCK}
    `),
  };
}

// A4: Cont creat, niciun magazin (+7 zile)
export function emailOnboardingLastChance(name: string): AutomationEmail {
  return {
    key: "onboarding_last_chance_7d",
    subject: "Contul tau Edinio va fi dezactivat in curand",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Contul tau va fi dezactivat</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Contul tau pe Edinio e inactiv de 7 zile si nu are niciun magazin creat. Pentru a pastra platforma curata, conturile inactive fara magazin sunt dezactivate automat dupa 14 zile.</p>
      <p style="margin:0 0 0 0;font-size:14px;color:#3f3f46;line-height:1.6;">Daca vrei sa iti pastrezi contul, tot ce trebuie sa faci e sa iti creezi magazinul. Dureaza sub 2 minute si e complet gratuit.</p>
      ${btn("Creeaza magazinul si pastreaza contul", "/onboarding/details")}
    `),
  };
}

// B5: Trial inceput (+3 zile) - sfaturi
export function emailTrialTips(name: string, slug: string): AutomationEmail {
  return {
    key: "trial_tips_3d",
    subject: "3 lucruri care iti cresc vanzarile pe Edinio",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">3 lucruri care iti cresc vanzarile</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Magazinul tau pe Edinio e activ de 3 zile. Iata 3 lucruri pe care le poti face acum ca sa primesti mai multe comenzi:</p>
      <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#18181b;">1. Adauga fotografii de calitate</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;">Produsele cu poze clare si pe fundal alb se vand de 2-3 ori mai bine. Foloseste telefonul si lumina naturala.</p>
      <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#18181b;">2. Scrie descrieri clare la produse</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;">Spune ce este produsul, din ce e facut, ce dimensiuni are si de ce ar trebui clientul sa il cumpere. O descriere buna face diferenta.</p>
      <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#18181b;">3. Distribuie magazinul</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;">Copiaza link-ul magazinului tau (edinio.com/${slug}) si posteaza-l pe Facebook, Instagram sau trimite-l pe WhatsApp clientilor tai.</p>
      ${btn("Mergi la dashboard", "/dashboard")}
      ${CONTACT_BLOCK}
    `),
  };
}

// B6: 0 produse (+2 zile dupa creare)
export function emailNoProducts(name: string, businessName: string): AutomationEmail {
  return {
    key: "no_products_2d",
    subject: "Adauga primul produs in magazin - dureaza 1 minut",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Magazinul tau asteapta produse</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Magazinul tau (${businessName}) e creat si online, dar inca nu are produse. Fara produse, clientii nu au ce sa cumpere.</p>
      <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;color:#18181b;">Adaugarea unui produs e simpla:</p>
      <ol style="margin:0 0 16px 0;padding-left:20px;font-size:14px;color:#3f3f46;line-height:1.8;">
        <li>Mergi in Dashboard > Produse > Adauga produs</li>
        <li>Pune un nume, pret si cel putin o poza</li>
        <li>Apasa "Salveaza" - gata, produsul e in magazin!</li>
      </ol>
      <p style="margin:0 0 0 0;font-size:14px;color:#3f3f46;">Poti adauga pana la 10 produse in planul gratuit. Incepe cu cel mai popular produs al tau.</p>
      ${btn("Adauga primul produs", "/dashboard/products/new")}
      ${CONTACT_BLOCK}
    `),
  };
}

// B7: Are produse, 0 comenzi (+5 zile)
export function emailNoOrders(name: string, businessName: string): AutomationEmail {
  return {
    key: "no_orders_5d",
    subject: "Cum sa obtii prima comanda pe Edinio",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Prima comanda e la un pas</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Magazinul tau (${businessName}) are produse adaugate dar inca nu a primit nicio comanda. E normal la inceput, iata ce poti face:</p>
      <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#18181b;">Trimite link-ul pe WhatsApp</p>
      <p style="margin:0 0 12px 0;font-size:14px;color:#3f3f46;">Copiaza link-ul magazinului si trimite-l la 10 persoane care ar fi interesate de produsele tale.</p>
      <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#18181b;">Posteaza pe social media</p>
      <p style="margin:0 0 12px 0;font-size:14px;color:#3f3f46;">Pune o poza cu produsul tau pe Facebook sau Instagram cu link-ul magazinului in descriere.</p>
      <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#18181b;">Ofera un discount</p>
      <p style="margin:0 0 12px 0;font-size:14px;color:#3f3f46;">Mergi in Dashboard > Discounturi si creeaza un cod promotional (ex: PRIMA10 pentru 10% reducere).</p>
      <p style="margin:0 0 0 0;font-size:14px;color:#3f3f46;">Prima comanda e cea mai grea. Dupa aceea, totul merge mai usor.</p>
      ${btn("Mergi la dashboard", "/dashboard")}
      ${CONTACT_BLOCK}
    `),
  };
}

// B8: Trial expira in 3 zile
export function emailTrialExpires3d(name: string, businessName: string): AutomationEmail {
  return {
    key: "trial_expires_3d",
    subject: "Mai ai 3 zile de testare gratuita pe Edinio",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Mai ai 3 zile de testare gratuita</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Perioada ta de testare gratuita pe Edinio expira in 3 zile. Dupa aceasta data, magazinul tau (${businessName}) nu va mai fi vizibil clientilor.</p>
      <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;color:#18181b;">Ca sa iti pastrezi magazinul activ, alege un plan:</p>
      <ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;color:#3f3f46;line-height:1.8;">
        <li><strong>Basic</strong> - 99 lei/luna (500 produse)</li>
        <li><strong>Premium</strong> - 249 lei/luna (2.500 produse)</li>
        <li><strong>Ultra</strong> - 499 lei/luna (produse nelimitate)</li>
      </ul>
      <p style="margin:0 0 0 0;font-size:14px;color:#71717a;">Toate planurile includ: integrari curierat, plati online, facturare automata, suport 7/7 si mentenanta gratuita pe viata.</p>
      ${btn("Alege un plan", "/dashboard/settings#abonament")}
      ${CONTACT_BLOCK}
    `),
  };
}

// B9: Trial expira maine
export function emailTrialExpires1d(name: string, businessName: string): AutomationEmail {
  return {
    key: "trial_expires_1d",
    subject: "Maine se dezactiveaza magazinul tau Edinio",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#d32f2f;">Ultima zi de testare gratuita</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Aceasta e ultima zi de testare gratuita. Maine, magazinul tau (${businessName}) va fi dezactivat si clientii nu il vor mai putea accesa.</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Produsele, comenzile si configurarile tale raman salvate. Daca alegi un plan, magazinul redevine activ instant.</p>
      <p style="margin:0 0 0 0;font-size:14px;color:#3f3f46;font-weight:600;">Cel mai popular plan e Basic la doar 99 lei/luna - mai putin decat o masa in oras.</p>
      ${btn("Activeaza magazinul acum", "/dashboard/settings#abonament")}
      ${CONTACT_BLOCK}
    `),
  };
}

// B10: Trial expirat
export function emailTrialExpired(name: string, businessName: string): AutomationEmail {
  return {
    key: "trial_expired_0d",
    subject: "Magazinul tau Edinio a fost dezactivat",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#d32f2f;">Magazinul tau a fost dezactivat</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Perioada de testare gratuita a expirat si magazinul tau (${businessName}) nu mai e vizibil clientilor.</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Vestea buna: totul e salvat. Produsele, comenzile, configurarile - toate sunt acolo. Tot ce trebuie sa faci e sa alegi un plan si magazinul revine online in cateva secunde.</p>
      <p style="margin:0 0 0 0;font-size:14px;color:#3f3f46;">Planurile pornesc de la 99 lei/luna cu tot inclus: curierat, plati, facturi, suport 7/7.</p>
      ${btn("Reactiveaza magazinul", "/dashboard/settings#abonament")}
      ${CONTACT_BLOCK}
    `),
  };
}

// C11: Nu a intrat de 7 zile
export function emailInactive7d(name: string, businessName: string): AutomationEmail {
  return {
    key: "inactive_7d",
    subject: "Au trecut 7 zile de cand nu ai intrat pe Edinio",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Magazinul tau te asteapta</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Au trecut 7 zile de cand nu ai mai verificat magazinul tau (${businessName}). Verifica daca ai comenzi noi sau mesaje de la clienti.</p>
      <p style="margin:0 0 0 0;font-size:14px;color:#3f3f46;">Un magazin online activ si verificat zilnic inspira incredere clientilor si genereaza mai multe vanzari.</p>
      ${btn("Verifica magazinul", "/dashboard")}
      ${CONTACT_BLOCK}
    `),
  };
}

// C12: Nu a intrat de 14 zile
export function emailInactive14d(name: string, businessName: string): AutomationEmail {
  return {
    key: "inactive_14d",
    subject: "Magazinul tau are nevoie de atentie",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Magazinul tau are nevoie de atentie</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Nu ai mai intrat pe Edinio de 2 saptamani. Magazinul tau (${businessName}) e in continuare online, dar fara atentie, clientii pot pleca la concurenta.</p>
      <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;color:#18181b;">Cateva lucruri pe care le poti face in 5 minute:</p>
      <ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;color:#3f3f46;line-height:1.8;">
        <li>Verifica comenzile noi</li>
        <li>Actualizeaza preturile sau stocul</li>
        <li>Adauga un produs nou</li>
        <li>Creeaza un cod de discount pentru clienti</li>
      </ul>
      ${btn("Intra pe dashboard", "/dashboard")}
      ${CONTACT_BLOCK}
    `),
  };
}

// D14: Prima comanda
export function emailFirstOrder(name: string, businessName: string, orderNumber: string, customerName: string, total: number): AutomationEmail {
  return {
    key: "first_order",
    subject: "Felicitari! Ai primit prima comanda pe Edinio!",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Felicitari! Prima comanda!</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Ai primit prima ta comanda pe ${businessName}! Acesta e un moment important - inseamna ca magazinul tau functioneaza si clientii au incredere sa cumpere.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Comanda ${orderNumber}</p>
        <p style="margin:4px 0 0 0;font-size:13px;color:#3f3f46;">Client: ${customerName} &middot; Total: ${total} lei</p>
      </div>
      <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;color:#18181b;">Ce sa faci acum:</p>
      <ol style="margin:0 0 16px 0;padding-left:20px;font-size:14px;color:#3f3f46;line-height:1.8;">
        <li>Confirma comanda in Dashboard > Comenzi</li>
        <li>Pregateste produsul pentru expediere</li>
        <li>Genereaza AWB-ul daca ai un curier conectat</li>
      </ol>
      <p style="margin:0 0 0 0;font-size:14px;color:#3f3f46;">Prima comanda e doar inceputul. Continua sa iti promovezi magazinul!</p>
      ${btn("Vezi comanda", "/dashboard/orders")}
    `),
  };
}

// D15: 10 comenzi
export function emailMilestone10(name: string, businessName: string): AutomationEmail {
  return {
    key: "milestone_10",
    subject: "10 comenzi! Magazinul tau creste",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">10 comenzi pe Edinio!</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Magazinul tau (${businessName}) a atins 10 comenzi pe Edinio! Asta inseamna ca ai deja clienti care cumpara si au incredere in tine.</p>
      <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;color:#18181b;">Cateva idei sa cresti si mai mult:</p>
      <ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;color:#3f3f46;line-height:1.8;">
        <li><strong>Activeaza platile online</strong> ca sa oferi mai multe optiuni clientilor</li>
        <li><strong>Creeaza coduri de discount</strong> pentru clientii fideli</li>
        <li><strong>Verifica statisticile</strong> sa vezi de unde vin clientii tai</li>
      </ul>
      <p style="margin:0 0 0 0;font-size:14px;color:#3f3f46;">Mult succes in continuare!</p>
      ${btn("Vezi statisticile", "/dashboard/analytics")}
    `),
  };
}

// D16: 50/100 comenzi
export function emailMilestone(name: string, businessName: string, count: number): AutomationEmail {
  return {
    key: `milestone_${count}`,
    subject: `${count} comenzi pe Edinio - esti pe drumul cel bun!`,
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">${count} de comenzi pe Edinio!</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">${businessName} a depasit ${count} de comenzi pe Edinio! E o realizare importanta si arata ca afacerea ta creste.</p>
      <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;color:#18181b;">La acest nivel, iti recomandam:</p>
      <ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;color:#3f3f46;line-height:1.8;">
        <li><strong>Conecteaza facturarea automata</strong> (SmartBill sau Oblio) ca sa economisesti timp</li>
        <li><strong>Foloseste SMS marketing</strong> ca sa trimiti oferte clientilor care au mai cumparat</li>
        <li><strong>Ia in considerare un plan superior</strong> pentru mai multe produse si functii avansate</li>
      </ul>
      <p style="margin:0 0 0 0;font-size:14px;color:#3f3f46;">Echipa Edinio iti multumeste pentru incredere. Suntem aici sa te ajutam sa cresti.</p>
      ${btn("Mergi la dashboard", "/dashboard")}
      ${CONTACT_BLOCK}
    `),
  };
}

// E17: Trial expirat +3 zile
export function emailReactivate3d(name: string, businessName: string): AutomationEmail {
  return {
    key: "reactivate_3d",
    subject: "Magazinul tau e offline de 3 zile",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#d32f2f;">Magazinul tau e offline de 3 zile</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Au trecut 3 zile de cand magazinul tau (${businessName}) a fost dezactivat. In tot acest timp, potentialii clienti nu il pot accesa.</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Fiecare zi fara magazin online inseamna comenzi pierdute. Reactiveaza-l acum - planurile pornesc de la 99 lei/luna.</p>
      <p style="margin:0 0 0 0;font-size:14px;color:#3f3f46;">Toate datele tale sunt in siguranta si magazinul revine online instant dupa activarea unui plan.</p>
      ${btn("Reactiveaza magazinul", "/dashboard/settings#abonament")}
      ${CONTACT_BLOCK}
    `),
  };
}

// E18: Trial expirat +7 zile
export function emailReactivate7d(name: string, businessName: string): AutomationEmail {
  return {
    key: "reactivate_7d",
    subject: "Ultima notificare: magazinul tau Edinio ramane offline",
    html: wrap(`
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#d32f2f;">Ultima notificare</h2>
      <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Salut${name ? `, ${name}` : ""}!</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Magazinul tau (${businessName}) e dezactivat de 7 zile. Aceasta este ultima notificare pe care o trimitem automat.</p>
      <p style="margin:0 0 16px 0;font-size:14px;color:#3f3f46;line-height:1.6;">Daca vrei sa continui sa vinzi online, alege un plan si magazinul redevine activ in cateva secunde. Daca nu, nu trebuie sa faci nimic - datele tale raman salvate 30 de zile.</p>
      ${btn("Alege un plan", "/dashboard/settings#abonament")}
      ${CONTACT_BLOCK}
    `),
  };
}

// ─── Send helper ──────────────────────────────────────────────────────────────

export async function sendAutomationEmail(to: string, email: AutomationEmail): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    await getResend().emails.send({
      from: FROM,
      to,
      subject: email.subject,
      html: email.html,
    });
    return true;
  } catch (e) {
    console.error(`[email-automation] Failed to send ${email.key}:`, (e as Error).message);
    return false;
  }
}
