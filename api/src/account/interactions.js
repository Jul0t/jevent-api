function normalizeInteractionKey(
  value
) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export async function recordSiteInteraction(
  env,
  {
    userId,
    interactionKey,
    eventKey = null,
    eventDay = null,
    amount = 1
  }
) {
  const normalizedUserId =
    Number(userId);

  const normalizedKey =
    normalizeInteractionKey(
      interactionKey
    );

  const normalizedEventKey =
    String(eventKey ?? "")
      .trim()
      .slice(0, 80);

  const normalizedEventDay =
    [1, 2, 3].includes(
      Number(eventDay)
    )
      ? Number(eventDay)
      : 0;

  const normalizedAmount =
    Math.min(
      10_000,
      Math.max(
        1,
        Math.floor(
          Number(amount) || 1
        )
      )
    );

  if (
    !Number.isInteger(
      normalizedUserId
    ) ||
    normalizedUserId < 1 ||
    !normalizedKey
  ) {
    throw new Error(
      "Interaction utilisateur invalide."
    );
  }

  await env.DB.prepare(`
    INSERT INTO user_site_interaction_stats (
      user_id,
      interaction_key,
      event_key,
      event_day,
      interaction_count,
      first_interaction_at,
      last_interaction_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT (
      user_id,
      interaction_key,
      event_key,
      event_day
    )
    DO UPDATE SET
      interaction_count =
        user_site_interaction_stats
          .interaction_count
        + excluded.interaction_count,

      last_interaction_at =
        CURRENT_TIMESTAMP
  `)
    .bind(
      normalizedUserId,
      normalizedKey,
      normalizedEventKey,
      normalizedEventDay,
      normalizedAmount
    )
    .run();
}