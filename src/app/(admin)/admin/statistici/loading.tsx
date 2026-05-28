export default function StatisticiLoading() {
  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-pulse">
      <div className="h-8 w-36 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-7 w-20 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
            <div className="h-4 w-28 bg-zinc-100 dark:bg-zinc-800 rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
          <div className="h-5 w-40 bg-zinc-100 dark:bg-zinc-800 rounded mb-4" />
          <div className="h-52 bg-zinc-50 dark:bg-zinc-800 rounded-xl" />
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
          <div className="h-5 w-36 bg-zinc-100 dark:bg-zinc-800 rounded mb-4" />
          <div className="h-52 bg-zinc-50 dark:bg-zinc-800 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 lg:col-span-2">
          <div className="h-5 w-44 bg-zinc-100 dark:bg-zinc-800 rounded mb-4" />
          <div className="h-48 bg-zinc-50 dark:bg-zinc-800 rounded-xl" />
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
          <div className="h-5 w-32 bg-zinc-100 dark:bg-zinc-800 rounded mb-4" />
          <div className="h-48 bg-zinc-50 dark:bg-zinc-800 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
