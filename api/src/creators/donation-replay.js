import { json } from "../shared/responses.js";
import { generateRandomToken } from "../shared/security.js";
import { resolveCreatorAccess } from "./panel.js";

export async function replayCreatorDonation(
    request,
    env,
    rawDonationId
) {
    const access = await resolveCreatorAccess(request, env);

    if (!access.allowed) {
        return access.response;
    }

    const canManage =
        access.user.permissions.isSuperAdmin ||
        ["owner", "delegate"].includes(
            access.membership?.memberRole
        );

    if (!canManage) {
        return json(
            { error: "Tu ne peux pas rejouer les alertes." },
            403
        );
    }

    const donationId = Number(rawDonationId);

    if (!Number.isSafeInteger(donationId) || donationId === 0) {
        return json({ error: "Identifiant de don invalide." }, 400);
    }

    const overlay = await env.DB.prepare(`
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
            { error: "Aucun overlay de dons actif pour ce créateur." },
            404
        );
    }

    let result;

    if (donationId < 0) {
        // Les tests sont identifiés négativement dans l’historique.
        result = await env.DB.prepare(`
      UPDATE overlay_donation_tests
      SET
        public_id = ?,
        status = 'pending',
        claim_token = NULL,
        claimed_at = NULL,
        completed_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND overlay_id = ?
        AND status NOT IN ('pending', 'claimed')
    `)
            .bind(
                `test_delivery_${generateRandomToken(16)}`,
                Math.abs(donationId),
                overlay.id
            )
            .run();
    } else {
        const donation = await env.DB.prepare(`
      SELECT id
      FROM interaction_donations
      WHERE id = ?
        AND creator_id = ?
        AND status = 'credited'
      LIMIT 1
    `)
            .bind(donationId, access.creatorId)
            .first();

        if (!donation) {
            return json(
                { error: "Don introuvable pour ce créateur." },
                404
            );
        }

        result = await env.DB.prepare(`
      INSERT INTO overlay_donation_deliveries (
        public_id,
        overlay_id,
        donation_id,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

      ON CONFLICT(overlay_id, donation_id)
      DO UPDATE SET
        public_id = excluded.public_id,
        status = 'pending',
        claim_token = NULL,
        claimed_at = NULL,
        delivered_at = NULL,
        updated_at = CURRENT_TIMESTAMP

      WHERE overlay_donation_deliveries.status = 'delivered'
    `)
            .bind(
                `delivery_${generateRandomToken(16)}`,
                overlay.id,
                donationId
            )
            .run();
    }

    if (Number(result.meta?.changes ?? 0) === 0) {
        return json(
            {
                error:
                    "Cette alerte est déjà en attente, en cours de lecture, ou le test est introuvable."
            },
            409
        );
    }

    return json({
        success: true,
        queued: true,
        donationId
    });
}