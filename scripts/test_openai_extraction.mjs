import fs from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'

const root = path.resolve(import.meta.dirname, '..')
const manifestPath = path.join(root, 'public', 'test-labels', 'generated', 'manifest.json')
const outPath = path.join(root, 'tmp', 'openai-extraction-results.json')
const localEnvPath = path.join(root, '.env.local')

const extractionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rawText: { type: 'string' },
    brandName: { type: ['string', 'null'] },
    classType: { type: ['string', 'null'] },
    alcoholContent: { type: ['string', 'null'] },
    netContents: { type: ['string', 'null'] },
    bottler: { type: ['string', 'null'] },
    countryOfOrigin: { type: ['string', 'null'] },
    warningText: { type: ['string', 'null'] },
    warningPrefixBold: { type: ['boolean', 'null'] },
    warningLegible: { type: ['boolean', 'null'] },
    warningRelativeSize: { type: 'string', enum: ['acceptable', 'small', 'unknown'] },
    warningFormatNotes: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'rawText',
    'brandName',
    'classType',
    'alcoholContent',
    'netContents',
    'bottler',
    'countryOfOrigin',
    'warningText',
    'warningPrefixBold',
    'warningLegible',
    'warningRelativeSize',
    'warningFormatNotes',
    'confidence',
    'notes',
  ],
}

function parseArgs() {
  const args = new Map()
  for (const arg of process.argv.slice(2)) {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
    args.set(key, value)
  }
  return args
}

function mimeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  return 'image/png'
}

async function fileToDataUrl(filePath) {
  const bytes = await fs.readFile(filePath)
  return `data:${mimeFor(filePath)};base64,${bytes.toString('base64')}`
}

async function loadLocalEnv() {
  try {
    const contents = await fs.readFile(localEnvPath, 'utf8')
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const separator = trimmed.indexOf('=')
      if (separator === -1) continue

      const key = trimmed.slice(0, separator).trim()
      const rawValue = trimmed.slice(separator + 1).trim()
      const value = rawValue.replace(/^["']|["']$/g, '')

      if (key && process.env[key] == null) {
        process.env[key] = value
      }
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error
  }
}

async function main() {
  await loadLocalEnv()

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required for this smoke test.')
    process.exitCode = 1
    return
  }

  const args = parseArgs()
  const model = process.env.OPENAI_EXTRACTION_MODEL || 'gpt-5.5'
  const limit = Number(args.get('limit') || 0)
  const requestedFile = args.get('file')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const cases = requestedFile
    ? [{ id: path.basename(requestedFile), file: requestedFile, expectedStatus: 'unknown' }]
    : manifest
  const selectedCases = limit > 0 ? cases.slice(0, limit) : cases
  const results = []

  for (const testCase of selectedCases) {
    const filePath = testCase.file.startsWith('/')
      ? path.join(root, 'public', testCase.file)
      : path.resolve(root, testCase.file)

    console.log(`Extracting ${testCase.id} with ${model}`)
    const result = await openai.responses.create({
      model,
      reasoning: { effort: 'low' },
      text: {
        format: {
          type: 'json_schema',
          name: 'alcohol_label_extraction',
          strict: true,
          schema: extractionSchema,
        },
      },
      input: [
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text:
                'Extract visible alcohol label fields. Preserve exact casing for the government warning. Also inspect whether the GOVERNMENT WARNING: prefix appears bold and whether the warning is legible or unusually small. Return null for unreadable or absent fields.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: `Extract fields from ${testCase.id}.` },
            { type: 'input_image', image_url: await fileToDataUrl(filePath), detail: 'high' },
          ],
        },
      ],
    })

    results.push({
      id: testCase.id,
      expectedStatus: testCase.expectedStatus,
      extraction: JSON.parse(result.output_text),
    })
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, JSON.stringify(results, null, 2))
  console.log(`Wrote ${results.length} extraction result(s) to ${path.relative(root, outPath)}`)
}

await main()
