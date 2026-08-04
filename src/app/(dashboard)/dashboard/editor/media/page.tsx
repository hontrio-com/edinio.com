import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { MediaLibraryClient } from "@/components/editor/MediaLibraryClient";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export const metadata = { title: "Biblioteca Media" };

export default async function MediaLibraryPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  return <MediaLibraryClient />;
}
