"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background text-foreground">
      <h1 className="text-7xl font-black text-zinc-200 dark:text-zinc-800">500</h1>
      <p className="text-lg font-semibold mt-4">Ceva nu a functionat corect</p>
      <p className="text-sm text-zinc-500 mt-1 text-center max-w-md">
        A aparut o eroare neasteptata. Te rugam sa incerci din nou.
      </p>
      <button
        onClick={reset}
        className="mt-6 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
      >
        Incearca din nou
      </button>
    </div>
  );
}
