import { Sparkles } from 'lucide-react'

export default function AvatarePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Avatar AI</h1>
        <p className="text-sm text-muted-foreground">
          Colecție de avatare AI gata de descărcat și folosit imediat în proiectele tale.
        </p>
      </div>

      <div className="rounded-2xl border bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 border-violet-100 p-8 sm:p-12 text-center space-y-4">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-2xl bg-white shadow-sm flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-violet-500" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-violet-900">Avatarele sunt în pregătire</h2>
          <p className="text-sm text-violet-700 max-w-sm mx-auto leading-relaxed">
            Lucrăm la o colecție premium de avatare AI pe care le vei putea descărca și folosi direct în videoclipurile tale.
          </p>
        </div>
        <p className="text-xs text-violet-500">Disponibil în curând</p>
      </div>
    </div>
  )
}
