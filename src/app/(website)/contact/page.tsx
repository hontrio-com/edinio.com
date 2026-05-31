import type { Metadata } from "next";
import { Mail, MapPin, Clock } from "lucide-react";
import { ContactForm } from "@/components/website/ContactForm";

export const metadata: Metadata = {
  title: "Contact Edinio - Suport creare magazin online",
  description:
    "Contacteaza echipa Edinio pentru orice intrebare despre creare magazin online. Suport 7 zile din 7, raspuns rapid.",
  alternates: {
    canonical: "https://edinio.ro/contact",
  },
  openGraph: {
    title: "Contact Edinio - Suport creare magazin online",
    description:
      "Contacteaza echipa Edinio. Suntem aici sa te ajutam cu orice intrebare.",
    url: "https://edinio.ro/contact",
  },
};

const CONTACT_INFO = [
  {
    icon: Mail,
    title: "Email",
    detail: "contact@edinio.ro",
  },
  {
    icon: MapPin,
    title: "Locatie",
    detail: "Bucuresti, Romania",
  },
  {
    icon: Clock,
    title: "Program suport",
    detail: "Luni - Vineri, 09:00 - 18:00",
  },
];

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <div className="pt-20 pb-12 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Contact
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Ai intrebari? Trimite-ne un mesaj si te contactam in cel mai scurt
            timp.
          </p>
        </div>
      </div>

      {/* Content */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-12">
            {/* Contact info */}
            <div className="lg:col-span-2 space-y-6">
              {CONTACT_INFO.map(({ icon: Icon, title, detail }) => (
                <div key={title} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">
                      {title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Form */}
            <div className="lg:col-span-3">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
