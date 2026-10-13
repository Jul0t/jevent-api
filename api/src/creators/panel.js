import {
  json,
  forbidden,
  notFound,
  validationError
} from "../shared/responses.js";

import {
  requireAuthentication
} from "../auth/permissions.js";

import {
  normalizeInteger
} from "../shared/validation.js";

import {
  unlockAdvancedBadges
} from "../badges/advanced.js";

export async function resolveCreatorAccess(
  request,
  env
) {
  const authorization =
    await requireAuthentication(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization;
  }

  const url = new URL(request.url);

  const requestedCreatorId =
    normalizeInteger(
      url.searchParams.get("creatorId"),
      {
        minimum: 1,
        fallback: 0
      }
    );

  const memberships =
    authorization.user.creatorMemberships ??
    Array.of();

  let membership = null;

  if (requestedCreatorId) {
    membership = memberships.find(
      item =>
        Number(item.creatorId) ===
        requestedCreatorId
    );

    if (
      !membership &&
      !authorization.user.permissions
        .isSuperAdmin
    ) {
      return {
        allowed: false,
        response: forbidden(
          "Tu n’as pas accès à ce créateur."
        )
      };
    }

    return {
      ...authorization,
      creatorId: requestedCreatorId,
      membership
    };
  }

  membership =
    memberships.find(
      item => item.memberRole === "owner"
    ) ??
    memberships.find(
      item => item.memberRole === "delegate"
    ) ??
    memberships[0] ??
    null;

  if (!membership) {
    return {
      allowed: false,
      response: forbidden(
        "Aucun profil créateur ne t’est associé."
      )
    };
  }

  return {
    ...authorization,
    creatorId: Number(
      membership.creatorId
    ),
    membership
  };
}

export async function getCreatorPanel(
  request,
  env
) {
  const access = await resolveCreatorAccess(
    request,
    env
  );

  if (!access.allowed) {
    return access.response;
  }

  const creator = await env.DB.prepare(`
    SELECT
      id,
      public_id,
      slug,
      twitch_id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      streamlabs_member_id,
      streamlabs_goal_url,
      
      donation_url,
      display_order,
      active,
      archived,
      claimed_by_user_id,
      claimed_at,
      onboarding_completed_at,
      created_at,
      updated_at
    FROM creators
    WHERE id = ?
    LIMIT 1
  `)
    .bind(access.creatorId)
    .first();

  if (!creator) {
    return notFound(
      "Profil créateur introuvable."
    );
  }

  return json({
    creator: {
      id: Number(creator.id),
      publicId: creator.public_id,
      slug: creator.slug,

      twitchId: creator.twitch_id,
      twitchLogin:
        creator.twitch_login,
      twitchDisplayName:
        creator.twitch_display_name,
      twitchProfileImageUrl:
        creator.twitch_profile_image_url,

      streamlabsMemberId:
        creator.streamlabs_member_id,
      streamlabsGoalConfigured:
        Boolean(creator.streamlabs_goal_url),
      donationUrl:
        creator.donation_url,

      displayOrder: Number(
        creator.display_order ?? 100
      ),

      active: Boolean(creator.active),
      archived: Boolean(creator.archived),
      claimed: Boolean(
        creator.claimed_by_user_id
      ),
      claimedAt: creator.claimed_at,

      onboardingCompleted: Boolean(
        creator.onboarding_completed_at
      ),

      createdAt: creator.created_at,
      updatedAt: creator.updated_at
    },

    access: {
      memberRole:
        access.membership?.memberRole ??
        (
          access.user.permissions.isSuperAdmin
            ? "super_admin"
            : null
        ),

      isOwner:
        access.membership?.memberRole ===
        "owner",

      isDelegate:
        access.membership?.memberRole ===
        "delegate",

      isCreatorModerator:
        access.membership?.memberRole ===
        "creator_moderator",

      isSuperAdmin:
        access.user.permissions.isSuperAdmin,

      canEditProfile:
        access.user.permissions.isSuperAdmin ||
        Array.of("owner", "delegate").includes(
          access.membership?.memberRole
        ),

      canProposeStaff:
        access.user.permissions.isSuperAdmin ||
        access.membership?.memberRole ===
        "owner"
    }
  });
}

export async function updateCreatorStreamlabsGoalUrl(
  request,
  env
) {
  const access = await resolveCreatorAccess(
    request,
    env
  );

  if (!access.allowed) {
    return access.response;
  }

  const canEdit =
    access.user.permissions.isSuperAdmin ||
    access.membership?.memberRole === "owner";

  if (!canEdit) {
    return forbidden(
      "Tu ne peux pas modifier ce créateur."
    );
  }

  const body = await request.json();

  const rawUrl = String(
    body.streamlabsGoalUrl ?? ""
  ).trim();

  let streamlabsGoalUrl = null;

  if (rawUrl) {
    try {
      const url = new URL(rawUrl);

      const valid =
        url.protocol === "https:" &&
        url.hostname ===
        "streamlabscharity.com" &&
        url.pathname.startsWith(
          "/api/v1/widgets/milestones/"
        );

      if (!valid) {
        return validationError(
          "Ce lien Streamlabs Charity n’est pas valide."
        );
      }

      streamlabsGoalUrl = url.toString();
    } catch {
      return validationError(
        "Ce lien Streamlabs Charity n’est pas valide."
      );
    }
  }

  await env.DB.prepare(`
    UPDATE creators
    SET
      streamlabs_goal_url = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(
      streamlabsGoalUrl,
      access.creatorId
    )
    .run();

  return json({
    success: true,
    streamlabsGoalConfigured:
      Boolean(streamlabsGoalUrl)
  });
}

export async function completeCreatorOnboarding(
  request,
  env
) {
  const access = await resolveCreatorAccess(
    request,
    env
  );

  if (!access.allowed) {
    return access.response;
  }

  const canComplete =
    access.user.permissions.isSuperAdmin ||
    Array.of("owner", "delegate").includes(
      access.membership?.memberRole
    );

  if (!canComplete) {
    return forbidden(
      "Tu ne peux pas terminer cet onboarding."
    );
  }

  const creator = await env.DB.prepare(`
  SELECT
    id,
    claimed_by_user_id,
    onboarding_completed_at
  FROM creators
  WHERE id = ?
  LIMIT 1
`)
    .bind(access.creatorId)
    .first();

  if (!creator) {
    return notFound(
      "Profil créateur introuvable."
    );
  }

  await env.DB.prepare(`
    UPDATE creators
    SET
      onboarding_completed_at = COALESCE(
        onboarding_completed_at,
        CURRENT_TIMESTAMP
      ),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(access.creatorId)
    .run();

  /*
* Le badge doit être attribué au propriétaire
* du profil, pas forcément à l’Admin ayant
* terminé l’onboarding.
*/

  const badgeUserId =
    Number(
      creator.claimed_by_user_id ??
      (
        access.membership
          ?.memberRole === "owner"
          ? access.user.id
          : 0
      )
    );

  let unlockedBadges = [];

  if (badgeUserId) {
    const badgeResult =
      await unlockAdvancedBadges(
        env,
        {
          userId:
            badgeUserId,

          advancedKey:
            "creator-onboarding-completed",

          metadata: {
            creatorId:
              Number(access.creatorId)
          }
        }
      );

    unlockedBadges =
      badgeResult.unlockedBadges;
  }

  return json({
    success: true,
    creatorId: access.creatorId,
    onboardingCompleted: true,
    alreadyCompleted: Boolean(
      creator.onboarding_completed_at
    ),
    unlockedBadges
  });
}