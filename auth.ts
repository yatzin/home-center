import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { verifyLogin } from "@/lib/auth-credentials"
import { clientIp, createLoginThrottle } from "@/lib/login-throttle"

// One throttle per process, kept on globalThis because route handlers and
// server actions can each load their own copy of this module.
const g = globalThis as unknown as { __hcLoginThrottle?: ReturnType<typeof createLoginThrottle> }
const throttle = (g.__hcLoginThrottle ??= createLoginThrottle())

/** Shown on the login page as "too many attempts" rather than "wrong password". */
export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited"
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const result = await verifyLogin(credentials, clientIp(request.headers), {
          findUser: (email) => prisma.user.findUnique({ where: { email } }),
          compare: (password, hash) => bcrypt.compare(password, hash),
          throttle,
        })
        if (result.status === "throttled") throw new TooManyAttempts()
        return result.status === "ok" ? result.user : null
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: string }).role
        token.mustResetPassword = (user as { mustResetPassword: boolean }).mustResetPassword
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as string
      session.user.mustResetPassword = token.mustResetPassword as boolean
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  trustHost: true,
})
