import { LandingPage } from '@/components/marketing/landing-page'
import { Navbar } from '@/components/layout/navbar'

export const metadata = {
  title: 'Invata sa faci videoclipuri cu Inteligenta Artificiala | Edinio',
  description:
    'Cursul complet pentru a crea videoclipuri profesionale cu AI. Platforma KIE.AI, avatare AI, Google Veo 3.1. 250 lei, acces pe viata.',
}

export default function HomePage() {
  return (
    <>
      <Navbar />
      <LandingPage />
    </>
  )
}
