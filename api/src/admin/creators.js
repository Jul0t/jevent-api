import {
    json,
    forbidden,
    notFound,
    validationError
} from "../shared/responses.js";

import {
    requireAdminAccess
} from "./access.js";

import {
    creatorSlugExists,
    findCreatorByTwitchId,
    insertCreator,
    validateCreatorSlug
} from "../creators/repository.js";

const STREAMLABS_TEAM_ID =
    "984964121642539025";

async function fetchStreamlabsMembers() {
    const response = await fetch(
        `https://streamlabscharity.com/api/v1/teams/${STREAMLABS_TEAM_ID}/members`,
        {
            headers: {
                Accept: "application/json"
            }
        }
    );

    if (!response.ok) {
        throw new Error(
            `Streamlabs a répondu ${response.status}.`
        );
    }

    const data = await response.json();

    return Array.isArray(data.data)
        ? data.data
        : [];
}

function normalizeStreamlabsMember(member) {
    const user = member?.user;

    const twitchProvider =
        user?.providers?.find(
            provider =>
                provider.provider_type === "twitch"
        );

    if (!user || !twitchProvider) {
        return null;
    }

    return {
        teamMemberId: String(member.id),
        streamlabsUserId: String(user.id),

        twitchId:
            String(twitchProvider.provider_id),

        twitchLogin:
            String(
                user.platforms?.twitch ??
                user.display_name ??
                user.slug
            ).toLowerCase(),

        twitchDisplayName:
            String(user.display_name),

        twitchProfileImageUrl:
            user.avatar?.url ?? null,

        suggestedSlug:
            String(user.slug)
    };
}

export async function listStreamlabsMembers(
    request,
    env
) {
    const authentication =
        await requireAdminAccess(request, env);

    if (!authentication.allowed) {
        return authentication.response;
    }

    try {
        const members =
            await fetchStreamlabsMembers();

        const existingResult =
            await env.DB.prepare(`
    SELECT
      id,
      twitch_id,
      slug
    FROM creators
  `).all();

        const existingCreators =
            new Map(
                (existingResult.results ?? []).map(
                    creator => [
                        String(creator.twitch_id),
                        {
                            id: Number(creator.id),
                            slug: creator.slug
                        }
                    ]
                )
            );

        return json({
            members: members
                .map(normalizeStreamlabsMember)
                .filter(Boolean)
                .map(member => {
                    const existing =
                        existingCreators.get(
                            member.twitchId
                        );

                    return {
                        ...member,
                        imported: Boolean(existing),
                        creatorId: existing?.id ?? null,
                        creatorSlug:
                            existing?.slug ?? null
                    };
                })
        });
    } catch (error) {
        return json(
            {
                error:
                    error.message ||
                    "Impossible de récupérer les membres Streamlabs."
            },
            502
        );
    }
}

