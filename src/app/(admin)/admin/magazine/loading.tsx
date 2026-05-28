export default function MagazineLoading() {
  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-pulse">
      <div className="h-8 w-40 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-2">
            <div className="h-7 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
            <div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="h-9 flex-1 min-w-48 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
        <div className="h-9 w-32 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
        <div className="h-9 w-28 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700 flex gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded" style={{ width: `${48 + i * 16}px` }} />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex gap-6 items-center">
            <div className="h-4 w-36 bg-zinc-100 dark:bg-zinc-800 rounded" />
            <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
            <div className="h-5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
            <div className="h-5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
            <div className="h-8 w-20 bg-zinc-100 dark:bg-zinc-800 rounded-lg ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
