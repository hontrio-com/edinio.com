/*
  Trimite la Sentry o eroare prinsa de o granita de eroare (`error.tsx`,
  `global-error.tsx`).

  ⚠ ERORILE DE SERVER NU SE RETRIMIT DE AICI. Cand o componenta de server cade,
  Next ii da browserului o eroare DEZINFECTATA („An error occurred in the Server
  Components render"), fara mesaj si fara stiva, dar cu `digest`. Originalul l-a
  trimis deja `onRequestError`, pe server, cu tot ce trebuie. A doua trimitere ar
  numara aceeasi cadere de doua ori, a doua oara fara nicio informatie.

  Sentry se aduce cu `import()`: pe vitrine nu e incarcat dinainte, deci o cadere
  acolo il descarca abia atunci (vezi `instrumentation-client.ts`).
*/
export function raporteazaEroarea(eroare: Error & { digest?: string }): void {
  if (eroare.digest) return;
  import("./client").then((m) => m.captureaza(eroare)).catch(() => undefined);
}
