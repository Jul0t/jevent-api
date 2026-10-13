import {
  json
} from "../shared/responses.js";

export async function receiveTwitchStats(
  request,
  env
) {
  const authorization =
    request.headers.get("Authorization") ?? "";

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
        error: "Corps JSON invalide."
      },
      400
    );
  }

  const stats =
    Array.isArray(body.stats)
      ? body.stats.slice(0, 100)
      : [];

  let imported = 0;

  for (const row of stats) {
    const channel =
      String(row.channel ?? "")
        .trim()
        .toLowerCase();

    const statDate =
      String(row.date ?? "").trim();

    const messagesCount =
      Math.max(
        0,
        Math.floor(
          Number(row.messages ?? 0)
        )
      );

    const emotesCount =
      Math.max(
        0,
        Math.floor(
          Number(row.emotes ?? 0)
        )
      );

    if (
      !channel ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        statDate
      ) ||
      !Number.isFinite(messagesCount) ||
      !Number.isFinite(emotesCount)
    ) {
      continue;
    }

    const creator =
      await env.DB.prepare(`
        SELECT id
        FROM creators
        WHERE lower(twitch_login) = ?
          AND archived = 0
        LIMIT 1
      `)
        .bind(channel)
        .first();

    if (!creator) {
      continue;
    }

    await env.DB.prepare(`
      INSERT INTO twitch_chat_daily_stats (
        creator_id,
        stat_date,
        messages_count,
        emotes_count
      )
      VALUES (?, ?, ?, ?)

      ON CONFLICT (creator_id, stat_date)
      DO UPDATE SET
        messages_count =
          messages_count +
          excluded.messages_count,

        emotes_count =
          emotes_count +
          excluded.emotes_count
    `)
      .bind(
        Number(creator.id),
        statDate,
        messagesCount,
        emotesCount
      )
      .run();

    imported += 1;
  }

  return json({
    success: true,
    imported
  });
}