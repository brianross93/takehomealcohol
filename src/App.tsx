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
import { recognizeLabelFile, shutdownOcrWorker } from './lib/ocr'
import {
  DEFAULT_APPLICATION,
  extractFields,
  verifyLabel,
  type ApplicationFields,
  type BeverageType,
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
  file?: File
  rawText?: string
  previewUrl?: string
  result?: ReviewResult
  error?: string
}

const BEVERAGE_TYPES: BeverageType[] = ['Distilled Spirits', 'Wine', 'Malt Beverage']

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

function csvEscape(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function makeFileItem(file: File): LabelItem {
  return {
    id: createId(),
    name: file.name,
    status: 'queued',
    progress: 0,
    progressText: 'Queued',
    file,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  }
}

function App() {
  const [application, setApplication] = useState<ApplicationFields>(DEFAULT_APPLICATION)
  const [items, setItems] = useState<LabelItem[]>([])
  const [pastedText, setPastedText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    return () => {
      void shutdownOcrWorker()
    }
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
      completed: completed.length,
      ready,
      review,
      reject,
      averageMs,
    }
  }, [items])

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

  function addFiles(fileList: FileList | File[]) {
    const nextItems = Array.from(fileList).map(makeFileItem)
    setItems((current) => [...current, ...nextItems])
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) addFiles(event.target.files)
    event.target.value = ''
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
      },
    ])
    setPastedText('')
  }

  async function verifyQueuedLabels() {
    const queue = items.filter((item) => item.status === 'queued')
    if (!queue.length || isProcessing) return

    setIsProcessing(true)

    for (const item of queue) {
      const startedAt = performance.now()
      updateItem(item.id, {
        status: 'processing',
        progress: 0.05,
        progressText: item.rawText ? 'Reading text' : 'Starting OCR',
        error: undefined,
      })

      try {
        let extracted = item.rawText ? extractFields(item.rawText, 100) : undefined

        if (!extracted) {
          try {
            extracted = await extractWithOpenAI(item.file as File, (progress) => {
              updateItem(item.id, {
                progress: Math.max(progress.progress, 0.05),
                progressText: progress.status,
              })
            })
          } catch {
            updateItem(item.id, {
              progress: 0.1,
              progressText: 'Using local OCR fallback',
            })

            const ocrOutput = await recognizeLabelFile(item.file as File, (progress) => {
              updateItem(item.id, {
                progress: Math.max(progress.progress, 0.12),
                progressText: progress.status,
              })
            })

            extracted = extractFields(ocrOutput.text, ocrOutput.confidence)
          }
        }

        const result = verifyLabel(extracted, application, performance.now() - startedAt)

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
          progressText: 'Error',
          error: error instanceof Error ? error.message : 'Unable to process this label.',
        })
      }
    }

    setIsProcessing(false)
  }

  function recheckCompletedLabels() {
    setItems((current) =>
      current.map((item) => {
        if (!item.result) return item

        const extracted = extractFields(
          item.result.extracted.rawText,
          item.result.extracted.confidence,
        )

        return {
          ...item,
          result: verifyLabel(extracted, application, item.result.durationMs),
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
          <span>OCR fallback</span>
          <span>No document storage</span>
          <span>Batch queue</span>
        </div>
      </header>

      <section className="summary-grid" aria-label="Review summary">
        <Metric label="Labels" value={stats.total} />
        <Metric label="Queued" value={stats.queued} />
        <Metric label="Ready" value={stats.ready} tone="ready" />
        <Metric label="Review" value={stats.review} tone="review" />
        <Metric label="Reject" value={stats.reject} tone="reject" />
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
              <span>PNG, JPG, SVG, or TXT</span>
              <input
                type="file"
                multiple
                accept="image/*,.txt,text/plain"
                onChange={handleFileChange}
              />
            </label>

            <div className="text-entry">
              <label htmlFor="ocr-text">OCR text</label>
              <textarea
                id="ocr-text"
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

          <div className="result-list" aria-live="polite">
            {items.length === 0 ? (
              <div className="empty-state">
                <FileText size={28} aria-hidden="true" />
                <p>No labels queued</p>
              </div>
            ) : (
              items.map((item) => <ResultItem key={item.id} item={item} />)
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

function ResultItem({ item }: { item: LabelItem }) {
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
            <div className="progress-track" aria-label="OCR progress">
              <div style={{ width: `${Math.round(item.progress * 100)}%` }} />
            </div>
          ) : null}
          {item.error ? <p className="error-text">{item.error}</p> : null}
        </div>

        <StatusPill item={item} />
      </div>

      {item.result ? (
        <>
          <div className="result-meta">
            <span>Score {(item.result.score * 100).toFixed(0)}%</span>
            <span>OCR {item.result.extracted.confidence.toFixed(0)}%</span>
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
            <summary>OCR text</summary>
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
