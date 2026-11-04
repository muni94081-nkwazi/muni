/**
 * Domain synonym dictionary for the product search analyzer.
 *
 * Symmetric entries ("a, b, c") expand any of the terms to all the others.
 * One-way entries ("a, b => c") are used where a local term is ambiguous
 * in English (e.g. "rolex" is a Ugandan street-food wrap, not the watch
 * brand) so we only expand *toward* the safe canonical term, never both ways.
 */
export const EAST_AFRICAN_SYNONYMS: string[] = [
  // Food & produce
  'matoke, matooke, plantain, green banana',
  'posho, maize meal, maize flour, cornmeal',
  'sukuma wiki, collard greens, sukuma',
  'mandazi, mandazi bread, fried dough, doughnut',
  'chapati, chapatti, roti, flatbread',
  'ugali, cornmeal porridge, maize porridge',
  'rolex, ugandan street food wrap => rolex food wrap',
  'nyama choma, roasted meat, grilled meat',
  'jinja honey, honey',
  // Fashion & textiles
  'kitenge, ankara, african wax print, african print fabric',
  'kanga, khanga, kitenge wrap',
  'gomesi, busuuti, traditional ugandan dress',
  'masai shuka, shuka blanket, maasai blanket',
  // Transport & commerce (brand/category terms)
  'boda boda, bodaboda, boda, motorcycle taxi',
  'matatu, dala dala, minibus taxi',
  'duka, kiosk, small shop, small store',
  'shamba, farm, farmland',
  // Common misspellings / regional variants
  'mama mboga, vegetable vendor, greengrocer',
  'kampala, kla',
];
