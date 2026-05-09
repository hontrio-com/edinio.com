'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Loader2, Save } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface BundleFormProps {
  bundle?: {
    id: string
    title_ro: string
    title_en: string
    slug: string
    price_ron: number
    price_eur: number
    stripe_price_id_ron: string | null
    stripe_price_id_eur: string | null
  }
  selectedCourseIds?: string[]
  allCourses?: { id: string; title_ro: string }[]
}

export function BundleForm({ bundle, selectedCourseIds = [], allCourses = [] }: BundleFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>(selectedCourseIds)
  const [form, setForm] = useState({
    title_ro: bundle?.title_ro ?? '',
    title_en: bundle?.title_en ?? '',
    slug: bundle?.slug ?? '',
    price_ron: bundle ? bundle.price_ron / 100 : 750,
    price_eur: bundle ? bundle.price_eur / 100 : 150,
    stripe_price_id_ron: bundle?.stripe_price_id_ron ?? '',
    stripe_price_id_eur: bundle?.stripe_price_id_eur ?? '',
  })
  const supabase = createClient()

  function toggleCourse(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  function setField(key: string, value: any) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.title_ro.trim()) {
      toast({ title: 'Adaugă un titlu în română', variant: 'destructive' })
      return
    }
    if (selected.length === 0) {
      toast({ title: 'Selectează cel puțin un curs', variant: 'destructive' })
      return
    }

    setLoading(true)
    const payload = {
      title_ro: form.title_ro,
      title_en: form.title_en,
      slug: form.slug,
      price_ron: Math.round(form.price_ron * 100),
      price_eur: Math.round(form.price_eur * 100),
      stripe_price_id_ron: form.stripe_price_id_ron || null,
      stripe_price_id_eur: form.stripe_price_id_eur || null,
    }

    let bundleId = bundle?.id

    if (bundle?.id) {
      await supabase.from('bundles').update(payload).eq('id', bundle.id)
      await supabase.from('bundle_courses').delete().eq('bundle_id', bundle.id)
    } else {
      const { data: nb } = await supabase
        .from('bundles')
        .insert({ ...payload, is_published: false })
        .select('id')
        .single()
      bundleId = nb?.id
    }

    if (bundleId) {
      await supabase.from('bundle_courses').insert(
        selected.map(courseId => ({ bundle_id: bundleId!, course_id: courseId }))
      )
    }

    toast({ title: bundle ? 'Bundle actualizat.' : 'Bundle creat!' })
    setLoading(false)
    router.push('/admin/bundle-uri')
    router.refresh()
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Detalii bundle</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Titlu (Română)</Label>
            <Input value={form.title_ro} onChange={e => setField('title_ro', e.target.value)} placeholder="Bundle Complet" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Title (English)</Label>
            <Input value={form.title_en} onChange={e => setField('title_en', e.target.value)} placeholder="Complete Bundle" className="h-9 text-sm" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">Slug URL</Label>
          <Input value={form.slug} onChange={e => setField('slug', e.target.value)} placeholder="bundle-complet" className="h-9 text-sm font-mono" />
        </div>

        <Separator />

        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Prețuri</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Preț RON</Label>
            <div className="relative">
              <Input type="number" value={form.price_ron} onChange={e => setField('price_ron', parseFloat(e.target.value))} className="h-9 text-sm pr-12" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">RON</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Price EUR</Label>
            <div className="relative">
              <Input type="number" value={form.price_eur} onChange={e => setField('price_eur', parseFloat(e.target.value))} className="h-9 text-sm pr-12" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">EUR</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Stripe Price ID (RON)</Label>
            <Input value={form.stripe_price_id_ron} onChange={e => setField('stripe_price_id_ron', e.target.value)} placeholder="price_1..." className="h-9 text-sm font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Stripe Price ID (EUR)</Label>
            <Input value={form.stripe_price_id_eur} onChange={e => setField('stripe_price_id_eur', e.target.value)} placeholder="price_1..." className="h-9 text-sm font-mono" />
          </div>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-3">Cursuri incluse</p>
          {allCourses.length === 0 ? (
            <p className="text-sm text-zinc-400">Nu există cursuri publicate. Publică cursuri mai întâi.</p>
          ) : (
            <div className="space-y-2.5">
              {allCourses.map(course => (
                <div key={course.id} className="flex items-center gap-3">
                  <Checkbox
                    id={course.id}
                    checked={selected.includes(course.id)}
                    onCheckedChange={() => toggleCourse(course.id)}
                  />
                  <Label htmlFor={course.id} className="cursor-pointer text-sm font-normal">
                    {course.title_ro}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>
        {selected.length > 0 && (
          <p className="text-xs text-zinc-500">{selected.length} {selected.length === 1 ? 'curs selectat' : 'cursuri selectate'}</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()} className="text-zinc-500">Anulează</Button>
        <Button onClick={handleSave} disabled={loading} className="gap-2 min-w-[140px]">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {bundle ? 'Salvează' : 'Creează bundle'}
        </Button>
      </div>
    </div>
  )
}
