import {
  json,
  forbidden
} from "../shared/responses.js";

import {
  generateRandomToken
} from "../shared/security.js";

import {
  resolveCreatorAccess
} from "../creators/panel.js";

function cleanText(
  value,
  maximum = 200
) {
  return String(value ?? "")
    .trim()
    .slice(0, maximum);
}

function getCurrencyUnit(currency) {
  switch (
  String(currency || "")
    .toUpperCase()
  ) {
    case "EUR":
      return "€";

    case "USD":
      return "$";

    case "GBP":
      return "£";

    default:
      return currency || "";
  }
}

async function requireTestAccess(
  request,
  env
) {
  const access =
    await resolveCreatorAccess(
      request,
      env
    );

  if (!access.allowed) {
    return access;
  }

  const canManage =
    access.user.permissions.isSuperAdmin ||
    [
      "owner",
      "delegate"
    ].includes(
      access.membership?.memberRole
    );

  if (!canManage) {
    return {
      allowed: false,

      response: forbidden(
        "Tu ne peux pas tester cet overlay."
      )
    };
  }

  return access;
}

export async function createDonationOverlayTest(
  request,
  env
) {
  const access =
    await requireTestAccess(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  let payload = {};

  try {
    payload =
      await request.json();
  } catch {
    payload = {};
  }

  const overlay =
    await env.DB.prepare(`
      SELECT id

      FROM creator_overlays

      WHERE creator_id = ?
        AND overlay_type = 'donations'
        AND enabled = 1

      LIMIT 1
    `)
      .bind(access.creatorId)
      .first();

  if (!overlay) {
    return json(
      {
        error:
          "Crée et active d’abord l’overlay de dons."
      },
      404
    );
  }

  const requestedAmount =
    Number(payload.amountCents);

  const amountCents =
    Number.isFinite(requestedAmount)
      ? Math.max(
        1,
        Math.round(requestedAmount)
      )
      : 1000;

  const currency =
    cleanText(
      payload.currency || "EUR",
      10
    ).toUpperCase();

  const publicId =
    `test_delivery_${generateRandomToken(16)
    }`;

  await env.DB.prepare(`
    INSERT INTO overlay_donation_tests (
      public_id,
      overlay_id,
      created_by_user_id,
      donor_name,
      donation_message,
      amount_cents,
      currency,
      rule_public_id,
      variant_public_id,
      status,
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
      'pending',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      publicId,
      Number(overlay.id),
      Number(access.user.id),

      cleanText(
        payload.donorName ||
        "Donateur test",
        100
      ),

      cleanText(
        payload.message ||
        "Ceci est une alerte de test.",
        500
      ),

      amountCents,
      currency,

      cleanText(
        payload.rulePublicId,
        150
      ) || null,

      cleanText(
        payload.variantPublicId,
        150
      ) || null
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

export async function claimNextDonationTest(
  env,
  overlayId
) {
  await env.DB.prepare(`
    UPDATE overlay_donation_tests

    SET
      status = 'pending',
      claim_token = NULL,
      claimed_at = NULL,
      updated_at = CURRENT_TIMESTAMP

    WHERE overlay_id = ?
      AND status = 'claimed'
      AND datetime(claimed_at)
        <= datetime('now', '-5 minutes')
  `)
    .bind(overlayId)
    .run();

  const pending =
    await env.DB.prepare(`
      SELECT *

      FROM overlay_donation_tests

      WHERE overlay_id = ?
        AND status = 'pending'

      ORDER BY id ASC

      LIMIT 1
    `)
      .bind(overlayId)
      .first();

  if (!pending) {
    return null;
  }

  const claimToken =
    generateRandomToken(24);

  const result =
    await env.DB.prepare(`
      UPDATE overlay_donation_tests

      SET
        status = 'claimed',
        claim_token = ?,
        claimed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
        AND status = 'pending'
    `)
      .bind(
        claimToken,
        pending.id
      )
      .run();

  if (
    Number(
      result.meta?.changes ?? 0
    ) === 0
  ) {
    return null;
  }

  const amountCents =
    Number(pending.amount_cents);

  return {
    publicId:
      pending.public_id,

    claimToken,

    isTest: true,

    rulePublicId:
      pending.rule_public_id,

    variantPublicId:
      pending.variant_public_id,

    donation: {
      providerDonationId:
        pending.public_id,

      donorName:
        pending.donor_name ||
        "Donateur test",

      message:
        pending.donation_message || "",

      amountCents,

      amount:
        (
          amountCents / 100
        ).toFixed(2),

      unit:
        getCurrencyUnit(
          pending.currency
        ),

      currency:
        pending.currency,

      donatedAt:
        pending.created_at
    }
  };
}

export async function revealDonationTest(
  env,
  overlayId,
  publicId,
  claimToken
) {
  if (
    !String(publicId).startsWith(
      "test_delivery_"
    )
  ) {
    return false;
  }

  const result = await env.DB.prepare(`
    UPDATE overlay_donation_tests
    SET
      revealed_at = COALESCE(
        revealed_at,
        CURRENT_TIMESTAMP
      ),
      updated_at = CURRENT_TIMESTAMP
    WHERE overlay_id = ?
      AND public_id = ?
      AND claim_token = ?
      AND status IN (
        'claimed',
        'completed'
      )
  `)
    .bind(
      overlayId,
      publicId,
      claimToken
    )
    .run();

  return Number(
    result.meta?.changes ?? 0
  ) > 0;
}

export async function completeDonationTest(
  env,
  overlayId,
  publicId,
  claimToken
) {
  if (
    !String(publicId).startsWith(
      "test_delivery_"
    )
  ) {
    return false;
  }

  const result =
    await env.DB.prepare(`
      UPDATE overlay_donation_tests

SET
  status = 'completed',
  revealed_at = COALESCE(
    revealed_at,
    CURRENT_TIMESTAMP
  ),
  completed_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP

      WHERE overlay_id = ?
        AND public_id = ?
        AND status = 'claimed'
        AND claim_token = ?
    `)
      .bind(
        overlayId,
        publicId,
        claimToken
      )
      .run();

  return (
    Number(
      result.meta?.changes ?? 0
    ) > 0
  );
}