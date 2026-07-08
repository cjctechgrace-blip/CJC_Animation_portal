import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-reel text-lg font-bold text-white">
            ▶
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            CJC Animation Portal
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Sign in to review episodes and leave feedback.
          </p>
        </div>

        <div className="card p-6">
          <LoginForm />
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-line bg-panel/60 p-4 text-xs text-ink-faint">
          <p className="mb-1 font-semibold uppercase tracking-wide">
            Demo accounts
          </p>
          <p>
            admin@cjc.test · editor@cjc.test · reviewer@cjc.test
            <br />
            password: <span className="font-mono">password123</span>
          </p>
        </div>
      </div>
    </main>
  );
}
