import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background text-foreground">
      <h1 className="text-7xl font-black text-zinc-200 dark:text-zinc-800">404</h1>
      <p className="text-lg font-semibold mt-4">Pagina nu a fost gasita</p>
      <p className="text-sm text-zinc-500 mt-1 text-center max-w-md">
        Pagina pe care o cauti nu exista sau a fost mutata.
      </p>
      <Link
        href="/"
        className="mt-6 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
      >
        Inapoi la pagina principala
      </Link>
    </div>
  );
}
