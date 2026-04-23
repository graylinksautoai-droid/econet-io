export function getPostStatus(post) {
  return post.postStatus || 'regular';
}

export function getLedBarClass(post) {
  const status = getPostStatus(post);

  if (status === 'critical') {
    return 'bg-red-600 shadow-red-500/60 animate-pulse';
  }

  if (status === 'observe') {
    return 'bg-yellow-500 shadow-yellow-400/50';
  }

  return 'bg-gray-400 shadow-gray-400/40';
}

export function isSentinelVerified(post) {
  return Boolean(post?.user?.verifiedReporter || post?.verifiedReporter);
}

export function isClimateSignal(post) {
  return Boolean(post?.liloClassification?.isClimateRelated);
}

export function isCommandEligible(post) {
  return isClimateSignal(post) && getPostStatus(post) !== 'regular';
}
