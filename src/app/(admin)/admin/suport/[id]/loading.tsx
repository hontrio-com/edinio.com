export default function TicketDetailLoading() {
  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6 animate-pulse">
      <div className="h-5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-6 w-64 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
              <div className="h-5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
            </div>
          </div>
          <div className="h-8 w-28 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
        </div>
        <div className="h-4 w-40 bg-zinc-100 dark:bg-zinc-800 rounded" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`flex gap-3 ${i % 2 === 1 ? "flex-row-reverse" : ""}`}>
            <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex-shrink-0" />
            <div className={`space-y-1 max-w-md ${i % 2 === 1 ? "items-end" : ""}`}>
              <div className="h-3 w-20 bg-zinc-100 dark:bg-zinc-800 rounded" />
              <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl p-4 space-y-2">
                <div className="h-4 w-full bg-zinc-200 dark:bg-zinc-700 rounded" />
                <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-700 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
        <div className="h-20 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
        <div className="flex justify-end">
          <div className="h-9 w-24 bg-zinc-200 dark:bg-zinc-700 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
