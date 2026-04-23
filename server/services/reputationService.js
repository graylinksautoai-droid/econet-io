export function calculateTrustScore(reports, verifiedReports = 0) {
  if (!reports || reports.length === 0) return 0;

  const now = Date.now();
  let weightedSum = 0;
  let totalWeight = 0;

  for (const report of reports) {
    const aiScore = report.aiVerification?.score || report.aiScore || 50;
    const validationBalance = (report.upvotes?.length || 0) - (report.downvotes?.length || 0);
    const socialApproval = (report.likes?.length || 0) + (report.sharesCount || 0);
    const voteInfluence = Math.min(20, Math.max(-20, validationBalance * 3 + socialApproval));

    // Sentinel Live: Proof of Presence (+40% Trust Score boost)
    const liveBoost = report.isLive || report.proofOfPresence ? 1.4 : 1.0;
    const verifiedBoost = report.verificationStatus === 'verified' ? 18 : 0;

    const reportAge = now - new Date(report.createdAt).getTime();
    const daysOld = reportAge / (1000 * 60 * 60 * 24);
    let timeMultiplier = 1;
    if (daysOld > 30) {
      timeMultiplier = Math.max(0.5, 1 - (daysOld - 30) * 0.02);
    }

    const reportWeight = Math.max(0, (aiScore + voteInfluence + verifiedBoost) * timeMultiplier * liveBoost);
    weightedSum += reportWeight;
    totalWeight++;
  }

  const verificationRatioBoost = Math.min(20, verifiedReports * 3);
  const rawScore = weightedSum / totalWeight + verificationRatioBoost;
  return Math.min(100, Math.max(0, Math.round(rawScore)));
}

export function calculateLeaves(reports = [], verifiedReports = 0) {
  return reports.reduce((total, report) => {
    const interactionValue =
      (report.likes?.length || 0) +
      (report.upvotes?.length || 0) * 2 +
      (report.sharesCount || 0) * 2 +
      (report.commentsCount || 0) +
      (report.giftsCount || 0) * 3;

    const verificationValue = report.verificationStatus === 'verified' ? 20 : 0;
    const liveValue = report.isLive || report.proofOfPresence ? 12 : 0;

    return total + 5 + interactionValue + verificationValue + liveValue;
  }, verifiedReports * 10);
}

export function calculateEcoCoins(reports = [], verifiedReports = 0) {
  const earnedFromVerifiedReports = reports.reduce((total, report) => {
    if (report.verificationStatus !== 'verified') return total;

    const severityBonus = report.severity === 'Critical' ? 8 : report.severity === 'Moderate' ? 4 : 2;
    const liveBonus = report.proofOfPresence ? 3 : 0;
    return total + severityBonus + liveBonus;
  }, 0);

  return verifiedReports * 5 + earnedFromVerifiedReports;
}

export function calculateUserStanding(reports = [], verifiedReports = 0) {
  const trustScore = calculateTrustScore(reports, verifiedReports);
  const leaves = calculateLeaves(reports, verifiedReports);
  const ecoCoins = calculateEcoCoins(reports, verifiedReports);
  const verifiedSentinel = trustScore >= 80 && verifiedReports >= 3;

  return {
    trustScore,
    leaves,
    ecoCoins,
    verifiedSentinel
  };
}
