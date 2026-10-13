import {
  json,
  notFound
} from "../shared/responses.js";

import {
  normalizeSlug
} from "../shared/validation.js";

export async function getPublicCreatorRaffle(
  request,
  env,
  rawSlug
) {
  const slug =
    normalizeSlug(rawSlug);

  if (!slug) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const creator =
    await env.DB.prepare(`
      SELECT id
      FROM creators
      WHERE slug = ?
        AND active = 1
        AND archived = 0
      LIMIT 1
    `)
      .bind(slug)
      .first();

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const raffle =
    await env.DB.prepare(`
      SELECT
        raffles.id,
        raffles.public_id,
        raffles.title,
        raffles.description,
        raffles.method,
        raffles.status,
        raffles.draw_mode,
        raffles.starts_at,
        raffles.ends_at,

        COUNT(
          DISTINCT entries.participant_key
        ) AS participant_count,

        COALESCE(
          SUM(entries.ticket_count),
          0
        ) AS ticket_count,

        COALESCE(
          SUM(entries.amount_cents),
          0
        ) AS amount_cents,

        winners.donor_name
          AS winner_name,

        winners.selected_at
          AS winner_selected_at

      FROM creator_raffles
        AS raffles

      LEFT JOIN raffle_entries
        AS entries
        ON entries.raffle_id =
          raffles.id

      LEFT JOIN raffle_winners
        AS winners
        ON winners.raffle_id =
          raffles.id

      WHERE raffles.creator_id = ?

        AND (
          raffles.status NOT IN (
            'completed',
            'cancelled'
          )

          OR (
            raffles.status =
              'completed'

            AND datetime(
              winners.selected_at
            ) >= datetime(
              'now',
              '-10 minutes'
            )
          )
        )

      GROUP BY raffles.id

      ORDER BY
        CASE
          WHEN
            raffles.status NOT IN (
              'completed',
              'cancelled'
            )
            AND datetime(
              raffles.starts_at
            ) <= datetime('now')
            AND datetime(
              raffles.ends_at
            ) > datetime('now')
          THEN 0

          WHEN
            raffles.status NOT IN (
              'completed',
              'cancelled'
            )
            AND datetime(
              raffles.ends_at
            ) <= datetime('now')
          THEN 1

          WHEN
            raffles.status NOT IN (
              'completed',
              'cancelled'
            )
          THEN 2

          ELSE 3
        END,

        datetime(
          raffles.created_at
        ) DESC

      LIMIT 1
    `)
      .bind(
        Number(creator.id)
      )
      .first();

  if (!raffle) {
    return json({
      raffle: null
    });
  }

  const now = Date.now();

  const startsAt =
    Date.parse(
      raffle.starts_at
    );

  const endsAt =
    Date.parse(
      raffle.ends_at
    );

  let phase =
    raffle.status;

  if (
    raffle.status ===
    "completed"
  ) {
    phase = "completed";
  } else if (
    Number.isFinite(startsAt) &&
    now < startsAt
  ) {
    phase = "scheduled";
  } else if (
    Number.isFinite(endsAt) &&
    now < endsAt
  ) {
    phase = "active";
  } else {
    phase = "waiting_draw";
  }

  return json({
    raffle: {
      publicId:
        raffle.public_id,

      title:
        raffle.title,

      description:
        raffle.description ?? "",

      method:
        raffle.method,

      drawMode:
        raffle.draw_mode ===
          "automatic"
          ? "automatic"
          : "manual",

      status:
        raffle.status,

      phase,

      startsAt:
        raffle.starts_at,

      endsAt:
        raffle.ends_at,

      participantCount:
        Number(
          raffle.participant_count ?? 0
        ),

      ticketCount:
        Number(
          raffle.ticket_count ?? 0
        ),

      amountCents:
        Number(
          raffle.amount_cents ?? 0
        ),

      currency: "EUR",

      winner:
        raffle.winner_selected_at
          ? {
              name:
                raffle.winner_name ||
                "Participant anonyme",

              selectedAt:
                raffle
                  .winner_selected_at
            }
          : null
    }
  });
}