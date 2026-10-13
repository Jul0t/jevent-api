import {
  json
} from "../shared/responses.js";

export async function listTwitchChannels(
  request,
  env
) {
  const authorization =
    request.headers.get("Authorization");

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

  const result = await env.DB.prepare(`
    SELECT twitch_login
    FROM creators
    WHERE active = 1
      AND archived = 0
      AND twitch_login IS NOT NULL
      AND TRIM(twitch_login) != ''
    ORDER BY
      display_order ASC,
      twitch_display_name COLLATE NOCASE ASC
  `).all();

  return json({
    channels:
      (result.results ?? [])
        .map(creator =>
          String(
            creator.twitch_login
          )
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
  });
}