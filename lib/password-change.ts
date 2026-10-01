export const MIN_PASSWORD_LENGTH = 12

export type PasswordChangeError = "wrong-current" | "short" | "mismatch"

/**
 * Someone holding only a signed-in browser must not be able to set a new
 * password, so the current one is required — except on a forced reset, where
 * the temporary password was used to sign in moments ago.
 */
export async function checkPasswordChange(
  input: { current: string; next: string; confirm: string },
  account: { mustResetPassword: boolean; passwordHash: string },
  compare: (password: string, hash: string) => Promise<boolean>
): Promise<PasswordChangeError | null> {
  if (!account.mustResetPassword && !(input.current && (await compare(input.current, account.passwordHash)))) {
    return "wrong-current"
  }
  if (input.next.length < MIN_PASSWORD_LENGTH) return "short"
  if (input.next !== input.confirm) return "mismatch"
  return null
}
