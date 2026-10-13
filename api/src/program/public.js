import {
  json,
  notFound
} from "../shared/responses.js";

import {
  EVENT_START,
  EVENT_END,
  EVENT_TIMEZONE,
  findProgramEntry,
  mapProgramEntry
} from "./repository.js";

import {
  normalizeSlug,
  normalizeInteger
} from "../shared/validation.js";

export const PROGRAM_START =
  "2026-10-25T00:00:00+02:00";

export const PROGRAM_END =
  "2026-11-05T23:59:59+01:00";

export const PUBLIC_EVENT_START =
  "2026-10-26T16:00:00+01:00";

export const PUBLIC_EVENT_END =
  "2026-10-29T04:00:00+01:00";

export async function listPublicProgram(
  request,
  env
) {
  const url = new URL(request.url);

  const day = normalizeInteger(
    url.searchParams.get("day"),
    {
      minimum: 1,
      maximum: 3,
      fallback: 0
    }
  );

  const creatorSlug = normalizeSlug(
    url.searchParams.get("creator")
  );

  const bindings = Array.of();
  let creatorJoin = "";
  let conditions =
    "WHERE entries.status = 'published'";

  if (day) {
    conditions +=
      " AND entries.event_day = ?";

    bindings.push(day);
  }

  if (creatorSlug) {
    creatorJoin = `
      INNER JOIN program_entry_participants
        AS creator_filter
        ON creator_filter.program_entry_id =
          entries.id

      INNER JOIN creators AS creator_search
        ON creator_search.id =
          creator_filter.creator_id
    `;

    conditions +=
      " AND creator_search.slug = ?";

    bindings.push(creatorSlug);
  }

  const result = await env.DB.prepare(`
    SELECT DISTINCT entries.*

    FROM program_entries AS entries

    ${creatorJoin}

    ${conditions}

    ORDER BY
      entries.starts_at ASC,
      entries.id ASC
  `)
    .bind(...bindings)
    .all();

  const program = await Promise.all(
    (result.results ?? []).map(
      entry =>
        mapProgramEntry(env, entry)
    )
  );

  return json({
    program,

    filters: {
      day: day || null,
      creator: creatorSlug || null
    },

    event: {
      name: "JEvent 26",
      association: "Association Petits Princes",
      startsAt: PUBLIC_EVENT_START,
      endsAt: PUBLIC_EVENT_END,
      timezone: EVENT_TIMEZONE,

      days: [
        {
          day: 1,
          date: "2026-10-26"
        },
        {
          day: 2,
          date: "2026-10-27"
        },
        {
          day: 3,
          date: "2026-10-28",
          endsOn: "2026-10-29"
        }
      ]
    }
  });
}
export async function listPublicProgramByCreator(
  request,
  env,
  creatorSlug
) {
  const creator = await env.DB.prepare(`
    SELECT
      id,
      slug,
      twitch_display_name
    FROM creators
    WHERE slug = ?
      AND active = 1
      AND archived = 0
    LIMIT 1
  `)
    .bind(String(creatorSlug).toLowerCase())
    .first();

  if (!creator) {
    return json(
      {
        error: "Ce créateur n’existe pas."
      },
      404
    );
  }

  const result = await env.DB.prepare(`
    SELECT entries.*
    FROM program_entries AS entries
    WHERE entries.status
      IN ('published', 'cancelled')

      AND EXISTS (
        SELECT 1
        FROM program_entry_participants
          AS participants

        WHERE participants.program_entry_id =
          entries.id

          AND participants.creator_id = ?

          AND participants.is_primary = 1
      )

    ORDER BY
      entries.starts_at ASC,
      entries.id ASC
  `)
    .bind(creator.id)
    .all();

  const entries = await Promise.all(
    (result.results ?? []).map(
      entry =>
        mapProgramEntry(env, entry)
    )
  );

  return json({
    creator: {
      id: Number(creator.id),
      slug: creator.slug,
      displayName:
        creator.twitch_display_name
    },

    entries
  });
}

export async function getPublicProgramEntry(
  request,
  env,
  publicId
) {
  const entry = await findProgramEntry(
    env,
    publicId
  );

  if (
    !entry ||
    entry.status !== "published"
  ) {
    return notFound(
      "Activité introuvable."
    );
  }

  return json({
    entry: await mapProgramEntry(
      env,
      entry
    )
  });
}
