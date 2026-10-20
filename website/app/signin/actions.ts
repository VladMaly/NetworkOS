"use server"

import { redirect } from "next/navigation"
import { authConfigured, signIn, signOut } from "@/auth"
import { currentUser } from "../lib/session"

export async function signOutAction() {
  await signOut({ redirectTo: "/signin" })
}

/* The landing page's top-right button: straight to Google, or to the app if already signed in. Without Google keys
   it falls back to /signin, which says what's missing. */
export async function signInWithGoogle() {
  if (await currentUser()) redirect("/")
  if (!authConfigured) redirect("/signin")
  await signIn("google", { redirectTo: "/?start=1" })
}
