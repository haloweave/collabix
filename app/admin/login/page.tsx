import { redirect } from "next/navigation";

// Superseded by the universal /login page; kept so old links still work.
export default function AdminLoginPage() {
  redirect("/login");
}
