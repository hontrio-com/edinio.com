import { Toaster } from "sonner";

/*
  ═══════════════════════════════════════════════════════════════════════════
  UN SINGUR LOC PENTRU ÎNFĂȚIȘAREA NOTIFICĂRILOR
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ STĂTEA ÎN `app/layout.tsx`, adică deasupra ÎNTREGII aplicații. De acolo
  ajungea și pe site-ul de prezentare, pe centrul de ajutor, pe paginile de
  aterizare și pe magazinele comercianților — 9 kB gzip de JavaScript livrat
  unui vizitator care nu poate declanșa nicio notificare, fiindcă nu are
  niciun buton care să cheme `toast`.

  Măsurat pe 31.08.2026 cu o urmărire a importurilor, nu din ochi:

      (website)     0/28  rute ajung la sonner
      (ajutor)       0/4
      (landing)      0/2
      (public)      0/15   ← magazinele comercianților
      (auth)         5/6
      (dashboard)  71/107
      (admin)      20/35
      (onboarding)   1/4
      reactivare     1/1

  ⚠ DE CE O COMPONENTĂ ȘI NU CINCI `<Toaster>` COPIATE: pentru că `duration` și
  clasele de mai jos sunt înfățișarea produsului. Cinci copii înseamnă că
  peste un an trei au altă durată și nimeni nu știe care e cea bună. Aici e una.

  ⚠ CINE ADAUGĂ `toast` ÎNTR-O RUTĂ NOUĂ trebuie să aibă asta montată deasupra.
  Nu e o convenție pe încredere: `notificari-montate.test.ts` urmărește
  importurile de la fiecare rută până la `sonner` și cade dacă vreo rută poate
  chema `toast` fără să aibă un `<NotificariToast>` într-un layout părinte.
  Fără plasa aia, greșeala e TĂCUTĂ — `toast.error(...)` nu aruncă nimic când
  nu există niciun `<Toaster>` montat, pur și simplu nu se vede nimic pe ecran.
*/
export function NotificariToast() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 1800,
        classNames: {
          toast: "font-sans text-sm",
        },
      }}
    />
  );
}
