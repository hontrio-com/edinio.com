export default function Loading() {
  return (
    <div className="p-6 max-w-6xl mx-auto animate-pulse">
      <div className="mb-5 h-4 w-28 rounded-md bg-muted" />
      <div className="mb-6">
        <div className="h-6 w-2/3 rounded-md bg-muted" />
        <div className="mt-3 h-5 w-64 rounded-md bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted" />
          ))}
          <div className="h-28 rounded-xl bg-muted" />
        </div>
        <div className="hidden h-64 rounded-xl bg-muted lg:block" />
      </div>
    </div>
  );
}
