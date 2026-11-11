/**
 * E respingerea unei actiuni de server o REDIRECTARE facuta de Next, nu o cadere?
 *
 * ⚠ In Next 16 o actiune care se incheie cu `redirect()` NU se intoarce la client pe calea de succes: promisiunea ei e
 * RESPINSA cu o eroare de redirectare (`server-action-reducer.js`: „the action promise will be rejected with a
 * redirect”), iar navigarea merge oricum. Deci un `catch` pus pe o astfel de actiune o vede si cand totul a reusit.
 * De aceea `register/page.tsx` avea un `catch` TACUT: un mesaj acolo ar fi aparut la fiecare inscriere reusita, iar
 * tacerea ascundea si caderile adevarate (o retea picata, un 403 de la poarta MFA: butonul revenea, fara niciun cuvant).
 *
 * Forma e cea din `next/dist/client/components/redirect-error.js` (`digest` = „NEXT_REDIRECT;<tip>;<adresa>;<cod>;”).
 * Nu se importa de acolo: e o cale interna a pachetului, fara garantie intre versiuni.
 */
export function esteRedirectareNext(e: unknown): boolean {
  if (typeof e !== "object" || e === null || !("digest" in e)) return false;
  const digest = (e as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;");
}
