import {
  generateRandomToken
} from "../shared/security.js";

export async function ensureCreatorRole(
  env,
  userId
) {
  const role = await env.DB.prepare(`
    SELECT role_key, revoked_at
    FROM user_roles
    WHERE user_id = ?
      AND role_key = 'creator'
    LIMIT 1
  `)
    .bind(userId)
    .first();

  if (!role) {
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
        'creator',
        NULL,
        CURRENT_TIMESTAMP,
        NULL
      )
    `)
      .bind(userId)
      .run();

    return;
  }

  if (role.revoked_at) {
    await env.DB.prepare(`
      UPDATE user_roles
      SET
        revoked_at = NULL,
        granted_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND role_key = 'creator'
    `)
      .bind(userId)
      .run();
  }
}

export async function ensureCreatorOwnership(
  env,
  creatorId,
  userId
) {
  const existing = await env.DB.prepare(`
    SELECT id, status
    FROM creator_members
    WHERE creator_id = ?
      AND user_id = ?
      AND member_role = 'owner'
    LIMIT 1
  `)
    .bind(creatorId, userId)
    .first();

  if (existing) {
    if (existing.status !== "approved") {
      await env.DB.prepare(`
        UPDATE creator_members
        SET
          status = 'approved',
          approved_at = CURRENT_TIMESTAMP,
          rejected_at = NULL,
          revoked_at = NULL
        WHERE id = ?
      `)
        .bind(existing.id)
        .run();
    }

    return;
  }

  await env.DB.prepare(`
    INSERT INTO creator_members (
      public_id,
      creator_id,
      user_id,
      member_role,
      status,
      reason,
      proposed_by_user_id,
      approved_by_user_id,
      created_at,
      approved_at
    )
    VALUES (
      ?,
      ?,
      ?,
      'owner',
      'approved',
      'Propriétaire de la chaîne Twitch',
      NULL,
      NULL,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      `cma_${generateRandomToken(12)}`,
      creatorId,
      userId
    )
    .run();
}