export async function importStreamlabsMember(
    request,
    env
) {
    const authentication =
        await requireAdminAccess(request, env);

    if (!authentication.allowed) {
        return authentication.response;
    }

    const body = await request.json();

    const requestedMemberId =
        String(body.teamMemberId ?? "");

    const members =
        await fetchStreamlabsMembers();

    const rawMember =
        members.find(
            member =>
                String(member.id) ===
                requestedMemberId
        );

    const member =
        normalizeStreamlabsMember(rawMember);

    if (!member) {
        return validationError(
            "Ce membre Streamlabs est introuvable."
        );
    }

    const existingCreator =
        await findCreatorByTwitchId(
            env,
            member.twitchId
        );

    if (existingCreator) {
        return validationError(
            "Ce streamer est déjà présent sur JEvent."
        );
    }

    let slugResult =
        validateCreatorSlug(
            member.suggestedSlug
        );

    if (!slugResult.valid) {
        return validationError(
            "Le slug proposé par Streamlabs n’est pas valide."
        );
    }

    let slug = slugResult.slug;

    if (await creatorSlugExists(env, slug)) {
        slug =
            `${slug}-${member.twitchId.slice(-4)}`;
    }

    const orderResult =
        await env.DB.prepare(`
      SELECT
        COALESCE(
          MAX(display_order),
          0
        ) + 10 AS next_order
      FROM creators
    `).first();

    const creator =
        await insertCreator(
            env,
            {
                twitchUser: {
                    id: member.twitchId,
                    login: member.twitchLogin,
                    display_name:
                        member.twitchDisplayName,
                    profile_image_url:
                        member.twitchProfileImageUrl
                },

                slug,

                streamlabsMemberId:
                    member.streamlabsUserId,

                displayOrder:
                    Number(
                        orderResult?.next_order ?? 100
                    ),

                createdByUserId:
                    authentication.user.id
            }
        );

    return json(
        {
            success: true,

            creator: {
                id: Number(creator.id),
                slug: creator.slug,
                twitchDisplayName:
                    creator.twitch_display_name
            }
        },
        201
    );
}

    function mapAdminCreator(creator) {
        return {
            id: Number(creator.id),
            publicId: creator.public_id,
            slug: creator.slug,

            twitchId: creator.twitch_id,
            twitchLogin: creator.twitch_login,
            twitchDisplayName:
                creator.twitch_display_name,
            twitchProfileImageUrl:
                creator.twitch_profile_image_url,

            active: Boolean(creator.active),
            archived: Boolean(creator.archived),

            accepted:
                Boolean(creator.active) &&
                !Boolean(creator.archived),

            streamlabsConfigured:
                Boolean(creator.streamlabs_goal_url),

            donationAvailable:
                Boolean(creator.donation_url),

            onboardingCompleted:
                Boolean(creator.onboarding_completed_at),

            displayOrder:
                Number(creator.display_order ?? 100),

            createdAt: creator.created_at,
            updatedAt: creator.updated_at
        };
    }

    export async function listAdminCreators(
        request,
        env
    ) {
        const access =
            await requireAdminAccess(
                request,
                env
            );

        if (!access.allowed) {
            return access.response;
        }

        const result = await env.DB.prepare(`
    SELECT
      id,
      public_id,
      slug,
      twitch_id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      streamlabs_goal_url,
      donation_url,
      display_order,
      active,
      archived,
      onboarding_completed_at,
      created_at,
      updated_at
    FROM creators
    ORDER BY
      archived ASC,
      active DESC,
      display_order ASC,
      twitch_display_name COLLATE NOCASE ASC
  `).all();

        return json({
            creators: (
                result.results ?? []
            ).map(mapAdminCreator)
        });
    }

    export async function updateAdminCreator(
        request,
        env,
        creatorId
    ) {
        const access =
            await requireAdminAccess(
                request,
                env
            );

        if (!access.allowed) {
            return access.response;
        }

        const id = Number(creatorId);

        if (!Number.isInteger(id) || id < 1) {
            return validationError(
                "Identifiant de créateur invalide."
            );
        }

        const creator = await env.DB.prepare(`
    SELECT *
    FROM creators
    WHERE id = ?
    LIMIT 1
  `)
            .bind(id)
            .first();

        if (!creator) {
            return notFound(
                "Créateur introuvable."
            );
        }

        const body =
            await request.json();

        let slug = creator.slug;

        if (body.slug !== undefined) {
            const slugResult =
                validateCreatorSlug(body.slug);

            if (!slugResult.valid) {
                return validationError(
                    slugResult.error
                );
            }

            const existing =
                await env.DB.prepare(`
        SELECT id
        FROM creators
        WHERE slug = ?
          AND id <> ?
        LIMIT 1
      `)
                    .bind(
                        slugResult.slug,
                        id
                    )
                    .first();

            if (existing) {
                return validationError(
                    "Ce slug est déjà utilisé."
                );
            }

            slug = slugResult.slug;
        }

        const active =
            body.active === undefined
                ? Number(creator.active)
                : body.active === true
                    ? 1
                    : 0;

        const archived =
            body.archived === undefined
                ? Number(creator.archived)
                : body.archived === true
                    ? 1
                    : 0;

        const displayOrder =
            body.displayOrder === undefined
                ? Number(
                    creator.display_order ?? 100
                )
                : Number(body.displayOrder);

        if (
            !Number.isInteger(displayOrder) ||
            displayOrder < 0
        ) {
            return validationError(
                "L’ordre d’affichage est invalide."
            );
        }

        await env.DB.prepare(`
    UPDATE creators
    SET
      slug = ?,
      active = ?,
      archived = ?,
      display_order = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
            .bind(
                slug,
                archived ? 0 : active,
                archived,
                displayOrder,
                id
            )
            .run();

        const updated =
            await env.DB.prepare(`
      SELECT
        id,
        public_id,
        slug,
        twitch_id,
        twitch_login,
        twitch_display_name,
        twitch_profile_image_url,
        streamlabs_goal_url,
        donation_url,
        display_order,
        active,
        archived,
        onboarding_completed_at,
        created_at,
        updated_at
      FROM creators
      WHERE id = ?
      LIMIT 1
    `)
                .bind(id)
                .first();

        return json({
            success: true,
            creator: mapAdminCreator(updated)
        });
    }