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

function hasCriticalWords(description = '') {
  return /(critical|urgent|emergency|immediate|spreading|evacuate|danger)/i.test(description);
}

export function classifyClientPost(description = '') {
  const matchedSignals = matchSignals(description);
  const isClimateRelated = matchedSignals.length > 0;
  const postStatus = !isClimateRelated
    ? 'regular'
    : hasCriticalWords(description)
      ? 'critical'
      : 'observe';

  return {
    postStatus,
    liloClassification: {
      isClimateRelated,
      confidence: isClimateRelated ? (postStatus === 'critical' ? 88 : 74) : 18,
      summary: isClimateRelated
        ? `Client-side LILO marked this as a ${postStatus} climate signal.`
        : 'Client-side LILO kept this in the regular social feed.',
      matchedSignals,
      routedToCommand: isClimateRelated && postStatus !== 'regular'
    }
  };
}
