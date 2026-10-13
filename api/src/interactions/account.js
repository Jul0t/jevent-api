import {
    json
} from "../shared/responses.js";

import {
    requireAuthentication
} from "../auth/permissions.js";

const CODE_ALPHABET =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePersonalCode() {
    const randomValues =
        new Uint8Array(7);

    crypto.getRandomValues(
        randomValues
    );

    const characters =
        [...randomValues]
            .map(
                value =>
                    CODE_ALPHABET[
                    value %
                    CODE_ALPHABET.length
                    ]
            )
            .join("");

    return `JEV-${characters}`;
}

function creditsFromCents(value) {
    return (
        Number(value ?? 0) /
        100
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

function isInteractionOpen(
    interaction,
    now = Date.now()
) {
    if (interaction.opens_at) {
        const opensAt =
            new Date(
                interaction.opens_at
            ).getTime();

        if (
            Number.isFinite(opensAt) &&
            now < opensAt
        ) {
            return false;
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
            return false;
        }
    }

    return true;
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
      total_spent_cents,
      created_at,
      updated_at
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
    const existingWallet =
        await findWallet(
            env,
            userId
        );

    if (existingWallet) {
        return existingWallet;
    }

    /*
     * Plusieurs essais permettent d’éviter
     * une collision très improbable entre
     * deux codes personnels.
     */
    for (
        let attempt = 0;
        attempt < 10;
        attempt += 1
    ) {
        const personalCode =
            generatePersonalCode();

        const result =
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

        if (
            Number(
                result.meta?.changes ?? 0
            ) > 0
        ) {
            return findWallet(
                env,
                userId
            );
        }

        /*
         * Une autre requête a peut-être créé
         * le portefeuille en même temps.
         */
        const concurrentWallet =
            await findWallet(
                env,
                userId
            );

        if (concurrentWallet) {
            return concurrentWallet;
        }
    }

    throw new Error(
        "Impossible de générer un code personnel."
    );
}

function mapUpload(upload) {
    return {
        publicId:
            upload.public_id,

        originalName:
            upload.original_name,

        contentType:
            upload.content_type,

        fileSizeBytes:
            Number(
                upload.file_size_bytes
            ),

        width:
            upload.width === null
                ? null
                : Number(upload.width),

        height:
            upload.height === null
                ? null
                : Number(upload.height),

        status:
            upload.status,

        creditCostCents:
            Number(
                upload.credit_cost_cents
            ),

        creditCost:
            creditsFromCents(
                upload.credit_cost_cents
            ),

        creditRefunded:
            Boolean(
                upload.credit_refunded
            ),

        moderationNote:
            upload.moderation_note,

        reviewedAt:
            upload.reviewed_at,

        createdAt:
            upload.created_at,

        updatedAt:
            upload.updated_at
    };
}

export async function getInteractionAccount(
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

    const wallet =
        await ensureWallet(
            env,
            userId
        );

    if (!wallet) {
        return json(
            {
                error:
                    "Impossible de charger le portefeuille."
            },
            500
        );
    }

    const [
        settings,
        interactionsResult,
        donationsResult,
        uploadsResult,
        uploadCountsResult,
        ledgerResult
    ] = await Promise.all([

        env.DB.prepare(`
      SELECT
        enabled,
        image_cost_cents,
        maximum_file_size_bytes,
        updated_at
      FROM interaction_settings
      WHERE id = 1
      LIMIT 1
    `).first(),

        env.DB.prepare(`
  SELECT
    interactions.id,
    interactions.public_id,
    interactions.slug
      AS interaction_slug,

    interactions.title,
    interactions.description,
    interactions.interaction_type,
    interactions.cost_cents,
    interactions.moderation_required,
    interactions.config_json,
    interactions.display_order,
    interactions.opens_at,
    interactions.closes_at,

    creators.id
      AS creator_id,

    creators.slug
      AS creator_slug,

    creators.twitch_login,
    creators.twitch_display_name,
    creators.twitch_profile_image_url

  FROM creator_interactions
    AS interactions

  INNER JOIN creators
    ON creators.id =
      interactions.creator_id

  WHERE interactions.visible = 1
    AND interactions.enabled = 1
    AND creators.active = 1
    AND creators.archived = 0

  ORDER BY
    creators.display_order ASC,
    creators.twitch_display_name
      COLLATE NOCASE ASC,
    interactions.display_order ASC,
    interactions.title
      COLLATE NOCASE ASC
`).all(),

        env.DB.prepare(`
      SELECT
        id,
        provider,
        provider_donation_id,
        creator_id,
        donor_name,
        donation_message,
        amount_cents,
        credited_cents,
        currency,
        status,
        donated_at,
        created_at
      FROM interaction_donations
      WHERE user_id = ?
      ORDER BY
        COALESCE(
          donated_at,
          created_at
        ) DESC,
        id DESC
      LIMIT 20
    `)
            .bind(userId)
            .all(),

        env.DB.prepare(`
      SELECT
        public_id,
        original_name,
        content_type,
        file_size_bytes,
        width,
        height,
        status,
        credit_cost_cents,
        credit_refunded,
        moderation_note,
        reviewed_at,
        created_at,
        updated_at
      FROM interaction_uploads
      WHERE user_id = ?
      ORDER BY
        created_at DESC,
        id DESC
      LIMIT 30
    `)
            .bind(userId)
            .all(),

        env.DB.prepare(`
      SELECT
        status,
        COUNT(*) AS total
      FROM interaction_uploads
      WHERE user_id = ?
      GROUP BY status
    `)
            .bind(userId)
            .all(),

        env.DB.prepare(`
      SELECT
        entry_type,
        amount_cents,
        balance_after_cents,
        reference_key,
        note,
        created_at
      FROM interaction_credit_ledger
      WHERE user_id = ?
      ORDER BY
        created_at DESC,
        id DESC
      LIMIT 30
    `)
            .bind(userId)
            .all()
    ]);

    const imageCostCents =
        Number(
            settings
                ?.image_cost_cents ??
            500
        );

    const maximumFileSizeBytes =
        Number(
            settings
                ?.maximum_file_size_bytes ??
            2_097_152
        );

    const uploadCounts = {
        pending: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0
    };

    for (
        const row of
        uploadCountsResult.results ?? []
    ) {
        if (
            Object.hasOwn(
                uploadCounts,
                row.status
            )
        ) {
            uploadCounts[row.status] =
                Number(row.total ?? 0);
        }
    }

    const walletBalanceCents =
        Number(
            wallet.balance_cents ?? 0
        );

    const interactions =
        (
            interactionsResult.results ??
            []
        ).map(interaction => {
            const costCents =
                Number(
                    interaction.cost_cents ?? 0
                );

            const open =
                isInteractionOpen(
                    interaction
                );

            const enoughCredits =
                walletBalanceCents >=
                costCents;

            return {
                id:
                    Number(interaction.id),

                publicId:
                    interaction.public_id,

                slug:
                    interaction.interaction_slug,

                title:
                    interaction.title,

                description:
                    interaction.description ?? "",

                type:
                    interaction.interaction_type,

                costCents,

                cost:
                    creditsFromCents(
                        costCents
                    ),

                moderationRequired:
                    Boolean(
                        interaction
                            .moderation_required
                    ),

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

                open,

                enoughCredits,

                available:
                    Boolean(
                        settings?.enabled ?? 1
                    ) &&
                    open &&
                    enoughCredits,

                missingCreditsCents:
                    enoughCredits
                        ? 0
                        : (
                            costCents -
                            walletBalanceCents
                        ),

                missingCredits:
                    enoughCredits
                        ? 0
                        : creditsFromCents(
                            costCents -
                            walletBalanceCents
                        ),

                creator: {
                    id:
                        Number(
                            interaction.creator_id
                        ),

                    slug:
                        interaction.creator_slug,

                    twitchLogin:
                        interaction.twitch_login,

                    displayName:
                        interaction
                            .twitch_display_name,

                    profileImageUrl:
                        interaction
                            .twitch_profile_image_url
                }
            };
        });

    return json({
        private: true,

        settings: {
            enabled:
                settings
                    ? Boolean(settings.enabled)
                    : true,

            creditsPerEuro: 1,

            imageCostCents,

            imageCost:
                creditsFromCents(
                    imageCostCents
                ),

            maximumFileSizeBytes,

            maximumFileSizeMegabytes:
                Number(
                    (
                        maximumFileSizeBytes /
                        1_048_576
                    ).toFixed(2)
                ),

            allowedContentTypes: [
                "image/jpeg",
                "image/png",
                "image/webp"
            ]
        },

        wallet: {
            personalCode:
                wallet.personal_code,

            balanceCents:
                Number(
                    wallet.balance_cents
                ),

            balance:
                creditsFromCents(
                    wallet.balance_cents
                ),

            totalEarnedCents:
                Number(
                    wallet.total_earned_cents
                ),

            totalEarned:
                creditsFromCents(
                    wallet.total_earned_cents
                ),

            totalSpentCents:
                Number(
                    wallet.total_spent_cents
                ),

            totalSpent:
                creditsFromCents(
                    wallet.total_spent_cents
                ),

            canSubmitImage:
                Boolean(settings?.enabled ?? 1) &&
                Number(wallet.balance_cents) >=
                imageCostCents,

            createdAt:
                wallet.created_at,

            updatedAt:
                wallet.updated_at
        },
        
        interactions: {
            total:
                interactions.length,

            items:
                interactions
        },

        donations:
            (
                donationsResult.results ??
                []
            ).map(donation => ({
                id:
                    Number(donation.id),

                provider:
                    donation.provider,

                creatorId:
                    donation.creator_id === null
                        ? null
                        : Number(
                            donation.creator_id
                        ),

                donorName:
                    donation.donor_name,

                message:
                    donation.donation_message,

                amountCents:
                    Number(
                        donation.amount_cents
                    ),

                amount:
                    creditsFromCents(
                        donation.amount_cents
                    ),

                creditedCents:
                    Number(
                        donation.credited_cents
                    ),

                credited:
                    creditsFromCents(
                        donation.credited_cents
                    ),

                currency:
                    donation.currency,

                status:
                    donation.status,

                donatedAt:
                    donation.donated_at,

                createdAt:
                    donation.created_at
            })),

        uploads: {
            counts:
                uploadCounts,

            items:
                (
                    uploadsResult.results ??
                    []
                ).map(mapUpload)
        },

        ledger:
            (
                ledgerResult.results ??
                []
            ).map(entry => ({
                type:
                    entry.entry_type,

                amountCents:
                    Number(
                        entry.amount_cents
                    ),

                amount:
                    creditsFromCents(
                        entry.amount_cents
                    ),

                balanceAfterCents:
                    Number(
                        entry.balance_after_cents
                    ),

                balanceAfter:
                    creditsFromCents(
                        entry.balance_after_cents
                    ),

                referenceKey:
                    entry.reference_key,

                note:
                    entry.note,

                createdAt:
                    entry.created_at
            }))
    });
}