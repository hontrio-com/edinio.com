import { redirect } from "next/navigation";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

// Customize step removed from onboarding - redirect to details
// Logo, colors, cover are now configured in Dashboard > Editor
export default function OnboardingCustomizePage() {
  redirect("/onboarding/details");
}
