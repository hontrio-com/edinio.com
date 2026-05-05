import { createClient } from '@/lib/supabase/server'
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header'
import { PayoutActionsClient } from '@/components/admin/referral/payout-actions-client'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'

export const metadata = { title: 'Referral & Payouts — Admin Edinio' }

export default async function AdminReferralPage() {
  const supabase = await createClient()

  const [{ data: requests }, { data: conversions }] = await Promise.all([
    supabase
      .from('payout_requests')
      .select('*, profiles:user_id(email, full_name)')
      .order('requested_at', { ascending: false })
      .limit(100),
    supabase
      .from('referral_conversions')
      .select('*, referrer:referrer_id(email, full_name), referred:referred_id(email)')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const totalPending = requests
    ?.filter((r) => r.status === 'pending')
    .reduce((s, r) => s + r.amount, 0) ?? 0

  const pendingCount = requests?.filter((r) => r.status === 'pending').length ?? 0

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Referral & Payouts"
        description={`${pendingCount} cereri în așteptare · ${formatPrice(totalPending, 'ron')} de plătit`}
      />

      <div>
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-3">
          Cereri de retragere
        </p>
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-zinc-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sumă</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Metodă</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(requests ?? []).map((req) => {
                const profile = req.profiles as any
                return (
                  <tr key={req.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-zinc-900">{profile?.full_name || '—'}</p>
                      <p className="text-xs text-zinc-400">{profile?.email}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm font-semibold">{formatPrice(req.amount, 'ron')}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-zinc-600">
                        {req.iban
                          ? `IBAN: ${req.iban.slice(0, 8)}...`
                          : `PayPal: ${req.paypal_email}`
                        }
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-zinc-500">
                        {format(new Date(req.requested_at ?? Date.now()), 'd MMM yyyy', { locale: ro })}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge
                        variant={
                          req.status === 'paid' ? 'default' :
                          req.status === 'pending' ? 'secondary' :
                          req.status === 'processing' ? 'outline' : 'destructive'
                        }
                        className="text-[10px]"
                      >
                        {req.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <PayoutActionsClient request={req} />
                    </td>
                  </tr>
                )
              })}
              {(requests ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-zinc-400">
                    Nicio cerere de retragere
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(conversions ?? []).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-3">
            Conversii recente ({conversions?.length})
          </p>
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-zinc-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Referrer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Client adus</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Reward</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {(conversions ?? []).map((conv) => {
                  const referrer = conv.referrer as any
                  const referred = conv.referred as any
                  return (
                    <tr key={conv.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-zinc-900">{referrer?.full_name || '—'}</p>
                        <p className="text-xs text-zinc-400">{referrer?.email}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-zinc-600">{referred?.email}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-semibold text-green-700">
                          +{formatPrice(conv.reward_amount, conv.reward_currency as 'ron' | 'eur')}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-zinc-500">
                          {format(new Date(conv.created_at ?? Date.now()), 'd MMM yyyy', { locale: ro })}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant="secondary" className="text-[10px]">{conv.status}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
