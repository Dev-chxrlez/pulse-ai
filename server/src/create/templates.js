// Server-side template metadata. Visual components live in client/src/video (shared with the preview).
// Styles are generic short-form ad patterns, not copies of any specific ad.
export const TEMPLATES = {
  motion: {name: 'Motion Pro', style: 'Premium motion graphics: animated gradient, icons chosen for your business, masked kinetic type synced to the voice, designed transitions.', tone: 'match the business'},
  'bold-hook': {name: 'Bold Hook', style: 'Full-screen kinetic text, punchy word-by-word entrances, alternating brand colors. Common in text-led TikTok and Reels ads.', tone: 'energetic, punchy, urgent'},
  'product-reveal': {name: 'Product Reveal', style: 'Dark stage, glowing logo or product reveal with a light sweep, feature chips slide in one by one, CTA end card.', tone: 'confident, premium'},
  matched: {name: 'Matched style', style: 'Scene count, cut rhythm, transitions, opening and text treatment measured from a reference ad.', tone: 'match the reference ad’s energy', hidden: true},
  'story-captions': {name: 'Story Captions', style: 'Large word-by-word captions synced to the voice with a highlighted current word. Works with sound off.', tone: 'warm, conversational'},
};
export function template(id) {
  const found = TEMPLATES[id];
  if (!found) throw Object.assign(new Error('Choose one of the available templates.'), {status: 400});
  return found;
}
