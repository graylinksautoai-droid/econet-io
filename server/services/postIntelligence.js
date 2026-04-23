const CLIMATE_CATEGORIES = new Set(['Flood', 'Drought', 'Fire', 'Pollution', 'Storm']);

const CLIMATE_KEYWORDS = [
  'climate',
  'flood',
  'fire',
  'wildfire',
  'pollution',
  'storm',
  'erosion',
  'drought',
  'heatwave',
  'air quality',
  'oil spill',
  'deforestation',
  'rainfall',
  'emission',
  'smoke',
  'water contamination'
];

function matchSignals(description = '') {
  const normalized = description.toLowerCase();
  return CLIMATE_KEYWORDS.filter((keyword) => normalized.includes(keyword));
}

export function normalizeSeverity(severity) {
  const value = String(severity || '').toLowerCase();

  if (value === 'critical' || value === 'high') return 'Critical';
  if (value === 'moderate' || value === 'medium' || value === 'observe') return 'Moderate';
  return 'Low';
}

export function normalizeUrgency(urgency) {
  const value = String(urgency || '').toLowerCase();

  if (value === 'immediate' || value === 'urgent' || value === 'critical') return 'Immediate';
  if (value === 'observation' || value === 'observe' || value === 'monitor') return 'Observation';
  if (value === 'temporaryrelief') return 'TemporaryRelief';
  return 'Low';
}

export function derivePostStatus({ isClimateRelated, severity, urgency }) {
  if (!isClimateRelated) return 'regular';
  if (severity === 'Critical' || urgency === 'Immediate') return 'critical';
  return 'observe';
}

export function classifyPostSignal({
  description = '',
  category = 'Other',
  severity = 'Low',
  urgency = 'Low',
  confidence = 0,
  summary = ''
}) {
  const matchedSignals = matchSignals(description);
  const normalizedSeverity = normalizeSeverity(severity);
  const normalizedUrgency = normalizeUrgency(urgency);
  const isClimateCategory = CLIMATE_CATEGORIES.has(category);
  const isClimateRelated = isClimateCategory || matchedSignals.length > 0;
  const confidenceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(typeof confidence === 'number' ? (confidence <= 1 ? confidence * 100 : confidence) : 0)
    )
  );
  const postStatus = derivePostStatus({
    isClimateRelated,
    severity: normalizedSeverity,
    urgency: normalizedUrgency
  });

  return {
    category: isClimateRelated ? category : 'Other',
    severity: normalizedSeverity,
    urgency: normalizedUrgency,
    postStatus,
    liloClassification: {
      isClimateRelated,
      confidence: confidenceScore,
      summary: summary || (isClimateRelated ? 'LILO flagged this post for climate review.' : 'LILO kept this post in the social feed.'),
      matchedSignals,
      routedToCommand: isClimateRelated && postStatus !== 'regular'
    }
  };
}
