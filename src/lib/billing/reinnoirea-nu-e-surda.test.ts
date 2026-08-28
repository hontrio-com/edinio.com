import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   RAMURA DE REINNOIRE ERA SINGURA SURDA (28.08.2026, noaptea tarziu)
   ══════════════════════════════════════════════════════════════════════════

   In acelasi fisier, aceleasi doua scrieri isi citesc raspunsul si intorc 500 ca Stripe sa
   relivreze: pe `checkout.session.completed` si pe `subscription.deleted`. Pe
   `invoice.payment_succeeded` — ramura care se aprinde la FIECARE plata, initiala si toate
   reinnoirile — nu si-l citeau. Iar ruta iese cu `{ received: true }` orice s-ar intampla, deci
   Stripe nu mai relivreaza niciodata.

   Ce se pierdea, la fiecare reinnoire:

     `plan_expires_at` nu se prelungea         -> un client platitor pica din plan
     o schimbare de plan la reinnoire          -> nu se scria
     `payment_failed_at` ramanea aprins        -> bannerul „plată restantă" pe un cont la zi

   ⚠ SI NIMIC NU REPARA PE URMA. `reconcile-subscriptions` filtreaza `.is("payment_failed_at",
   null)` si DOAR suspenda: nu prelungeste, nu curata semnul, nu ridica suspendarea. Mai rau, cu
   semnul ramas aprins userul iese definitiv si din interogarea plasei — deci tocmai contul
   stricat devine cel invizibil.

   ⚠ DE CE RELUAREA E SIGURA, si de-aia 500 e raspunsul potrivit: factura fiscala se emite
   DEFERAT, prin `after()`, deci un 500 se intoarce inainte ca ea sa fie macar programata. Iar
   `emitSubscriptionInvoice` e oricum idempotenta — sare daca exista deja o serie Smartbill, si
   `unique(stripe_invoice_id)` opreste restul.
*/

const ruta = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");

/** Bucata dintre doua marcaje de ramura, ca sa nu numaram scrieri din alta ramura. */
function ramura(dela: string, panaLa: string): string {
  const i = ruta.indexOf(dela);
  assert.notEqual(i, -1, `n-am gasit ramura ${dela}`);
  const j = ruta.indexOf(panaLa, i + dela.length);
  assert.notEqual(j, -1, `n-am gasit sfarsitul ramurii ${dela}`);
  return ruta.slice(i, j);
}

const REINNOIRE = 'if (event.type === "invoice.payment_succeeded")';
const ESEC = 'if (event.type === "invoice.payment_failed")';

test("⚠ scrierea planului la reinnoire isi citeste raspunsul si cere reluarea", () => {
  const r = ramura(REINNOIRE, ESEC);
  assert.match(r, /const \{ error: eProfil \} = await admin\.from\("users_profile"\)\.update\(/,
    "scrierea planului trebuie sa-si prinda eroarea");
  /*
   * ⚠ 500, NU `received: true`. Un 200 ii spune lui Stripe „am inregistrat" — si atunci nu mai
   * relivreaza, iar plata ramane incasata la ei si nescrisa la noi, pentru totdeauna.
   */
  assert.match(r, /if \(eProfil\) \{[\s\S]{0,260}?status: 500/,
    "un esec trebuie sa ceara relivrarea, nu sa iasa cu 200");
});

test("⚠ si ridicarea suspendarii, la fel", () => {
  const r = ramura(REINNOIRE, ESEC);
  assert.match(r, /const \{ error: eSuspendare \} = await admin[\s\S]{0,120}?suspended_until: null/,
    "ridicarea suspendarii trebuie sa-si prinda eroarea");
  assert.match(r, /if \(eSuspendare\) \{[\s\S]{0,260}?status: 500/);
});

test("⚠ si la plata initiala, unde profilul era pazit iar suspendarea nu", () => {
  /*
   * Un om care tocmai a platit si ramane suspendat e chiar cazul in care tacerea costa cel mai
   * mult: el vede ca a platit, si magazinul lui e tot inchis.
   */
  const r = ramura('if (event.type === "checkout.session.completed")',
    'if (event.type === "customer.subscription.deleted")');
  assert.match(r, /const \{ error: eSuspendareInitiala \} = await admin[\s\S]{0,120}?suspended_until: null/);
  assert.match(r, /if \(eSuspendareInitiala\) \{[\s\S]{0,260}?status: 500/);
});

test("⚠ niciun 500 nu se intoarce DUPA ce s-a programat factura fiscala", () => {
  /*
   * ⚠ AICI E CONDITIA CARE FACE RELUAREA SIGURA. Un 500 intors dupa `after(...)` ar lasa factura
   * programata SI ar cere relivrarea — adica exact drumul catre o a doua factura fiscala pentru
   * aceiasi bani. Idempotenta lui `emitSubscriptionInvoice` ar prinde-o, dar o paza care se
   * bizuie pe alta paza nu e o paza.
   */
  const r = ramura(REINNOIRE, ESEC);
  /*
   * ⚠ SE CAUTA CHEMAREA, NU CUVANTUL. `indexOf("after(")` nimerea intai propria mea NOTA de
   * deasupra, care scrie „prin `after()`" — deci proba masura distanta fata de un comentariu si
   * cadea pe cod bun. A patra oara in doua zile cand o ancora prinde altceva decat apara.
   */
  const iAfter = r.indexOf("after(() => emitSubscriptionInvoice(");
  assert.ok(iAfter > 0, "factura se emite deferat, prin after()");
  const dupaAfter = r.slice(iAfter);
  assert.doesNotMatch(dupaAfter, /status: 500/,
    "dupa programarea facturii nu se mai cere relivrarea");
});

test("⚠ plasa de reconciliere chiar NU repara asta, deci webhook-ul nu se poate bizui pe ea", () => {
  /*
   * Probele de mai sus apara o alegere: „500, ca sa reia Stripe". Alegerea are sens numai cat timp
   * nimic altceva nu prinde plata pierduta. Daca maine plasa ar invata sa prelungeasca planurile,
   * proba asta cade prima si intreaba din nou — asta e rostul ei.
   */
  const plasa = readFileSync("src/app/api/cron/reconcile-subscriptions/route.ts", "utf8");
  assert.match(plasa, /\.is\("payment_failed_at", null\)/,
    "plasa inca ocoleste conturile cu semnul aprins");
  assert.doesNotMatch(plasa, /plan_expires_at:/,
    "plasa inca nu prelungeste niciun plan");
});
