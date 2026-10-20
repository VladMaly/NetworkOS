import "server-only"
import { auth, authConfigured } from "@/auth"

export type SignedIn = { id: string; name: string; email: string; image: string | null }

/* The signed-in user, by Google account ID. For local work without Google keys, `npm run dev` with DEV_USER_ID set
   signs you in as that ID; this never applies in a production build or once Google sign-in is configured. */
export async function currentUser(): Promise<SignedIn | null> {
  if (!authConfigured) {
    const dev = process.env.NODE_ENV === "development" ? process.env.DEV_USER_ID : undefined
    return dev ? { id: dev, name: process.env.DEV_USER_NAME ?? "Dev Founder", email: "dev@localhost", image: null } : null
  }
  const user = (await auth())?.user
  return user?.id ? { id: user.id, name: user.name ?? "You", email: user.email ?? "", image: user.image ?? null } : null
}
