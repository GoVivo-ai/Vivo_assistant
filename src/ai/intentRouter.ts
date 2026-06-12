import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { aiModel, env } from '../config/env';
import { companyNow } from '../utils/dates';
import { routerSystemPrompt } from './prompts';

const langField = z.enum(['es', 'en']).default('en');

const IntentSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('search_drive'),
    lang: langField,
    // Omitted/empty query = "list my recent files/folders" rather than a search.
    query: z.string().optional(),
    type: z.enum(['file', 'folder', 'any']).default('any'),
  }),
  z.object({
    intent: z.literal('calendar_events'),
    lang: langField,
    range: z.enum(['today', 'tomorrow', 'this_week', 'next_week', 'custom']).default('today'),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
  z.object({
    intent: z.literal('clickup_task_status'),
    lang: langField,
    query: z.string().min(1),
  }),
  z.object({
    intent: z.literal('clickup_my_tasks'),
    lang: langField,
    status: z.enum(['open', 'in_progress', 'overdue', 'all']).default('all'),
    range: z.enum(['today', 'this_week', 'all']).default('all'),
  }),
  z.object({ intent: z.literal('help'), lang: langField }),
  z.object({ intent: z.literal('chat'), lang: langField }),
  z.object({ intent: z.literal('unknown'), lang: langField }),
]);

export type Intent = z.infer<typeof IntentSchema>;
export type Lang = 'es' | 'en';

let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

export async function callModel(
  system: string,
  userMessage: string,
  options: { json?: boolean; maxTokens?: number } = {},
): Promise<string> {
  const { json = false, maxTokens = 300 } = options;

  if (env.AI_PROVIDER === 'openai') {
    openaiClient ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await openaiClient.chat.completions.create({
      model: aiModel(),
      temperature: json ? 0 : 0.7,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' as const } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
    });
    return response.choices[0]?.message?.content ?? '';
  }

  anthropicClient ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await anthropicClient.messages.create({
    model: aiModel(),
    max_tokens: maxTokens,
    temperature: json ? 0 : 0.7,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });
  const block = response.content[0];
  return block && block.type === 'text' ? block.text : '';
}

/** Extracts the first JSON object from a model response, tolerating fences. */
function extractJson(text: string): string {
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model response');
  }
  return cleaned.slice(start, end + 1);
}

/** Cheap heuristic used only when the model call fails entirely. */
function guessLang(text: string): Lang {
  return /[áéíóúñ¿¡]|\b(qué|cómo|dónde|cuál|hola|tengo|reuni|tarea|archivo|carpeta)\b/i.test(text)
    ? 'es'
    : 'en';
}

/**
 * Classifies the user's message into a structured intent (including language).
 * Any model/parsing failure degrades safely to {intent: 'unknown'}.
 */
export async function routeIntent(text: string): Promise<Intent> {
  try {
    const now = companyNow();
    const system = routerSystemPrompt(now.toISODate() ?? '', env.COMPANY_TIMEZONE);
    const raw = await callModel(system, text, { json: true });
    const parsed = IntentSchema.safeParse(JSON.parse(extractJson(raw)));
    if (!parsed.success) {
      console.error('[intentRouter] schema validation failed for model output');
      return { intent: 'unknown', lang: guessLang(text) };
    }
    return parsed.data;
  } catch (err) {
    console.error('[intentRouter] routing failed:', (err as Error).message);
    return { intent: 'unknown', lang: guessLang(text) };
  }
}
