type OcrProgress = {
  status: string
  progress: number
}

type OcrOutput = {
  text: string
  confidence: number
}

type LoggerMessage = {
  status?: string
  progress?: number
}

type TesseractWorker = {
  recognize: (image: Blob | File) => Promise<{ data: { text: string; confidence: number } }>
  setParameters: (params: Record<string, string>) => Promise<unknown>
  terminate: () => Promise<unknown>
}

type TesseractRuntime = {
  createWorker: (
    languages?: string,
    oem?: unknown,
    options?: { logger?: (message: LoggerMessage) => void },
  ) => Promise<TesseractWorker>
}

let activeProgressHandler: ((progress: OcrProgress) => void) | undefined
let workerPromise: Promise<TesseractWorker> | undefined
let ocrQueue: Promise<unknown> = Promise.resolve()

async function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js')
      .then((module) => {
        const runtime = module as unknown as TesseractRuntime
        return runtime.createWorker('eng', undefined, {
          logger: (message) => {
            activeProgressHandler?.({
              status: message.status || 'Reading label',
              progress: message.progress || 0,
            })
          },
        })
      })
      .then(async (worker) => {
        await worker.setParameters({
          preserve_interword_spaces: '1',
          tessedit_pageseg_mode: '11',
        })
        return worker
      })
  }

  return workerPromise
}

async function readTextFile(file: File): Promise<OcrOutput> {
  return {
    text: await file.text(),
    confidence: 100,
  }
}

export async function recognizeLabelFile(
  file: File,
  onProgress: (progress: OcrProgress) => void,
): Promise<OcrOutput> {
  if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')) {
    onProgress({ status: 'Reading text', progress: 1 })
    return readTextFile(file)
  }

  const recognize = async () => {
    activeProgressHandler = onProgress
    const worker = await getWorker()
    try {
      const result = await worker.recognize(file)

      return {
        text: result.data.text,
        confidence: result.data.confidence,
      }
    } finally {
      activeProgressHandler = undefined
    }
  }

  const queuedResult = ocrQueue.then(recognize, recognize)
  ocrQueue = queuedResult.catch(() => undefined)
  return queuedResult
}

export async function shutdownOcrWorker() {
  if (!workerPromise) return

  const worker = await workerPromise
  await worker.terminate()
  workerPromise = undefined
}
