import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

/* Google sign-in. The user's ID everywhere in NetworkOS is their Google account ID (the `sub` claim), carried in the
   session as `user.id`. Reads AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from the environment. */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: "/signin" },
  callbacks: {
    jwt({ token, account }) {
      if (account?.provider === "google") token.uid = account.providerAccountId
      return token
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid
      return session
    },
  },
})

export const authConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET)
