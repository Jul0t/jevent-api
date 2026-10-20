import {
  requireAuthentication
} from "../auth/permissions.js";

import {
  generateRandomToken
} from "../shared/security.js";

import {
  json
} from "../shared/responses.js";

function parseConfig(value) {
  try {
    const parsed =
      JSON.parse(value || "{}");

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

function isInteractionOpen(interaction) {
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
      now >= closesAt
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

function generatePersonalCode() {
  return (
    "JEV-" +
    generateRandomToken(8)
  ).toUpperCase();
}

async function findWallet(env, userId) {
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

async function ensureWallet(env, userId) {
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
    attempt < 10;
    attempt += 1
  ) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO interaction_wallets (
        user_id,
        personal_code,
        balance_cents,
        total_earned_cents,
        total_spent_cents,
        created_at,
        updated_at
      )
      VALUES (?, ?, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
      .bind(
        userId,
        generatePersonalCode()
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

export async function createInteractionEffect(
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

  let body;

  try {
    body =
      await request.json();
  } catch {
    return json(
      {
        error:
          "Le JSON envoyé est invalide."
      },
      400
    );
  }

  const interactionPublicId =
    String(
      body?.interactionPublicId ||
      ""
    ).trim();

  if (!interactionPublicId) {
    return json(
      {
        error:
          "L’identifiant de l’interaction est obligatoire."
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
        interactions.visible,
        interactions.enabled,
        interactions.config_json,
        interactions.opens_at,
        interactions.closes_at,

        creators.id AS creator_id,
        creators.slug AS creator_slug

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
    "effect"
  ) {
    return json(
      {
        error:
          "Cette interaction n’est pas un effet visuel."
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
    isInteractionOpen(
      interaction
    );

  if (!availability.open) {
    return json(
      {
        error:
          availability.error
      },
      409
    );
  }

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

  const userId =
    Number(
      authorization.user.id
    );

  const wallet =
    await ensureWallet(
      env,
      userId
    );

  if (
    Number(wallet.balance_cents) <
    costCents
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

  const configuration =
    parseConfig(
      interaction.config_json
    );

  /*
   * Si effectKey est renseigné plus tard
   * dans la configuration, il sera utilisé.
   * Sinon, l’identifiant de l’interaction
   * servira de clé par défaut.
   */
  const effectKey =
    String(
      configuration.effectKey ||
      interaction.public_id
    )
      .trim()
      .slice(0, 160);

  const deliveryPublicId =
    `effect_${generateRandomToken(18)}`;

  try {
    const insertion =
      await env.DB.prepare(`
        INSERT INTO interaction_effect_deliveries (
          public_id,
          interaction_id,
          creator_id,
          user_id,
          effect_key,
          cost_cents,
          status,
          created_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          'pending',
          CURRENT_TIMESTAMP
        )
      `)
        .bind(
          deliveryPublicId,
          Number(interaction.id),
          Number(interaction.creator_id),
          userId,
          effectKey,
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

        delivery: {
          id:
            Number(
              insertion.meta?.last_row_id
            ),

          publicId:
            deliveryPublicId,

          interactionPublicId:
            interaction.public_id,

          effectKey,

          status:
            "pending"
        },

        wallet: {
          balanceCents:
            Number(
              updatedWallet?.balance_cents ??
              0
            ),

          totalSpentCents:
            Number(
              updatedWallet?.total_spent_cents ??
              0
            )
        }
      },
      201
    );
  } catch (error) {
    if (
      String(
        error?.message ||
        error
      ).includes(
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
      "Impossible de déclencher l’effet :",
      error
    );

    return json(
      {
        error:
          "Impossible de déclencher l’effet."
      },
      500
    );
  }
}