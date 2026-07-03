import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    SLACK_BOT_TOKEN: z.string().min(1, 'SLACK_BOT_TOKEN is required'),
    SLACK_SIGNING_SECRET: z.string().min(1, 'SLACK_SIGNING_SECRET is required'),
    SLACK_APP_TOKEN: z.string().optional(),

    APP_BASE_URL: z.string().url('APP_BASE_URL must be a valid URL'),

    AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().optional(),

    GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
    GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
    GOOGLE_REDIRECT_URI: z.string().url('GOOGLE_REDIRECT_URI must be a valid URL'),

    CLICKUP_CLIENT_ID: z.string().min(1, 'CLICKUP_CLIENT_ID is required'),
    CLICKUP_CLIENT_SECRET: z.string().min(1, 'CLICKUP_CLIENT_SECRET is required'),
    CLICKUP_REDIRECT_URI: z.string().url('CLICKUP_REDIRECT_URI must be a valid URL'),

    TOKEN_ENCRYPTION_KEY: z
      .string()
      .min(32, 'TOKEN_ENCRYPTION_KEY must be at least 32 characters (use: openssl rand -hex 32)'),

    // Access key for the /admin dashboard (session login at /admin/login).
    // If unset, the dashboard is disabled.
    ADMIN_DASHBOARD_KEY: z.string().min(8).optional(),

    COMPANY_TIMEZONE: z.string().default('America/Bogota'),
  })
  .superRefine((val, ctx) => {
    if (val.AI_PROVIDER === 'openai' && !val.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when AI_PROVIDER=openai',
      });
    }
    if (val.AI_PROVIDER === 'anthropic' && !val.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

const DEFAULT_AI_MODELS: Record<typeof env.AI_PROVIDER, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

export function aiModel(): string {
  return env.AI_MODEL && env.AI_MODEL.length > 0 ? env.AI_MODEL : DEFAULT_AI_MODELS[env.AI_PROVIDER];
}
