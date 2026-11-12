// Turns a completed PULSE analysis of a reference ad into STYLE parameters only (timing, pace,
// structure). No footage, music, wording or logos are reused. The twist: the chosen PULSE template
// supplies its own layout and motion, with the user's colors, words and voice.
export function deriveStyle(video) {
  const analysis = video?.analysisStatus === 'completed' ? video.analysis : null;
  if (!analysis) return null;
  const duration = analysis.metadata?.duration || analysis.metadata?.videoDuration || null;
  const cuts = (analysis.sceneChanges || []).filter(time => time > .2);
  const cutInterval = duration ? Math.round(duration / (cuts.length + 1) * 10) / 10 : null;
  const findings = analysis.report.findings.filter(finding => finding.certainty !== 'uncertain');
  const frameTime = finding => Math.min(...finding.evidence.filter(item => item.source === 'frame').map(item => analysis.frames.find(frame => frame.index === item.index)?.timestamp ?? Infinity));
  const textHeavy = findings.filter(finding => finding.category === 'on_screen_text').length >= 1;
  const productAt = Math.min(...findings.filter(finding => finding.category === 'product').map(frameTime));
  const ctaFound = findings.some(finding => finding.category === 'call_to_action');
  const pace = cutInterval === null ? 'medium' : cutInterval < 1.6 ? 'fast' : cutInterval < 3.2 ? 'medium' : 'slow';
  const templateId = Number.isFinite(productAt) && productAt <= 4 ? 'product-reveal' : textHeavy && pace !== 'slow' ? 'bold-hook' : 'story-captions';
  const reasons = [
    cutInterval !== null && `${cuts.length} scene changes in ${Math.round(duration)}s (about one every ${cutInterval}s → ${pace} pace)`,
    Number.isFinite(productAt) && `product first sampled at ~${productAt.toFixed(1)}s`,
    textHeavy && 'relies on on-screen text',
    ctaFound && 'ends with a call to action',
  ].filter(Boolean);
  // Blueprint for the matched-style generator: normalized cut rhythm + opening/text/CTA structure.
  const blueprint = {pace, cuts: duration ? cuts.filter(time => time < duration).map(time => Math.round(time / duration * 1000) / 1000).slice(0, 24) : [], brandEarly: Number.isFinite(productAt) && productAt <= 1.5, textHeavy, ctaFound};
  return {templateId, blueprint, pace, cutInterval, firstCut: cuts[0] ?? null, productAt: Number.isFinite(productAt) ? productAt : null, textHeavy, ctaFound, duration, reasons};
}
