export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function normalizeBoolean(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}

export function normalizeInteger(
  value,
  {
    minimum = Number.MIN_SAFE_INTEGER,
    maximum = Number.MAX_SAFE_INTEGER,
    fallback = 0
  } = {}
) {
  const integer = Number.parseInt(value, 10);

  if (!Number.isFinite(integer)) {
    return fallback;
  }

  return Math.min(
    Math.max(integer, minimum),
    maximum
  );
}

export function normalizeTwitchLogin(value) {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

export function isValidTwitchLogin(value) {
  return /^[a-z0-9_]{4,25}$/.test(
    normalizeTwitchLogin(value)
  );
}

export function normalizeSlug(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function sanitizePlainText(
  value,
  maximumLength = 255
) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maximumLength);
}

export function normalizeDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}