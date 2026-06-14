import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { PlatformMetaPixel } from "@/components/platform/PlatformMetaPixel";
import { PlatformTikTokPixel } from "@/components/platform/PlatformTikTokPixel";

export const metadata: Metadata = {
  title: "Configurare initiala",
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <PlatformMetaPixel />
      <PlatformTikTokPixel />
      <header className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center">
          <Logo size="md" />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
