import { redirect } from "next/navigation";

export default function RootPage() {
  // Server-side redirect — instant, no client "Loading…" flash.
  redirect("/dashboard");
}
