import {
  findCreatorByTwitchId
} from "./repository.js";

import {
  ensureCreatorOwnership,
  ensureCreatorRole
} from "./memberships.js";

export async function attachPreRegisteredCreator(
  env,
  user
) {
  const twitchId =
    user.twitch_id ??
    user.twitchId;

  const twitchLogin =
    user.twitch_login ??
    user.login;

  const twitchDisplayName =
    user.twitch_display_name ??
    user.displayName;

  const twitchProfileImageUrl =
    user.twitch_profile_image_url ??
    user.profileImageUrl ??
    null;

  if (!twitchId || !user.id) {
    return null;
  }

  const creator =
    await findCreatorByTwitchId(
      env,
      twitchId
    );

  if (
    !creator ||
    Boolean(creator.archived)
  ) {
    return null;
  }

  if (
    creator.claimed_by_user_id &&
    Number(creator.claimed_by_user_id) !==
      Number(user.id)
  ) {
    throw new Error(
      "Ce profil créateur est déjà lié à un autre compte."
    );
  }

  await ensureCreatorOwnership(
    env,
    Number(creator.id),
    Number(user.id)
  );

  await ensureCreatorRole(
    env,
    Number(user.id)
  );

  await env.DB.prepare(`
    UPDATE creators
    SET
      twitch_login = ?,
      twitch_display_name = ?,
      twitch_profile_image_url = ?,
      claimed_by_user_id = ?,
      claimed_at = COALESCE(
        claimed_at,
        CURRENT_TIMESTAMP
      ),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(
      twitchLogin,
      twitchDisplayName,
      twitchProfileImageUrl,
      Number(user.id),
      Number(creator.id)
    )
    .run();

  return {
    creatorId: Number(creator.id),
    slug: creator.slug,
    requiresOnboarding:
      !creator.onboarding_completed_at
  };
}