import {
  normalizeTwitchLogin,
  isValidTwitchLogin,
  sanitizePlainText
} from "../shared/validation.js";

export async function findUserByTwitchId(
  env,
  twitchId
) {
  return env.DB.prepare(`
    SELECT
      id,
      twitch_id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      disabled_at,
      created_at,
      updated_at
    FROM users
    WHERE twitch_id = ?
    LIMIT 1
  `)
    .bind(String(twitchId))
    .first();
}

export async function upsertTwitchUser(
  env,
  twitchUser
) {
  const twitchId = sanitizePlainText(
    twitchUser?.id,
    50
  );

  const twitchLogin = normalizeTwitchLogin(
    twitchUser?.login
  );

  const displayName = sanitizePlainText(
    twitchUser?.display_name ||
      twitchUser?.login,
    100
  );

  const profileImageUrl = sanitizePlainText(
    twitchUser?.profile_image_url,
    1000
  );

  if (
    !twitchId ||
    !isValidTwitchLogin(twitchLogin) ||
    !displayName
  ) {
    throw new Error(
      "Le compte Twitch reçu est invalide."
    );
  }

  await env.DB.prepare(`
    INSERT INTO users (
      twitch_id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(twitch_id)
    DO UPDATE SET
      twitch_login =
        excluded.twitch_login,
      twitch_display_name =
        excluded.twitch_display_name,
      twitch_profile_image_url =
        excluded.twitch_profile_image_url,
      updated_at =
        CURRENT_TIMESTAMP
  `)
    .bind(
      twitchId,
      twitchLogin,
      displayName,
      profileImageUrl || null
    )
    .run();

  return findUserByTwitchId(
    env,
    twitchId
  );
}

export async function ensureViewerRole(
  env,
  userId
) {
  const existingRole = await env.DB.prepare(`
    SELECT
      role_key,
      revoked_at
    FROM user_roles
    WHERE user_id = ?
      AND role_key = 'viewer'
    LIMIT 1
  `)
    .bind(userId)
    .first();

  if (!existingRole) {
    await env.DB.prepare(`
      INSERT INTO user_roles (
        user_id,
        role_key,
        granted_by_user_id,
        granted_at,
        revoked_at
      )
      VALUES (
        ?,
        'viewer',
        NULL,
        CURRENT_TIMESTAMP,
        NULL
      )
    `)
      .bind(userId)
      .run();

    return;
  }

  if (existingRole.revoked_at) {
    await env.DB.prepare(`
      UPDATE user_roles
      SET
        revoked_at = NULL,
        granted_at = CURRENT_TIMESTAMP,
        granted_by_user_id = NULL
      WHERE user_id = ?
        AND role_key = 'viewer'
    `)
      .bind(userId)
      .run();
  }
}