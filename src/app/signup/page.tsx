import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignupForm } from "./SignupForm";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-reel text-lg font-bold text-white">
            ▶
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Request access</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Create your account — an admin gives it clearance before you can
            sign in.
          </p>
        </div>

        <div className="card p-6">
          <SignupForm />
        </div>

        <p className="mt-4 text-center text-xs text-ink-faint">
          Already cleared?{" "}
          <Link href="/login" className="text-reel hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
