import {
  json
} from "../shared/responses.js";

import {
  requireAdminAccess
} from "./access.js";

const DEFAULT_EVENT_KEY =
  "jevent-2026";

const ACQUISITION_MODES =
  new Set([
    "automatic",
    "manual",
    "advanced"
  ]);

const REQUIREMENT_METRICS =
  new Set([
    "messages",
    "emotes",
    "channels",
    "event_days",
  ]);

const REQUIREMENT_SCOPES =
  new Set([
    "all_time",
    "event",
    "event_day"
  ]);

const METRIC_RULE_KEYS = {
  messages: "message_count",
  emotes: "emote_count",
  channels: "channel_count",
  event_days: "event_days",
};

const RULE_KEY_METRICS = {
  message_count: "messages",
  emote_count: "emotes",
  channel_count: "channels",
  event_days: "event_days",
};

async function requireBadgeAdmin(
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
            "Seuls les Admins peuvent gérer les badges."
        },
        403
      )
    };
  }

  return access;
}

function cleanText(
  value,
  maximumLength = 200
) {
  return String(value ?? "")
    .replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
      ""
    )
    .trim()
    .slice(0, maximumLength);
}

function cleanBoolean(
  value,
  fallback = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  if (
    value === 1 ||
    value === "1" ||
    value === "true"
  ) {
    return true;
  }

  if (
    value === 0 ||
    value === "0" ||
    value === "false"
  ) {
    return false;
  }

  return fallback;
}

function cleanInteger(
  value,
  {
    minimum = 0,
    maximum = 1_000_000,
    fallback = 0
  } = {}
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.floor(number)
    )
  );
}

