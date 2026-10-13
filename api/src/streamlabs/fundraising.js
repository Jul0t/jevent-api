const fundraiserCache = new Map();

const TTL_MS = 45_000;
const TIMEOUT_MS = 7_000;

function toCents(value) {
  if (value === null || value === undefined) return null;

  const n = Number(
    String(value)
      .replace(/\s/g, "")
      .replace(",", ".")
  );

  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n * 100));
}

function pickAmount(raw) {
  // Compat: champ probable dans ton widget + variantes communes
  const candidates = [
    raw?.member_amount_raised,
    raw?.campaign?.member_amount_raised,
    raw?.memberAmountRaised,
    raw?.member_amount,
    raw?.campaign?.amounts?.member
  ];

  for (const c of candidates) {
    const cents = toCents(c);
    if (cents !== null) return cents;
  }

  return null;
}

export async function getCreatorRaisedCents(streamlabsGoalUrl) {
  if (!streamlabsGoalUrl) return null;

  const cached = fundraiserCache.get(streamlabsGoalUrl);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.value;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      streamlabsGoalUrl,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal
      }
    );

    if (!response.ok) return null;

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    const raisedCents = pickAmount(payload);

    fundraiserCache.set(streamlabsGoalUrl, {
      at: Date.now(),
      value: raisedCents
    });

    return raisedCents;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}