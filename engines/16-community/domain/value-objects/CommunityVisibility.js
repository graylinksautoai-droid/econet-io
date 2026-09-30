/**
 * Engine 16: Community Engine — CommunityVisibility Value Object
 * Visibility is separate from membership. PUBLIC communities may be discovered
 * by any caller; PRIVATE communities require an active membership to view.
 */

export const CommunityVisibility = Object.freeze({
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE'
});

export function isValidVisibility(visibility) {
  return Object.values(CommunityVisibility).includes(visibility);
}

export function normalizeVisibility(visibility) {
  const normalized = String(visibility ?? '').trim().toUpperCase();
  if (!isValidVisibility(normalized)) {
    throw new Error(`Invalid community visibility: "${visibility}". Must be PUBLIC or PRIVATE.`);
  }
  return normalized;
}