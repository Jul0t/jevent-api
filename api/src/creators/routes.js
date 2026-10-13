import {
  json,
  notFound,
  validationError
} from "../shared/responses.js";

import {
  requireSuperAdmin,
  requireAuthentication
} from "../auth/permissions.js";

import {
  normalizeInteger,
  normalizeTwitchLogin,
  sanitizePlainText
} from "../shared/validation.js";

import {
  getTwitchUserByLogin
} from "../twitch/api.js";

import {
  creatorSlugExists,
  insertCreator,
  validateCreatorSlug
} from "./repository.js";

export async function searchCreatorRoute(
  request,
  env
) {
  const authorization =
    await requireSuperAdmin(request, env);

  if (!authorization.allowed) {
    return authorization.response;
  }

  const url = new URL(request.url);

  const login = normalizeTwitchLogin(
    url.searchParams.get("login")
  );

  const twitchUser =
    await getTwitchUserByLogin(env, login);

  if (!twitchUser) {
    return notFound(
      "Compte Twitch introuvable."
    );
  }

  return json({
    twitchUser: {
      id: twitchUser.id,
      login: twitchUser.login,
      displayName:
        twitchUser.display_name,
      profileImageUrl:
        twitchUser.profile_image_url,
      description:
        twitchUser.description
    },
    suggestedSlug: twitchUser.login
  });
}

export async function createCreatorRoute(
  request,
  env
) {
  const authorization =
    await requireSuperAdmin(request, env);

  if (!authorization.allowed) {
    return authorization.response;
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return validationError(
      "Corps JSON invalide."
    );
  }

  const login = normalizeTwitchLogin(
    body.twitchLogin
  );

  const twitchUser =
    await getTwitchUserByLogin(env, login);

  if (!twitchUser) {
    return notFound(
      "Compte Twitch introuvable."
    );
  }

  const existing = await env.DB.prepare(`
    SELECT id
    FROM creators
    WHERE twitch_id = ?
    LIMIT 1
  `)
    .bind(twitchUser.id)
    .first();

  if (existing) {
    return json(
      {
        error:
          "Ce compte Twitch est déjà inscrit."
      },
      409
    );
  }

  const slugValidation =
    validateCreatorSlug(
      body.slug || twitchUser.login
    );

  if (!slugValidation.valid) {
    return validationError(
      slugValidation.error
    );
  }

  if (
    await creatorSlugExists(
      env,
      slugValidation.slug
    )
  ) {
    return json(
      {
        error:
          "Ce slug est déjà utilisé."
      },
      409
    );
  }

  const creator = await insertCreator(
    env,
    {
      twitchUser,
      slug: slugValidation.slug,
      streamlabsMemberId:
        sanitizePlainText(
          body.streamlabsMemberId,
          100
        ),
      displayOrder:
        normalizeInteger(
          body.displayOrder,
          {
            minimum: 0,
            maximum: 1000,
            fallback: 100
          }
        ),
      createdByUserId:
        authorization.user.id
    }
  );

  return json(
    {
      success: true,
      creator
    },
    201
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
      ON users.id = creators.claimed_by_user_id

    ORDER BY
      creators.archived ASC,
      creators.display_order ASC,
      creators.twitch_display_name ASC
  `).all();

  const creators = (result.results ?? []).map(
    creator => ({
      id: Number(creator.id),
      publicId: creator.public_id,
      slug: creator.slug,

      twitchId: creator.twitch_id,
      twitchLogin: creator.twitch_login,
      twitchDisplayName:
        creator.twitch_display_name,
      twitchProfileImageUrl:
        creator.twitch_profile_image_url,

      streamlabsMemberId:
        creator.streamlabs_member_id,
      donationUrl: creator.donation_url,

      displayOrder: Number(
        creator.display_order ?? 100
      ),

      active: Boolean(creator.active),
      archived: Boolean(creator.archived),

      claimed: Boolean(
        creator.claimed_by_user_id
      ),

      claimedAt: creator.claimed_at,

      claimedBy: creator.claimed_by_user_id
        ? {
            id: Number(
              creator.claimed_by_user_id
            ),
            login: creator.claimed_by_login,
            displayName:
              creator.claimed_by_display_name
          }
        : null,

      onboardingCompleted: Boolean(
        creator.onboarding_completed_at
      ),

      createdAt: creator.created_at,
      updatedAt: creator.updated_at
    })
  );

  return json({ creators });
}