import {
  json
} from "../shared/responses.js";

import {
  requireAuthentication
} from "../auth/permissions.js";

const EVENT_KEY =
  "jevent-2026";

const ROLE_LABELS = {
  super_admin: "Admin",
  moderator: "Modérateur JEvent",
  creator: "Créateur",
  viewer: "Viewer"
};

function parseObject(value) {
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

function getBadgeRequirement(badge) {
  const config =
    parseObject(
      badge.requirement_config_json
    );

  if (config.metric) {
    return config;
  }

  const metricByRule = {
    message_count: "messages",
    emote_count: "emotes",
    channel_count: "channels",
    event_days: "event_days",
  };

  return {
    metric:
      metricByRule[badge.rule_key] ??
      "advanced",

    scope: "event",

    eventKey:
      badge.event_key ??
      EVENT_KEY,

    eventDay: null,

    threshold:
      Number(badge.threshold ?? 0)
  };
}

function mapBadge(
  badge,
  current,
  unlocked = false
) {
  const requirement =
    getBadgeRequirement(badge);

  const target =
    Number(
      requirement.threshold ??
      badge.threshold ??
      0
    );

  /*
   * Les détails sont masqués uniquement
   * tant que le badge n’est pas débloqué.
   */
  const detailsHidden =
    Boolean(
      badge.requirements_hidden
    ) &&
    !unlocked;

  return {
    key:
      badge.badge_key,

    label:
      badge.label,

    description:
      detailsHidden
        ? null
        : badge.description,

    iconKey:
      badge.icon_key,

    automatic:
      Boolean(badge.automatic),

    acquisitionMode:
      badge.acquisition_mode ??
      (
        badge.automatic
          ? "automatic"
          : "manual"
      ),

    requirementsHidden:
      Boolean(
        badge.requirements_hidden
      ),

    detailsHidden,

    ruleKey:
      detailsHidden
        ? null
        : badge.rule_key,

    requirement:
      detailsHidden
        ? null
        : requirement,

    current:
      detailsHidden
        ? null
        : Number(current ?? 0),

    target:
      detailsHidden
        ? null
        : target,

    percentage:
      detailsHidden
        ? null
        : (
          target > 0
            ? Math.min(
              100,
              Math.round(
                Number(current ?? 0) /
                target *
                100
              )
            )
            : (
              unlocked
                ? 100
                : 0
            )
        ),

    unlocked
  };
}

async function getBadgeProgress(
  env,
  twitchId,
  badge
) {
  const acquisitionMode =
    badge.acquisition_mode ??
    (
      badge.automatic
        ? "automatic"
        : "manual"
    );

  if (
    acquisitionMode !== "automatic"
  ) {
    return 0;
  }

  const requirement =
    getBadgeRequirement(badge);

  const metric =
    String(
      requirement.metric ?? ""
    );

  /*
   * Ces règles seront gérées par des
   * modules spécifiques plus tard.
   */

if (metric === "advanced") {
  return 0;
}

  const expressions = {
    messages:
      "COALESCE(SUM(messages_count), 0)",

    emotes:
      "COALESCE(SUM(emotes_count), 0)",

    channels:
      "COUNT(DISTINCT creator_id)",

    event_days: `
      COUNT(
        DISTINCT CASE
          WHEN event_day IS NOT NULL
          THEN event_key || ':' || event_day
          ELSE NULL
        END
      )
    `
  };

  const expression =
    expressions[metric];

  if (!expression) {
    return 0;
  }

  const conditions = [
    "viewer_twitch_id = ?"
  ];

  const bindings = [
    twitchId
  ];

  const scope =
    String(
      requirement.scope ?? "event"
    );

  if (scope === "event") {
    conditions.push(
      "event_key = ?",
      "event_day IS NOT NULL"
    );

    bindings.push(
      requirement.eventKey ??
      badge.event_key ??
      EVENT_KEY
    );
  }

  if (scope === "event_day") {
    conditions.push(
      "event_key = ?",
      "event_day = ?"
    );

    bindings.push(
      requirement.eventKey ??
      badge.event_key ??
      EVENT_KEY,

      Number(requirement.eventDay)
    );
  }

  /*
   * Pour all_time, aucune limite d’édition
   * ou de journée n’est appliquée.
   */

  const result =
    await env.DB.prepare(`
      SELECT
        ${expression} AS progress
      FROM viewer_chat_daily_stats
      WHERE ${conditions.join(
      " AND "
    )}
    `)
      .bind(...bindings)
      .first();

  return Number(
    result?.progress ?? 0
  );
}

async function loadCreatorNames(
  env,
  memberships
) {
  const creatorIds = [
    ...new Set(
      memberships
        .map(membership =>
          Number(
            membership.creatorId
          )
        )
        .filter(Boolean)
    )
  ];

  if (creatorIds.length === 0) {
    return new Map();
  }

  const placeholders =
    creatorIds
      .map(() => "?")
      .join(", ");

  const result =
    await env.DB.prepare(`
      SELECT
        id,
        slug,
        twitch_display_name
      FROM creators
      WHERE id IN (
        ${placeholders}
      )
    `)
      .bind(...creatorIds)
      .all();

  return new Map(
    (result.results ?? []).map(
      creator => [
        Number(creator.id),
        {
          id: Number(creator.id),
          slug: creator.slug,

          displayName:
            creator.twitch_display_name
        }
      ]
    )
  );
}

function buildRoles(
  globalRoles,
  memberships,
  creatorNames
) {
  const roles = [];

  const globalRoleKeys =
    new Set(
      globalRoles.map(
        role => role.role_key
      )
    );

  const ownsCreator =
    memberships.some(
      membership =>
        membership.memberRole ===
        "owner"
    );

  const isCreator =
    globalRoleKeys.has(
      "creator"
    ) ||
    ownsCreator;

  function addRole(role) {
    const alreadyAdded =
      roles.some(
        existing =>
          existing.key === role.key
      );

    if (!alreadyAdded) {
      roles.push(role);
    }
  }

  if (
    globalRoleKeys.has(
      "super_admin"
    )
  ) {
    addRole({
      key: "super_admin",
      type: "global",
      label: "Admin"
    });
  }

  if (isCreator) {
    addRole({
      key: "creator",
      type: "global",
      label: "Créateur"
    });
  }

  if (
    globalRoleKeys.has(
      "moderator"
    )
  ) {
    addRole({
      key: "moderator",
      type: "global",
      label:
        "Modérateur JEvent"
    });
  }

  for (
    const membership
    of memberships
  ) {
    if (
      membership.memberRole !==
      "creator_moderator"
    ) {
      continue;
    }

    const creatorId =
      Number(
        membership.creatorId
      );

    const creator =
      creatorNames.get(
        creatorId
      );

    const creatorName =
      creator?.displayName ||
      creator?.slug ||
      `Créateur ${creatorId}`;

    addRole({
      key:
        `creator_moderator:${creatorId}`,

      type: "creator_moderator",

      label:
        `Modérateur chez ${creatorName}`,

      creator
    });
  }

  /*
   * Le rôle Viewer est ajouté par défaut,
   * sauf lorsque la personne est créatrice.
   */

  if (!isCreator) {
    addRole({
      key: "viewer",
      type: "global",
      label: "Viewer"
    });
  }

  /*
   * Conserve aussi les éventuels rôles
   * globaux ajoutés plus tard.
   */

  for (const role of globalRoles) {
    if (
      [
        "viewer",
        "creator",
        "moderator",
        "super_admin"
      ].includes(role.role_key)
    ) {
      continue;
    }

    addRole({
      key: role.role_key,
      type: "global",

      label:
        ROLE_LABELS[
        role.role_key
        ] ||
        role.label ||
        role.role_key
    });
  }

  return roles;
}

async function synchronizeBadges(
  env,
  userId,
  badgeDefinitions,
  progressByBadge
) {
  const statements = [];

  for (
    const badge of
    badgeDefinitions
  ) {
    const acquisitionMode =
      badge.acquisition_mode ??
      (
        badge.automatic
          ? "automatic"
          : "manual"
      );

    /*
     * Les badges manuels et avancés ne sont
     * pas attribués automatiquement ici.
     */

    if (
      acquisitionMode !==
      "automatic"
    ) {
      continue;
    }

    const requirement =
      getBadgeRequirement(badge);

    const target =
      Number(
        requirement.threshold ??
        badge.threshold ??
        0
      );

    const current =
      Number(
        progressByBadge.get(
          badge.badge_key
        ) ?? 0
      );

    if (
      target <= 0 ||
      current < target
    ) {
      continue;
    }

    statements.push(
      env.DB.prepare(`
        INSERT INTO user_profile_badges (
          user_id,
          badge_key,
          source,
          awarded_at,
          metadata_json,
          revoked_at
        )
        VALUES (
          ?,
          ?,
          'automatic',
          CURRENT_TIMESTAMP,
          ?,
          NULL
        )

        ON CONFLICT (
          user_id,
          badge_key
        )
        DO UPDATE SET
          revoked_at =
            CASE
              WHEN
                user_profile_badges.source =
                  'automatic'
              THEN NULL

              ELSE
                user_profile_badges.revoked_at
            END
      `)
        .bind(
          userId,
          badge.badge_key,

          JSON.stringify({
            requirement,
            current,
            target
          })
        )
    );
  }

  if (statements.length > 0) {
    await env.DB.batch(
      statements
    );
  }
}

export async function getPrivateAccountProfile(
  request,
  env
) {
  const authorization =
    await requireAuthentication(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const userId =
    Number(
      authorization.user.id
    );

  const account =
    await env.DB.prepare(`
      SELECT
        id,
        twitch_id,
        twitch_login,
        twitch_display_name,
        twitch_profile_image_url,
        is_active,
        onboarding_completed,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `)
      .bind(userId)
      .first();

  if (!account) {
    return json(
      {
        error:
          "Compte introuvable."
      },
      404
    );
  }

  const memberships =
    authorization.user
      .creatorMemberships ??
    [];

  const [
    globalRolesResult,
    statsRow,
    daysResult,
    channelsResult,
    badgeDefinitionsResult
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT
        user_roles.role_key,
        roles.label
      FROM user_roles

      LEFT JOIN roles
        ON roles.role_key =
          user_roles.role_key

      WHERE user_roles.user_id = ?
        AND user_roles.revoked_at
          IS NULL

      ORDER BY
        CASE user_roles.role_key
          WHEN 'super_admin' THEN 1
          WHEN 'creator' THEN 2
          WHEN 'moderator' THEN 3
          WHEN 'viewer' THEN 4
          ELSE 10
        END ASC
    `)
      .bind(userId)
      .all(),

    /*
     * event_day IS NOT NULL empêche les
     * données de test de débloquer des badges.
     */

    env.DB.prepare(`
      SELECT
        COALESCE(
          SUM(messages_count),
          0
        ) AS messages,

        COALESCE(
          SUM(emotes_count),
          0
        ) AS emotes,

        COUNT(
          DISTINCT creator_id
        ) AS channels,

        COUNT(
          DISTINCT event_day
        ) AS days,

        MIN(first_seen_at)
          AS first_seen_at,

        MAX(last_seen_at)
          AS last_seen_at

      FROM viewer_chat_daily_stats

      WHERE event_key = ?
        AND viewer_twitch_id = ?
        AND event_day IS NOT NULL
    `)
      .bind(
        EVENT_KEY,
        account.twitch_id
      )
      .first(),

    env.DB.prepare(`
      SELECT DISTINCT
        event_day
      FROM viewer_chat_daily_stats

      WHERE event_key = ?
        AND viewer_twitch_id = ?
        AND event_day IS NOT NULL

      ORDER BY event_day ASC
    `)
      .bind(
        EVENT_KEY,
        account.twitch_id
      )
      .all(),

    env.DB.prepare(`
      SELECT
        creators.id,
        creators.slug,
        creators.twitch_display_name,

        SUM(
          stats.messages_count
        ) AS messages,

        SUM(
          stats.emotes_count
        ) AS emotes

      FROM viewer_chat_daily_stats
        AS stats

      INNER JOIN creators
        ON creators.id =
          stats.creator_id

      WHERE stats.event_key = ?
        AND stats.viewer_twitch_id = ?
        AND stats.event_day IS NOT NULL

      GROUP BY creators.id

      ORDER BY
        messages DESC,
        creators.twitch_display_name
          COLLATE NOCASE ASC
    `)
      .bind(
        EVENT_KEY,
        account.twitch_id
      )
      .all(),

    env.DB.prepare(`
      SELECT
        badge_key,
        label,
        description,
        icon_key,
        event_key,
        automatic,
        rule_key,
        threshold,
        requirements_hidden,
        acquisition_mode,
        requirement_config_json,
        display_order

        FROM profile_badges

      WHERE active = 1
        AND (
          event_key = ?
          OR event_key IS NULL
        )

      ORDER BY
        display_order ASC,
        label COLLATE NOCASE ASC
    `)
      .bind(EVENT_KEY)
      .all()
  ]);

  const personalStats = {
    messages:
      Number(
        statsRow?.messages ?? 0
      ),

    emotes:
      Number(
        statsRow?.emotes ?? 0
      ),

    channels:
      Number(
        statsRow?.channels ?? 0
      ),

    days:
      Number(
        statsRow?.days ?? 0
      ),

    eventDays:
      (daysResult.results ?? [])
        .map(row =>
          Number(row.event_day)
        )
        .filter(day =>
          [1, 2, 3].includes(day)
        ),

    firstSeenAt:
      statsRow?.first_seen_at ??
      null,

    lastSeenAt:
      statsRow?.last_seen_at ??
      null,

    byCreator:
      (
        channelsResult.results ??
        []
      ).map(creator => ({
        id:
          Number(creator.id),

        slug:
          creator.slug,

        displayName:
          creator.twitch_display_name,

        messages:
          Number(
            creator.messages ?? 0
          ),

        emotes:
          Number(
            creator.emotes ?? 0
          )
      }))
  };

  const badgeDefinitions =
    badgeDefinitionsResult.results ??
    [];

  const progressByBadge =
    new Map();

  await Promise.all(
    badgeDefinitions.map(
      async badge => {
        const progress =
          await getBadgeProgress(
            env,
            account.twitch_id,
            badge
          );

        progressByBadge.set(
          badge.badge_key,
          progress
        );
      }
    )
  );

  await synchronizeBadges(
    env,
    userId,
    badgeDefinitions,
    progressByBadge
  );

  const [
    unlockedBadgesResult,
    showcaseResult,
    creatorNames
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT
        badges.badge_key,
        badges.label,
        badges.description,
        badges.icon_key,
        badges.automatic,
        badges.rule_key,
        badges.threshold,
        badges.display_order,
        badges.requirements_hidden,
        badges.acquisition_mode,
        badges.requirement_config_json,

        user_badges.source,
        user_badges.awarded_at

      FROM user_profile_badges
        AS user_badges

      INNER JOIN profile_badges
        AS badges
        ON badges.badge_key =
          user_badges.badge_key

      WHERE user_badges.user_id = ?
        AND user_badges.revoked_at
          IS NULL
        AND badges.active = 1

      ORDER BY
        badges.display_order ASC,
        badges.label
          COLLATE NOCASE ASC
    `)
      .bind(userId)
      .all(),

    env.DB.prepare(`
      SELECT
        showcase.badge_key,
        showcase.display_order

      FROM user_badge_showcase
        AS showcase

      INNER JOIN user_profile_badges
        AS user_badges
        ON user_badges.user_id =
          showcase.user_id
        AND user_badges.badge_key =
          showcase.badge_key
        AND user_badges.revoked_at
          IS NULL

      WHERE showcase.user_id = ?

      ORDER BY
        showcase.display_order ASC
    `)
      .bind(userId)
      .all(),

    loadCreatorNames(
      env,
      memberships
    )
  ]);

  const unlockedKeys =
    new Set(
      (
        unlockedBadgesResult.results ??
        []
      ).map(
        badge => badge.badge_key
      )
    );

  const unlockedBadges =
    (
      unlockedBadgesResult.results ??
      []
    ).map(badge => ({
      ...mapBadge(
        badge,
        progressByBadge.get(
          badge.badge_key
        ) ?? 0,
        true
      ),

      source:
        badge.source,

      awardedAt:
        badge.awarded_at
    }));

  const lockedBadges =
    badgeDefinitions
      .filter(
        badge =>
          Boolean(badge.automatic) &&
          !unlockedKeys.has(
            badge.badge_key
          )
      )
      .map(
        badge =>
          mapBadge(
            badge,
            progressByBadge.get(
              badge.badge_key
            ) ?? 0,
            false
          )
      );

  const roles =
    buildRoles(
      globalRolesResult.results ??
      [],
      memberships,
      creatorNames
    );

  return json({
    private: true,

    event: {
      key: EVENT_KEY,
      name: "JEvent 26"
    },

    account: {
      id:
        Number(account.id),

      twitchId:
        account.twitch_id,

      twitchLogin:
        account.twitch_login,

      twitchDisplayName:
        account.twitch_display_name,

      twitchProfileImageUrl:
        account.twitch_profile_image_url,

      active:
        Boolean(
          account.is_active
        ),

      onboardingCompleted:
        Boolean(
          account.onboarding_completed
        ),

      createdAt:
        account.created_at,

      updatedAt:
        account.updated_at
    },

    roles,

    stats: personalStats,

    badges: {
      unlocked:
        unlockedBadges,

      locked:
        lockedBadges,

      showcase:
        (
          showcaseResult.results ??
          []
        ).map(
          row => row.badge_key
        )
    }
  });
}