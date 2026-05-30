import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { AnalyticsClient } from "@/components/dashboard/AnalyticsClient";
import fs from "fs";
import path from "path";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, primary_color")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!business) redirect("/dashboard");

  const svgContent = fs.readFileSync(
    path.join(process.cwd(), "public", "ro.svg"),
    "utf-8",
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <AnalyticsClient
        businessId={business.id}
        svgContent={svgContent}
        primaryColor={business.primary_color ?? "#1AB554"}
      />
    </div>
  );
}
