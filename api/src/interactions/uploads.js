import {
  requireAuthentication
} from "../auth/permissions.js";

import {
  generateRandomToken
} from "../shared/security.js";

import {
  json
} from "../shared/responses.js";

const ABSOLUTE_MAXIMUM_SIZE =
  2 * 1024 * 1024;

const DEFAULT_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
];

const FILE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function cleanFileName(value) {
  return String(value || "image")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .trim()
    .slice(0, 180) || "image";
}

function parseInteractionConfig(value) {
  try {
    const parsed =
      JSON.parse(value || "{}");

    return (
      parsed &&
      typeof parsed === "object"
        ? parsed
        : {}
    );
  } catch {
    return {};
  }
}

function detectImageType(buffer) {
  const bytes =
    new Uint8Array(buffer);

  const jpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  if (jpeg) {
    return "image/jpeg";
  }

  const png =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  if (png) {
    return "image/png";
  }

  const webp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  if (webp) {
    return "image/webp";
  }

  return null;
}

async function calculateSha256(buffer) {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      buffer
    );

  return Array.from(
    new Uint8Array(digest)
  )
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

function interactionIsOpen(interaction) {
  const now = Date.now();

  if (interaction.opens_at) {
    const opensAt =
      new Date(
        interaction.opens_at
      ).getTime();

    if (
      Number.isFinite(opensAt) &&
      now < opensAt
    ) {
      return {
        open: false,
        error:
          "Cette interaction n’est pas encore ouverte."
      };
    }
  }

  if (interaction.closes_at) {
    const closesAt =
      new Date(
        interaction.closes_at
      ).getTime();

    if (
      Number.isFinite(closesAt) &&
      now > closesAt
    ) {
      return {
        open: false,
        error:
          "Cette interaction est terminée."
      };
    }
  }

  return {
    open: true
  };
}

async function findWallet(
  env,
  userId
) {
  return env.DB.prepare(`
    SELECT
      user_id,
      personal_code,
      balance_cents,
      total_earned_cents,
      total_spent_cents
    FROM interaction_wallets
    WHERE user_id = ?
    LIMIT 1
  `)
    .bind(userId)
    .first();
}

async function ensureWallet(
  env,
  userId
) {
  let wallet =
    await findWallet(
      env,
      userId
    );

  if (wallet) {
    return wallet;
  }

  for (
    let attempt = 0;
    attempt < 5;
    attempt += 1
  ) {
    const personalCode =
      (
        "JEV-" +
        generateRandomToken(8)
      ).toUpperCase();

    await env.DB.prepare(`
      INSERT OR IGNORE INTO
        interaction_wallets (
          user_id,
          personal_code,
          balance_cents,
          total_earned_cents,
          total_spent_cents,
          created_at,
          updated_at
        )
      VALUES (
        ?,
        ?,
        0,
        0,
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `)
      .bind(
        userId,
        personalCode
      )
      .run();

    wallet =
      await findWallet(
        env,
        userId
      );

    if (wallet) {
      return wallet;
    }
  }

  throw new Error(
    "Impossible de créer le portefeuille."
  );
}

