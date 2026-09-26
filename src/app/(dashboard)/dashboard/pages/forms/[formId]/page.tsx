import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { FormBuilderClient } from "@/components/pages/FormBuilderClient";
import type { FormField } from "@/lib/pages/forms.types";
import { statisticiFormulare } from "@/lib/pages/statistici-formulare";
import { PanouStatistica } from "@/components/pages/StatisticaFormular";
import { getStoreEmailSender } from "@/lib/email/sender";
import { adreseleLui } from "@/lib/pages/destinatar-formular";

// Titlul filei (sablonul radacinii adauga „ | Edinio”); pana acum fila arata textul generic al site-ului.
export const metadata = { title: "Formular" };

export default async function FormEditorPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: form } = await supabase.from("forms").select("*").eq("id", formId).single();
  if (!form) notFound();

  const { data: business } = await supabase
    .from("businesses").select("id, email").eq("id", form.business_id).eq("user_id", user.id).single();
  if (!business) notFound(); // not the owner

  const [statistici, sender] = await Promise.all([
    statisticiFormulare(supabase, business.id, [form.id]),
    // Cu SMTP propriu, adresa de primire e la alegerea lui; fara, numai adresele lui (`destinatarFormular`).
    getStoreEmailSender(supabase, business.id),
  ]);
  const stat = statistici[form.id];

  return (
    <FormBuilderClient
      formId={form.id}
      initialName={form.name}
      initialVersiune={form.updated_at}
      initialFields={Array.isArray(form.fields) ? (form.fields as unknown as FormField[]) : []}
      initialSubmitLabel={form.submit_label}
      initialSuccessMessage={form.success_message}
      initialEmailEnabled={form.email_enabled}
      initialEmailTo={form.email_to ?? ""}
      adreseleLui={adreseleLui(business.email, user.email)}
      areSmtp={!!sender?.smtp}
      initialMailchimpEnabled={form.mailchimp_enabled}
      initialBrevoEnabled={form.brevo_enabled ?? false}
      initialKlaviyoEnabled={form.klaviyo_enabled ?? false}
      statistica={stat ? <PanouStatistica s={stat} /> : null}
    />
  );
}
