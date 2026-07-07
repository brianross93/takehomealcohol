import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, MutableRefObject } from 'react'
import './App.css'
import { SAMPLE_LABELS } from './data/sampleLabels'
import { extractWithOpenAI } from './lib/aiExtraction'
import {
  DEFAULT_APPLICATION,
  extractFields,
  verifyLabel,
  type ApplicationFields,
  type BeverageType,
  type ExtractedFields,
  type VerificationCheck,
  type ReviewResult,
  type ReviewStatus,
} from './lib/verification'

type QueueStatus = 'queued' | 'processing' | 'complete' | 'error'
type ApplicationSource = 'manual' | 'csv' | 'provided' | 'extracted'
type HumanDecision = 'accepted' | 'rejected'
type AddFilesOptions = {
  replace?: boolean
  applicationSource?: ApplicationSource
  progressText?: string
}
type ProcessItemOptions = {
  updateItem?: (id: string, patch: Partial<LabelItem>) => void
  processingIds?: MutableRefObject<Set<string>>
  fallbackApplication?: ApplicationFields
  draftFromExtraction?: boolean
  onDraftApplication?: (application: ApplicationFields) => void
}

type LabelItem = {
  id: string
  name: string
  status: QueueStatus
  progress: number
  progressText: string
  application?: ApplicationFields
  applicationSource?: ApplicationSource
  file?: File
  rawText?: string
  previewUrl?: string
  result?: ReviewResult
  error?: string
  canRetry?: boolean
  humanDecision?: HumanDecision
  decidedAt?: string
}

const BEVERAGE_TYPES: BeverageType[] = ['Distilled Spirits', 'Wine', 'Malt Beverage']
const BATCH_CONCURRENCY = 5
const REVIEW_PREFETCH_COUNT = 3
const PROVIDED_PACKET_PATH = '/preloaded-submissions'

type ResultFilter = 'all' | ReviewStatus

const UPLOAD_ACCEPT =
  'image/png,image/jpeg,image/webp,.csv,text/csv,application/pdf,.pdf,image/heic,image/heif,.heic,.heif'

const statusCopy: Record<ReviewStatus, string> = {
  ready: 'Ready',
  review: 'Review',
  missing: 'Missing',
}

const humanDecisionCopy: Record<HumanDecision, string> = {
  accepted: 'Accepted',
  rejected: 'Rejected',
}

const EMPTY_APPLICATION: ApplicationFields = {
  beverageType: 'Distilled Spirits',
  brandName: '',
  classType: '',
  alcoholContent: '',
  netContents: '',
  bottlerName: '',
  bottlerAddress: '',
  countryOfOrigin: '',
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '0.0s'
  return `${(ms / 1000).toFixed(1)}s`
}

function extractionSourceLabel(source: ExtractedFields['source'] | undefined) {
  if (source === 'text') return 'MANUAL'
  return 'AI'
}

function applicationSourceLabel(source: ApplicationSource | undefined) {
  if (source === 'provided') return 'Provided form'
  if (source === 'csv') return 'CSV record'
  if (source === 'extracted') return 'Extracted draft'
  return 'Manual record'
}

function csvEscape(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function normalizeFileKey(fileName: string) {
  return fileName.trim().toLowerCase()
}

function fileExtension(file: File) {
  const dotIndex = file.name.lastIndexOf('.')
  return dotIndex === -1 ? '' : file.name.slice(dotIndex + 1).toLowerCase()
}

function isCsvFile(file: File) {
  return file.type === 'text/csv' || fileExtension(file) === 'csv'
}

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || fileExtension(file) === 'pdf'
}

function isHeicFile(file: File) {
  const extension = fileExtension(file)
  return file.type === 'image/heic' || file.type === 'image/heif' || extension === 'heic' || extension === 'heif'
}

function isSupportedImageFile(file: File) {
  const extension = fileExtension(file)
  return (
    file.type === 'image/png' ||
    file.type === 'image/jpeg' ||
    file.type === 'image/webp' ||
    extension === 'png' ||
    extension === 'jpg' ||
    extension === 'jpeg' ||
    extension === 'webp'
  )
}

