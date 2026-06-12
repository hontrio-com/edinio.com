"use client";

import { useEffect } from "react";
import { markAnnouncementsSeen } from "@/lib/actions/announcement.actions";

// Marks announcements as seen for the current user when the Noutati page opens,
// which clears the unread badge in the sidebar.
export function AnnouncementsSeenMarker() {
  useEffect(() => {
    markAnnouncementsSeen();
  }, []);
  return null;
}
