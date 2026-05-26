import type { Metadata } from "next";

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
      <header className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center">
          <a href="/" className="inline-flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: "var(--color-brand)" }}
            >
              E
            </div>
            <span className="text-lg font-semibold text-foreground tracking-tight">
              Edinio
            </span>
          </a>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
