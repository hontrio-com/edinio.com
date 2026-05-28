export default function Loading() {
  return (
    <div className="p-6 max-w-4xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-32 bg-muted rounded-lg" />
        <div className="h-9 w-32 bg-muted rounded-lg" />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
