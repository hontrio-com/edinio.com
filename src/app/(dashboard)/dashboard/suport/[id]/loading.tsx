export default function Loading() {
  return (
    <div className="p-6 max-w-3xl mx-auto animate-pulse">
      <div className="h-5 w-28 bg-muted rounded mb-6" />
      <div className="h-10 w-2/3 bg-muted rounded-xl mb-2" />
      <div className="flex gap-2 mb-8">
        <div className="h-6 w-20 bg-muted rounded-full" />
        <div className="h-6 w-16 bg-muted rounded-full" />
        <div className="h-6 w-24 bg-muted rounded-full" />
      </div>
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
            <div className="h-24 w-2/3 bg-muted rounded-2xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
