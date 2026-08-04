import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { FormBuilderClient } from "@/components/pages/FormBuilderClient";
import type { FormField } from "@/lib/pages/forms.types";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function FormEditorPage({ params }: { params: Promise<{ formId: string }> }) {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const { formId } = await params;
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: form } = await supabase.from("forms").select("*").eq("id", formId).single();
  if (!form) notFound();

  const { data: business } = await supabase
    .from("businesses").select("id").eq("id", form.business_id).eq("user_id", user.id).single();
  if (!business) notFound(); // not the owner

  return (
    <FormBuilderClient
      formId={form.id}
      initialName={form.name}
      initialFields={Array.isArray(form.fields) ? (form.fields as unknown as FormField[]) : []}
      initialSubmitLabel={form.submit_label}
      initialSuccessMessage={form.success_message}
      initialEmailEnabled={form.email_enabled}
      initialEmailTo={form.email_to ?? ""}
      initialMailchimpEnabled={form.mailchimp_enabled}
      initialBrevoEnabled={form.brevo_enabled ?? false}
      initialKlaviyoEnabled={form.klaviyo_enabled ?? false}
    />
  );
}
