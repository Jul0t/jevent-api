import {
    json
} from "../shared/responses.js";

import {
    requireAuthentication
} from "../auth/permissions.js";

import {
    recordSiteInteraction
} from "./interactions.js";

const MAXIMUM_BADGES = 5;

function normalizeBadgeKeys(value) {
    if (!Array.isArray(value)) {
        return null;
    }

    const result = [];

    for (const item of value) {
        const badgeKey =
            String(item ?? "")
                .trim()
                .slice(0, 100);

        if (
            badgeKey &&
            !result.includes(badgeKey)
        ) {
            result.push(badgeKey);
        }
    }

    return result;
}

export async function updateBadgeShowcase(
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

    const badgeKeys =
        normalizeBadgeKeys(
            body?.badges
        );

    if (!badgeKeys) {
        return json(
            {
                error:
                    "La liste des badges est obligatoire."
            },
            400
        );
    }

    if (
        badgeKeys.length >
        MAXIMUM_BADGES
    ) {
        return json(
            {
                error:
                    "Tu peux sélectionner au maximum 5 badges."
            },
            400
        );
    }

    const userId =
        Number(
            authorization.user.id
        );

    /*
     * Vérifie que tous les badges sélectionnés
     * sont réellement débloqués par le compte.
     */

    if (badgeKeys.length > 0) {
        const placeholders =
            badgeKeys
                .map(() => "?")
                .join(", ");

        const result =
            await env.DB.prepare(`
        SELECT
          user_badges.badge_key

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
          AND user_badges.badge_key
            IN (${placeholders})
      `)
                .bind(
                    userId,
                    ...badgeKeys
                )
                .all();

        const unlockedKeys =
            new Set(
                (result.results ?? []).map(
                    row => row.badge_key
                )
            );

        const invalidBadge =
            badgeKeys.find(
                key =>
                    !unlockedKeys.has(key)
            );

        if (invalidBadge) {
            return json(
                {
                    error:
                        "Un badge sélectionné n’est pas débloqué ou n’est plus disponible."
                },
                400
            );
        }
    }

    const statements = [
        env.DB.prepare(`
      DELETE FROM user_badge_showcase
      WHERE user_id = ?
    `)
            .bind(userId)
    ];

    badgeKeys.forEach(
        (badgeKey, index) => {
            statements.push(
                env.DB.prepare(`
          INSERT INTO user_badge_showcase (
            user_id,
            badge_key,
            display_order,
            added_at
          )
          VALUES (
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP
          )
        `)
                    .bind(
                        userId,
                        badgeKey,
                        index + 1
                    )
            );
        }
    );

    await env.DB.batch(statements);

    await recordSiteInteraction(
        env,
        {
            userId,
            interactionKey:
                "badge_showcase_update",

            eventKey:
                "jevent-2026",

            amount: 1
        }
    );

    return json({
        success: true,
        maximum: MAXIMUM_BADGES,
        showcase: badgeKeys
    });
}