import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { MediaLibraryClient } from "@/components/editor/MediaLibraryClient";

export const metadata = { title: "Biblioteca Media" };

export default async function MediaLibraryPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  return <MediaLibraryClient />;
}
