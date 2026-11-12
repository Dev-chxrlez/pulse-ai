import { z } from 'zod';
import { AnalysisError } from './media.js';

// AI-rated criteria. Grounded in Google's ABCD (Attract, Brand, Connect, Direct) plus TikTok/Meta
// short-form guidance (sound-off viewing). Weights with FORMAT_CRITERION sum to 100.
export const RUBRIC = [
  { id: 'hook', label: 'Opening hook', weight: 22, categories: ['opening_hook'], description: 'Is the opening specific, immediate, and understandable in the first three seconds?' },
  { id: 'clarity', label: 'Message clarity', weight: 16, categories: ['visual_content', 'narration', 'product'], description: 'Is the main subject or benefit clear and consistent across visuals and narration?' },
  { id: 'pacing', label: 'Pacing', weight: 12, categories: ['pacing'], description: 'Does available evidence suggest purposeful progression without unnecessary repetition?' },
  { id: 'text', label: 'Text readability', weight: 8, categories: ['on_screen_text'], description: 'When text is observed, is it legible and useful? Absence of text alone is not a weakness.' },
  { id: 'cta', label: 'Call to action', weight: 12, categories: ['call_to_action'], description: 'When a CTA is evidenced, is the next step clear and appropriate? An unobserved CTA is unknown, not automatically poor.' },
  { id: 'brand', label: 'Early branding', weight: 10, categories: ['product', 'opening_hook', 'visual_content'], description: 'Is the brand, product, or main subject clearly identifiable, ideally within the first few seconds? Rate only from evidence of when and how it appears.' },
  { id: 'silent', label: 'Works without sound', weight: 8, categories: ['on_screen_text', 'visual_content'], description: 'Could a viewer with sound off follow the core message through on-screen text, captions, or self-explanatory visuals? Unknown if visual/text evidence is insufficient.' },
  { id: 'connect', label: 'Emotional connection', weight: 7, categories: ['narration', 'engagement', 'visual_content'], description: 'Does the video use storytelling, a relatable situation, humor, or a clear human angle that gives viewers a reason to care? Do not infer viewers\' or people\'s emotions, identity, or traits.' },
];
// Measured from the file, not AI: Reels, TikTok and Shorts are built for vertical 9:16.
export const FORMAT_CRITERION = { id: 'format', label: 'Platform format fit', weight: 5, categories: [], measured: true, description: 'Measured from the video file: vertical 9:16 fits Reels, TikTok and Shorts full-screen; 4:5 is acceptable in feeds; square and horizontal leave unused screen space.' };
export const FULL_RUBRIC = [...RUBRIC, FORMAT_CRITERION];
export function formatCriterion(metadata) {
  const width = metadata?.width, height = metadata?.height;
  if (!(width > 0 && height > 0)) return { id: 'format', rating: null, rationale: 'Video dimensions are unavailable.', findingIndexes: [], measured: true };
  const ratio = height / width, shape = `${width}×${height}`;
  const [rating, rationale] = ratio >= 1.7 ? [4, `Vertical ${shape} (about 9:16): fills the screen on Reels, TikTok and Shorts.`]
    : ratio >= 1.2 ? [3, `Portrait ${shape} (about 4:5 or 3:4): fits feeds well but does not fill a full 9:16 screen.`]
    : ratio >= 0.95 ? [2, `Square ${shape}: shows with empty space on full-screen vertical placements.`]
    : [1, `Horizontal ${shape}: appears small or cropped on vertical short-form placements. Consider a 9:16 edit.`];
  return { id: 'format', rating, rationale, findingIndexes: [], measured: true };
}
const references = z.array(z.number().int().nonnegative()).min(1).max(8);
export const creativeSchema = z.object({
  criteria: z.array(z.object({
    id: z.enum(RUBRIC.map(dimension => dimension.id)),
    rating: z.number().int().min(0).max(4).nullable(),
    rationale: z.string().min(1).max(1500),
    findingIndexes: z.array(z.number().int().nonnegative()).max(8),
  }).strict()).length(RUBRIC.length),
  hooks: z.array(z.object({
    text: z.string().min(1).max(350),
    execution: z.string().min(1).max(1000),
    rationale: z.string().min(1).max(1000),
    findingIndexes: references,
  }).strict()).min(1).max(3),
  priorities: z.array(z.object({
    title: z.string().min(1).max(160),
    action: z.string().min(1).max(1200),
    findingIndexes: references,
  }).strict()).min(1).max(5),
}).strict();
export const creativeJsonSchema = z.toJSONSchema(creativeSchema, { target: 'draft-7' });
delete creativeJsonSchema.$schema;
function supportedFinding(finding) {
  return Boolean(finding && finding.certainty !== 'uncertain' && finding.evidence.length > 0);
}
export function creativeEvidenceMap(analysis) {
  return Object.fromEntries(RUBRIC.map(dimension => [dimension.id, analysis.report.findings.flatMap((finding, index) => supportedFinding(finding) && dimension.categories.includes(finding.category) ? [index] : [])]));
}
// Encode the same criterion/category contract in the request, before generation.
// Keep validateCreative as the independent, authoritative acceptance check.
export function creativeRequestSchema(analysis) {
  const schema = structuredClone(creativeJsonSchema);
  const eligible = creativeEvidenceMap(analysis);
  const criterion = schema.properties.criteria.items;
  const choices = [];
  for (const dimension of RUBRIC) {
    const indexes = eligible[dimension.id];
    const unknown = structuredClone(criterion);
    unknown.properties.id = { type: 'string', enum: [dimension.id] };
    unknown.properties.rating = { type: 'null' };
    unknown.properties.findingIndexes = indexes.length ? { type: 'array', items: { type: 'integer', enum: indexes }, maxItems: 8 } : { type: 'array', items: { type: 'integer' }, maxItems: 0 };
    choices.push(unknown);
    if (indexes.length) {
      const scored = structuredClone(unknown);
      scored.properties.rating = { type: 'integer', minimum: 0, maximum: 4 };
      scored.properties.findingIndexes.minItems = 1;
      choices.push(scored);
    }
  }
  schema.properties.criteria.items = { anyOf: choices };
  return schema;
}
function evidenceError(message, diagnostic) {
  const error = new AnalysisError('INVALID_CREATIVE_EVIDENCE', message);
  // Structural metadata only: never include model prose, transcripts, or media.
  error.diagnostic = diagnostic;
  return error;
}
export function validateCreative(raw, analysis) {
  const result = creativeSchema.safeParse(raw);
  if (!result.success || new Set(result.data?.criteria.map(item => item.id)).size !== RUBRIC.length) throw new AnalysisError('INVALID_CREATIVE', 'The creative review was incomplete. Please retry.');
  function valid(index) {
    return supportedFinding(analysis.report.findings[index]);
  }
  for (const [collection, items] of Object.entries({ criteria: result.data.criteria, hooks: result.data.hooks, priorities: result.data.priorities })) for (const [position, item] of items.entries()) {
    const field = `${collection}[${position}].findingIndexes`;
    if (!item.findingIndexes.every(valid) || ('rating' in item && item.rating !== null && item.findingIndexes.length === 0)) throw evidenceError('The creative review cited unsupported findings. Please retry.', { reason: item.findingIndexes.length ? 'unsupported_reference' : 'missing_reference', field, ...(collection === 'criteria' ? { criterionId: item.id } : {}), findingIndexes: item.findingIndexes });
    if ('rating' in item && item.rating !== null) {
      const dimension = RUBRIC.find(dimension => dimension.id === item.id);
      if (!item.findingIndexes.some(index => dimension.categories.includes(analysis.report.findings[index].category))) throw evidenceError('A creative rating lacked evidence for its criterion. Please retry.', { reason: 'criterion_category_mismatch', field, criterionId: item.id, findingIndexes: item.findingIndexes, referencedCategories: item.findingIndexes.map(index => analysis.report.findings[index].category), allowedCategories: dimension.categories, eligibleFindingIndexes: creativeEvidenceMap(analysis)[item.id] });
    }
  }
  return result.data;
}
// Ratings for every rubric criterion: AI ratings from the saved review (missing = unknown, e.g. reviews made
// before a criterion existed) plus the measured format criterion.
function ratingsFor(creative, metadata) {
  return FULL_RUBRIC.map(dimension => dimension.measured ? { ...dimension, ...formatCriterion(metadata) } : { ...dimension, rating: null, rationale: 'Not assessed in this review. Regenerate the creative review to include this criterion.', findingIndexes: [], ...creative.criteria.find(item => item.id === dimension.id), weight: dimension.weight, label: dimension.label });
}
export function scoreCreative(raw, metadata) {
  const criteria = ratingsFor(raw, metadata);
  const assessed = criteria.filter(item => item.rating !== null);
  const coverage = assessed.reduce((sum, item) => sum + item.weight, 0);
  const overall = assessed.length >= 3 && coverage >= 60 ? Math.round(assessed.reduce((sum, item) => sum + item.weight * item.rating / 4, 0) / coverage * 100) : null;
  return { ...raw, criteria, coverage, overall, strengths: assessed.filter(item => item.rating >= 3).map(item => item.id), weaknesses: assessed.filter(item => item.rating <= 1).map(item => item.id) };
}
export function compareCreative(videos) {
  const ratings = videos.map(video => ratingsFor(video.creative, video.analysis?.metadata));
  const common = FULL_RUBRIC.filter((_dimension, index) => ratings.every(rows => rows[index].rating !== null));
  const coverage = common.reduce((sum, dimension) => sum + dimension.weight, 0);
  return { commonCriteria: common.map(item => item.id), coverage, totalCriteria: FULL_RUBRIC.length,
    rows: FULL_RUBRIC.map((dimension, index) => ({ id: dimension.id, label: dimension.label, weight: dimension.weight, measured: Boolean(dimension.measured), shared: common.includes(dimension), items: ratings.map(rows => ({ rating: rows[index].rating, rationale: rows[index].rationale, findingIndexes: rows[index].findingIndexes || [] })) })),
    scores: videos.map((video, position) => ({
      id: video.id,
      score: common.length >= 3 && coverage >= 60 ? Math.round(common.reduce((sum, dimension) => sum + dimension.weight * ratings[position][FULL_RUBRIC.indexOf(dimension)].rating / 4, 0) / coverage * 100) : null,
    })) };
}

