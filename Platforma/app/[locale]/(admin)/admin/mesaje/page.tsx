import { createClient } from '@supabase/supabase-js'
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { ro } from 'date-fns/locale'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MesajePage() {
  const db = getAdmin()
  const { data: messages } = await db
    .from('contact_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="max-w-4xl">
      <AdminPageHeader
        title="Mesaje de contact"
        description={`${messages?.length ?? 0} mesaje primite`}
      />

      {!messages?.length ? (
        <div className="border-2 border-dashed border-zinc-200 rounded-xl py-16 text-center">
          <p className="text-sm text-zinc-400">Niciun mesaj primit încă.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg: any) => (
            <div key={msg.id} className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{msg.name}</span>
                    {!msg.is_read && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-blue-100 text-blue-700">
                        Nou
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">{msg.email}</p>
                </div>
                <span className="text-xs text-zinc-400 shrink-0">
                  {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ro })}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  {msg.subject}
                </p>
                <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
                  {msg.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
