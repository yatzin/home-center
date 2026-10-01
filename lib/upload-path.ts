import path from "path"

// Every filesystem path built from a record id goes through here. Ids arrive
// from the client, so a path is only trusted once it is proven to sit strictly
// inside the upload root.

export function uploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? "./uploads")
}

export function resolveUploadPath(...segments: string[]): string {
  if (segments.length === 0 || segments.some((s) => !s)) {
    throw new Error("Upload path segments must be non-empty")
  }
  const root = uploadRoot()
  const full = path.resolve(root, ...segments)
  // Equal to the root is rejected too: a recursive rm of the root is exactly
  // the failure this exists to prevent.
  if (!full.startsWith(root + path.sep)) {
    throw new Error("Refusing a path outside the upload directory")
  }
  return full
}
