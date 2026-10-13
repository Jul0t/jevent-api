import {
  generateRandomToken
} from "../shared/security.js";

import {
  normalizeSlug
} from "../shared/validation.js";

export const EVENT_START =
  "2026-10-25T00:00:00+02:00";

export const EVENT_END =
  "2026-11-05T23:59:59+01:00";

export const EVENT_TIMEZONE =
  "Europe/Paris";

export const PROGRAM_STATUSES =
  new Set(
    Array.of(
      "draft",
      "published",
      "cancelled"
    )
  );

export const PROGRAM_CATEGORIES =
  new Set(
    Array.of(
      "gaming",
      "talk",
      "challenge",
      "creative",
      "charity",
      "community",
      "special",
      "other"
    )
  );

import {
  getCreatorRaisedCents
} from "../streamlabs/fundraising.js";

export function normalizeProgramStatus(
  value,
  fallback = "draft"
) {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();

  return PROGRAM_STATUSES.has(status)
    ? status
    : fallback;
}

export function normalizeProgramCategory(value) {
  const category = String(value ?? "")
    .trim()
    .toLowerCase();

  return PROGRAM_CATEGORIES.has(category)
    ? category
    : "other";
}

export function normalizeDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function isWithinEvent(
  startsAt,
  endsAt
) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  const eventStart =
    new Date(EVENT_START).getTime();

  const eventEnd =
    new Date(EVENT_END).getTime();

  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= eventStart &&
    end <= eventEnd &&
    end > start
  );
}

export function getEventDay(startsAt) {
  const timestamp =
    new Date(startsAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  if (
    timestamp < new Date(EVENT_START).getTime() ||
    timestamp > new Date(EVENT_END).getTime()
  ) {
    return null;
  }

  if (
    timestamp <
    new Date(
      "2026-10-27T16:00:00+01:00"
    ).getTime()
  ) {
    return 1;
  }

  if (
    timestamp <
    new Date(
      "2026-10-28T16:00:00+01:00"
    ).getTime()
  ) {
    return 2;
  }

  return 3;
}

export async function findProgramEntry(
  env,
  publicId
) {
  return env.DB.prepare(`
    SELECT *
    FROM program_entries
    WHERE public_id = ?
    LIMIT 1
  `)
    .bind(publicId)
    .first();
}

export async function generateProgramSlug(
  env,
  title,
  exceptEntryId = null
) {
  const base =
    normalizeSlug(title) || "activite";

  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = exceptEntryId
      ? await env.DB.prepare(`
          SELECT id
          FROM program_entries
          WHERE slug = ?
            AND id <> ?
          LIMIT 1
        `)
        .bind(candidate, exceptEntryId)
        .first()
      : await env.DB.prepare(`
          SELECT id
          FROM program_entries
          WHERE slug = ?
          LIMIT 1
        `)
        .bind(candidate)
        .first();

    if (!existing) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export function createProgramPublicId() {
  return `program_${generateRandomToken(12)}`;
}

export async function getEntryParticipants(
  env,
  entryId
) {
  const result = await env.DB.prepare(`
    SELECT
      creators.id,
      creators.slug,
      creators.twitch_login,
      creators.twitch_display_name,
      creators.twitch_profile_image_url,

      participants.is_primary,
      participants.display_order

    FROM program_entry_participants
      AS participants

    INNER JOIN creators
      ON creators.id =
        participants.creator_id

    WHERE participants.program_entry_id = ?

    ORDER BY
      participants.is_primary DESC,
      participants.display_order ASC,
      creators.display_order ASC
  `)
    .bind(entryId)
    .all();

  return (result.results ?? []).map(
    participant => ({
      id: Number(participant.id),
      slug: participant.slug,
      twitchLogin:
        participant.twitch_login,
      twitchDisplayName:
        participant.twitch_display_name,
      twitchProfileImageUrl:
        participant.twitch_profile_image_url,
      primary:
        Boolean(participant.is_primary),
      displayOrder:
        Number(
          participant.display_order ?? 0
        )
    })
  );
}

export async function getEntryGoal(
  env,
  goalId
) {
  if (!goalId) {
    return null;
  }

  const goal = await env.DB.prepare(`
    SELECT
      public_id,
      title,
      description_markdown,
      target_amount_cents,
      status,
      scope_type,
      creator_id
    FROM goals
    WHERE id = ?
    LIMIT 1
  `)
    .bind(goalId)
    .first();

  if (!goal) {
    return null;
  }

  return {
    publicId: goal.public_id,
    title: goal.title,
    descriptionMarkdown: goal.description_markdown ?? "",
    thresholdCents: Number(goal.target_amount_cents ?? 0),
    currency: goal.currency ?? "EUR",
    status: goal.status,
    scopeType: goal.scope_type,
    creatorId:
      goal.creator_id === null
        ? null
        : Number(goal.creator_id),

    reached:
      goal.status === "reached" ||
      goal.status === "completed"
  };
}

export async function mapProgramEntry(
  env,
  entry
) {
  const participants =
    await getEntryParticipants(
      env,
      entry.id
    );

  const primaryCreator =
    participants.find(
      participant => participant.primary
    ) ??
    participants[0] ??
    null;

  const goal =
    await getEntryGoal(
      env,
      entry.goal_id,
      primaryCreator?.id ?? null
    );

  return {
    id: Number(entry.id),
    publicId: entry.public_id,
    slug: entry.slug,
    title: entry.title,

    descriptionMarkdown:
      entry.description_markdown ?? "",

    category: entry.category,
    status: entry.status,

    startsAt: entry.starts_at,
    endsAt: entry.ends_at,
    eventDay: Number(entry.event_day),
    timezone:
      entry.timezone || EVENT_TIMEZONE,

    externalUrl: entry.external_url,

    goal,
    goalPublicId:
      goal?.publicId ?? null,

    goalCondition:
      entry.goal_condition ?? "always",

    fallbackEnabled:
      Boolean(entry.fallback_enabled),

    fallback:
      entry.fallback_enabled
        ? {
          title: entry.fallback_title,

          descriptionMarkdown:
            entry.fallback_description_markdown ?? "",

          category:
            entry.fallback_category,

          externalUrl:
            entry.fallback_external_url
        }
        : null,

    participants,
    primaryCreator,

    cancelledReason:
      entry.cancelled_reason,

    publishedAt: entry.published_at,
    cancelledAt: entry.cancelled_at,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at
  };
}