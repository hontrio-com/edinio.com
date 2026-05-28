import { requireAdmin } from "@/lib/admin-guard";

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
