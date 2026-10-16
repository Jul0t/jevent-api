import {
  json
} from "../shared/responses.js";

export async function listPublicGoals(
  request,
  env,
  creatorSlug
) {
  const creator = await env.DB.prepare(`
    SELECT
      id,
      streamlabs_goal_url
    FROM creators
    WHERE slug = ?
      AND archived = 0
    LIMIT 1
  `)
    .bind(creatorSlug)
    .first();

  if (!creator) {
    return json(
      {
        error: "Ce créateur n’existe pas."
      },
      404
    );
  }

  const total = await env.DB.prepare(`
  SELECT
    COALESCE(SUM(amount_cents), 0)
      AS total_cents
  FROM interaction_donations
  WHERE creator_id = ?
    AND currency = 'EUR'
    AND status = 'credited'
`)
    .bind(creator.id)
    .first();

  const creatorAmountRaisedCents =
    Math.max(
      0,
      Number(total?.total_cents ?? 0)
    );  

  const result = await env.DB.prepare(`
    SELECT
      goals.public_id,
      goals.title,
      goals.description_markdown,
      goals.target_amount_cents,
      goals.status
    FROM goals
    WHERE goals.is_visible = 1
      AND goals.status != 'cancelled'
      AND (
        goals.scope_type = 'global'

        OR (
          goals.scope_type = 'creator'
          AND goals.creator_id = ?
        )

        OR (
          goals.scope_type = 'shared'
          AND EXISTS (
            SELECT 1
            FROM goal_creators
            WHERE goal_creators.goal_id =
              goals.id
              AND goal_creators.creator_id = ?
          )
        )
      )
    ORDER BY
      goals.target_amount_cents ASC,
      goals.display_order ASC,
      goals.id ASC
  `)
    .bind(
      creator.id,
      creator.id
    )
    .all();

  return json({
    creatorAmountRaisedCents:
      creatorAmountRaisedCents ?? 0,

    goals: (result.results ?? []).map(
      goal => {
        const targetCents =
          Number(goal.target_amount_cents);

        const reached =
          (
            creatorAmountRaisedCents !== null &&
            creatorAmountRaisedCents >= targetCents
          );

        return {
          publicId: goal.public_id,
          title: goal.title,
          descriptionMarkdown:
            goal.description_markdown ?? "",
          thresholdCents: targetCents,
          currency: "EUR",
          status: goal.status,
          reached
        };
      }
    )
  });
}