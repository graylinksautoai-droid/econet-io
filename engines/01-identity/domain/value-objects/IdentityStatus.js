export const IdentityStatus = Object.freeze({
  CREATED: 'CREATED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DEACTIVATED: 'DEACTIVATED',
  ANONYMIZED: 'ANONYMIZED'
});

const transitions = Object.freeze({
  [IdentityStatus.CREATED]: new Set([IdentityStatus.ACTIVE, IdentityStatus.ANONYMIZED]),
  [IdentityStatus.ACTIVE]: new Set([
    IdentityStatus.SUSPENDED,
    IdentityStatus.DEACTIVATED,
    IdentityStatus.ANONYMIZED
  ]),
  [IdentityStatus.SUSPENDED]: new Set([
    IdentityStatus.ACTIVE,
    IdentityStatus.DEACTIVATED,
    IdentityStatus.ANONYMIZED
  ]),
  [IdentityStatus.DEACTIVATED]: new Set([IdentityStatus.ANONYMIZED]),
  [IdentityStatus.ANONYMIZED]: new Set()
});

export function assertIdentityTransition(from, to) {
  if (!Object.values(IdentityStatus).includes(to)) {
    throw new Error(`Unknown identity status: "${to}".`);
  }
  if (from === to || !transitions[from]?.has(to)) {
    throw new Error(`Invalid identity lifecycle transition: ${from} -> ${to}.`);
  }
}

export function isActiveIdentityStatus(status) {
  return status === IdentityStatus.ACTIVE;
}
