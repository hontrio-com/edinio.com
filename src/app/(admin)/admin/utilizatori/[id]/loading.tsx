export default function UserDetailLoading() {
  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6 animate-pulse">
      <div className="h-5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
            <div className="h-4 w-56 bg-zinc-100 dark:bg-zinc-800 rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-24 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
            <div className="h-8 w-28 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-16 bg-zinc-100 dark:bg-zinc-800 rounded" />
              <div className="h-5 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-3">
          <div className="h-5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
              <div className="h-4 w-20 bg-zinc-100 dark:bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-3">
          <div className="h-5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
              <div className="h-4 w-20 bg-zinc-100 dark:bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-3">
        <div className="h-5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
      </div>
    </div>
  );
}
