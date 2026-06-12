import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getPublishedAnnouncements } from "@/lib/actions/announcement.actions";
import { AnnouncementArticle, type ArticleData } from "@/components/dashboard/AnnouncementArticle";
import { AnnouncementsSeenMarker } from "@/components/dashboard/AnnouncementsSeenMarker";
import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import type { Announcement } from "@/lib/announcements";

export const metadata = { title: "Noutati" };

// Sanitize text-block HTML server-side before it reaches the client renderer.
function toArticle(a: Announcement): ArticleData {
  return {
    title: a.title,
    excerpt: a.excerpt,
    cover_url: a.cover_url,
    is_pinned: a.is_pinned,
    published_at: a.published_at,
    blocks: (Array.isArray(a.blocks) ? a.blocks : []).map((b) =>
      b.type === "text" ? { ...b, html: sanitizeHtml(b.html) } : b
    ),
  };
}

export default async function NoutatiPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const announcements = await getPublishedAnnouncements();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <AnnouncementsSeenMarker />

      <div className="flex items-center gap-2 mb-6">
        <Megaphone className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold text-foreground">Noutati</h1>
      </div>

      {announcements.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-2xl">
          <Megaphone className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-foreground mb-1">Nicio noutate inca</p>
          <p className="text-sm text-muted-foreground">Aici vei vedea anunturile despre platforma.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {announcements.map((a) => (
            <AnnouncementArticle key={a.id} data={toArticle(a)} />
          ))}
        </div>
      )}
    </div>
  );
}
