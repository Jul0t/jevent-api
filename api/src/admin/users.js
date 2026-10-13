import {
  json
} from "../shared/responses.js";

import {
  requireAdminAccess
} from "./access.js";

async function requireSuperAdmin(
  request,
  env
) {
  const access =
    await requireAdminAccess(
      request,
      env
    );

  if (!access.allowed) {
    return access;
  }

  if (
    !access.user.permissions
      ?.isSuperAdmin
  ) {
    return {
      allowed: false,

      response: json(
        {
          error:
            "Seuls les super-administrateurs peuvent gérer les rôles."
        },
        403
      )
    };
  }

  return access;
}

export async function listAdminUsers(
  request,
  env
) {
  const access =
    await requireSuperAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        users.id,
        users.twitch_id,
        users.twitch_login,
        users.twitch_display_name,
        users.twitch_profile_image_url,
        users.is_active,
        users.created_at,
        users.disabled_at,

        CASE
          WHEN EXISTS (
            SELECT 1
            FROM user_roles
            WHERE user_roles.user_id =
              users.id
              AND user_roles.role_key =
                'super_admin'
              AND user_roles.revoked_at
                IS NULL
          )
          THEN 1
          ELSE 0
        END AS is_super_admin

      FROM users

      ORDER BY
        users.twitch_display_name
          COLLATE NOCASE ASC
    `).all();

  return json({
    currentUserId:
      Number(access.user.id),

    users:
      (result.results ?? []).map(
        user => ({
          id: Number(user.id),

          twitchId:
            user.twitch_id,

          twitchLogin:
            user.twitch_login,

          twitchDisplayName:
            user.twitch_display_name,

          twitchProfileImageUrl:
            user.twitch_profile_image_url,

          active:
            Boolean(user.is_active),

          superAdmin:
            Boolean(
              user.is_super_admin
            ),

          createdAt:
            user.created_at,

          disabledAt:
            user.disabled_at
        })
      )
  });
}

export async function updateUserSuperAdminRole(
  request,
  env,
  userIdValue
) {
  const access =
    await requireSuperAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const userId =
    Number(userIdValue);

  if (
    !Number.isInteger(userId) ||
    userId < 1
  ) {
    return json(
      {
        error:
          "Le compte sélectionné est invalide."
      },
      400
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

  if (
    typeof body?.enabled !==
    "boolean"
  ) {
    return json(
      {
        error:
          "La valeur « enabled » est obligatoire."
      },
      400
    );
  }

  const user =
    await env.DB.prepare(`
      SELECT
        id,
        twitch_login,
        twitch_display_name
      FROM users
      WHERE id = ?
      LIMIT 1
    `)
      .bind(userId)
      .first();

  if (!user) {
    return json(
      {
        error:
          "Ce compte n’existe pas."
      },
      404
    );
  }

  if (body.enabled) {
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
        'super_admin',
        ?,
        CURRENT_TIMESTAMP,
        NULL
      )

      ON CONFLICT (
        user_id,
        role_key
      )
      DO UPDATE SET
        granted_by_user_id =
          excluded.granted_by_user_id,

        granted_at =
          CURRENT_TIMESTAMP,

        revoked_at =
          NULL
    `)
      .bind(
        userId,
        Number(access.user.id)
      )
      .run();

    return json({
      success: true,
      userId,
      superAdmin: true
    });
  }

  /*
   * Empêche un Admin de retirer
   * accidentellement son propre accès.
   */

  if (
    userId ===
    Number(access.user.id)
  ) {
    return json(
      {
        error:
          "Tu ne peux pas retirer ton propre accès super-admin."
      },
      400
    );
  }

  /*
   * La condition COUNT protège le dernier
   * super-admin directement dans la requête.
   */

  const result =
    await env.DB.prepare(`
      UPDATE user_roles

      SET revoked_at =
        CURRENT_TIMESTAMP

      WHERE user_id = ?
        AND role_key =
          'super_admin'

        AND revoked_at IS NULL

        AND (
          SELECT COUNT(*)
          FROM user_roles
          WHERE role_key =
            'super_admin'
            AND revoked_at IS NULL
        ) > 1
    `)
      .bind(userId)
      .run();

  if (
    Number(result.meta?.changes ?? 0) ===
    0
  ) {
    return json(
      {
        error:
          "Le rôle n’a pas été retiré. Ce compte n’est peut-être pas Admin, ou il s’agit du dernier super-admin."
      },
      400
    );
  }

  return json({
    success: true,
    userId,
    superAdmin: false
  });
}