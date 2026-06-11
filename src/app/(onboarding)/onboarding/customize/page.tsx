import { redirect } from "next/navigation";

// Customize step removed from onboarding - redirect to details
// Logo, colors, cover are now configured in Dashboard > Editor
export default function OnboardingCustomizePage() {
  redirect("/onboarding/details");
}