function normalizeBeverageType(value: string | undefined): BeverageType {
  const normalized = value?.trim().toLowerCase()
  return BEVERAGE_TYPES.find((type) => type.toLowerCase() === normalized) || 'Distilled Spirits'
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function makeFileItem(
  file: File,
  applicationByFileName: Record<string, ApplicationFields>,
  applicationSource: ApplicationSource = 'csv',
  progressText = 'Queued',
): LabelItem {
  const hasApplication = Boolean(applicationByFileName[normalizeFileKey(file.name)])

  return {
    id: createId(),
    name: file.name,
    status: 'queued',
    progress: 0,
    progressText,
    application: applicationByFileName[normalizeFileKey(file.name)],
    applicationSource: hasApplication ? applicationSource : undefined,
    file,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  }
}

function unsupportedFileItem(file: File): LabelItem {
  const message = isPdfFile(file)
    ? 'PDF label extraction is not implemented in this prototype. Export label pages to PNG or JPG, or add production PDF page rendering before extraction.'
    : isHeicFile(file)
      ? 'HEIC/HEIF labels are not reliably supported in this browser extraction path. Convert iPhone uploads to JPG or PNG before review.'
      : 'Unsupported file type. Upload PNG, JPG, WEBP label images or CSV application records.'

  return {
    id: createId(),
    name: file.name,
    status: 'error',
    progress: 0,
    progressText: 'Unsupported file type',
    error: message,
    canRetry: false,
  }
}

function failedCsvItem(file: File, error: unknown): LabelItem {
  return {
    id: createId(),
    name: file.name,
    status: 'error',
    progress: 0,
    progressText: 'CSV import failed',
    error: error instanceof Error ? error.message : 'Unable to import application CSV.',
    canRetry: false,
  }
}

function parseCsvRows(csv: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    const next = csv[index + 1]

    if (char === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(value.trim())
      value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      row.push(value.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }

  row.push(value.trim())
  if (row.some(Boolean)) rows.push(row)

  return rows
}

function csvToApplications(csv: string) {
  const rows = parseCsvRows(csv)
  const [headerRow, ...dataRows] = rows
  if (!headerRow?.length) return {}

  const headers = headerRow.map(normalizeCsvHeader)
  const headerIndex = new Map(headers.map((header, index) => [header, index]))

  function read(row: string[], header: string) {
    const index = headerIndex.get(normalizeCsvHeader(header))
    return index === undefined ? '' : row[index] || ''
  }

  return dataRows.reduce<Record<string, ApplicationFields>>((applications, row) => {
    const fileName = read(row, 'fileName')
    if (!fileName) return applications

    applications[normalizeFileKey(fileName)] = {
      beverageType: normalizeBeverageType(read(row, 'beverageType')),
      brandName: read(row, 'brandName'),
      classType: read(row, 'classType'),
      alcoholContent: read(row, 'alcoholContent'),
      netContents: read(row, 'netContents'),
      bottlerName: read(row, 'bottlerName'),
      bottlerAddress: read(row, 'bottlerAddress'),
      countryOfOrigin: read(row, 'countryOfOrigin'),
    }

    return applications
  }, {})
}

function csvFileNames(csv: string) {
  const rows = parseCsvRows(csv)
  const [headerRow, ...dataRows] = rows
  if (!headerRow?.length) return []

  const headers = headerRow.map(normalizeCsvHeader)
  const fileNameIndex = headers.indexOf(normalizeCsvHeader('fileName'))
  if (fileNameIndex === -1) return []

  return dataRows
    .map((row) => row[fileNameIndex]?.trim())
    .filter((fileName): fileName is string => Boolean(fileName))
}

function readTextFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read CSV file'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(file)
  })
}

