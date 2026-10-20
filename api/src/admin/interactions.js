import {
  json
} from "../shared/responses.js";

import {
  requireAdminAccess
} from "./access.js";

const INTERACTION_TYPES =
  new Set([
    "image",
    "text",
    "code",
    "sound",
    "advanced",
    "effect"
  ]);

const IMAGE_CONTENT_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);

const MAXIMUM_IMAGE_SIZE =
  2_097_152;

async function requireInteractionAdmin(
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
            "Seuls les Admins peuvent gérer les interactions."
        },
        403
      )
    };
  }

  return access;
}

function cleanText(
  value,
  maximumLength = 500
) {
  return String(value ?? "")
    .replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
      ""
    )
    .trim()
    .slice(0, maximumLength);
}

function normalizeSlug(value) {
  return cleanText(value, 100)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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
    maximum = 100_000_000,
    fallback = 0
  } = {}
) {
  const number =
    Number(value);

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

function parseConfig(value) {
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

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

function normalizeImageConfig(config) {
  const allowedContentTypes =
    Array.isArray(
      config.allowedContentTypes
    )
      ? config.allowedContentTypes
        .map(value =>
          String(value).trim()
        )
        .filter(value =>
          IMAGE_CONTENT_TYPES.has(
            value
          )
        )
      : [];

  return {
    maximumFileSizeBytes:
      cleanInteger(
        config.maximumFileSizeBytes,
        {
          minimum: 1,
          maximum:
            MAXIMUM_IMAGE_SIZE,
          fallback:
            MAXIMUM_IMAGE_SIZE
        }
      ),

    allowedContentTypes:
      allowedContentTypes.length > 0
        ? [
          ...new Set(
            allowedContentTypes
          )
        ]
        : [
          "image/jpeg",
          "image/png",
          "image/webp"
        ]
  };
}

function normalizePayload(
  body,
  existing = null
) {
  const creatorId =
    cleanInteger(
      body?.creatorId ??
      existing?.creator_id,
      {
        minimum: 1,
        fallback: 0
      }
    );

  if (!creatorId) {
    return {
      valid: false,
      error:
        "Le créateur est obligatoire."
    };
  }

  const title =
    cleanText(
      body?.title ??
      existing?.title,
      120
    );

  if (!title) {
    return {
      valid: false,
      error:
        "Le titre est obligatoire."
    };
  }

  const slug =
    normalizeSlug(
      body?.slug ??
      existing?.slug ??
      title
    );

  if (!slug) {
    return {
      valid: false,
      error:
        "Le slug est invalide."
    };
  }

  const type =
    cleanText(
      body?.type ??
      body?.interactionType ??
      existing?.interaction_type ??
      "image",
      30
    ).toLowerCase();

  if (!INTERACTION_TYPES.has(type)) {
    return {
      valid: false,
      error:
        "Le type d’interaction est invalide."
    };
  }

  const costCents =
    cleanInteger(
      body?.costCents ??
      existing?.cost_cents,
      {
        minimum: 0,
        maximum: 100_000_000,
        fallback: 500
      }
    );

  const opensAtValue =
    body?.opensAt !== undefined
      ? body.opensAt
      : existing?.opens_at;

  const closesAtValue =
    body?.closesAt !== undefined
      ? body.closesAt
      : existing?.closes_at;

  const opensAt =
    normalizeDate(opensAtValue);

  const closesAt =
    normalizeDate(closesAtValue);

  if (opensAtValue && !opensAt) {
    return {
      valid: false,
      error:
        "La date d’ouverture est invalide."
    };
  }

  if (closesAtValue && !closesAt) {
    return {
      valid: false,
      error:
        "La date de fermeture est invalide."
    };
  }

  if (
    opensAt &&
    closesAt &&
    new Date(closesAt) <=
    new Date(opensAt)
  ) {
    return {
      valid: false,
      error:
        "La fermeture doit avoir lieu après l’ouverture."
    };
  }

  let config =
    parseConfig(
      body?.config ??
      existing?.config_json
    );

  if (type === "image") {
    config =
      normalizeImageConfig(config);
  }

  const configJson =
    JSON.stringify(config);

  if (configJson.length > 20_000) {
    return {
      valid: false,
      error:
        "La configuration est trop longue."
    };
  }

  return {
    valid: true,

    value: {
      creatorId,
      slug,
      title,

      description:
        cleanText(
          body?.description ??
          existing?.description,
          1200
        ),

      type,
      costCents,

      moderationRequired:
        type === "effect"
          ? false
          : cleanBoolean(
            body?.moderationRequired,
            existing
              ? Boolean(
                existing.moderation_required
              )
              : true
          ),

      visible:
        cleanBoolean(
          body?.visible,
          existing
            ? Boolean(existing.visible)
            : true
        ),

      enabled:
        cleanBoolean(
          body?.enabled,
          existing
            ? Boolean(existing.enabled)
            : true
        ),

      displayOrder:
        cleanInteger(
          body?.displayOrder ??
          existing?.display_order,
          {
            minimum: 0,
            maximum: 100_000,
            fallback: 100
          }
        ),

      config,
      configJson,
      opensAt,
      closesAt
    }
  };
}

function mapInteraction(
  interaction
) {
  return {
    id:
      Number(interaction.id),

    publicId:
      interaction.public_id,

    creatorId:
      Number(interaction.creator_id),

    creator: {
      id:
        Number(
          interaction.creator_id
        ),

      slug:
        interaction.creator_slug,

      displayName:
        interaction
          .creator_display_name,

      twitchLogin:
        interaction.twitch_login,

      profileImageUrl:
        interaction
          .twitch_profile_image_url
    },

    slug:
      interaction.slug,

    title:
      interaction.title,

    description:
      interaction.description ?? "",

    type:
      interaction.interaction_type,

    costCents:
      Number(
        interaction.cost_cents
      ),

    cost:
      Number(
        interaction.cost_cents
      ) / 100,

    moderationRequired:
      Boolean(
        interaction
          .moderation_required
      ),

    visible:
      Boolean(interaction.visible),

    enabled:
      Boolean(interaction.enabled),

    config:
      parseConfig(
        interaction.config_json
      ),

    displayOrder:
      Number(
        interaction.display_order ??
        100
      ),

    opensAt:
      interaction.opens_at,

    closesAt:
      interaction.closes_at,

    usageCount:
      Number(
        interaction.usage_count ?? 0
      ),

    createdAt:
      interaction.created_at,

    updatedAt:
      interaction.updated_at
  };
}

async function findInteraction(
  env,
  publicId
) {
  return env.DB.prepare(`
    SELECT *
    FROM creator_interactions
    WHERE public_id = ?
    LIMIT 1
  `)
    .bind(publicId)
    .first();
}

async function findCreator(
  env,
  creatorId
) {
  return env.DB.prepare(`
    SELECT
      id,
      slug,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      active,
      archived
    FROM creators
    WHERE id = ?
    LIMIT 1
  `)
    .bind(creatorId)
    .first();
}

/* =========================================================
   Liste
   ========================================================= */

export async function listAdminInteractions(
  request,
  env
) {
  const access =
    await requireInteractionAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const [
    creatorsResult,
    interactionsResult
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT
        id,
        slug,
        twitch_login,
        twitch_display_name,
        twitch_profile_image_url,
        display_order,
        active,
        archived
      FROM creators
      ORDER BY
        archived ASC,
        display_order ASC,
        twitch_display_name
          COLLATE NOCASE ASC
    `).all(),

    env.DB.prepare(`
      SELECT
        interactions.*,

        creators.slug
          AS creator_slug,

        creators.twitch_login,

        creators.twitch_display_name
          AS creator_display_name,

        creators.twitch_profile_image_url,

        COUNT(uploads.id)
          AS usage_count

      FROM creator_interactions
        AS interactions

      INNER JOIN creators
        ON creators.id =
          interactions.creator_id

      LEFT JOIN interaction_uploads
        AS uploads
        ON uploads.interaction_id =
          interactions.id

      GROUP BY interactions.id

      ORDER BY
        creators.display_order ASC,
        creators.twitch_display_name
          COLLATE NOCASE ASC,
        interactions.display_order ASC,
        interactions.title
          COLLATE NOCASE ASC
    `).all()
  ]);

  return json({
    creators:
      (creatorsResult.results ?? [])
        .map(creator => ({
          id:
            Number(creator.id),

          slug:
            creator.slug,

          twitchLogin:
            creator.twitch_login,

          displayName:
            creator
              .twitch_display_name,

          profileImageUrl:
            creator
              .twitch_profile_image_url,

          displayOrder:
            Number(
              creator.display_order ??
              100
            ),

          active:
            Boolean(creator.active),

          archived:
            Boolean(
              creator.archived
            )
        })),

    interactions:
      (
        interactionsResult.results ??
        []
      ).map(mapInteraction)
  });
}

/* =========================================================
   Création
   ========================================================= */

export async function createAdminInteraction(
  request,
  env
) {
  const access =
    await requireInteractionAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
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

  const normalized =
    normalizePayload(body);

  if (!normalized.valid) {
    return json(
      {
        error:
          normalized.error
      },
      400
    );
  }

  const interaction =
    normalized.value;

  const creator =
    await findCreator(
      env,
      interaction.creatorId
    );

  if (!creator) {
    return json(
      {
        error:
          "Le créateur sélectionné n’existe pas."
      },
      404
    );
  }

  const duplicate =
    await env.DB.prepare(`
      SELECT id
      FROM creator_interactions
      WHERE creator_id = ?
        AND slug = ?
      LIMIT 1
    `)
      .bind(
        interaction.creatorId,
        interaction.slug
      )
      .first();

  if (duplicate) {
    return json(
      {
        error:
          "Une interaction utilise déjà ce slug pour ce créateur."
      },
      409
    );
  }

  const publicId =
    `interaction_${crypto.randomUUID()}`;

  await env.DB.prepare(`
    INSERT INTO creator_interactions (
      public_id,
      creator_id,
      slug,
      title,
      description,
      interaction_type,
      cost_cents,
      moderation_required,
      visible,
      enabled,
      config_json,
      display_order,
      opens_at,
      closes_at,
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
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      publicId,
      interaction.creatorId,
      interaction.slug,
      interaction.title,
      interaction.description,
      interaction.type,
      interaction.costCents,
      interaction.moderationRequired
        ? 1
        : 0,
      interaction.visible ? 1 : 0,
      interaction.enabled ? 1 : 0,
      interaction.configJson,
      interaction.displayOrder,
      interaction.opensAt,
      interaction.closesAt,
      Number(access.user.id)
    )
    .run();

  return json(
    {
      success: true,
      publicId
    },
    201
  );
}

/* =========================================================
   Modification
   ========================================================= */

export async function updateAdminInteraction(
  request,
  env,
  publicId
) {
  const access =
    await requireInteractionAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const existing =
    await findInteraction(
      env,
      publicId
    );

  if (!existing) {
    return json(
      {
        error:
          "Cette interaction n’existe pas."
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

  const normalized =
    normalizePayload(
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

  const interaction =
    normalized.value;

  const creator =
    await findCreator(
      env,
      interaction.creatorId
    );

  if (!creator) {
    return json(
      {
        error:
          "Le créateur sélectionné n’existe pas."
      },
      404
    );
  }

  const duplicate =
    await env.DB.prepare(`
      SELECT id
      FROM creator_interactions
      WHERE creator_id = ?
        AND slug = ?
        AND id != ?
      LIMIT 1
    `)
      .bind(
        interaction.creatorId,
        interaction.slug,
        Number(existing.id)
      )
      .first();

  if (duplicate) {
    return json(
      {
        error:
          "Une interaction utilise déjà ce slug pour ce créateur."
      },
      409
    );
  }

  await env.DB.prepare(`
    UPDATE creator_interactions
    SET
      creator_id = ?,
      slug = ?,
      title = ?,
      description = ?,
      interaction_type = ?,
      cost_cents = ?,
      moderation_required = ?,
      visible = ?,
      enabled = ?,
      config_json = ?,
      display_order = ?,
      opens_at = ?,
      closes_at = ?,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE public_id = ?
  `)
    .bind(
      interaction.creatorId,
      interaction.slug,
      interaction.title,
      interaction.description,
      interaction.type,
      interaction.costCents,
      interaction.moderationRequired
        ? 1
        : 0,
      interaction.visible ? 1 : 0,
      interaction.enabled ? 1 : 0,
      interaction.configJson,
      interaction.displayOrder,
      interaction.opensAt,
      interaction.closesAt,
      publicId
    )
    .run();

  return json({
    success: true,
    publicId
  });
}

/* =========================================================
   Suppression
   ========================================================= */

export async function deleteAdminInteraction(
  request,
  env,
  publicId
) {
  const access =
    await requireInteractionAdmin(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const interaction =
    await findInteraction(
      env,
      publicId
    );

  if (!interaction) {
    return json(
      {
        error:
          "Cette interaction n’existe pas."
      },
      404
    );
  }

  const usage =
    await env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM interaction_uploads
      WHERE interaction_id = ?
    `)
      .bind(
        Number(interaction.id)
      )
      .first();

  if (
    Number(usage?.total ?? 0) > 0
  ) {
    return json(
      {
        error:
          "Cette interaction a déjà été utilisée. Désactive-la au lieu de la supprimer."
      },
      409
    );
  }

  await env.DB.prepare(`
    DELETE FROM creator_interactions
    WHERE id = ?
  `)
    .bind(
      Number(interaction.id)
    )
    .run();

  return json({
    success: true,
    deleted: publicId
  });
}