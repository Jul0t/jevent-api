import {
  json
} from "../shared/responses.js";

const EVENT_KEY = "jevent-2026";

function cleanText(
  value,
  maximumLength = 100
) {
  return String(value ?? "")
    .trim()
    .slice(0, maximumLength);
}

function cleanCount(value) {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return 0;
  }

  return Math.min(
    Math.floor(number),
    1_000_000
  );
}

function cleanEventDay(value) {
  const day = Number(value);

  return [1, 2, 3].includes(day)
    ? day
    : null;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value ?? "")
  );
}

export async function ingestTwitchViewerStats(
  request,
  env
) {
  const authorization =
    request.headers.get(
      "Authorization"
    );

  if (
    !env.JEVENT_BOT_TOKEN ||
    authorization !==
      `Bearer ${env.JEVENT_BOT_TOKEN}`
  ) {
    return json(
      {
        error: "Accès refusé."
      },
      401
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        error:
          "Le contenu envoyé est invalide."
      },
      400
    );
  }

  if (!Array.isArray(body?.stats)) {
    return json(
      {
        error:
          "La liste des statistiques est obligatoire."
      },
      400
    );
  }

  if (body.stats.length > 5000) {
    return json(
      {
        error:
          "Trop de statistiques envoyées en une seule fois."
      },
      400
    );
  }

  const rows = body.stats
    .map(row => ({
      channel:
        cleanText(
          row.channel,
          100
        ).toLowerCase(),

      date:
        cleanText(
          row.date,
          10
        ),

      eventDay:
        cleanEventDay(
          row.eventDay
        ),

      viewerTwitchId:
        cleanText(
          row.viewerTwitchId,
          100
        ),

      viewerTwitchLogin:
        cleanText(
          row.viewerTwitchLogin,
          100
        ).toLowerCase(),

      viewerTwitchDisplayName:
        cleanText(
          row.viewerTwitchDisplayName,
          100
        ),

      messages:
        cleanCount(
          row.messages
        ),

      emotes:
        cleanCount(
          row.emotes
        ),

      firstSeenAt:
        cleanText(
          row.firstSeenAt,
          40
        ) || null,

      lastSeenAt:
        cleanText(
          row.lastSeenAt,
          40
        ) || null
    }))
    .filter(row =>
      row.channel &&
      row.viewerTwitchId &&
      validDate(row.date) &&
      (
        row.messages > 0 ||
        row.emotes > 0
      )
    );

  if (rows.length === 0) {
    return json({
      success: true,
      accepted: 0,
      ignored: body.stats.length
    });
  }

  const channels = [
    ...new Set(
      rows.map(row => row.channel)
    )
  ];

  const placeholders =
    channels
      .map(() => "?")
      .join(", ");

  const creatorsResult =
    await env.DB.prepare(`
      SELECT
        id,
        LOWER(twitch_login)
          AS twitch_login
      FROM creators
      WHERE active = 1
        AND archived = 0
        AND LOWER(twitch_login)
          IN (${placeholders})
    `)
      .bind(...channels)
      .all();

  const creatorsByChannel =
    new Map(
      (creatorsResult.results ?? [])
        .map(creator => [
          creator.twitch_login,
          Number(creator.id)
        ])
    );

  const statements = [];

  for (const row of rows) {
    const creatorId =
      creatorsByChannel.get(
        row.channel
      );

    if (!creatorId) {
      continue;
    }

    statements.push(
      env.DB.prepare(`
        INSERT INTO viewer_chat_daily_stats (
          event_key,
          viewer_twitch_id,
          viewer_twitch_login,
          viewer_twitch_display_name,
          creator_id,
          stat_date,
          event_day,
          messages_count,
          emotes_count,
          first_seen_at,
          last_seen_at,
          created_at,
          updated_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          COALESCE(?, CURRENT_TIMESTAMP),
          COALESCE(?, CURRENT_TIMESTAMP),
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )

        ON CONFLICT (
          event_key,
          viewer_twitch_id,
          creator_id,
          stat_date
        )
        DO UPDATE SET
          viewer_twitch_login =
            excluded.viewer_twitch_login,

          viewer_twitch_display_name =
            excluded.viewer_twitch_display_name,

          event_day =
            COALESCE(
              excluded.event_day,
              viewer_chat_daily_stats.event_day
            ),

          messages_count =
            viewer_chat_daily_stats.messages_count +
            excluded.messages_count,

          emotes_count =
            viewer_chat_daily_stats.emotes_count +
            excluded.emotes_count,

          first_seen_at =
            CASE
              WHEN
                viewer_chat_daily_stats.first_seen_at
                  IS NULL
              THEN excluded.first_seen_at

              WHEN
                excluded.first_seen_at <
                viewer_chat_daily_stats.first_seen_at
              THEN excluded.first_seen_at

              ELSE
                viewer_chat_daily_stats.first_seen_at
            END,

          last_seen_at =
            CASE
              WHEN
                viewer_chat_daily_stats.last_seen_at
                  IS NULL
              THEN excluded.last_seen_at

              WHEN
                excluded.last_seen_at >
                viewer_chat_daily_stats.last_seen_at
              THEN excluded.last_seen_at

              ELSE
                viewer_chat_daily_stats.last_seen_at
            END,

          updated_at =
            CURRENT_TIMESTAMP
      `)
        .bind(
          EVENT_KEY,
          row.viewerTwitchId,
          row.viewerTwitchLogin ||
            null,
          row.viewerTwitchDisplayName ||
            null,
          creatorId,
          row.date,
          row.eventDay,
          row.messages,
          row.emotes,
          row.firstSeenAt,
          row.lastSeenAt
        )
    );
  }

  if (statements.length > 0) {
    await env.DB.batch(
      statements
    );
  }

  return json({
    success: true,
    accepted: statements.length,
    ignored:
      body.stats.length -
      statements.length
  });
}