import {
  json
} from "../shared/responses.js";

import {
  generateRandomToken
} from "../shared/security.js";

import {
  syncStreamlabsCharityDonations
} from "../interactions/streamlabs-donations.js";

import {
  claimNextDonationTest,
  completeDonationTest,
  revealDonationTest,
} from "./donation-tests.js";

const DONATION_SYNC_INTERVAL_MS =
  5000;

let lastDonationSyncAt = 0;
let donationSyncPromise = null;

async function refreshDonations(env) {
  if (donationSyncPromise) {
    return donationSyncPromise;
  }

  if (
    Date.now() -
    lastDonationSyncAt <
    DONATION_SYNC_INTERVAL_MS
  ) {
    return null;
  }

  lastDonationSyncAt =
    Date.now();

  donationSyncPromise =
    syncStreamlabsCharityDonations(env)
      .catch(error => {
        console.error(
          "[Overlay dons] Synchronisation impossible :",
          error
        );

        return null;
      })
      .finally(() => {
        donationSyncPromise = null;
      });

  return donationSyncPromise;
}

async function findDonationOverlay(
  env,
  accessToken
) {
  return env.DB.prepare(`
    SELECT
      id,
      creator_id,
      enabled

    FROM creator_overlays

    WHERE access_token = ?
      AND overlay_type = 'donations'

    LIMIT 1
  `)
    .bind(accessToken)
    .first();
}

