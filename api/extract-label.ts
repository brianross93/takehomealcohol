import OpenAI from 'openai'
import type { IncomingMessage, ServerResponse } from 'node:http'

type JsonRequest = IncomingMessage & {
  body?: unknown
}

type LabelExtractionPayload = {
  imageDataUrl?: string
  fileName?: string
}

type ModelExtraction = {
  rawText: string
  brandName: string | null
  classType: string | null
  alcoholContent: string | null
  netContents: string | null
  bottler: string | null
  countryOfOrigin: string | null
  warningText: string | null
  confidence: number
  notes: string[]
}

const extractionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rawText: {
      type: 'string',
      description:
        'Best-effort transcription of all visible label text, preserving original casing and punctuation where readable.',
    },
    brandName: { type: ['string', 'null'] },
    classType: { type: ['string', 'null'] },
    alcoholContent: { type: ['string', 'null'] },
    netContents: { type: ['string', 'null'] },
    bottler: { type: ['string', 'null'] },
    countryOfOrigin: { type: ['string', 'null'] },
    warningText: {
      type: ['string', 'null'],
      description:
        'The government warning exactly as printed, including prefix casing. Null if not readable or absent.',
    },
    confidence: {
      type: 'number',
      description: 'Overall extraction confidence from 0 to 1.',
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short extraction caveats such as glare, blur, rotation, or partially obscured text.',
    },
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
    'confidence',
    'notes',
  ],
} as const

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

async function readJsonBody(request: JsonRequest): Promise<LabelExtractionPayload> {
  if (request.body && typeof request.body === 'object') {
    return request.body as LabelExtractionPayload
  }

  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const bodyText = Buffer.concat(chunks).toString('utf8')
  return bodyText ? (JSON.parse(bodyText) as LabelExtractionPayload) : {}
}

export default async function handler(request: JsonRequest, response: ServerResponse) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' })
    return
  }

  if (!process.env.OPENAI_API_KEY) {
    sendJson(response, 503, { error: 'OPENAI_API_KEY is not configured' })
    return
  }

  try {
    const payload = await readJsonBody(request)
    const imageDataUrl = payload.imageDataUrl || ''

    if (!imageDataUrl.startsWith('data:image/')) {
      sendJson(response, 400, { error: 'imageDataUrl must be an image data URL' })
      return
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model = process.env.OPENAI_EXTRACTION_MODEL || 'gpt-5.5'

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
              text: [
                'Extract text and alcohol label fields from the provided label image.',
                'Do not compare against an application record and do not infer missing values.',
                'Preserve exact casing for warning text, especially GOVERNMENT WARNING.',
                'Return null for unreadable or absent fields.',
              ].join(' '),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Read this alcohol label image${
                payload.fileName ? ` named ${payload.fileName}` : ''
              } and return only the structured extraction.`,
            },
            {
              type: 'input_image',
              image_url: imageDataUrl,
              detail: 'high',
            },
          ],
        },
      ],
    })

    const parsed = JSON.parse(result.output_text) as ModelExtraction
    sendJson(response, 200, parsed)
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Label extraction failed',
    })
  }
}
