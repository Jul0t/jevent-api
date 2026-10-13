import {
  getSession
} from "./sessions.js";

import {
  unauthorized,
  forbidden
} from "../shared/responses.js";

export const AVAILABLE_ROLES = new Set([
  "viewer",
  "creator",
  "moderator",
  "super_admin"
]);

export async function getUserRoles(
  env,
  userId
) {
  const result = await env.DB.prepare(`
    SELECT role_key
    FROM user_roles
    WHERE user_id = ?
      AND revoked_at IS NULL
    ORDER BY role_key ASC
  `)
    .bind(userId)
    .all();

  return (result.results ?? []).map(
    row => row.role_key
  );
}

export function hasRole(roles, role) {
  return (
    Array.isArray(roles) &&
    roles.includes(role)
  );
}

export function hasAnyRole(
  roles,
  expectedRoles
) {
  if (
    !Array.isArray(roles) ||
    !Array.isArray(expectedRoles)
  ) {
    return false;
  }

  return expectedRoles.some(
    role => roles.includes(role)
  );
}

export async function getCreatorMemberships(
  env,
  userId
) {
  const result = await env.DB.prepare(`
    SELECT
      creator_members.id,
      creator_members.creator_id,
      creator_members.member_role,
      creator_members.status,

      creators.slug,
      creators.twitch_login,
      creators.twitch_display_name,
      creators.twitch_profile_image_url

    FROM creator_members

    INNER JOIN creators
      ON creators.id =
        creator_members.creator_id

    WHERE creator_members.user_id = ?
      AND creator_members.status = 'approved'
      AND creators.archived = 0

    ORDER BY creators.display_order ASC
  `)
    .bind(userId)
    .all();

  return (result.results ?? []).map(
    membership => ({
      id: Number(membership.id),

      creatorId:
        Number(membership.creator_id),

      memberRole:
        membership.member_role,

      status:
        membership.status,

      creator: {
        slug:
          membership.slug,

        login:
          membership.twitch_login,

        displayName:
          membership.twitch_display_name,

        profileImageUrl:
          membership
            .twitch_profile_image_url
      }
    })
  );
}

export async function getAuthenticatedUser(
  request,
  env
) {
  const session = await getSession(
    request,
    env
  );

  if (!session) {
    return null;
  }

  const [roles, creatorMemberships] =
    await Promise.all([
      getUserRoles(env, session.userId),

      getCreatorMemberships(
        env,
        session.userId
      )
    ]);

  return {
    session,

    user: {
      ...session.user,
      roles,
      creatorMemberships,

      permissions: {
        isViewer: true,

        isCreator:
          hasRole(roles, "creator"),

        isGlobalModerator:
          hasAnyRole(roles, [
            "moderator",
            "super_admin"
          ]),

        isSuperAdmin:
          hasRole(roles, "super_admin"),

        canAccessCreatorPanel:
          creatorMemberships.length > 0 ||
          hasRole(roles, "super_admin"),

        canAccessGlobalModeration:
          hasAnyRole(roles, [
            "moderator",
            "super_admin"
          ]),

        canAccessAdministration:
          hasRole(roles, "super_admin")
      }
    }
  };
}

export async function requireAuthentication(
  request,
  env
) {
  const authentication =
    await getAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return {
      allowed: false,
      response: unauthorized()
    };
  }

  return {
    allowed: true,
    ...authentication
  };
}

export async function requireAnyRole(
  request,
  env,
  requiredRoles
) {
  const authentication =
    await requireAuthentication(
      request,
      env
    );

  if (!authentication.allowed) {
    return authentication;
  }

  if (!Array.isArray(requiredRoles)) {
    throw new TypeError(
      "requiredRoles doit être un tableau."
    );
  }

  if (
    !hasAnyRole(
      authentication.user.roles,
      requiredRoles
    )
  ) {
    return {
      allowed: false,

      response: forbidden(
        "Tu ne possèdes pas les droits requis."
      )
    };
  }

  return authentication;
}

export function requireSuperAdmin(
  request,
  env
) {
  return requireAnyRole(
    request,
    env,
    Array.of("super_admin")
  );
}

export function requireGlobalModerator(
  request,
  env
) {
  return requireAnyRole(
    request,
    env,
    Array.of("moderator", "super_admin")
  );
}