async function initializeCursor(
  env,
  overlay
) {
  const existing =
    await env.DB.prepare(`
      SELECT last_donation_id

      FROM overlay_donation_cursors

      WHERE overlay_id = ?

      LIMIT 1
    `)
      .bind(overlay.id)
      .first();

  if (existing) {
    return {
      initialized: false,

      lastDonationId:
        Number(
          existing.last_donation_id ??
          0
        )
    };
  }

  /*
   * On importe d’abord les dons déjà existants.
   * Ils ne seront donc pas rejoués au premier
   * chargement de l’overlay.
   */
  await refreshDonations(env);

  const latest =
    await env.DB.prepare(`
      SELECT
        COALESCE(
          MAX(id),
          0
        ) AS last_donation_id

      FROM interaction_donations

      WHERE creator_id = ?
    `)
      .bind(
        overlay.creator_id
      )
      .first();

  const lastDonationId =
    Number(
      latest?.last_donation_id ??
      0
    );

  await env.DB.prepare(`
    INSERT OR IGNORE INTO
      overlay_donation_cursors (
        overlay_id,
        last_donation_id,
        initialized_at,
        updated_at
      )

    VALUES (
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      overlay.id,
      lastDonationId
    )
    .run();

  return {
    initialized: true,
    lastDonationId
  };
}

async function enqueueDonations(
  env,
  overlay,
  lastDonationId
) {
  const result =
    await env.DB.prepare(`
      SELECT id

      FROM interaction_donations

      WHERE creator_id = ?
        AND id > ?
        AND status = 'credited'

      ORDER BY id ASC

      LIMIT 100
    `)
      .bind(
        overlay.creator_id,
        lastDonationId
      )
      .all();

  const donations =
    result.results ?? [];

  if (donations.length === 0) {
    return;
  }

  const statements =
    donations.map(donation =>
      env.DB.prepare(`
        INSERT OR IGNORE INTO
          overlay_donation_deliveries (
            public_id,
            overlay_id,
            donation_id,
            status,
            created_at,
            updated_at
          )

        VALUES (
          ?,
          ?,
          ?,
          'pending',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `)
        .bind(
          `delivery_${generateRandomToken(16)
          }`,

          overlay.id,
          donation.id
        )
    );

  await env.DB.batch(
    statements
  );

  const newestDonationId =
    Math.max(
      ...donations.map(
        donation =>
          Number(donation.id)
      )
    );

  await env.DB.prepare(`
    UPDATE overlay_donation_cursors

    SET
      last_donation_id = ?,
      updated_at =
        CURRENT_TIMESTAMP

    WHERE overlay_id = ?
  `)
    .bind(
      newestDonationId,
      overlay.id
    )
    .run();
}

function currencyUnit(currency) {
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

export async function getNextDonationDelivery(
  request,
  env,
  rawAccessToken
) {
  const accessToken =
    String(
      rawAccessToken || ""
    ).trim();

  const overlay =
    await findDonationOverlay(
      env,
      accessToken
    );

  if (
    !overlay ||
    !Boolean(overlay.enabled)
  ) {
    return json(
      {
        error:
          "Cet overlay n’existe pas ou est désactivé."
      },
      404
    );
  }

  const testDelivery =
    await claimNextDonationTest(
      env,
      Number(overlay.id)
    );

  if (testDelivery) {
    return json({
      initialized: false,
      delivery: testDelivery,
      claimToken:
        testDelivery.claimToken
    });
  }

  const cursor =
    await initializeCursor(
      env,
      overlay
    );

  if (cursor.initialized) {
    return json({
      initialized: true,
      delivery: null
    });
  }

  /*
   * Une ancienne alerte réapparaît dans la file
   * si elle n’a jamais été confirmée.
   */
  await env.DB.prepare(`
    UPDATE overlay_donation_deliveries

    SET
      status = 'pending',
      claim_token = NULL,
      claimed_at = NULL,
      updated_at =
        CURRENT_TIMESTAMP

    WHERE overlay_id = ?
      AND status = 'claimed'

      AND datetime(claimed_at)
        <= datetime(
          'now',
          '-5 minutes'
        )
  `)
    .bind(overlay.id)
    .run();

  //await refreshDonations(env);

  const currentCursor =
    await env.DB.prepare(`
      SELECT last_donation_id

      FROM overlay_donation_cursors

      WHERE overlay_id = ?

      LIMIT 1
    `)
      .bind(overlay.id)
      .first();

  await enqueueDonations(
    env,
    overlay,

    Number(
      currentCursor
        ?.last_donation_id ??
      0
    )
  );

  const pending =
    await env.DB.prepare(`
      SELECT
        deliveries.id,
        deliveries.public_id

      FROM overlay_donation_deliveries
        AS deliveries

      WHERE deliveries.overlay_id = ?
        AND deliveries.status =
          'pending'

      ORDER BY deliveries.id ASC

      LIMIT 1
    `)
      .bind(overlay.id)
      .first();

  if (!pending) {
    return json({
      initialized: false,
      delivery: null
    });
  }

  const claimToken =
    generateRandomToken(24);

  const claim =
    await env.DB.prepare(`
      UPDATE overlay_donation_deliveries

      SET
        status = 'claimed',
        claim_token = ?,
        claimed_at =
          CURRENT_TIMESTAMP,
        updated_at =
          CURRENT_TIMESTAMP

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
      claim.meta?.changes ??
      0
    ) === 0
  ) {
    return json({
      initialized: false,
      delivery: null
    });
  }

  const delivery =
    await env.DB.prepare(`
      SELECT
        deliveries.public_id,
        donations.provider_donation_id,
        donations.donor_name,
        donations.donation_message,
        donations.amount_cents,
        donations.currency,
        donations.donated_at

      FROM overlay_donation_deliveries
        AS deliveries

      INNER JOIN interaction_donations
        AS donations
        ON donations.id =
          deliveries.donation_id

      WHERE deliveries.id = ?

      LIMIT 1
    `)
      .bind(pending.id)
      .first();

  const amountCents =
    Number(
      delivery.amount_cents ??
      0
    );

  return json({
    initialized: false,

    delivery: {
      publicId:
        delivery.public_id,

      claimToken,

      donation: {
        providerDonationId:
          delivery.provider_donation_id,

        donorName:
          delivery.donor_name ||
          "Anonyme",

        message:
          delivery.donation_message ||
          "",

        amountCents,

        amount:
          (
            amountCents / 100
          ).toFixed(2),

        unit:
          currencyUnit(
            delivery.currency
          ),

        currency:
          delivery.currency,

        donatedAt:
          delivery.donated_at
      }
    }
  });
}

async function revealDonationForDelivery(
  env,
  overlayId,
  deliveryPublicId,
  claimToken
) {
  const result = await env.DB.prepare(`
    UPDATE interaction_donations
    SET revealed_at = COALESCE(
      revealed_at,
      CURRENT_TIMESTAMP
    )
    WHERE id = (
      SELECT donation_id
      FROM overlay_donation_deliveries
      WHERE overlay_id = ?
        AND public_id = ?
        AND claim_token = ?
        AND status IN ('claimed', 'delivered')
      LIMIT 1
    )
  `)
    .bind(
      overlayId,
      deliveryPublicId,
      claimToken
    )
    .run();

  return Number(
    result.meta?.changes ?? 0
  ) > 0;
}

