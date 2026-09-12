// Legacy values have no account scope: read hints only, never confirm or write.
export function readLegacyCompanionCandidate(tripId, members) {
  if (!String(tripId || '').trim()) return { candidate: '', conflict: false };
  try {
    const values = ['travel-active-member-', 'travel-checklist-actor-']
      .map(prefix => String(localStorage.getItem(`${prefix}${tripId}`) || '').trim())
      .filter(Boolean);
    const unique = [...new Set(values)];
    return {
      candidate: unique.length === 1 && members.includes(unique[0]) ? unique[0] : '',
      conflict: unique.length > 1,
    };
  } catch {
    return { candidate: '', conflict: false };
  }
}