function normalizeBadgeKey(value) {
  return cleanText(value, 100)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseJson(value) {
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

function existingRequirement(row) {
  const config =
    parseJson(
      row?.requirement_config_json
    );

  if (config.metric) {
    return config;
  }

  const metric =
    RULE_KEY_METRICS[
    row?.rule_key
    ];

  if (!metric) {
    return config;
  }

  return {
    metric,
    scope: "event",
    eventKey:
      row?.event_key ??
      DEFAULT_EVENT_KEY,

    eventDay: null,

    threshold:
      Number(row?.threshold ?? 0)
  };
}

function normalizeBadgePayload(
  body,
  existing = null
) {
  const label =
    cleanText(
      body?.label ??
      existing?.label,
      100
    );

  if (!label) {
    return {
      valid: false,
      error:
        "Le nom du badge est obligatoire."
    };
  }

  const description =
    cleanText(
      body?.description ??
      existing?.description,
      600
    );

  if (!description) {
    return {
      valid: false,
      error:
        "La description du badge est obligatoire."
    };
  }

  const iconKey =
    normalizeBadgeKey(
      body?.iconKey ??
      existing?.icon_key ??
      "award"
    ) || "award";

  const eventKeyValue =
    body?.eventKey !== undefined
      ? body.eventKey
      : (
        existing?.event_key ??
        DEFAULT_EVENT_KEY
      );

  const eventKey =
    eventKeyValue === null
      ? null
      : (
        cleanText(
          eventKeyValue,
          80
        ) || null
      );

  const acquisitionMode =
    cleanText(
      body?.acquisitionMode ??
      existing?.acquisition_mode ??
      "automatic",
      30
    ).toLowerCase();

  if (
    !ACQUISITION_MODES.has(
      acquisitionMode
    )
  ) {
    return {
      valid: false,
      error:
        "Le mode d’obtention est invalide."
    };
  }

  const requirementsHidden =
    cleanBoolean(
      body?.requirementsHidden,
      Boolean(
        existing
          ?.requirements_hidden
      )
    );

  const active =
    cleanBoolean(
      body?.active,
      existing
        ? Boolean(existing.active)
        : true
    );

  const displayOrder =
    cleanInteger(
      body?.displayOrder ??
      existing?.display_order,
      {
        minimum: 0,
        maximum: 100_000,
        fallback: 100
      }
    );

  let automatic = 0;
  let ruleKey = null;
  let threshold = null;
  let requirementConfig = {};

  /*
   * Badge attribué manuellement depuis
   * le panel Admin.
   */

  if (
    acquisitionMode === "manual"
  ) {
    automatic = 0;
  }

  /*
   * Badge automatique avec une règle simple.
   */

  if (
    acquisitionMode === "automatic"
  ) {
    automatic = 1;

    const previousRequirement =
      existingRequirement(existing);

    const requirement =
      parseJson(
        body?.requirement ??
        body?.requirementConfig ??
        previousRequirement
      );

    const metric =
      cleanText(
        requirement.metric,
        50
      ).toLowerCase();

    if (
      !REQUIREMENT_METRICS.has(
        metric
      )
    ) {
      return {
        valid: false,
        error:
          "Le type de prérequis est invalide."
      };
    }

    const scope =
      cleanText(
        requirement.scope ??
        "event",
        30
      ).toLowerCase();

    if (
      !REQUIREMENT_SCOPES.has(
        scope
      )
    ) {
      return {
        valid: false,
        error:
          "La période du prérequis est invalide."
      };
    }

    const requirementThreshold =
      cleanInteger(
        requirement.threshold ??
        body?.threshold ??
        existing?.threshold,
        {
          minimum: 1,
          maximum: 100_000_000,
          fallback: 0
        }
      );

    if (
      requirementThreshold < 1
    ) {
      return {
        valid: false,
        error:
          "Le nombre requis doit être supérieur à zéro."
      };
    }

    let eventDay = null;

    if (scope === "event_day") {
      eventDay =
        cleanInteger(
          requirement.eventDay,
          {
            minimum: 1,
            maximum: 3,
            fallback: 0
          }
        );

      if (
        ![1, 2, 3].includes(
          eventDay
        )
      ) {
        return {
          valid: false,
          error:
            "La journée sélectionnée est invalide."
        };
      }
    }

    ruleKey =
      METRIC_RULE_KEYS[metric];

    threshold =
      requirementThreshold;

    requirementConfig = {
      metric,
      scope,

      eventKey:
        scope === "all_time"
          ? null
          : (
            eventKey ??
            DEFAULT_EVENT_KEY
          ),

      eventDay,

      threshold:
        requirementThreshold
    };
  }

  /*
   * Badge avancé : l’API stocke une clé.
   * Son fonctionnement sera développé dans
   * un module spécifique ultérieurement.
   */

  if (
    acquisitionMode === "advanced"
  ) {
    automatic = 1;
    ruleKey = "advanced";
    threshold = null;

    const previousConfig =
      parseJson(
        existing
          ?.requirement_config_json
      );

    const submittedConfig =
      parseJson(
        body?.requirement ??
        body?.requirementConfig
      );

    const advancedKey =
      normalizeBadgeKey(
        submittedConfig
          .advancedKey ??
        body?.advancedKey ??
        previousConfig
          .advancedKey
      );

    if (!advancedKey) {
      return {
        valid: false,
        error:
          "La clé avancée est obligatoire."
      };
    }

    requirementConfig = {
      metric: "advanced",
      advancedKey,

      parameters:
        parseJson(
          submittedConfig.parameters ??
          previousConfig.parameters
        )
    };
  }

  const configJson =
    JSON.stringify(
      requirementConfig
    );

  if (configJson.length > 10_000) {
    return {
      valid: false,
      error:
        "La configuration du badge est trop longue."
    };
  }

  return {
    valid: true,

    value: {
      label,
      description,
      iconKey,
      eventKey,
      acquisitionMode,
      requirementsHidden,
      automatic,
      ruleKey,
      threshold,
      requirementConfig,
      configJson,
      active,
      displayOrder
    }
  };
}

function mapBadge(row) {
  return {
    key:
      row.badge_key,

    label:
      row.label,

    description:
      row.description,

    iconKey:
      row.icon_key,

    eventKey:
      row.event_key,

    automatic:
      Boolean(row.automatic),

    acquisitionMode:
      row.acquisition_mode,

    requirementsHidden:
      Boolean(
        row.requirements_hidden
      ),

    ruleKey:
      row.rule_key,

    threshold:
      row.threshold === null
        ? null
        : Number(row.threshold),

    requirement:
      existingRequirement(row),

    active:
      Boolean(row.active),

    displayOrder:
      Number(
        row.display_order ?? 100
      ),

    createdByUserId:
      row.created_by_user_id
        ? Number(
          row.created_by_user_id
        )
        : null,

    awardedCount:
      Number(
        row.awarded_count ?? 0
      ),

    showcasedCount:
      Number(
        row.showcased_count ?? 0
      ),

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at
  };
}

async function findBadge(
  env,
  badgeKey
) {
  return env.DB.prepare(`
    SELECT *
    FROM profile_badges
    WHERE badge_key = ?
    LIMIT 1
  `)
    .bind(badgeKey)
    .first();
}

async function createUniqueBadgeKey(
  env,
  requestedKey,
  label,
  eventKey
) {
  const requested =
    normalizeBadgeKey(
      requestedKey
    );

  if (requested) {
    const existing =
      await findBadge(
        env,
        requested
      );

    if (existing) {
      return {
        valid: false,
        error:
          "Cette clé de badge existe déjà."
      };
    }

    return {
      valid: true,
      key: requested
    };
  }

  const eventPrefix =
    normalizeBadgeKey(
      eventKey ??
      "global"
    );

  const labelKey =
    normalizeBadgeKey(label) ||
    "badge";

  const baseKey =
    `${eventPrefix}-${labelKey}`
      .slice(0, 70);

  let badgeKey = baseKey;

  const existing =
    await findBadge(
      env,
      badgeKey
    );

  if (existing) {
    badgeKey =
      (
        baseKey +
        "-" +
        crypto.randomUUID()
          .slice(0, 8)
      ).slice(0, 80);
  }

  return {
    valid: true,
    key: badgeKey
  };
}

export async function listAdminBadges(
  request,
  env
) {
  const access =
    await requireBadgeAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        badges.*,

        (
          SELECT COUNT(*)
          FROM user_profile_badges
          WHERE user_profile_badges.badge_key =
            badges.badge_key
            AND user_profile_badges.revoked_at
              IS NULL
        ) AS awarded_count,

        (
          SELECT COUNT(*)
          FROM user_badge_showcase
          WHERE user_badge_showcase.badge_key =
            badges.badge_key
        ) AS showcased_count

      FROM profile_badges AS badges

      ORDER BY
        badges.active DESC,
        badges.display_order ASC,
        badges.label COLLATE NOCASE ASC
    `).all();

  return json({
    badges:
      (result.results ?? [])
        .map(mapBadge)
  });
}

export async function createAdminBadge(
  request,
  env
) {
  const access =
    await requireBadgeAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
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

  const normalized =
    normalizeBadgePayload(body);

  if (!normalized.valid) {
    return json(
      {
        error:
          normalized.error
      },
      400
    );
  }

  const badge =
    normalized.value;

  const keyResult =
    await createUniqueBadgeKey(
      env,
      body?.key,
      badge.label,
      badge.eventKey
    );

  if (!keyResult.valid) {
    return json(
      {
        error:
          keyResult.error
      },
      409
    );
  }

  await env.DB.prepare(`
    INSERT INTO profile_badges (
      badge_key,
      label,
      description,
      icon_key,
      event_key,
      automatic,
      rule_key,
      threshold,
      active,
      display_order,
      requirements_hidden,
      acquisition_mode,
      requirement_config_json,
      created_by_user_id,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      keyResult.key,
      badge.label,
      badge.description,
      badge.iconKey,
      badge.eventKey,
      badge.automatic,
      badge.ruleKey,
      badge.threshold,
      badge.active ? 1 : 0,
      badge.displayOrder,
      badge.requirementsHidden
        ? 1
        : 0,
      badge.acquisitionMode,
      badge.configJson,
      Number(access.user.id)
    )
    .run();

  const created =
    await findBadge(
      env,
      keyResult.key
    );

  return json(
    {
      success: true,
      badge:
        mapBadge(created)
    },
    201
  );
}

export async function updateAdminBadge(
  request,
  env,
  rawBadgeKey
) {
  const access =
    await requireBadgeAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const badgeKey =
    normalizeBadgeKey(
      rawBadgeKey
    );

  const existing =
    await findBadge(
      env,
      badgeKey
    );

  if (!existing) {
    return json(
      {
        error:
          "Ce badge n’existe pas."
      },
      404
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

  const normalized =
    normalizeBadgePayload(
      body,
      existing
    );

  if (!normalized.valid) {
    return json(
      {
        error:
          normalized.error
      },
      400
    );
  }

  const badge =
    normalized.value;

  await env.DB.prepare(`
    UPDATE profile_badges
    SET
      label = ?,
      description = ?,
      icon_key = ?,
      event_key = ?,
      automatic = ?,
      rule_key = ?,
      threshold = ?,
      active = ?,
      display_order = ?,
      requirements_hidden = ?,
      acquisition_mode = ?,
      requirement_config_json = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE badge_key = ?
  `)
    .bind(
      badge.label,
      badge.description,
      badge.iconKey,
      badge.eventKey,
      badge.automatic,
      badge.ruleKey,
      badge.threshold,
      badge.active ? 1 : 0,
      badge.displayOrder,
      badge.requirementsHidden
        ? 1
        : 0,
      badge.acquisitionMode,
      badge.configJson,
      badgeKey
    )
    .run();

  const updated =
    await findBadge(
      env,
      badgeKey
    );

  return json({
    success: true,
    badge:
      mapBadge(updated)
  });
}

export async function setAdminBadgeActive(
  request,
  env,
  rawBadgeKey
) {
  const access =
    await requireBadgeAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const badgeKey =
    normalizeBadgeKey(
      rawBadgeKey
    );

  const existing =
    await findBadge(
      env,
      badgeKey
    );

  if (!existing) {
    return json(
      {
        error:
          "Ce badge n’existe pas."
      },
      404
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
    typeof body?.active !==
    "boolean"
  ) {
    return json(
      {
        error:
          "La valeur « active » est obligatoire."
      },
      400
    );
  }

  await env.DB.prepare(`
    UPDATE profile_badges
    SET
      active = ?,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE badge_key = ?
  `)
    .bind(
      body.active ? 1 : 0,
      badgeKey
    )
    .run();

  return json({
    success: true,
    key: badgeKey,
    active: body.active
  });
}

export async function deleteAdminBadge(
  request,
  env,
  rawBadgeKey
) {
  const access =
    await requireBadgeAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const badgeKey =
    normalizeBadgeKey(
      rawBadgeKey
    );

  const badge =
    await env.DB.prepare(`
      SELECT
        badges.badge_key,

        (
          SELECT COUNT(*)
          FROM user_profile_badges
          WHERE user_profile_badges.badge_key =
            badges.badge_key
            AND user_profile_badges.revoked_at
              IS NULL
        ) AS awarded_count,

                (
          SELECT COUNT(*)
          FROM user_badge_showcase AS showcase
            
          INNER JOIN user_profile_badges AS assignment
            ON assignment.user_id =
              showcase.user_id
            AND assignment.badge_key =
              showcase.badge_key
            AND assignment.revoked_at IS NULL
            
          WHERE showcase.badge_key =
            badges.badge_key
        ) AS showcased_count

      FROM profile_badges AS badges

      WHERE badges.badge_key = ?
      LIMIT 1
    `)
      .bind(badgeKey)
      .first();

  if (!badge) {
    return json(
      {
        error:
          "Ce badge n’existe pas."
      },
      404
    );
  }

  if (
    Number(
      badge.awarded_count ?? 0
    ) > 0 ||
    Number(
      badge.showcased_count ?? 0
    ) > 0
  ) {
    return json(
      {
        error:
          "Ce badge a déjà été attribué. Désactive-le au lieu de le supprimer."
      },
      409
    );
  }

  await env.DB.prepare(`
    DELETE FROM profile_badges
    WHERE badge_key = ?
  `)
    .bind(badgeKey)
    .run();

  return json({
    success: true,
    deleted: badgeKey
  });
}

export async function listAdminBadgeAssignments(
  request,
  env,
  rawBadgeKey
) {
  const access =
    await requireBadgeAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const badgeKey =
    normalizeBadgeKey(
      rawBadgeKey
    );

  const badge =
    await findBadge(
      env,
      badgeKey
    );

  if (!badge) {
    return json(
      {
        error:
          "Ce badge n’existe pas."
      },
      404
    );
  }

  if (
    badge.acquisition_mode !==
    "manual"
  ) {
    return json(
      {
        error:
          "Seuls les badges manuels peuvent être attribués depuis cette interface."
      },
      400
    );
  }

  const url =
    new URL(request.url);

  const search =
    cleanText(
      url.searchParams.get("search"),
      100
    ).toLowerCase();

  const searchPattern =
    `%${search}%`;

  const result =
    await env.DB.prepare(`
      SELECT
        users.id,
        users.twitch_id,
        users.twitch_login,
        users.twitch_display_name,
        users.twitch_profile_image_url,
        users.is_active,

        CASE
          WHEN assignment.badge_key
            IS NOT NULL
            AND assignment.revoked_at
              IS NULL
          THEN 1
          ELSE 0
        END AS is_assigned,

        assignment.source,
        assignment.awarded_at,
        assignment.revoked_at,

        awarded_by.id
          AS awarded_by_id,

        awarded_by.twitch_login
          AS awarded_by_login,

        awarded_by.twitch_display_name
          AS awarded_by_display_name

      FROM users

      LEFT JOIN user_profile_badges
        AS assignment
        ON assignment.user_id =
          users.id
        AND assignment.badge_key = ?

      LEFT JOIN users AS awarded_by
        ON awarded_by.id =
          assignment.awarded_by_user_id

      WHERE (
        ? = ''

        OR LOWER(
          users.twitch_login
        ) LIKE ?

        OR LOWER(
          users.twitch_display_name
        ) LIKE ?
      )

      ORDER BY
        is_assigned DESC,

        users.twitch_display_name
          COLLATE NOCASE ASC

      LIMIT 100
    `)
      .bind(
        badgeKey,
        search,
        searchPattern,
        searchPattern
      )
      .all();

  const users =
    (result.results ?? []).map(
      user => ({
        id:
          Number(user.id),

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

        assigned:
          Boolean(user.is_assigned),

        source:
          user.source,

        awardedAt:
          user.awarded_at,

        revokedAt:
          user.revoked_at,

        awardedBy:
          user.awarded_by_id
            ? {
              id:
                Number(
                  user.awarded_by_id
                ),

              twitchLogin:
                user.awarded_by_login,

              twitchDisplayName:
                user
                  .awarded_by_display_name
            }
            : null
      })
    );

  return json({
    badge: {
      key:
        badge.badge_key,

      label:
        badge.label,

      description:
        badge.description,

      iconKey:
        badge.icon_key
    },

    users,

    assignedCount:
      users.filter(
        user => user.assigned
      ).length
  });
}

export async function updateAdminBadgeAssignment(
  request,
  env,
  rawBadgeKey,
  rawUserId
) {
  const access =
    await requireBadgeAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const badgeKey =
    normalizeBadgeKey(
      rawBadgeKey
    );

  const userId =
    Number(rawUserId);

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

  const badge =
    await findBadge(
      env,
      badgeKey
    );

  if (!badge) {
    return json(
      {
        error:
          "Ce badge n’existe pas."
      },
      404
    );
  }

  if (
    badge.acquisition_mode !==
    "manual"
  ) {
    return json(
      {
        error:
          "Ce badge n’utilise pas l’attribution manuelle."
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

  let body;

  try {
    body =
      await request.json();
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

  if (body.enabled) {
    await env.DB.prepare(`
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
        'manual',
        ?,
        CURRENT_TIMESTAMP,
        ?,
        NULL
      )

      ON CONFLICT (
        user_id,
        badge_key
      )
      DO UPDATE SET
        source = 'manual',

        awarded_by_user_id =
          excluded.awarded_by_user_id,

        awarded_at =
          CURRENT_TIMESTAMP,

        metadata_json =
          excluded.metadata_json,

        revoked_at = NULL
    `)
      .bind(
        userId,
        badgeKey,
        Number(access.user.id),

        JSON.stringify({
          assignedFrom:
            "admin_badges_panel"
        })
      )
      .run();

    return json({
      success: true,
      userId,
      badgeKey,
      assigned: true,
      awardedAt:
        new Date().toISOString()
    });
  }

  await env.DB.prepare(`
    UPDATE user_profile_badges

    SET
      revoked_at =
        CURRENT_TIMESTAMP

    WHERE user_id = ?
      AND badge_key = ?
      AND revoked_at IS NULL
  `)
    .bind(
      userId,
      badgeKey
    )
    .run();

  return json({
    success: true,
    userId,
    badgeKey,
    assigned: false
  });
}