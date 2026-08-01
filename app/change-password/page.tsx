import { auth, signOut } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

async function changePassword(formData: FormData) {
  "use server"
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const newPassword = formData.get("newPassword") as string
  const confirm = formData.get("confirm") as string

  if (!newPassword || newPassword.length < 8) {
    redirect("/change-password?error=short")
  }
  if (newPassword !== confirm) {
    redirect("/change-password?error=mismatch")
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash, mustResetPassword: false },
  })

  // Force re-login to refresh the JWT with mustResetPassword: false
  await signOut({ redirectTo: "/login?message=password-changed" })
}

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams

  const errorText =
    error === "short"
      ? "Password must be at least 8 characters."
      : error === "mismatch"
        ? "Passwords do not match."
        : null

  return (
    <div className="min-h-svh flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Set your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a new password before continuing.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">New password</CardTitle>
            {errorText && (
              <CardDescription className="text-destructive">{errorText}</CardDescription>
            )}
            {message === "password-changed" && (
              <CardDescription className="text-green-600">
                Password changed — please sign in again.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <form action={changePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full">
                Set password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
