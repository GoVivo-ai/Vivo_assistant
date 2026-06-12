import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { aiModel, env } from '../config/env';
import { companyNow } from '../utils/dates';
import { routerSystemPrompt } from './prompts';

const IntentSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('search_drive'),
    query: z.string().min(1),
    type: z.enum(['file', 'folder', 'any']).default('any'),
  }),
  z.object({
    intent: z.literal('calendar_events'),
    range: z.enum(['today', 'tomorrow', 'this_week', 'next_week', 'custom']).default('today'),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
  z.object({
    intent: z.literal('clickup_task_status'),
    query: z.string().min(1),
  }),
  z.object({
    intent: z.literal('clickup_my_tasks'),
    status: z.enum(['open', 'in_progress', 'overdue', 'all']).default('all'),
    range: z.enum(['today', 'this_week', 'all']).default('all'),
  }),
  z.object({ intent: z.literal('help') }),
  z.object({ intent: z.literal('unknown') }),
]);

export type Intent = z.infer<typeof IntentSchema>;

let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

async function callModel(system: string, userMessage: string): Promise<string> {
  if (env.AI_PROVIDER === 'openai') {
    openaiClient ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await openaiClient.chat.completions.create({
      model: aiModel(),
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
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
    max_tokens: 300,
    temperature: 0,
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

/**
 * Classifies the user's message into a structured intent.
 * Any model/parsing failure degrades safely to {intent: 'unknown'}.
 */
export async function routeIntent(text: string): Promise<Intent> {
  try {
    const now = companyNow();
    const system = routerSystemPrompt(now.toISODate() ?? '', env.COMPANY_TIMEZONE);
    const raw = await callModel(system, text);
    const parsed = IntentSchema.safeParse(JSON.parse(extractJson(raw)));
    if (!parsed.success) {
      console.error('[intentRouter] schema validation failed for model output');
      return { intent: 'unknown' };
    }
    return parsed.data;
  } catch (err) {
    console.error('[intentRouter] routing failed:', (err as Error).message);
    return { intent: 'unknown' };
  }
}
