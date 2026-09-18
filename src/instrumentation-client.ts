/*
  ═══════════════════════════════════════════════════════════════════════════════
  SENTRY IN BROWSER: NUMAI UNDE LUCREAZA OAMENI CU CONT
  ═══════════════════════════════════════════════════════════════════════════════

  Fisierul asta intra in pachetul de client al FIECAREI pagini, inclusiv al
  vitrinelor magazinelor, unde fiecare kilobyte se plateste in viteza si in
  conversie. De aceea aici nu se importa Sentry: doar se hotaraste daca se aduce.

  Se aduce (cu `import()`, deci intr-o bucata separata) pe dashboard, admin, login,
  onboarding si reactivare: ecranele comerciantilor si ale noastre. Pe vitrine NU;
  acolo erorile de server le prinde oricum `onRequestError`, iar o cadere prinsa de
  granita de eroare il aduce abia atunci (vezi `raporteaza.ts`).

  Si la navigarea pe client: cine intra pe site si apasa „Intra in cont" ajunge la
  /login fara reincarcare, deci verificarea de la incarcare nu l-ar prinde.
*/
const ZONE_CU_CONT =
  /^\/(dashboard|admin|onboarding|login|register|forgot-password|reset-password|reactivare)(\/|$)/;

let adus: Promise<void> | null = null;

function adu(): void {
  adus ??= import("./lib/sentry/client").then((m) => m.porneste()).catch(() => undefined);
}

if (ZONE_CU_CONT.test(window.location.pathname)) adu();

export function onRouterTransitionStart(adresa: string): void {
  try {
    if (ZONE_CU_CONT.test(new URL(adresa, window.location.href).pathname)) adu();
  } catch {
    // o adresa care nu se poate citi nu schimba nimic
  }
}
