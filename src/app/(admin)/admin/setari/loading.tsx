export default function Loading() {
  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-14 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
