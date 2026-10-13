import {
    json,
    forbidden,
    validationError
} from "../shared/responses.js";

import {
    resolveCreatorAccess
} from "./panel.js";

function canManageSettings(access) {
    return (
        access.user.permissions.isSuperAdmin ||
        ["owner", "delegate"].includes(
            access.membership?.memberRole
        )
    );
}

export async function listCreatorDonations(
    request,
    env
) {
    const access = await resolveCreatorAccess(
        request,
        env
    );

    if (!access.allowed) {
        return access.response;
    }

    const creator = await env.DB.prepare(`
    SELECT hide_donation_details_until_overlay
    FROM creators
    WHERE id = ?
    LIMIT 1
  `)
        .bind(access.creatorId)
        .first();

    const hideUntilOverlay = Boolean(
        creator?.hide_donation_details_until_overlay
    );

    const result = await env.DB.prepare(`
  SELECT *
  FROM (
    SELECT
      'donation' AS source,
      id AS source_id,
      donor_name,
      donation_message,
      amount_cents,
      currency,
      COALESCE(
        donated_at,
        created_at
      ) AS event_at,
      revealed_at
    FROM interaction_donations
    WHERE creator_id = ?
      AND status = 'credited'
      AND (
        provider_donation_id IS NULL
        OR provider_donation_id
          NOT LIKE 'archived_test_%'
      )

    UNION ALL

    SELECT
      'test' AS source,
      tests.id AS source_id,
      tests.donor_name,
      tests.donation_message,
      tests.amount_cents,
      tests.currency,
      tests.created_at AS event_at,
      tests.revealed_at
    FROM overlay_donation_tests AS tests
    INNER JOIN creator_overlays AS overlays
      ON overlays.id = tests.overlay_id
    WHERE overlays.creator_id = ?
  )
  ORDER BY
    event_at DESC,
    source_id DESC
  LIMIT 50
`)
        .bind(
            access.creatorId,
            access.creatorId
        )
        .all();

    const donations = (
        result.results ?? []
    ).map(row => {
        const isTest =
            row.source === "test";

        const revealed =
            !hideUntilOverlay ||
            Boolean(row.revealed_at);

        return {
            /*
             * Les tests utilisent un ID négatif pour éviter
             * les collisions avec les véritables dons.
             */
            id: isTest
                ? -Number(row.source_id)
                : Number(row.source_id),

            isTest,
            revealed,

            donorName: revealed
                ? row.donor_name || "Anonyme"
                : null,

            message: revealed
                ? row.donation_message || null
                : null,

            amountCents: revealed
                ? Number(row.amount_cents ?? 0)
                : null,

            currency: revealed
                ? row.currency || "EUR"
                : null,

            donatedAt: row.event_at
        };
    });

    return json({
        hideUntilOverlay,
        donations
    });
}

export async function updateDonationHistorySettings(
    request,
    env
) {
    const access = await resolveCreatorAccess(
        request,
        env
    );

    if (!access.allowed) {
        return access.response;
    }

    if (!canManageSettings(access)) {
        return forbidden(
            "Tu ne peux pas modifier ce paramètre."
        );
    }

    let body;

    try {
        body = await request.json();
    } catch {
        return validationError(
            "Le contenu envoyé est invalide."
        );
    }

    if (
        typeof body.hideUntilOverlay !==
        "boolean"
    ) {
        return validationError(
            "Le paramètre hideUntilOverlay est invalide."
        );
    }

    const current = await env.DB.prepare(`
    SELECT hide_donation_details_until_overlay
    FROM creators
    WHERE id = ?
    LIMIT 1
  `)
        .bind(access.creatorId)
        .first();

    const previousValue = Boolean(
        current?.hide_donation_details_until_overlay
    );

    const nextValue =
        body.hideUntilOverlay;

    if (previousValue !== nextValue) {
        await env.DB.batch([
            env.DB.prepare(`
        UPDATE creators
        SET
          hide_donation_details_until_overlay = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
                nextValue ? 1 : 0,
                access.creatorId
            ),

            /*
             * Les dons déjà reçus ne doivent pas être
             * de nouveau masqués si l’option est réactivée.
             */
            env.DB.prepare(`
        UPDATE interaction_donations
        SET revealed_at = COALESCE(
          revealed_at,
          CURRENT_TIMESTAMP
        )
        WHERE creator_id = ?
      `).bind(access.creatorId)
        ]);
    }

    return json({
        success: true,
        hideUntilOverlay: nextValue
    });
}

export async function deleteCreatorDonationTests(
    request,
    env
) {
    const access = await resolveCreatorAccess(
        request,
        env
    );

    if (!access.allowed) {
        return access.response;
    }

    if (!canManageSettings(access)) {
        return forbidden(
            "Tu ne peux pas supprimer les simulations."
        );
    }

    const result = await env.DB.prepare(`
    DELETE FROM overlay_donation_tests
    WHERE overlay_id IN (
      SELECT id
      FROM creator_overlays
      WHERE creator_id = ?
    )
  `)
        .bind(access.creatorId)
        .run();

    return json({
        success: true,
        deleted: Number(
            result.meta?.changes ?? 0
        )
    });
}

export async function revealCreatorDonation(
    request,
    env,
    rawDonationId
) {
    const access = await resolveCreatorAccess(
        request,
        env
    );

    if (!access.allowed) {
        return access.response;
    }

    const donationId = Number(
        rawDonationId
    );

    if (
        !Number.isSafeInteger(donationId) ||
        donationId === 0
    ) {
        return validationError(
            "Ce don est invalide."
        );
    }

    let result;

    if (donationId < 0) {
        /*
         * ID négatif = simulation.
         * -85 correspond au test 85 dans la base.
         */
        result = await env.DB.prepare(`
            UPDATE overlay_donation_tests
            SET revealed_at = COALESCE(
                revealed_at,
                CURRENT_TIMESTAMP
            )
            WHERE id = ?
              AND EXISTS (
                  SELECT 1
                  FROM creator_overlays
                  WHERE creator_overlays.id =
                    overlay_donation_tests.overlay_id
                    AND creator_overlays.creator_id = ?
              )
        `)
            .bind(
                Math.abs(donationId),
                access.creatorId
            )
            .run();
    } else {
        /*
         * ID positif = véritable don.
         */
        result = await env.DB.prepare(`
            UPDATE interaction_donations
            SET revealed_at = COALESCE(
                revealed_at,
                CURRENT_TIMESTAMP
            )
            WHERE id = ?
              AND creator_id = ?
        `)
            .bind(
                donationId,
                access.creatorId
            )
            .run();
    }

    const changes = Number(
        result.meta?.changes ?? 0
    );

    if (changes === 0) {
        return json(
            {
                error:
                    "Le don est introuvable pour ce créateur."
            },
            404
        );
    }

    return json({
        success: true,
        donationId,
        revealed: true
    });
}
