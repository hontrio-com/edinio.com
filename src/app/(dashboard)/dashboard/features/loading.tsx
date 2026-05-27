export default function FeaturesLoading() {
  return (
    <div className="p-6 max-w-4xl animate-pulse">
      <div className="h-7 w-40 bg-muted rounded-lg mb-1" />
      <div className="h-4 w-80 bg-muted rounded mb-8" />
      <div className="space-y-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="h-4 w-24 bg-muted rounded mb-3" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-16 bg-muted rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
