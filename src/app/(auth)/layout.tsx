import type { Metadata } from "next";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = {
  title: "Autentificare",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuroraBackground>
      <div className="w-full max-w-md px-4 py-8">
        <div className="mb-6 sm:mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="bg-white rounded-xl border border-border p-6 sm:p-8 shadow-md">
          {children}
        </div>
      </div>
    </AuroraBackground>
  );
}
