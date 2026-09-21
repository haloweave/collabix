import { redirect } from "next/navigation";
import { getSessionUser, STAFF_ROLES } from "@/lib/admin/auth";
import { LoginForm } from "@/components/admin/login-form";

// Public (unguarded) sign-in page. If a staff account is already signed in we
// skip straight to the dashboard; otherwise show the OTP form.
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await getSessionUser();
  if (user && (STAFF_ROLES as readonly string[]).includes(user.role)) {
    redirect("/admin");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <LoginForm forbidden={error === "forbidden"} />
    </div>
  );
}
