import type { Metadata } from "next";
import { AuroraBackground } from "@/components/ui/aurora-background";

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
        <div className="mb-6 sm:mb-8 text-center">
          <a href="/" className="inline-flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: "var(--color-brand)" }}
            >
              E
            </div>
            <span className="text-xl font-semibold text-foreground tracking-tight">
              Edinio
            </span>
          </a>
        </div>
        <div className="bg-white rounded-xl border border-border p-6 sm:p-8 shadow-md">
          {children}
        </div>
      </div>
    </AuroraBackground>
  );
}
