import { z } from 'zod';
import { AnalysisError } from './media.js';
const evidence = z.object({
  source: z.enum(['frame', 'transcript']),
  index: z.number().int().nonnegative(),
  observation: z.string().min(1).max(1200),
}).strict();
export const reportSchema = z.object({
  summary: z.string().min(1).max(2000),
  findings: z.array(z.object({
    category: z.enum(['opening_hook', 'visual_content', 'narration', 'on_screen_text', 'pacing', 'product', 'call_to_action', 'engagement']),
    title: z.string().min(1).max(160),
    assessment: z.string().min(1).max(2000),
    suggestion: z.string().max(1600),
    certainty: z.enum(['observed', 'inferred', 'uncertain']),
    evidence: z.array(evidence).max(8),
  }).strict()).min(1).max(20),
  limitations: z.array(z.string().min(1).max(1200)).max(12),
}).strict();
export const jsonSchema = z.toJSONSchema(reportSchema, { target: 'draft-7' });
delete jsonSchema.$schema;
export function validateReport(raw, frames, transcript) {
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) throw new AnalysisError('INVALID_AI_RESPONSE', 'The AI returned an invalid report. You can retry analysis.');
  for (const finding of parsed.data.findings) {
    if (finding.certainty !== 'uncertain' && !finding.evidence.length) throw new AnalysisError('INVALID_EVIDENCE', 'The AI report contained an unsupported finding. You can retry analysis.');
    for (const reference of finding.evidence) {
      const source = reference.source === 'frame' ? frames : transcript.windows;
      if (!source.some(item => item.index === reference.index)) throw new AnalysisError('INVALID_EVIDENCE', 'The AI cited evidence that was not supplied. You can retry analysis.');
    }
  }
  return parsed.data;
}
