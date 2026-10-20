import {
  json
} from "../shared/responses.js";

import {
  requireAdminAccess
} from "./access.js";

function normalizeDate(value) {
  const date =
    String(value ?? "").trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : null;
}

export async function getAdminStatsOverview(
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

  const url = new URL(request.url);

  const creatorIdValue =
    url.searchParams.get("creatorId");

  const creatorId =
    creatorIdValue
      ? Number(creatorIdValue)
      : null;

  if (
    creatorIdValue &&
    (
      !Number.isInteger(creatorId) ||
      creatorId < 1
    )
  ) {
    return json(
      {
        error:
          "Le créateur sélectionné est invalide."
      },
      400
    );
  }

  const fromValue =
    url.searchParams.get("from");

  const toValue =
    url.searchParams.get("to");

  const from =
    normalizeDate(fromValue);

  const to =
    normalizeDate(toValue);

  if (fromValue && !from) {
    return json(
      {
        error:
          "La date de début est invalide."
      },
      400
    );
  }

  if (toValue && !to) {
    return json(
      {
        error:
          "La date de fin est invalide."
      },
      400
    );
  }

  if (from && to && from > to) {
    return json(
      {
        error:
          "La date de début doit être avant la date de fin."
      },
      400
    );
  }

  /*
   * Filtres utilisés pour les totaux Twitch.
   */

  const statsConditions = [];
  const statsBindings = [];

  if (creatorId) {
    statsConditions.push(
      "creator_id = ?"
    );

    statsBindings.push(
      creatorId
    );
  }

  if (from) {
    statsConditions.push(
      "stat_date >= ?"
    );

    statsBindings.push(from);
  }

  if (to) {
    statsConditions.push(
      "stat_date <= ?"
    );

    statsBindings.push(to);
  }

  const statsWhere =
    statsConditions.length > 0
      ? `WHERE ${statsConditions.join(
        " AND "
      )}`
      : "";

  /*
   * Les dates sont placées dans le JOIN afin
   * que les créateurs sans statistique restent
   * visibles avec zéro message et zéro emote.
   */

  const creatorJoinConditions = [
    "stats.creator_id = creators.id"
  ];

  const creatorBindings = [];

  if (from) {
    creatorJoinConditions.push(
      "stats.stat_date >= ?"
    );

    creatorBindings.push(from);
  }

  if (to) {
    creatorJoinConditions.push(
      "stats.stat_date <= ?"
    );

    creatorBindings.push(to);
  }

  let creatorWhere = "";

  if (creatorId) {
    creatorWhere =
      "WHERE creators.id = ?";

    creatorBindings.push(
      creatorId
    );
  }

  const platformStatement =
    env.DB.prepare(`
      SELECT
        (
          SELECT COUNT(*)
          FROM creators
        ) AS creators,

        (
          SELECT COUNT(*)
          FROM creators
          WHERE active = 1
            AND archived = 0
        ) AS active_creators,

        (
          SELECT COUNT(*)
          FROM goals
          WHERE status != 'cancelled'
        ) AS goals,

        (
          SELECT COUNT(*)
          FROM program_entries
          WHERE status IN (
            'draft',
            'published'
          )
        ) AS program_entries,

        (
          SELECT COUNT(*)
          FROM creators
          WHERE streamlabs_goal_url IS NOT NULL
            AND TRIM(streamlabs_goal_url) != ''
        ) AS streamlabs_configured
    `);

  const twitchStatement =
    env.DB.prepare(`
      SELECT
        COALESCE(
          SUM(messages_count),
          0
        ) AS messages,

        COALESCE(
          SUM(emotes_count),
          0
        ) AS emotes

      FROM twitch_chat_daily_stats

      ${statsWhere}
    `);

  const creatorsStatement =
    env.DB.prepare(`
      SELECT
        creators.id,
        creators.slug,
        creators.twitch_display_name,
        creators.active,
        creators.archived,
        creators.streamlabs_goal_url,

        COALESCE((
          SELECT SUM(d.amount_cents)
          FROM interaction_donations AS d
          WHERE d.creator_id = creators.id
            AND d.status = 'credited'
        ), 0) AS raised_cents,

        COALESCE(
          SUM(stats.messages_count),
          0
        ) AS messages_count,

        COALESCE(
          SUM(stats.emotes_count),
          0
        ) AS emotes_count

      FROM creators

      LEFT JOIN twitch_chat_daily_stats
        AS stats
        ON ${creatorJoinConditions.join(
      " AND "
    )}

      ${creatorWhere}

      GROUP BY creators.id

      ORDER BY
        creators.display_order ASC,
        creators.twitch_display_name
          COLLATE NOCASE ASC
    `);

  const [
    platform,
    twitch,
    creatorsResult
  ] = await Promise.all([
    platformStatement.first(),

    statsBindings.length > 0
      ? twitchStatement
        .bind(...statsBindings)
        .first()
      : twitchStatement.first(),

    creatorBindings.length > 0
      ? creatorsStatement
        .bind(...creatorBindings)
        .all()
      : creatorsStatement.all()
  ]);

  const creators =
    await Promise.all(
      (creatorsResult.results ?? []).map(
        async creator => {
          let raisedCents = null;

          if (creator.streamlabs_goal_url) {
            try {
              raisedCents =
                await getCreatorRaisedCents(
                  creator.streamlabs_goal_url
                );
            } catch (error) {
              console.error(
                `Impossible de récupérer la cagnotte de ${creator.slug} :`,
                error
              );
            }
          }

          return {
            id: Number(creator.id),
            slug: creator.slug,

            displayName:
              creator.twitch_display_name,

            active:
              Boolean(creator.active),

            archived:
              Boolean(creator.archived),

            messages:
              Number(
                creator.messages_count ?? 0
              ),

            emotes:
              Number(
                creator.emotes_count ?? 0
              ),

            raisedCents:
              Number(creator.raised_cents ?? 0)
          };
        }
      )
    );

  const totalRaisedCents =
    creators.reduce(
      (total, creator) =>
        total +
        Number(creator.raisedCents ?? 0),
      0
    );

  return json({
    filters: {
      creatorId,
      from,
      to
    },

    overview: {
      creators:
        Number(platform?.creators ?? 0),

      activeCreators:
        Number(
          platform?.active_creators ?? 0
        ),

      goals:
        Number(platform?.goals ?? 0),

      programEntries:
        Number(
          platform?.program_entries ?? 0
        ),

      streamlabsConfigured:
        Number(
          platform?.streamlabs_configured ??
          0
        ),

      messages:
        Number(twitch?.messages ?? 0),

      emotes:
        Number(twitch?.emotes ?? 0),

      raisedCents: totalRaisedCents
    },

    creators:
      creator => ({
        id: Number(creator.id),
        slug: creator.slug,

        displayName:
          creator.twitch_display_name,

        active:
          Boolean(creator.active),

        archived:
          Boolean(creator.archived),

        messages:
          Number(
            creator.messages_count ?? 0
          ),

        emotes:
          Number(
            creator.emotes_count ?? 0
          )
      })
  });
}