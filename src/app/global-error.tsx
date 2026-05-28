"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ro">
      <body className="min-h-screen flex flex-col items-center justify-center px-4 bg-white text-zinc-900">
        <h1 className="text-7xl font-black text-zinc-200">500</h1>
        <p className="text-lg font-semibold mt-4">Eroare critica</p>
        <p className="text-sm text-zinc-500 mt-1 text-center max-w-md">
          A aparut o eroare neasteptata. Te rugam sa incerci din nou.
        </p>
        <button
          onClick={reset}
          className="mt-6 px-5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors"
        >
          Incearca din nou
        </button>
      </body>
    </html>
  );
}
