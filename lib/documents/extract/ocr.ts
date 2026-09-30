import path from "path"
import { createWorker, type Worker } from "tesseract.js"

// One Tesseract worker for the process, created on first use and terminated
// when the queue goes idle (it holds ~100 MB). Language data comes from the
// @tesseract.js-data/eng package on disk — never downloaded at runtime.

let worker: Promise<Worker> | null = null

export function tessdataPath(): string {
  return process.env.TESSDATA_PATH ?? path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int")
}

function getWorker(): Promise<Worker> {
  worker ??= createWorker("eng", 1, {
    langPath: tessdataPath(),
    gzip: true,
    cacheMethod: "none",
    logger: () => {},
    errorHandler: () => {},
  }).catch((error) => {
    worker = null
    throw error
  })
  return worker
}

export async function ocrImage(image: Buffer): Promise<string> {
  const { data } = await (await getWorker()).recognize(image)
  return data.text
}

export async function terminateOcr(): Promise<void> {
  const w = worker
  worker = null
  if (w) await w.then((x) => x.terminate()).catch(() => {})
}
