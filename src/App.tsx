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
import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
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
  type ReviewResult,
  type ReviewStatus,
} from './lib/verification'

type QueueStatus = 'queued' | 'processing' | 'complete' | 'error'

type LabelItem = {
  id: string
  name: string
  status: QueueStatus
  progress: number
  progressText: string
  application?: ApplicationFields
  applicationSource?: 'manual' | 'csv'
  file?: File
  rawText?: string
  previewUrl?: string
  result?: ReviewResult
  error?: string
}

const BEVERAGE_TYPES: BeverageType[] = ['Distilled Spirits', 'Wine', 'Malt Beverage']
const BATCH_CONCURRENCY = 5

type ResultFilter = 'all' | ReviewStatus

const statusCopy: Record<ReviewStatus, string> = {
  ready: 'Ready',
  review: 'Review',
  reject: 'Reject',
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

function csvEscape(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function normalizeFileKey(fileName: string) {
  return fileName.trim().toLowerCase()
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
): LabelItem {
  return {
    id: createId(),
    name: file.name,
    status: 'queued',
    progress: 0,
    progressText: 'Queued',
    application: applicationByFileName[normalizeFileKey(file.name)],
    applicationSource: applicationByFileName[normalizeFileKey(file.name)] ? 'csv' : undefined,
    file,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
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

function readTextFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read CSV file'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(file)
  })
}

function App() {
  const [application, setApplication] = useState<ApplicationFields>(DEFAULT_APPLICATION)
  const [items, setItems] = useState<LabelItem[]>([])
  const [pastedText, setPastedText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [applicationByFileName, setApplicationByFileName] = useState<
    Record<string, ApplicationFields>
  >({})
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')

  useEffect(() => {
    void fetch('/api/extract-label', { method: 'HEAD' }).catch(() => undefined)
  }, [])

  const stats = useMemo(() => {
    const completed = items.filter((item) => item.result)
    const ready = completed.filter((item) => item.result?.status === 'ready').length
    const review = completed.filter((item) => item.result?.status === 'review').length
    const reject = completed.filter((item) => item.result?.status === 'reject').length
    const averageMs =
      completed.reduce((sum, item) => sum + (item.result?.durationMs || 0), 0) /
      Math.max(completed.length, 1)

    return {
      total: items.length,
      queued: items.filter((item) => item.status === 'queued').length,
      processing: items.filter((item) => item.status === 'processing').length,
      completed: completed.length,
      ready,
      review,
      reject,
      averageMs,
      etaMs: averageMs * (items.length - completed.length),
    }
  }, [items])

  const filteredItems = useMemo(() => {
    if (resultFilter === 'all') return items
    return items.filter((item) => item.result?.status === resultFilter)
  }, [items, resultFilter])

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

  function retryItem(id: string) {
    updateItem(id, {
      status: 'queued',
      progress: 0,
      progressText: 'Queued',
      error: undefined,
      result: undefined,
    })
  }

  function addFiles(fileList: FileList | File[]) {
    const nextItems = Array.from(fileList).map((file) =>
      makeFileItem(file, applicationByFileName),
    )
    setItems((current) => [...current, ...nextItems])
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) addFiles(event.target.files)
    event.target.value = ''
  }

  async function handleCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const csv = await readTextFile(file)
    const importedApplications = csvToApplications(csv)

    setApplicationByFileName((current) => ({
      ...current,
      ...importedApplications,
    }))
    setItems((current) =>
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
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files)
  }

  function loadSamples() {
    setApplication(DEFAULT_APPLICATION)
    setItems((current) => [
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

    setItems((current) => [
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

  async function verifyQueuedLabels() {
    const queue = items.filter((item) => item.status === 'queued')
    if (!queue.length || isProcessing) return

    setIsProcessing(true)

    async function processItem(item: LabelItem) {
      const startedAt = performance.now()
      updateItem(item.id, {
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
          extracted = await extractWithOpenAI(item.file as File, (progress) => {
            updateItem(item.id, {
              progress: Math.max(progress.progress, 0.05),
              progressText: progress.status,
            })
          })
        }

        const result = verifyLabel(
          extracted,
          item.application || application,
          performance.now() - startedAt,
        )

        updateItem(item.id, {
          status: 'complete',
          progress: 1,
          progressText: 'Complete',
          result,
        })
      } catch (error) {
        updateItem(item.id, {
          status: 'error',
          progress: 0,
          progressText: 'Extraction failed',
          error:
            error instanceof Error
              ? error.message
              : 'AI extraction failed. Check the API configuration or retry.',
        })
      }
    }

    const workerCount = Math.min(BATCH_CONCURRENCY, queue.length)
    const workers = Array.from({ length: workerCount }, async (_, workerIndex) => {
      for (let index = workerIndex; index < queue.length; index += workerCount) {
        await processItem(queue[index])
      }
    })

    await Promise.all(workers)
    setIsProcessing(false)
  }

  function recheckCompletedLabels() {
    setItems((current) =>
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

  function clearQueue() {
    items.forEach((item) => {
      if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
    })
    setItems([])
  }

  function downloadCsv() {
    const rows: Array<Array<string | number>> = [
      [
        'label',
        'overall_status',
        'overall_score',
        'duration_ms',
        'application_source',
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
          item.applicationSource || 'manual',
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
    anchor.download = 'label-verification-results.csv'
    anchor.click()
    URL.revokeObjectURL(url)
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
        <Metric label="Reject" value={stats.reject} tone="reject" />
        <Metric label="ETA" value={formatDuration(stats.etaMs)} />
        <Metric label="Avg time" value={formatDuration(stats.averageMs)} />
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
            <button type="button" className="secondary-button" onClick={loadSamples}>
              <FileText size={18} />
              Samples
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setApplication(DEFAULT_APPLICATION)}
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
                <h2>Label batch</h2>
              </div>
            </div>
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                onClick={verifyQueuedLabels}
                disabled={stats.queued === 0 || isProcessing}
              >
                {isProcessing ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
                Verify
              </button>
              <button
                type="button"
                className="secondary-button icon-only"
                onClick={recheckCompletedLabels}
                disabled={stats.completed === 0 || isProcessing}
                title="Recheck completed labels"
              >
                <RefreshCw size={18} />
              </button>
              <button
                type="button"
                className="secondary-button icon-only"
                onClick={downloadCsv}
                disabled={stats.completed === 0}
                title="Download CSV"
              >
                <Download size={18} />
              </button>
              <button
                type="button"
                className="secondary-button icon-only danger"
                onClick={clearQueue}
                disabled={items.length === 0 || isProcessing}
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
              <span>PNG, JPG, or WEBP</span>
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
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
            <span>{Object.keys(applicationByFileName).length} application records</span>
          </div>

          <div className="filter-row" aria-label="Result filters">
            {(['all', 'ready', 'review', 'reject'] as ResultFilter[]).map((filter) => (
              <button
                type="button"
                key={filter}
                className={`filter-button ${
                  resultFilter === filter ? 'filter-button--active' : ''
                }`}
                onClick={() => setResultFilter(filter)}
              >
                {filter === 'all' ? 'All' : statusCopy[filter]}
              </button>
            ))}
            <span>
              Showing {filteredItems.length} of {items.length}
            </span>
          </div>

          <div className="result-list" aria-live="polite">
            {filteredItems.length === 0 ? (
              <div className="empty-state">
                <FileText size={28} aria-hidden="true" />
                <p>{items.length === 0 ? 'No labels queued' : 'No matching labels'}</p>
              </div>
            ) : (
              filteredItems.map((item) => (
                <ResultItem key={item.id} item={item} onRetry={retryItem} />
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
          {item.status === 'error' ? (
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
            <span>Score {(item.result.score * 100).toFixed(0)}%</span>
            <span>
              {extractionSourceLabel(item.result.extracted.source)}{' '}
              {item.result.extracted.confidence.toFixed(0)}%
            </span>
            <span>{item.applicationSource === 'csv' ? 'CSV record' : 'Manual record'}</span>
            <span>{formatDuration(item.result.durationMs)}</span>
          </div>

          <div className="checks-table">
            {item.result.checks.map((check) => (
              <div className={`check-row check-row--${check.status}`} key={check.id}>
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
      <span className="status-pill status-pill--reject">
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