export async function createInteractionUpload(
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

  if (!env.INTERACTION_UPLOADS) {
    return json(
      {
        error:
          "Le stockage des interactions n’est pas configuré."
      },
      500
    );
  }

  const contentType =
    request.headers.get(
      "Content-Type"
    ) || "";

  if (
    !contentType
      .toLowerCase()
      .startsWith(
        "multipart/form-data"
      )
  ) {
    return json(
      {
        error:
          "Le formulaire envoyé est invalide."
      },
      400
    );
  }

  let formData;

  try {
    formData =
      await request.formData();
  } catch {
    return json(
      {
        error:
          "Impossible de lire le formulaire."
      },
      400
    );
  }

  const interactionPublicId =
    String(
      formData.get(
        "interactionPublicId"
      ) ||
      formData.get(
        "interactionId"
      ) ||
      ""
    ).trim();

  const file =
    formData.get("image") ||
    formData.get("file");

  if (!interactionPublicId) {
    return json(
      {
        error:
          "Sélectionne une interaction."
      },
      400
    );
  }

  if (
    !file ||
    typeof file.arrayBuffer !==
      "function"
  ) {
    return json(
      {
        error:
          "Sélectionne une image."
      },
      400
    );
  }

  const interaction =
    await env.DB.prepare(`
      SELECT
        interactions.id,
        interactions.public_id,
        interactions.title,
        interactions.interaction_type,
        interactions.cost_cents,
        interactions.moderation_required,
        interactions.visible,
        interactions.enabled,
        interactions.config_json,
        interactions.opens_at,
        interactions.closes_at,

        creators.id AS creator_id,
        creators.slug AS creator_slug,
        creators.twitch_display_name
          AS creator_name

      FROM creator_interactions
        AS interactions

      INNER JOIN creators
        ON creators.id =
          interactions.creator_id

      WHERE interactions.public_id = ?
        AND creators.active = 1
        AND creators.archived = 0

      LIMIT 1
    `)
      .bind(interactionPublicId)
      .first();

  if (!interaction) {
    return json(
      {
        error:
          "Cette interaction n’existe pas."
      },
      404
    );
  }

  if (
    interaction.interaction_type !==
      "image"
  ) {
    return json(
      {
        error:
          "Cette interaction n’accepte pas d’image."
      },
      400
    );
  }

  if (
    !Boolean(interaction.visible) ||
    !Boolean(interaction.enabled)
  ) {
    return json(
      {
        error:
          "Cette interaction n’est pas disponible."
      },
      409
    );
  }

  const availability =
    interactionIsOpen(interaction);

  if (!availability.open) {
    return json(
      {
        error:
          availability.error
      },
      409
    );
  }

  const configuration =
    parseInteractionConfig(
      interaction.config_json
    );

  const configuredMaximum =
    Number(
      configuration
        .maximumFileSizeBytes
    );

  const maximumSize =
    Number.isFinite(
      configuredMaximum
    ) &&
    configuredMaximum > 0
      ? Math.min(
          configuredMaximum,
          ABSOLUTE_MAXIMUM_SIZE
        )
      : ABSOLUTE_MAXIMUM_SIZE;

  if (
    file.size < 1 ||
    file.size > maximumSize
  ) {
    return json(
      {
        error:
          "L’image doit peser au maximum 2 Mo."
      },
      400
    );
  }

  const buffer =
    await file.arrayBuffer();

  const detectedContentType =
    detectImageType(buffer);

  if (!detectedContentType) {
    return json(
      {
        error:
          "Le fichier doit être une image JPEG, PNG ou WebP."
      },
      400
    );
  }

  const configuredTypes =
    Array.isArray(
      configuration
        .allowedContentTypes
    )
      ? configuration
          .allowedContentTypes
          .filter(type =>
            DEFAULT_CONTENT_TYPES
              .includes(type)
          )
      : DEFAULT_CONTENT_TYPES;

  const allowedContentTypes =
    configuredTypes.length > 0
      ? configuredTypes
      : DEFAULT_CONTENT_TYPES;

  if (
    !allowedContentTypes.includes(
      detectedContentType
    )
  ) {
    return json(
      {
        error:
          "Ce format d’image n’est pas accepté pour cette interaction."
      },
      400
    );
  }

  const userId =
    Number(
      authorization.user.id
    );

  const costCents =
    Number(
      interaction.cost_cents
    );

  if (
    !Number.isInteger(costCents) ||
    costCents <= 0
  ) {
    return json(
      {
        error:
          "Le coût de cette interaction est invalide."
      },
      500
    );
  }

  const wallet =
    await ensureWallet(
      env,
      userId
    );

  if (
    Number(
      wallet.balance_cents
    ) < costCents
  ) {
    return json(
      {
        error:
          "Tu n’as pas assez de crédits.",
        requiredCents:
          costCents,
        balanceCents:
          Number(
            wallet.balance_cents
          )
      },
      409
    );
  }

  const uploadPublicId =
    `upload_${generateRandomToken(18)}`;

  const extension =
    FILE_EXTENSIONS[
      detectedContentType
    ];

  const now =
    new Date();

  const storageKey = [
    "uploads",
    String(
      now.getUTCFullYear()
    ),
    String(
      now.getUTCMonth() + 1
    ).padStart(2, "0"),
    String(userId),
    `${uploadPublicId}.${extension}`
  ].join("/");

  const sha256 =
    await calculateSha256(
      buffer
    );

  const status =
    Boolean(
      interaction
        .moderation_required
    )
      ? "pending"
      : "approved";

  try {
    await env.INTERACTION_UPLOADS.put(
      storageKey,
      buffer,
      {
        httpMetadata: {
          contentType:
            detectedContentType
        },

        customMetadata: {
          uploadPublicId,
          userId: String(userId),
          interactionPublicId:
            interaction.public_id,
          sha256
        }
      }
    );

    const insertion =
      await env.DB.prepare(`
        INSERT INTO
          interaction_uploads (
            public_id,
            user_id,
            interaction_id,
            storage_key,
            original_name,
            content_type,
            file_size_bytes,
            sha256,
            status,
            credit_cost_cents,
            credit_refunded,
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
          0,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `)
        .bind(
          uploadPublicId,
          userId,
          Number(interaction.id),
          storageKey,
          cleanFileName(file.name),
          detectedContentType,
          buffer.byteLength,
          sha256,
          status,
          costCents
        )
        .run();

    const updatedWallet =
      await findWallet(
        env,
        userId
      );

    return json(
      {
        success: true,

        upload: {
          id: Number(
            insertion.meta
              ?.last_row_id
          ),

          publicId:
            uploadPublicId,

          interactionPublicId:
            interaction.public_id,

          interactionTitle:
            interaction.title,

          creator: {
            id: Number(
              interaction.creator_id
            ),

            slug:
              interaction.creator_slug,

            displayName:
              interaction.creator_name
          },

          originalName:
            cleanFileName(
              file.name
            ),

          contentType:
            detectedContentType,

          fileSizeBytes:
            buffer.byteLength,

          status,

          costCents
        },

        wallet: {
          balanceCents:
            Number(
              updatedWallet
                ?.balance_cents ?? 0
            ),

          totalSpentCents:
            Number(
              updatedWallet
                ?.total_spent_cents ??
              0
            )
        }
      },
      201
    );
  } catch (error) {
    try {
      await env.INTERACTION_UPLOADS
        .delete(storageKey);
    } catch (
      storageDeletionError
    ) {
      console.error(
        "Impossible de supprimer l’image R2 :",
        storageDeletionError
      );
    }

    if (
      String(error?.message || error)
        .includes(
          "INSUFFICIENT_CREDITS"
        )
    ) {
      return json(
        {
          error:
            "Tu n’as plus assez de crédits."
        },
        409
      );
    }

    console.error(
      "Impossible d’enregistrer l’image :",
      error
    );

    return json(
      {
        error:
          "Impossible d’envoyer l’image."
      },
      500
    );
  }
}