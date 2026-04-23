const HARVEST_KEY = 'econet-harvest-state';

export const REWARD_RULES = {
  dailyHarvest: { leaves: 15, ecoCoins: 0, bloom: 10 },
  harvestStreak7: { leaves: 30, ecoCoins: 5, bloom: 20 },
  post: { leaves: 3, ecoCoins: 0, bloom: 5 },
  like: { leaves: 1, ecoCoins: 0, bloom: 2 },
  comment: { leaves: 2, ecoCoins: 0, bloom: 4 },
  share: { leaves: 2, ecoCoins: 0, bloom: 5 },
  validate: { leaves: 3, ecoCoins: 1, bloom: 6 },
  downvote: { leaves: 0, ecoCoins: 0, bloom: 1 },
  livePost: { leaves: 6, ecoCoins: 2, bloom: 8 },
  giftLeaf: { leaves: 2, ecoCoins: 0, bloom: 4 },
  giftSolar: { leaves: 4, ecoCoins: 1, bloom: 8 },
  giftTree: { leaves: 8, ecoCoins: 2, bloom: 12 }
};

export function applyRewardToReputation(reputation = {}, reward = {}) {
  const nextLeaves = (reputation.leaves || 0) + (reward.leaves || 0);
  const nextEcoCoins = (reputation.ecoCoins || reputation.seeds || 0) + (reward.ecoCoins || 0);

  return {
    ...reputation,
    leaves: nextLeaves,
    ecoCoins: nextEcoCoins,
    seeds: nextEcoCoins
  };
}

export function readHarvestState() {
  try {
    return JSON.parse(localStorage.getItem(HARVEST_KEY) || '{"lastHarvestDate":null,"streak":0}');
  } catch {
    return { lastHarvestDate: null, streak: 0 };
  }
}

export function writeHarvestState(state) {
  localStorage.setItem(HARVEST_KEY, JSON.stringify(state));
}

export function claimDailyHarvest(now = new Date()) {
  const state = readHarvestState();
  const today = now.toISOString().slice(0, 10);

  if (state.lastHarvestDate === today) {
    return {
      claimed: false,
      streak: state.streak || 0,
      reward: { leaves: 0, ecoCoins: 0, bloom: 0 }
    };
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  const nextStreak = state.lastHarvestDate === yesterdayKey ? (state.streak || 0) + 1 : 1;
  const reward = nextStreak % 7 === 0
    ? {
        leaves: REWARD_RULES.dailyHarvest.leaves + REWARD_RULES.harvestStreak7.leaves,
        ecoCoins: REWARD_RULES.harvestStreak7.ecoCoins,
        bloom: REWARD_RULES.dailyHarvest.bloom + REWARD_RULES.harvestStreak7.bloom
      }
    : REWARD_RULES.dailyHarvest;

  writeHarvestState({
    lastHarvestDate: today,
    streak: nextStreak
  });

  return {
    claimed: true,
    streak: nextStreak,
    reward
  };
}
