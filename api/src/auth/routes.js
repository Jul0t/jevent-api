import {
  json
} from "../shared/responses.js";

import {
  getAuthenticatedUser
} from "./permissions.js";

import {
  deleteSession,
  createExpiredSessionCookie
} from "./sessions.js";

import {
  withCookie
} from "./cookies.js";

export async function getCurrentUserRoute(
  request,
  env
) {
  const authentication =
    await getAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return json({
      authenticated: false,
      user: null
    });
  }

  return json({
    authenticated: true,
    user: authentication.user,
    session: {
      expiresAt:
        authentication.session.expiresAt
    }
  });
}

export async function logoutRoute(
  request,
  env
) {
  await deleteSession(request, env);

  return withCookie(
    json({ success: true }),
    createExpiredSessionCookie()
  );
}

export async function listAdminCreatorsRoute(
  request,
  env
) {
  const authorization =
    await requireSuperAdmin(request, env);

  if (!authorization.allowed) {
    return authorization.response;
  }

  const result = await env.DB.prepare(`
    SELECT
      creators.id,
      creators.public_id,
      creators.slug,
      creators.twitch_id,
      creators.twitch_login,
      creators.twitch_display_name,
      creators.twitch_profile_image_url,
      creators.streamlabs_member_id,
      creators.donation_url,
      creators.display_order,
      creators.active,
      creators.archived,
      creators.claimed_by_user_id,
      creators.claimed_at,
      creators.onboarding_completed_at,
      creators.created_at,
      creators.updated_at,

      users.twitch_display_name
        AS claimed_by_display_name,

      users.twitch_login
        AS claimed_by_login

    FROM creators

    LEFT JOIN users
      ON users.id =
        creators.claimed_by_user_id

    ORDER BY
      creators.archived ASC,
      creators.display_order ASC,
      creators.twitch_display_name ASC
  `).all();

  return json({
    creators: (result.results ?? []).map(
      creator => ({
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
        donationUrl:
          creator.donation_url,

        displayOrder:
          Number(
            creator.display_order ?? 100
          ),

        active:
          Boolean(creator.active),
        archived:
          Boolean(creator.archived),

        claimed:
          Boolean(
            creator.claimed_by_user_id
          ),

        claimedAt:
          creator.claimed_at,

        claimedBy:
          creator.claimed_by_user_id
            ? {
                id: Number(
                  creator
                    .claimed_by_user_id
                ),
                login:
                  creator
                    .claimed_by_login,
                displayName:
                  creator
                    .claimed_by_display_name
              }
            : null,

        onboardingCompleted:
          Boolean(
            creator
              .onboarding_completed_at
          ),

        createdAt:
          creator.created_at,
        updatedAt:
          creator.updated_at
      })
    )
  });
}