import 'dotenv/config'
import { z } from 'zod'

/** The single demo tenant. Every document carries this in `brand`. */
export const DEMO_BRAND = 'Northstar Demo Brand'

/**
 * Parse a comma-separated allow-list of browser origins.
 * Wildcards are deliberately rejected: production CORS must be explicit.
 */
function parseCorsOrigins(value, ctx) {
  const rawOrigins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (!rawOrigins.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'FRONTEND_URL must contain at least one explicit http(s) origin.',
    })
    return z.NEVER
  }

  const origins = []
  for (const rawOrigin of rawOrigins) {
    if (rawOrigin.includes('*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'FRONTEND_URL cannot contain wildcard origins.',
      })
      return z.NEVER
    }

    let url
    try {
      url = new URL(rawOrigin)
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `FRONTEND_URL contains an invalid origin: ${rawOrigin}`,
      })
      return z.NEVER
    }

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `FRONTEND_URL must contain an http(s) origin: ${rawOrigin}`,
      })
      return z.NEVER
    }

    // A browser Origin never contains a path, query or fragment. Rejecting
    // them avoids silently allowing a different origin than the operator wrote.
    const withoutTrailingSlash = rawOrigin.replace(/\/+$/, '')
    if (url.origin !== withoutTrailingSlash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `FRONTEND_URL entries must be origins without a path: ${rawOrigin}`,
      })
      return z.NEVER
    }

    if (!origins.includes(url.origin)) origins.push(url.origin)
  }

  return origins
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z
    .string({ required_error: 'MONGODB_URI is required (MongoDB Atlas connection string).' })
    .trim()
    .min(1, 'MONGODB_URI is required (MongoDB Atlas connection string).'),
  FRONTEND_URL: z
    .string({ required_error: 'FRONTEND_URL is required (explicit CORS origin for the frontend).' })
    .trim()
    .min(1, 'FRONTEND_URL is required (explicit CORS origin for the frontend).')
    .transform(parseCorsOrigins),
  DEMO_MODE: z
    .enum(['true', 'false'], { message: 'DEMO_MODE must be exactly "true" or "false".' })
    .default('false')
    .transform((value) => value === 'true'),
  // Enabled by default for a new deployment. It invokes only the idempotent
  // runSeed() function, which inserts data only when demo facts are absent.
  SEED_ON_START: z
    .enum(['true', 'false'], { message: 'SEED_ON_START must be exactly "true" or "false".' })
    .default('true')
    .transform((value) => value === 'true'),
  NODE_ENV: z.string().trim().default('development'),
  // Provider-neutral OpenAI-compatible extraction configuration.
  LLM_BASE_URL: z.string().trim().optional(),
  LLM_API_KEY: z.string().trim().optional(),
  LLM_MODEL: z.string().trim().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('\n[config] Invalid environment. Fix the following and restart:')
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.') || '(env)'}: ${issue.message}`)
  }
  console.error('See server/.env.example for the required variables.\n')
  process.exit(1)
}

export const config = {
  port: parsed.data.PORT,
  mongoUri: parsed.data.MONGODB_URI,
  // Kept as a compatibility convenience for existing startup logs.
  frontendUrl: parsed.data.FRONTEND_URL[0],
  frontendUrls: parsed.data.FRONTEND_URL,
  demoMode: parsed.data.DEMO_MODE,
  seedOnStart: parsed.data.SEED_ON_START,
  nodeEnv: parsed.data.NODE_ENV,
  llm: {
    baseUrl: parsed.data.LLM_BASE_URL,
    apiKey: parsed.data.LLM_API_KEY,
    model: parsed.data.LLM_MODEL,
  },
}
