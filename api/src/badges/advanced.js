function normalizeAdvancedKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseConfiguration(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed =
      typeof value === "string"
        ? JSON.parse(value)
        : value;

    return (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    )
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function normalizeMetadata(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}

export async function unlockAdvancedBadges(
  env,
  {
    userId,
    advancedKey,
    metadata = {}
  }
) {
  const normalizedUserId =
    Number(userId);

  const normalizedKey =
    normalizeAdvancedKey(
      advancedKey
    );

  if (
    !Number.isInteger(
      normalizedUserId
    ) ||
    normalizedUserId < 1 ||
    !normalizedKey
  ) {
    throw new Error(
      "Déclenchement de badge invalide."
    );
  }

  /*
   * On charge uniquement les badges avancés
   * actuellement actifs.
   */

  const result =
    await env.DB.prepare(`
      SELECT
        badge_key,
        requirement_config_json
      FROM profile_badges
      WHERE active = 1
        AND acquisition_mode =
          'advanced'
        AND rule_key =
          'advanced'
    `).all();

  const matchingBadges =
    (result.results ?? [])
      .filter(badge => {
        const configuration =
          parseConfiguration(
            badge
              .requirement_config_json
          );

        return (
          normalizeAdvancedKey(
            configuration.advancedKey
          ) === normalizedKey
        );
      });

  if (
    matchingBadges.length === 0
  ) {
    return {
      success: true,
      advancedKey:
        normalizedKey,
      unlockedBadges: []
    };
  }

  const metadataJson =
    JSON.stringify({
      ...normalizeMetadata(metadata),

      advancedKey:
        normalizedKey
    });

  const statements =
    matchingBadges.map(badge =>
      env.DB.prepare(`
        INSERT INTO user_profile_badges (
          user_id,
          badge_key,
          source,
          awarded_by_user_id,
          awarded_at,
          metadata_json,
          revoked_at
        )
        VALUES (
          ?,
          ?,
          'automatic',
          NULL,
          CURRENT_TIMESTAMP,
          ?,
          NULL
        )

        ON CONFLICT (
          user_id,
          badge_key
        )
        DO UPDATE SET
          source = 'automatic',

          awarded_by_user_id =
            NULL,

          awarded_at =
            CASE
              WHEN
                user_profile_badges
                  .revoked_at
                IS NOT NULL
              THEN CURRENT_TIMESTAMP

              ELSE
                user_profile_badges
                  .awarded_at
            END,

          metadata_json =
            excluded.metadata_json,

          revoked_at =
            NULL
      `)
        .bind(
          normalizedUserId,
          badge.badge_key,
          metadataJson
        )
    );

  await env.DB.batch(statements);

  return {
    success: true,

    advancedKey:
      normalizedKey,

    unlockedBadges:
      matchingBadges.map(
        badge => badge.badge_key
      )
  };
}