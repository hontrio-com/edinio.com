'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Send, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const faqs = [
  {
    q: 'Nu pot vedea videoclipul lecției. Ce fac?',
    a: 'Asigură-te că ești conectat la internet și că ai acces la curs. Dacă problema persistă, încearcă să reîmprospătezi pagina sau să golești cache-ul browserului. Dacă tot nu merge, contactează-ne prin formularul de mai jos.',
  },
  {
    q: 'Cum accesez cursul pe telefon?',
    a: 'Platforma este optimizată pentru mobil — deschide edinio.com din browserul telefonului și loghează-te cu contul tău. Nu e nevoie de aplicație.',
  },
  {
    q: 'Pot descărca videoclipurile pentru vizionare offline?',
    a: 'Momentan videoclipurile sunt disponibile doar în streaming, direct pe platformă. Lucrăm la o funcție de descărcare pentru viitor.',
  },
  {
    q: 'Am uitat parola. Cum o resetez?',
    a: 'Accesează pagina de login și apasă pe "Am uitat parola". Vei primi un email cu link de resetare în câteva minute.',
  },
  {
    q: 'Cum funcționează programul de referral?',
    a: 'Găsești codul tău unic de referral în secțiunea Dashboard. Când cineva cumpără un curs folosind linkul tău, primești automat un bonus în contul tău, care poate fi retras după atingerea pragului minim.',
  },
  {
    q: 'Cât timp am acces la curs după cumpărare?',
    a: 'Accesul este pe viață. Odată cumpărat cursul, îl poți relua oricând, inclusiv actualizările viitoare de conținut.',
  },
  {
    q: 'Există o garanție de returnare a banilor?',
    a: 'Da, oferim garanție de 14 zile. Dacă nu ești mulțumit din orice motiv, contactează-ne și îți returnăm banii integral, fără întrebări.',
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b last:border-0">
      <button
        className="w-full flex items-center justify-between gap-3 py-4 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm sm:text-base font-medium pr-2">{q}</span>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        }
      </button>
      {open && (
        <p className="text-sm text-muted-foreground leading-relaxed pb-4 pr-7">{a}</p>
      )}
    </div>
  )
}

export default function AjutorPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()
    if (res.ok) {
      setSent(true)
    } else {
      setError(data.error ?? 'A apărut o eroare. Încearcă din nou.')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Ajutor</h1>
        <p className="text-sm text-muted-foreground">
          Găsești răspunsuri la întrebările frecvente și poți contacta echipa noastră.
        </p>
      </div>

      {/* FAQ */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Întrebări frecvente</h2>
        <div className="rounded-xl border bg-card px-5 divide-y">
          {faqs.map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </section>

      {/* Contact form */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Contactează-ne</h2>
          <p className="text-sm text-muted-foreground">
            Nu ai găsit răspunsul? Trimite-ne un mesaj și îți răspundem în cel mult 24 de ore.
          </p>
        </div>

        {sent ? (
          <div className="rounded-xl border bg-green-50 border-green-100 p-6 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
            <p className="font-medium text-green-800">Mesaj trimis cu succes!</p>
            <p className="text-sm text-green-700">Îți răspundem în cel mult 24 de ore.</p>
            <button
              onClick={() => { setSent(false); setForm({ name: '', email: '', subject: '', message: '' }) }}
              className="text-xs text-green-600 underline underline-offset-2 mt-1"
            >
              Trimite un alt mesaj
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-5 sm:p-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Nume</Label>
                <Input
                  placeholder="Numele tău"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  placeholder="email@exemplu.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subiect</Label>
              <Input
                placeholder="Cu ce te putem ajuta?"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                required
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mesaj</Label>
              <Textarea
                placeholder="Descrie problema sau întrebarea ta..."
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                required
                rows={5}
                className="text-sm resize-none"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full sm:w-auto gap-2">
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Se trimite...</>
                : <><Send className="h-4 w-4" /> Trimite mesajul</>
              }
            </Button>
          </form>
        )}
      </section>
    </div>
  )
}
