import { redirect } from "next/navigation";
import { Megaphone, Pin } from "lucide-react";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getPublishedAnnouncements } from "@/lib/actions/announcement.actions";
import { AnnouncementBlocks } from "@/components/dashboard/AnnouncementBlocks";
import { AnnouncementsSeenMarker } from "@/components/dashboard/AnnouncementsSeenMarker";
import { formatDate } from "@/lib/utils/format";

export const metadata = { title: "Noutati" };

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
            <article key={a.id} className="bg-surface border border-border rounded-2xl overflow-hidden">
              {a.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.cover_url} alt="" className="w-full max-h-64 object-cover" />
              )}
              <div className="p-5 sm:p-6 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {a.is_pinned && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      <Pin className="h-3 w-3" /> Important
                    </span>
                  )}
                  {a.published_at && <span className="text-xs text-muted-foreground">{formatDate(a.published_at)}</span>}
                </div>
                <h2 className="text-xl font-bold text-foreground">{a.title}</h2>
                {a.excerpt && <p className="text-sm text-muted-foreground">{a.excerpt}</p>}
                <AnnouncementBlocks blocks={Array.isArray(a.blocks) ? a.blocks : []} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
