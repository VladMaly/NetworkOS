import { signOut } from "@/auth"

/* Sign-out for the static NetworkOS page: it posts a plain form here and lands back on the homepage. */
export async function POST() {
  await signOut({ redirectTo: "/" })
}
