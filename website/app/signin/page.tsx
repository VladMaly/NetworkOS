import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { authConfigured, signIn } from "@/auth"
import { currentUser } from "../lib/session"
import { NetMark } from "../home/icons"
import "../home/network-os.css"

export const metadata: Metadata = { title: "Sign in · NetworkOS" }

/* Where to go after signing in: a path on this site (?next=/…), the dashboard otherwise. */
const safeNext = (next: string | undefined) => (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/home")

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await connection()
  const next = safeNext((await searchParams).next)
  const user = await currentUser()
  if (user) redirect(next)

  async function google() {
    "use server"
    await signIn("google", { redirectTo: next })
  }

  return (
    <div className="os-page nx">
      <main className="nx-signin">
        <div className="nx-signin-card ly-pane">
          <NetMark size={52} />
          <h1>NetworkOS</h1>
          <p>Your AI relationship team. It remembers everyone you meet and tells you what to do next.</p>
          {authConfigured ? (
            <form action={google}>
              <button type="submit" className="os-btn os-main">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3zM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22zM6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1A10 10 0 0 0 2 12c0 1.6.4 3.1 1.1 4.6L6.4 14zM12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z" /></svg>
                Continue with Google
              </button>
            </form>
          ) : (
            <p className="nx-status">Google sign-in isn&apos;t set up yet. Add AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET (see docs/setup.md).</p>
          )}
          <p className="nx-fine">We only use your Google name and email. Nothing is ever sent for you without your approval.</p>
        </div>
      </main>
    </div>
  )
}
