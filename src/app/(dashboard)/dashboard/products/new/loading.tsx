export default function Loading() {
  return (
    <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-6">
      <div className="h-6 w-36 bg-muted rounded-lg" />
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-muted rounded-xl h-16" />
          ))}
          <div className="bg-muted rounded-xl h-40" />
        </div>
        <div className="lg:w-72 space-y-4">
          <div className="bg-muted rounded-xl h-48" />
          <div className="bg-muted rounded-xl h-32" />
        </div>
      </div>
    </div>
  );
}