async function urlToFile(url: string, fileName: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Unable to load ${fileName} (${response.status}).`)
  }

  const blob = await response.blob()
  return new File([blob], fileName, { type: blob.type || 'image/png' })
}

function hasApplicationData(application: ApplicationFields) {
  return [
    application.brandName,
    application.classType,
    application.alcoholContent,
    application.netContents,
    application.bottlerName,
    application.bottlerAddress,
    application.countryOfOrigin,
  ].some((value) => value.trim())
}

function applicationFromExtraction(
  extracted: ExtractedFields,
  fallback: ApplicationFields,
): ApplicationFields {
  return {
    beverageType: fallback.beverageType,
    brandName: extracted.brandName || fallback.brandName,
    classType: extracted.classType || fallback.classType,
    alcoholContent: extracted.alcoholContent || fallback.alcoholContent,
    netContents: extracted.netContents || fallback.netContents,
    bottlerName: extracted.bottler || fallback.bottlerName,
    bottlerAddress: fallback.bottlerAddress,
    countryOfOrigin: extracted.countryOfOrigin || fallback.countryOfOrigin,
  }
}

function summarizeItems(items: LabelItem[]) {
  const reviewed = items.filter((item) => item.result)
  const completed = items.filter((item) => item.result || item.status === 'error')
  const ready = reviewed.filter((item) => item.result?.status === 'ready').length
  const review = reviewed.filter((item) => item.result?.status === 'review').length
  const missing = reviewed.filter((item) => item.result?.status === 'missing').length
  const accepted = items.filter((item) => item.humanDecision === 'accepted').length
  const rejected = items.filter((item) => item.humanDecision === 'rejected').length
  const averageMs =
    reviewed.reduce((sum, item) => sum + (item.result?.durationMs || 0), 0) /
    Math.max(reviewed.length, 1)

  return {
    total: items.length,
    queued: items.filter((item) => item.status === 'queued').length,
    processing: items.filter((item) => item.status === 'processing').length,
    completed: completed.length,
    reviewed: reviewed.length,
    ready,
    review,
    missing,
    accepted,
    rejected,
    averageMs,
    etaMs: averageMs * (items.length - completed.length),
  }
}

function downloadItemsCsv(items: LabelItem[], fileName: string) {
  const rows: Array<Array<string | number>> = [
    [
      'label',
      'aiRecommendation',
      'aiScore',
      'durationMs',
      'applicationSource',
      'agentDecision',
      'agentDecisionAt',
      'check',
      'check_status',
      'expected',
      'found',
      'message',
    ],
  ]

  items.forEach((item) => {
    item.result?.checks.forEach((check) => {
      rows.push([
        item.name,
        statusCopy[item.result.status],
        item.result.score.toFixed(3),
        Math.round(item.result.durationMs),
        applicationSourceLabel(item.applicationSource),
        item.humanDecision || '',
        item.decidedAt || '',
        check.label,
        check.status,
        check.expected,
        check.found,
        check.message,
      ])
    })
  })

  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [application, setApplication] = useState<ApplicationFields>(EMPTY_APPLICATION)
  const [items, setItems] = useState<LabelItem[]>([])
  const [customItems, setCustomItems] = useState<LabelItem[]>([])
  const [pastedText, setPastedText] = useState('')
  const [activeItemId, setActiveItemId] = useState<string>()
  const [applicationByFileName, setApplicationByFileName] = useState<
    Record<string, ApplicationFields>
  >({})
  const [customApplicationByFileName, setCustomApplicationByFileName] = useState<
    Record<string, ApplicationFields>
  >({})
  const [customResultFilter, setCustomResultFilter] = useState<ResultFilter>('all')
  const processingIds = useRef(new Set<string>())
  const customProcessingIds = useRef(new Set<string>())
  const providedLoadStarted = useRef(false)

  useEffect(() => {
    void fetch('/api/extract-label?warmup=1').catch(() => undefined)
  }, [])

  useEffect(() => {
    if (providedLoadStarted.current) return

    providedLoadStarted.current = true
    void loadProvidedSubmissions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => summarizeItems(items), [items])
  const customStats = useMemo(() => summarizeItems(customItems), [customItems])

  const activeItem = useMemo(
    () =>
      items.find((item) => item.id === activeItemId) ||
      items.find((item) => !item.humanDecision) ||
      items[0],
    [activeItemId, items],
  )

  const activeItemNumber = activeItem
    ? items.findIndex((item) => item.id === activeItem.id) + 1
    : 0
  const activeApplication = activeItem?.application || application
  const canDecideActive = Boolean(activeItem?.result) && activeItem?.status !== 'processing'

  useEffect(() => {
    if (!activeItem) return

    const activeIndex = items.findIndex((item) => item.id === activeItem.id)
    if (activeIndex === -1) return

    items
      .slice(activeIndex, activeIndex + REVIEW_PREFETCH_COUNT)
      .filter((item) => item.status === 'queued' && !item.result)
      .forEach((item) => {
        void processItem(item)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem?.id, items])

  useEffect(() => {
    function handleReviewShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const targetTag = target?.tagName
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') return

      if (event.key.toLowerCase() === 'a' || event.key === 'ArrowRight') {
        event.preventDefault()
        recordHumanDecision('accepted')
      }

      if (event.key.toLowerCase() === 'r' || event.key === 'ArrowLeft') {
        event.preventDefault()
        recordHumanDecision('rejected')
      }
    }

    window.addEventListener('keydown', handleReviewShortcut)
    return () => window.removeEventListener('keydown', handleReviewShortcut)
  })

  const filteredCustomItems = useMemo(() => {
    if (customResultFilter === 'all') return customItems
    return customItems.filter((item) => item.result?.status === customResultFilter)
  }, [customItems, customResultFilter])

  function updateApplication<Field extends keyof ApplicationFields>(
    field: Field,
    value: ApplicationFields[Field],
  ) {
    setApplication((current) => ({ ...current, [field]: value }))
  }

  function updateItem(id: string, patch: Partial<LabelItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  function updateCustomItem(id: string, patch: Partial<LabelItem>) {
    setCustomItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  function retryItem(id: string) {
    const item = items.find((queuedItem) => queuedItem.id === id)

    updateItem(id, {
      status: 'queued',
      progress: 0,
      progressText: 'Queued for retry',
      error: undefined,
      result: undefined,
    })

    if (item) {
      void processItem({
        ...item,
        status: 'queued',
        progress: 0,
        progressText: 'Queued for retry',
        error: undefined,
        result: undefined,
      })
    }
  }

  function retryCustomItem(id: string) {
    const item = customItems.find((queuedItem) => queuedItem.id === id)

    updateCustomItem(id, {
      status: 'queued',
      progress: 0,
      progressText: 'Queued for retry',
      error: undefined,
      result: undefined,
    })

    if (item) {
      void processItem(
        {
          ...item,
          status: 'queued',
          progress: 0,
          progressText: 'Queued for retry',
          error: undefined,
          result: undefined,
        },
        {
          updateItem: updateCustomItem,
          processingIds: customProcessingIds,
          fallbackApplication: application,
          draftFromExtraction: true,
          onDraftApplication: setApplication,
        },
      )
    }
  }

  async function loadProvidedSubmissions() {
    items.forEach((item) => {
      if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
    })
    processingIds.current.clear()
    setItems([])
    setApplicationByFileName({})
    setActiveItemId(undefined)

    try {
      const csvResponse = await fetch(`${PROVIDED_PACKET_PATH}/application-records.csv`)
      if (!csvResponse.ok) {
        throw new Error(`Unable to load provided forms (${csvResponse.status}).`)
      }

      const csv = await csvResponse.text()
      const csvFile = new File([csv], 'application-records.csv', { type: 'text/csv' })
      const imageFiles = await Promise.all(
        csvFileNames(csv).map((fileName) =>
          urlToFile(`${PROVIDED_PACKET_PATH}/${encodeURIComponent(fileName)}`, fileName),
        ),
      )

      await addReviewFiles([csvFile, ...imageFiles], {
        replace: true,
        applicationSource: 'provided',
        progressText: 'Queued for pre-analysis',
      })
    } catch (error) {
      setItems([
        {
          id: createId(),
          name: 'provided-review-packet',
          status: 'error',
          progress: 0,
          progressText: 'Load failed',
          error:
            error instanceof Error
              ? error.message
              : 'Unable to load provided review packet.',
          canRetry: false,
        },
      ])
    }
  }

  function recordHumanDecision(decision: HumanDecision) {
    if (!activeItem?.result || activeItem.status === 'processing') return

    const currentIndex = items.findIndex((item) => item.id === activeItem.id)
    const nextItem =
      items.slice(currentIndex + 1).find((item) => !item.humanDecision) ||
      items.find((item) => item.id !== activeItem.id && !item.humanDecision)

    updateItem(activeItem.id, {
      humanDecision: decision,
      decidedAt: new Date().toISOString(),
    })

    if (nextItem) {
      setActiveItemId(nextItem.id)
    }
  }

  async function importCsvFiles(files: File[]) {
    const imported = await Promise.all(
      files.map(async (file) => csvToApplications(await readTextFile(file))),
    )

    return imported.reduce<Record<string, ApplicationFields>>(
      (merged, applications) => ({ ...merged, ...applications }),
      {},
    )
  }

  async function addReviewFiles(fileList: FileList | File[], options: AddFilesOptions = {}) {
    const files = Array.from(fileList)
    const csvFiles = files.filter(isCsvFile)
    let importedApplications: Record<string, ApplicationFields> = {}
    let csvErrors: LabelItem[] = []

    try {
      importedApplications = await importCsvFiles(csvFiles)
    } catch (error) {
      csvErrors = csvFiles.map((file) => failedCsvItem(file, error))
    }

    const nextApplications = {
      ...(options.replace ? {} : applicationByFileName),
      ...importedApplications,
    }
    const nextItems = files
      .filter((file) => !isCsvFile(file))
      .map((file) =>
        isSupportedImageFile(file)
          ? makeFileItem(
              file,
              nextApplications,
              options.applicationSource || 'csv',
              options.progressText || 'Queued',
            )
          : unsupportedFileItem(file),
      )
      .concat(csvErrors)

    if (csvFiles.length || options.replace) {
      setApplicationByFileName(nextApplications)
    }

    setItems((current) => {
      const updatedCurrent = options.replace
        ? []
        : current.map((item) => ({
            ...item,
            application: importedApplications[normalizeFileKey(item.name)] || item.application,
            applicationSource: importedApplications[normalizeFileKey(item.name)]
              ? options.applicationSource || 'csv'
              : item.applicationSource,
          }))

      return [...updatedCurrent, ...nextItems]
    })
  }

  async function addCustomFiles(fileList: FileList | File[], options: AddFilesOptions = {}) {
    const files = Array.from(fileList)
    const csvFiles = files.filter(isCsvFile)
    let importedApplications: Record<string, ApplicationFields> = {}
    let csvErrors: LabelItem[] = []

    try {
      importedApplications = await importCsvFiles(csvFiles)
    } catch (error) {
      csvErrors = csvFiles.map((file) => failedCsvItem(file, error))
    }

    const nextApplications = {
      ...(options.replace ? {} : customApplicationByFileName),
      ...importedApplications,
    }
    const nextItems = files
      .filter((file) => !isCsvFile(file))
      .map((file) =>
        isSupportedImageFile(file)
          ? makeFileItem(
              file,
              nextApplications,
              options.applicationSource || 'csv',
              options.progressText || 'Queued',
            )
          : unsupportedFileItem(file),
      )
      .concat(csvErrors)

    if (csvFiles.length || options.replace) {
      setCustomApplicationByFileName(nextApplications)
    }

    setCustomItems((current) => {
      const updatedCurrent = options.replace
        ? []
        : current.map((item) => ({
            ...item,
            application: importedApplications[normalizeFileKey(item.name)] || item.application,
            applicationSource: importedApplications[normalizeFileKey(item.name)]
              ? options.applicationSource || 'csv'
              : item.applicationSource,
          }))

      return [...updatedCurrent, ...nextItems]
    })
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) void addCustomFiles(event.target.files)
    event.target.value = ''
  }

  async function handleCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const csv = await readTextFile(file)
    const importedApplications = csvToApplications(csv)

    setCustomApplicationByFileName((current) => ({
      ...current,
      ...importedApplications,
    }))
    setCustomItems((current) =>
      current.map((item) => ({
        ...item,
        application:
          importedApplications[normalizeFileKey(item.name)] ||
          item.application,
        applicationSource: importedApplications[normalizeFileKey(item.name)]
          ? 'csv'
          : item.applicationSource,
      })),
    )
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    if (event.dataTransfer.files.length) void addCustomFiles(event.dataTransfer.files)
  }

  function loadSamples() {
    setApplication(DEFAULT_APPLICATION)
    setCustomItems((current) => [
      ...current,
      ...SAMPLE_LABELS.map((sample) => ({
        id: createId(),
        name: sample.name,
        status: 'queued' as const,
        progress: 0,
        progressText: 'Queued',
        rawText: sample.rawText,
        application: DEFAULT_APPLICATION,
        applicationSource: 'manual' as const,
        previewUrl: sample.imagePath,
      })),
    ])
  }

  function addPastedText() {
    const text = pastedText.trim()
    if (!text) return

    setCustomItems((current) => [
      ...current,
      {
        id: createId(),
        name: `pasted-label-${current.length + 1}.txt`,
        status: 'queued',
        progress: 0,
        progressText: 'Queued',
        rawText: text,
        application,
        applicationSource: 'manual',
      },
    ])
    setPastedText('')
  }

  async function processItem(item: LabelItem, options: ProcessItemOptions = {}) {
    const update = options.updateItem || updateItem
    const processing = options.processingIds || processingIds
    const fallbackApplication = options.fallbackApplication || application

    if (processing.current.has(item.id)) return

    processing.current.add(item.id)
    const startedAt = performance.now()
    update(item.id, {
      status: 'processing',
      progress: 0.05,
      progressText: item.rawText ? 'Reading text' : 'Starting AI extraction',
      error: undefined,
    })

    try {
      let extracted: ExtractedFields | undefined = item.rawText
        ? { ...extractFields(item.rawText, 100), source: 'text' as const }
        : undefined

      if (!extracted) {
        if (!item.file) {
          throw new Error('No label image is available for extraction.')
        }

        const extractionFile = item.file
        extracted = await extractWithOpenAI(extractionFile, (progress) => {
          update(item.id, {
            progress: Math.max(progress.progress, 0.05),
            progressText: progress.status,
          })
        })
      }

      const shouldDraftApplication =
        options.draftFromExtraction &&
        !item.application &&
        !hasApplicationData(fallbackApplication)
      const comparisonApplication = shouldDraftApplication
        ? applicationFromExtraction(extracted, fallbackApplication)
        : item.application || fallbackApplication
      const applicationSource: ApplicationSource =
        item.applicationSource || (shouldDraftApplication ? 'extracted' : 'manual')

      if (shouldDraftApplication) {
        options.onDraftApplication?.(comparisonApplication)
      }

      const result = verifyLabel(
        extracted,
        comparisonApplication,
        performance.now() - startedAt,
      )

      update(item.id, {
        status: 'complete',
        progress: 1,
        progressText: 'Analysis complete',
        application: comparisonApplication,
        applicationSource,
        result,
      })
    } catch (error) {
      update(item.id, {
        status: 'error',
        progress: 0,
        progressText: 'Extraction failed',
        canRetry: true,
        error:
          error instanceof Error
            ? error.message
            : 'AI extraction failed. Check the API configuration or retry.',
      })
    } finally {
      processing.current.delete(item.id)
    }
  }

  function retryActiveAnalysis() {
    if (!activeItem || activeItem.status === 'processing') return
    retryItem(activeItem.id)
  }

  async function verifyCustomQueuedLabels() {
    const queue = customItems.filter((item) => item.status === 'queued')
    if (!queue.length) return

    const workerCount = Math.min(BATCH_CONCURRENCY, queue.length)
    const workers = Array.from({ length: workerCount }, async (_, workerIndex) => {
      for (let index = workerIndex; index < queue.length; index += workerCount) {
        await processItem(queue[index], {
          updateItem: updateCustomItem,
          processingIds: customProcessingIds,
          fallbackApplication: application,
          draftFromExtraction: true,
          onDraftApplication: setApplication,
        })
      }
    })

    await Promise.all(workers)
  }

  function recheckCustomCompletedLabels() {
    setCustomItems((current) =>
      current.map((item) => {
        if (!item.result) return item

        return {
          ...item,
          result: verifyLabel(
            item.result.extracted,
            item.application || application,
            item.result.durationMs,
          ),
        }
      }),
    )
  }

  function clearCustomQueue() {
    customItems.forEach((item) => {
      if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
    })
    setCustomItems([])
    setCustomApplicationByFileName({})
    setCustomResultFilter('all')
    customProcessingIds.current.clear()
  }

  function downloadCustomCsv() {
    downloadItemsCsv(customItems, 'custom-label-verification-results.csv')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="identity">
          <div className="identity-mark" aria-hidden="true">
            <ShieldCheck size={28} />
          </div>
          <div>
            <p className="eyebrow">TTB prototype</p>
            <h1>Label verification</h1>
          </div>
        </div>
        <div className="topbar-status" aria-label="System status">
          <span>AI extraction</span>
          <span>No document storage</span>
          <span>Batch queue</span>
        </div>
      </header>

      <section className="summary-grid" aria-label="Review summary">
        <Metric label="Total" value={stats.total} />
        <Metric label="Done" value={`${stats.completed}/${stats.total}`} />
        <Metric label="Queued" value={stats.queued} />
        <Metric label="Ready" value={stats.ready} tone="ready" />
        <Metric label="Review" value={stats.review} tone="review" />
        <Metric label="Missing" value={stats.missing} tone="missing" />
        <Metric label="Accepted" value={stats.accepted} tone="ready" />
        <Metric label="Rejected" value={stats.rejected} tone="missing" />
      </section>

      <section className="panel reviewer-station" aria-label="Current submission review">
        {activeItem ? (
          <>
            <div className="reviewer-header">
              <div>
                <p className="eyebrow">Current submission</p>
                <h2>
                  Form {activeItemNumber} of {items.length}: {activeItem.name}
                </h2>
              </div>
              <div className="reviewer-actions">
                {activeItem.status === 'error' && activeItem.canRetry !== false ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={retryActiveAnalysis}
                  >
                    <RefreshCw size={18} />
                    Retry analysis
                  </button>
                ) : null}
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => recordHumanDecision('accepted')}
                  disabled={!canDecideActive}
                  title="Accept and advance (A or Right Arrow)"
                >
                  <CheckCircle2 size={18} />
                  Accept
                </button>
                <button
                  type="button"
                  className="secondary-button danger"
                  onClick={() => recordHumanDecision('rejected')}
                  disabled={!canDecideActive}
                  title="Reject and advance (R or Left Arrow)"
                >
                  <XCircle size={18} />
                  Reject
                </button>
              </div>
            </div>

            <div className="reviewer-body">
              <div className="submission-image-frame">
                {activeItem.previewUrl ? (
                  <img src={activeItem.previewUrl} alt="" />
                ) : (
                  <div className="text-preview" aria-hidden="true">
                    <FileText size={28} />
                  </div>
                )}
              </div>

              <div className="submission-details">
                <ApplicationSnapshot application={activeApplication} />

                <div className="classifier-summary">
                  <StatusPill item={activeItem} />
                  <span>
                    AI recommendation:{' '}
                    {activeItem.result ? statusCopy[activeItem.result.status] : 'Pending'}
                  </span>
                  <span>{applicationSourceLabel(activeItem.applicationSource)}</span>
                  {activeItem.result ? (
                    <span>Score {(activeItem.result.score * 100).toFixed(0)}%</span>
                  ) : (
                    <span>{activeItem.progressText}</span>
                  )}
                  {activeItem.humanDecision ? (
                    <span>Agent decision: {humanDecisionCopy[activeItem.humanDecision]}</span>
                  ) : (
                    <span>Agent decision: pending</span>
                  )}
                </div>

                {activeItem.error ? <p className="error-text">{activeItem.error}</p> : null}

                {activeItem.result ? (
                  <div className="checks-table reviewer-checks">
                    {activeItem.result.checks.map((check) => (
                      <CheckRow check={check} key={check.id} />
                    ))}
                  </div>
                ) : (
                  <div className="reviewer-prompt">
                    {activeItem.status === 'processing' ? (
                      <Loader2 className="spin" size={24} aria-hidden="true" />
                    ) : activeItem.status === 'error' ? (
                      <XCircle size={24} aria-hidden="true" />
                    ) : (
                      <FileText size={24} aria-hidden="true" />
                    )}
                    <p>
                      {activeItem.status === 'processing'
                        ? 'Analyzing this label while you review the form and image.'
                        : activeItem.status === 'error'
                          ? 'Extraction failed. Retry analysis or review the submission manually.'
                          : 'Queued for automatic pre-analysis.'}
                    </p>
                    {activeItem.status === 'processing' ? (
                      <div className="progress-track reviewer-progress" aria-label="Analysis progress">
                        <div style={{ width: `${Math.round(activeItem.progress * 100)}%` }} />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <FileText size={28} aria-hidden="true" />
            <p>No submissions loaded</p>
          </div>
        )}
      </section>

      <section className="workspace-grid">
        <form className="panel application-panel">
          <div className="panel-heading">
            <ClipboardCheck size={22} aria-hidden="true" />
            <h2>Application record</h2>
          </div>

          <label className="field">
            <span>Beverage type</span>
            <select
              value={application.beverageType}
              onChange={(event) =>
                updateApplication('beverageType', event.target.value as BeverageType)
              }
            >
              {BEVERAGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <FieldInput
            label="Brand name"
            value={application.brandName}
            onChange={(value) => updateApplication('brandName', value)}
          />
          <FieldInput
            label="Class/type"
            value={application.classType}
            onChange={(value) => updateApplication('classType', value)}
          />
          <FieldInput
            label="Alcohol content"
            value={application.alcoholContent}
            onChange={(value) => updateApplication('alcoholContent', value)}
          />
          <FieldInput
            label="Net contents"
            value={application.netContents}
            onChange={(value) => updateApplication('netContents', value)}
          />
          <FieldInput
            label="Bottler/producer"
            value={application.bottlerName}
            onChange={(value) => updateApplication('bottlerName', value)}
          />
          <FieldInput
            label="Address"
            value={application.bottlerAddress}
            onChange={(value) => updateApplication('bottlerAddress', value)}
          />
          <FieldInput
            label="Country of origin"
            value={application.countryOfOrigin}
            onChange={(value) => updateApplication('countryOfOrigin', value)}
          />

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={loadProvidedSubmissions}>
              <ClipboardCheck size={18} />
              Provided forms
            </button>
            <button type="button" className="secondary-button" onClick={loadSamples}>
              <FileText size={18} />
              Samples
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setApplication(EMPTY_APPLICATION)}
            >
              <RefreshCw size={18} />
              Reset
            </button>
          </div>
        </form>

        <section className="panel review-panel">
          <div className="panel-heading split-heading">
            <div>
              <div className="heading-line">
                <Upload size={22} aria-hidden="true" />
                <h2>Custom upload</h2>
              </div>
            </div>
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                onClick={verifyCustomQueuedLabels}
                disabled={customStats.queued === 0}
              >
                {customStats.processing > 0 ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <Play size={18} />
                )}
                Verify
              </button>
              <button
                type="button"
                className="secondary-button icon-only"
                onClick={recheckCustomCompletedLabels}
                disabled={customStats.reviewed === 0}
                title="Recheck completed labels"
              >
                <RefreshCw size={18} />
              </button>
              <button
                type="button"
                className="secondary-button icon-only"
                onClick={downloadCustomCsv}
                disabled={customStats.reviewed === 0}
                title="Download CSV"
              >
                <Download size={18} />
              </button>
              <button
                type="button"
                className="secondary-button icon-only danger"
                onClick={clearCustomQueue}
                disabled={customItems.length === 0}
                title="Clear batch"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          <div className="upload-grid">
            <label
              className="dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload size={24} aria-hidden="true" />
              <strong>Upload labels</strong>
              <span>PNG, JPG, WEBP, CSV, PDF, or HEIC</span>
              <input
                type="file"
                multiple
                accept={UPLOAD_ACCEPT}
                onChange={handleFileChange}
              />
            </label>

            <div className="text-entry">
              <label htmlFor="label-text">Manual label text</label>
              <textarea
                id="label-text"
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                placeholder="Paste label text"
              />
              <button type="button" className="secondary-button" onClick={addPastedText}>
                <FileText size={18} />
                Add text
              </button>
            </div>
          </div>

          <div className="batch-tools">
            <label className="secondary-button csv-import">
              <FileText size={18} />
              Import CSV
              <input type="file" accept=".csv,text/csv" onChange={handleCsvChange} />
            </label>
            <span>{Object.keys(customApplicationByFileName).length} application records</span>
          </div>

          <div className="filter-row" aria-label="Result filters">
            {(['all', 'ready', 'review', 'missing'] as ResultFilter[]).map((filter) => (
              <button
                type="button"
                key={filter}
                className={`filter-button ${
                  customResultFilter === filter ? 'filter-button--active' : ''
                }`}
                onClick={() => setCustomResultFilter(filter)}
              >
                {filter === 'all' ? 'All' : statusCopy[filter]}
              </button>
            ))}
            <span>
              Showing {filteredCustomItems.length} of {customItems.length}
            </span>
          </div>

          <div className="result-list" aria-live="polite">
            {filteredCustomItems.length === 0 ? (
              <div className="empty-state">
                <FileText size={28} aria-hidden="true" />
                <p>{customItems.length === 0 ? 'No custom labels queued' : 'No matching labels'}</p>
              </div>
            ) : (
              filteredCustomItems.map((item) => (
                <ResultItem key={item.id} item={item} onRetry={retryCustomItem} />
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: ReviewStatus
}) {
  return (
    <div className={`metric ${tone ? `metric--${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FieldInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function ApplicationSnapshot({ application }: { application: ApplicationFields }) {
  const fields = [
    ['Beverage type', application.beverageType],
    ['Brand name', application.brandName],
    ['Class/type', application.classType],
    ['Alcohol content', application.alcoholContent],
    ['Net contents', application.netContents],
    ['Bottler/producer', application.bottlerName],
    ['Address', application.bottlerAddress],
    ['Country of origin', application.countryOfOrigin],
  ]

  return (
    <div className="application-snapshot">
      {fields.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  )
}

function CheckRow({ check }: { check: VerificationCheck }) {
  return (
    <div className={`check-row check-row--${check.status}`}>
      <div className="check-status" aria-hidden="true">
        {check.status === 'pass' ? (
          <CheckCircle2 size={18} />
        ) : check.status === 'warn' ? (
          <AlertTriangle size={18} />
        ) : (
          <XCircle size={18} />
        )}
      </div>
      <div>
        <strong>{check.label}</strong>
        <p>{check.message}</p>
      </div>
      <div className="check-values">
        <span>Expected: {check.expected}</span>
        <span>Found: {check.found}</span>
      </div>
    </div>
  )
}

function ResultItem({
  item,
  onRetry,
}: {
  item: LabelItem
  onRetry: (id: string) => void
}) {
  const overallStatus = item.result?.status

  return (
    <article className={`result-item ${overallStatus ? `result-item--${overallStatus}` : ''}`}>
      <div className="result-summary">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt="" className="label-preview" />
        ) : (
          <div className="text-preview" aria-hidden="true">
            <FileText size={24} />
          </div>
        )}

        <div className="result-title">
          <strong>{item.name}</strong>
          <span>{item.progressText}</span>
          {item.status === 'processing' ? (
            <div className="progress-track" aria-label="Extraction progress">
              <div style={{ width: `${Math.round(item.progress * 100)}%` }} />
            </div>
          ) : null}
          {item.error ? <p className="error-text">{item.error}</p> : null}
        </div>

        <div className="result-actions">
          <StatusPill item={item} />
          {item.status === 'error' && item.canRetry !== false ? (
            <button
              type="button"
              className="secondary-button retry-button"
              onClick={() => onRetry(item.id)}
            >
              <RefreshCw size={16} />
              Retry
            </button>
          ) : null}
        </div>
      </div>

      {item.result ? (
        <>
          <div className="result-meta">
            <span>AI recommendation {statusCopy[item.result.status]}</span>
            <span>Score {(item.result.score * 100).toFixed(0)}%</span>
            <span>
              {extractionSourceLabel(item.result.extracted.source)}{' '}
              {item.result.extracted.confidence.toFixed(0)}%
            </span>
            <span>{applicationSourceLabel(item.applicationSource)}</span>
            {item.humanDecision ? (
              <span>Agent decision {humanDecisionCopy[item.humanDecision]}</span>
            ) : null}
            <span>{formatDuration(item.result.durationMs)}</span>
          </div>

          <div className="checks-table">
            {item.result.checks.map((check) => (
              <CheckRow check={check} key={check.id} />
            ))}
          </div>

          <details className="raw-text">
            <summary>Extracted label text</summary>
            <pre>{item.result.extracted.rawText}</pre>
          </details>
        </>
      ) : null}
    </article>
  )
}

function StatusPill({ item }: { item: LabelItem }) {
  if (item.status === 'processing') {
    return (
      <span className="status-pill status-pill--processing">
        <Loader2 className="spin" size={16} />
        Processing
      </span>
    )
  }

  if (item.status === 'error') {
    return (
      <span className="status-pill status-pill--missing">
        <XCircle size={16} />
        Error
      </span>
    )
  }

  if (!item.result) {
    return <span className="status-pill">Queued</span>
  }

  const icon =
    item.result.status === 'ready' ? (
      <CheckCircle2 size={16} />
    ) : item.result.status === 'review' ? (
      <AlertTriangle size={16} />
    ) : (
      <XCircle size={16} />
    )

  return (
    <span className={`status-pill status-pill--${item.result.status}`}>
      {icon}
      {statusCopy[item.result.status]}
    </span>
  )
}

export default App
