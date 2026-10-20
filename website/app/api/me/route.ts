import { authConfigured } from "@/auth"
import { currentUser } from "../../lib/session"

/* Who is signed in, for the static NetworkOS page (it has no server side of its own). Name, email and picture only. */
export async function GET() {
  const user = await currentUser()
  return Response.json(
    { user: user && { name: user.name, email: user.email, image: user.image }, signInReady: authConfigured },
    { headers: { "Cache-Control": "no-store" } },
  )
}
