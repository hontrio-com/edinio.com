import { NotificariToast } from "@/components/ui/NotificariToast";

/*
  ⚠ ASPECTUL ĂSTA EXISTĂ DINTR-UN SINGUR MOTIV: `<NotificariToast />`.

  `/reactivare` e singura rută din aplicație care stă în afara oricărui grup și
  totuși cheamă `toast`. `ReactivateClient` o face de două ori, și amândouă
  sunt momentul cel mai prost cu putință ca să nu vezi nimic pe ecran:

      toast.error("Eroare la initializarea platii.")
      toast.error("Eroare de retea. Incearca din nou.")

  Adică un comerciant cu magazinul OPRIT, care încearcă să plătească și să și-l
  pornească la loc. Dacă plata cade și notificarea nu se vede, el rămâne cu un
  buton care pare că n-a făcut nimic — și cu magazinul tot oprit.

  Până pe 31.08.2026 `<Toaster>` stătea în `app/layout.tsx` și acoperea și ruta
  asta din întâmplare. Când s-a mutat de acolo (9 kB livrați degeaba fiecărui
  vizitator al site-ului de prezentare), ruta asta ar fi rămas descoperită —
  tăcut, fiindcă `toast.error` nu aruncă nimic când nu e montat niciun
  `<Toaster>`. De aceea aspectul ăsta s-a scris în ACEEAȘI mișcare cu mutarea,
  și de aceea `notificari-montate.test.ts` verifică legătura la fiecare probă.
*/
export default function ReactivareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <NotificariToast />
    </>
  );
}