export async function revealDonationDelivery(
  request,
  env,
  rawAccessToken,
  rawDeliveryPublicId
) {
  const overlay =
    await findDonationOverlay(
      env,
      String(
        rawAccessToken || ""
      ).trim()
    );

  if (
    !overlay ||
    !Boolean(overlay.enabled)
  ) {
    return json(
      {
        error:
          "Cet overlay n’existe pas ou est désactivé."
      },
      404
    );
  }

  let payload = {};

  try {
    payload =
      await request.json();
  } catch {
    payload = {};
  }

  const claimToken =
    String(
      payload.claimToken || ""
    ).trim();

  if (!claimToken) {
    return json(
      {
        error:
          "Le jeton de lecture manque."
      },
      400
    );
  }

  const deliveryPublicId =
    String(
      rawDeliveryPublicId || ""
    ).trim();

  /*
   * On tente d’abord de révéler
   * une simulation.
   */
  const testRevealed =
    await revealDonationTest(
      env,
      Number(overlay.id),
      deliveryPublicId,
      claimToken
    );

  if (testRevealed) {
    return json({
      success: true,
      revealed: true,
      test: true
    });
  }

  /*
   * Sinon, il s’agit d’un vrai don.
   */
  const revealed =
    await revealDonationForDelivery(
      env,
      overlay.id,
      deliveryPublicId,
      claimToken
    );

  return json({
    success: true,
    revealed,
    test: false
  });
}

export async function completeDonationDelivery(
  request,
  env,
  rawAccessToken,
  rawDeliveryPublicId
) {
  const overlay =
    await findDonationOverlay(
      env,
      String(
        rawAccessToken || ""
      ).trim()
    );

  if (
    !overlay ||
    !Boolean(overlay.enabled)
  ) {
    return json(
      {
        error:
          "Cet overlay n’existe pas ou est désactivé."
      },
      404
    );
  }

  let payload = {};

  try {
    payload =
      await request.json();
  } catch {
    payload = {};
  }

  const claimToken =
    String(
      payload.claimToken || ""
    ).trim();

  if (!claimToken) {
    return json(
      {
        error:
          "Le jeton de lecture manque."
      },
      400
    );
  }

  const testCompleted =
    await completeDonationTest(
      env,
      Number(overlay.id),
      String(
        rawDeliveryPublicId || ""
      ),
      claimToken
    );

  if (testCompleted) {
    return json({
      success: true,
      test: true
    });
  }

  const result =
    await env.DB.prepare(`
      UPDATE overlay_donation_deliveries

      SET
        status = 'delivered',
        delivered_at =
          CURRENT_TIMESTAMP,
        updated_at =
          CURRENT_TIMESTAMP

      WHERE overlay_id = ?
        AND public_id = ?
        AND status = 'claimed'
        AND claim_token = ?
    `)
      .bind(
        overlay.id,

        String(
          rawDeliveryPublicId || ""
        ).trim(),

        claimToken
      )
      .run();

  if (
    Number(
      result.meta?.changes ??
      0
    ) === 0
  ) {
    return json(
      {
        error:
          "Cette alerte est invalide ou déjà terminée."
      },
      409
    );
  }

  /*
 * Révélation de secours si l’overlay n’a pas
 * détecté la couche contenant le montant.
 */
  await env.DB.prepare(`
    UPDATE interaction_donations
    SET revealed_at =
      COALESCE(
        revealed_at,
        CURRENT_TIMESTAMP
      )
    WHERE id = (
      SELECT donation_id
      FROM overlay_donation_deliveries
      WHERE overlay_id = ?
        AND public_id = ?
        AND claim_token = ?
      LIMIT 1
    )
  `)
    .bind(
      overlay.id,
      String(
        rawDeliveryPublicId || ""
      ).trim(),
      claimToken
    )
    .run();

  await revealDonationForDelivery(
    env,
    overlay.id,
    String(
      rawDeliveryPublicId || ""
    ).trim(),
    claimToken
  );

  return json({
    success: true
  });
}