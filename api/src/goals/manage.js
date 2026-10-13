import {
  requireAuthentication
} from "../auth/permissions.js";

import {
  json,
  validationError,
  forbidden
} from "../shared/responses.js";

function canManageCreator(user, creatorId) {
  if (user.permissions.isSuperAdmin) {
    return true;
  }

  return (user.creatorMemberships ?? []).some(
    membership =>
      Number(membership.creatorId) ===
      Number(creatorId) &&
      membership.memberRole === "owner"
  );
}

export async function createGoal(
  request,
  env
) {
  const authentication =
    await requireAuthentication(request, env);

  if (!authentication.allowed) {
    return authentication.response;
  }

  const body = await request.json();

  const creatorId =
    Number(body.creatorId);

  const title =
    String(body.title ?? "").trim();

  const targetAmountCents =
    Math.round(
      Number(body.targetAmountCents)
    );

  if (!creatorId || !title) {
    return validationError(
      "Le streamer et le titre sont obligatoires."
    );
  }

  if (
    !Number.isInteger(targetAmountCents) ||
    targetAmountCents <= 0
  ) {
    return validationError(
      "Le montant doit être supérieur à zéro."
    );
  }

  if (
    !canManageCreator(
      authentication.user,
      creatorId
    )
  ) {
    return forbidden(
      "Tu ne peux pas modifier ce streamer."
    );
  }

  const creator =
    await env.DB.prepare(`
      SELECT id
      FROM creators
      WHERE id = ?
        AND archived = 0
      LIMIT 1
    `)
      .bind(creatorId)
      .first();

  if (!creator) {
    return validationError(
      "Ce streamer n’existe pas."
    );
  }

  const publicId =
    `goal_${crypto.randomUUID()}`;

  await env.DB.prepare(`
    INSERT INTO goals (
      public_id,
      scope_type,
      creator_id,
      title,
      description_markdown,
      target_amount_cents,
      status,
      is_visible,
      display_order,
      created_by_user_id,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      'creator',
      ?,
      ?,
      ?,
      ?,
      'active',
      1,
      0,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      publicId,
      creatorId,
      title,
      String(
        body.descriptionMarkdown ?? ""
      ).trim(),
      targetAmountCents,
      authentication.user.id
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

function isGlobalManager(user) {
  return Boolean(
    user.permissions.isSuperAdmin ||
    user.permissions.isGlobalModerator
  );
}

function getManageableCreatorIds(user) {
  return (user.creatorMemberships ?? [])
    .filter(membership =>
      ["owner", "delegate"].includes(
        membership.memberRole
      )
    )
    .map(membership =>
      Number(membership.creatorId)
    );
}

function mapGoal(goal) {
  return {
    publicId: goal.public_id,
    title: goal.title,
    descriptionMarkdown:
      goal.description_markdown ?? "",

    thresholdCents:
      Number(goal.target_amount_cents),

    currency: "EUR",
    status: goal.status,
    scopeType: goal.scope_type,

    creatorId:
      goal.creator_id === null
        ? null
        : Number(goal.creator_id),

    sharedCreatorIds:
      goal.shared_creator_ids
        ? String(goal.shared_creator_ids)
          .split(",")
          .map(Number)
          .filter(Boolean)
        : [],

    reached:
      goal.status === "reached" ||
      goal.status === "completed"
  };
}

export async function listManageableGoals(
  request,
  env
) {
  const authentication =
    await requireAuthentication(
      request,
      env
    );

  if (!authentication.allowed) {
    return authentication.response;
  }

  const user = authentication.user;
  let result;

  const baseQuery = `
    SELECT
      goals.*,

      GROUP_CONCAT(
        DISTINCT goal_creators.creator_id
      ) AS shared_creator_ids

    FROM goals

    LEFT JOIN goal_creators
      ON goal_creators.goal_id = goals.id
  `;

  if (isGlobalManager(user)) {
    result = await env.DB.prepare(`
      ${baseQuery}

      GROUP BY goals.id

      ORDER BY
        goals.display_order ASC,
        goals.target_amount_cents ASC,
        goals.id ASC
    `).all();
  } else {
    const creatorIds =
      getManageableCreatorIds(user);

    if (creatorIds.length === 0) {
      return json({
        goals: []
      });
    }

    const placeholders =
      creatorIds
        .map(() => "?")
        .join(", ");

    result = await env.DB.prepare(`
      ${baseQuery}

      WHERE
        goals.scope_type = 'global'

        OR (
          goals.scope_type = 'creator'
          AND goals.creator_id
            IN (${placeholders})
        )

        OR (
          goals.scope_type = 'shared'
          AND EXISTS (
            SELECT 1
            FROM goal_creators AS access

            WHERE access.goal_id = goals.id
              AND access.creator_id
                IN (${placeholders})
          )
        )

      GROUP BY goals.id

      ORDER BY
        goals.display_order ASC,
        goals.target_amount_cents ASC,
        goals.id ASC
    `)
      .bind(
        ...creatorIds,
        ...creatorIds
      )
      .all();
  }

  return json({
    goals: (result.results ?? []).map(
      mapGoal
    )
  });
}
async function findGoal(env, publicId) {
  return env.DB.prepare(`
    SELECT *
    FROM goals
    WHERE public_id = ?
    LIMIT 1
  `)
    .bind(publicId)
    .first();
}

export async function updateGoal(
  request,
  env,
  publicId
) {
  const authentication =
    await requireAuthentication(request, env);

  if (!authentication.allowed) {
    return authentication.response;
  }

  const goal = await findGoal(env, publicId);

  if (!goal) {
    return validationError(
      "Cet objectif n’existe pas."
    );
  }

  if (
    !canManageCreator(
      authentication.user,
      goal.creator_id
    )
  ) {
    return forbidden(
      "Tu ne peux pas modifier cet objectif."
    );
  }

  const body = await request.json();

  const title =
    String(body.title ?? "").trim();

  const targetAmountCents =
    Math.round(
      Number(body.targetAmountCents)
    );

  if (!title) {
    return validationError(
      "Le titre est obligatoire."
    );
  }

  if (
    !Number.isInteger(targetAmountCents) ||
    targetAmountCents <= 0
  ) {
    return validationError(
      "Le montant doit être supérieur à zéro."
    );
  }

  const allowedStatuses = [
    "draft",
    "active",
    "reached",
    "completed",
    "cancelled"
  ];

  const status =
    allowedStatuses.includes(body.status)
      ? body.status
      : goal.status;

  await env.DB.prepare(`
    UPDATE goals
    SET
      title = ?,
      description_markdown = ?,
      target_amount_cents = ?,
      status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(
      title,
      String(
        body.descriptionMarkdown ?? ""
      ).trim(),
      targetAmountCents,
      status,
      goal.id
    )
    .run();

  return json({
    success: true
  });
}

export async function deleteGoal(
  request,
  env,
  publicId
) {
  const authentication =
    await requireAuthentication(request, env);

  if (!authentication.allowed) {
    return authentication.response;
  }

  const goal = await findGoal(env, publicId);

  if (!goal) {
    return validationError(
      "Cet objectif n’existe pas."
    );
  }

  if (
    !canManageCreator(
      authentication.user,
      goal.creator_id
    )
  ) {
    return forbidden(
      "Tu ne peux pas supprimer cet objectif."
    );
  }

  await env.DB.prepare(`
    DELETE FROM goals
    WHERE id = ?
  `)
    .bind(goal.id)
    .run();

  return json({
    success: true
  });
}
