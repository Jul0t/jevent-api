import {
  json,
  notFound,
  forbidden,
  validationError
} from "../shared/responses.js";

import {
  readJson,
  sanitizePlainText
} from "../shared/validation.js";

import {
  generateRandomToken
} from "../shared/security.js";

import {
  requireGlobalModerator
} from "../auth/permissions.js";

import {
  resolveCreatorAccess
} from "./panel.js";

import {
  validateCreatorDescription
} from "./description-validation.js";

function canEditDescription(access) {
  return (
    access.user.permissions.isSuperAdmin ||
    Array.of("owner", "delegate").includes(
      access.membership?.memberRole
    )
  );
}

function mapRevision(revision) {
  if (!revision) {
    return null;
  }

  return {
    id: Number(revision.id),

    publicId:
      revision.public_id,

    creatorId:
      Number(revision.creator_id),

    revisionNumber:
      Number(revision.revision_number),

    markdown:
      revision.markdown_content ?? "",

    status:
      revision.status,

    moderationNote:
      revision.moderation_note,

    submittedByUserId:
      Number(
        revision.submitted_by_user_id
      ),

    reviewedByUserId:
      revision.reviewed_by_user_id
        ? Number(
          revision.reviewed_by_user_id
        )
        : null,

    createdAt:
      revision.created_at,

    updatedAt:
      revision.updated_at,

    submittedAt:
      revision.submitted_at,

    reviewedAt:
      revision.reviewed_at,

    publishedAt:
      revision.published_at
  };
}

async function findRevisionByPublicId(
  env,
  publicId
) {
  return env.DB.prepare(`
    SELECT *
    FROM creator_profile_revisions
    WHERE public_id = ?
    LIMIT 1
  `)
    .bind(publicId)
    .first();
}

async function getLatestRevision(
  env,
  creatorId,
  status
) {
  return env.DB.prepare(`
    SELECT *
    FROM creator_profile_revisions
    WHERE creator_id = ?
      AND status = ?
    ORDER BY revision_number DESC
    LIMIT 1
  `)
    .bind(creatorId, status)
    .first();
}

async function getNextRevisionNumber(
  env,
  creatorId
) {
  const result = await env.DB.prepare(`
    SELECT
      COALESCE(
        MAX(revision_number),
        0
      ) AS maximum_revision
    FROM creator_profile_revisions
    WHERE creator_id = ?
  `)
    .bind(creatorId)
    .first();

  return (
    Number(result?.maximum_revision ?? 0) +
    1
  );
}

/* ============================================================
   ESPACE DE TRAVAIL DU CRÉATEUR
   ============================================================ */

export async function getDescriptionWorkspace(
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

  if (!canEditDescription(access)) {
    return forbidden(
      "Tu ne peux pas modifier cette description."
    );
  }

  const creator = await env.DB.prepare(`
    SELECT
      id,
      slug,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      public_description_markdown,
      public_description_updated_at,
      description_moderation_bypass
    FROM creators
    WHERE id = ?
    LIMIT 1
  `)
    .bind(access.creatorId)
    .first();

  if (!creator) {
    return notFound(
      "Profil créateur introuvable."
    );
  }

  const results = await Promise.all(
    Array.of(
      getLatestRevision(
        env,
        access.creatorId,
        "draft"
      ),

      getLatestRevision(
        env,
        access.creatorId,
        "pending"
      ),

      getLatestRevision(
        env,
        access.creatorId,
        "rejected"
      ),

      getLatestRevision(
        env,
        access.creatorId,
        "approved"
      )
    )
  );

  const lastRejected = results[2];
  const lastApproved = results[3];

  const visibleRejected =
    lastRejected &&
      (
        !lastApproved ||
        Number(lastRejected.revision_number) >
        Number(lastApproved.revision_number)
      )
      ? lastRejected
      : null;

  return json({
    creator: {
      id: Number(creator.id),
      slug: creator.slug,

      twitchLogin:
        creator.twitch_login,

      twitchDisplayName:
        creator.twitch_display_name,

      twitchProfileImageUrl:
        creator.twitch_profile_image_url,

      publicDescriptionMarkdown:
        creator
          .public_description_markdown ??
        "",

      publicDescriptionUpdatedAt:
        creator
          .public_description_updated_at,

      moderationBypass:
        Boolean(
          creator
            .description_moderation_bypass
        )
    },

    draft: mapRevision(results[0]),
    pending: mapRevision(results[1]),
    lastRejected: mapRevision(visibleRejected)
  });
}

/* ============================================================
   ENREGISTRER UN BROUILLON
   ============================================================ */

export async function saveDescriptionDraft(
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

  if (!canEditDescription(access)) {
    return forbidden(
      "Tu ne peux pas modifier cette description."
    );
  }

  const body = await readJson(request);

  if (!body) {
    return validationError(
      "Corps JSON invalide."
    );
  }

  const validation =
    validateCreatorDescription(
      body.markdown
    );

  if (!validation.valid) {
    return json(
      {
        error:
          "La description Markdown est invalide.",

        validationErrors:
          validation.errors
      },
      400
    );
  }

  const existingDraft =
    await getLatestRevision(
      env,
      access.creatorId,
      "draft"
    );

  let publicId;

  if (existingDraft) {
    publicId = existingDraft.public_id;

    await env.DB.prepare(`
      UPDATE creator_profile_revisions
      SET
        markdown_content = ?,
        submitted_by_user_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND status = 'draft'
    `)
      .bind(
        validation.markdown,
        access.user.id,
        existingDraft.id
      )
      .run();
  } else {
    publicId =
      `cpr_${generateRandomToken(12)}`;

    const revisionNumber =
      await getNextRevisionNumber(
        env,
        access.creatorId
      );

    await env.DB.prepare(`
      INSERT INTO creator_profile_revisions (
        public_id,
        creator_id,
        revision_number,
        markdown_content,
        status,
        submitted_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        'draft',
        ?,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `)
      .bind(
        publicId,
        access.creatorId,
        revisionNumber,
        validation.markdown,
        access.user.id
      )
      .run();
  }

  const savedRevision =
    await findRevisionByPublicId(
      env,
      publicId
    );

  return json({
    success: true,
    draft: mapRevision(savedRevision)
  });
}

/* ============================================================
   SOUMETTRE LE BROUILLON
   ============================================================ */

export async function submitDescription(
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

  if (!canEditDescription(access)) {
    return forbidden(
      "Tu ne peux pas soumettre cette description."
    );
  }

  const draft = await getLatestRevision(
    env,
    access.creatorId,
    "draft"
  );

  if (!draft) {
    return notFound(
      "Aucun brouillon à soumettre."
    );
  }

  const pending = await getLatestRevision(
    env,
    access.creatorId,
    "pending"
  );

  if (pending) {
    return json(
      {
        error:
          "Une description est déjà en attente de validation."
      },
      409
    );
  }

  const validation =
    validateCreatorDescription(
      draft.markdown_content
    );

  if (!validation.valid) {
    return json(
      {
        error:
          "Le brouillon contient du contenu interdit.",

        validationErrors:
          validation.errors
      },
      400
    );
  }

  const creator = await env.DB.prepare(`
    SELECT
      id,
      description_moderation_bypass
    FROM creators
    WHERE id = ?
    LIMIT 1
  `)
    .bind(access.creatorId)
    .first();

  if (!creator) {
    return notFound(
      "Profil créateur introuvable."
    );
  }

  const bypass = Boolean(
    creator.description_moderation_bypass
  );

  if (bypass) {
    await env.DB.batch(
      Array.of(
        env.DB.prepare(`
          UPDATE creator_profile_revisions
          SET
            status = 'approved',
            submitted_at =
              CURRENT_TIMESTAMP,
            reviewed_at =
              CURRENT_TIMESTAMP,
            published_at =
              CURRENT_TIMESTAMP,
            moderation_note =
              'Publication automatique',
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'draft'
        `).bind(draft.id),

        env.DB.prepare(`
          UPDATE creators
          SET
            public_description_markdown = ?,
            public_description_revision_id = ?,
            public_description_updated_at =
              CURRENT_TIMESTAMP,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          validation.markdown,
          draft.id,
          access.creatorId
        )
      )
    );

    return json({
      success: true,
      status: "approved",
      automaticallyApproved: true
    });
  }

  await env.DB.prepare(`
    UPDATE creator_profile_revisions
    SET
      status = 'pending',
      submitted_at =
        CURRENT_TIMESTAMP,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'draft'
  `)
    .bind(draft.id)
    .run();

  return json({
    success: true,
    status: "pending",
    automaticallyApproved: false
  });
}

/* ============================================================
   ANNULER UNE SOUMISSION
   ============================================================ */

export async function cancelDescriptionSubmission(
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

  if (!canEditDescription(access)) {
    return forbidden();
  }

  const pending = await getLatestRevision(
    env,
    access.creatorId,
    "pending"
  );

  if (!pending) {
    return notFound(
      "Aucune description en attente."
    );
  }

  await env.DB.prepare(`
    UPDATE creator_profile_revisions
    SET
      status = 'draft',
      submitted_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'pending'
  `)
    .bind(pending.id)
    .run();

  return json({
    success: true,
    status: "draft"
  });
}

/* ============================================================
   FILE DE MODÉRATION
   ============================================================ */

export async function listDescriptionsForModeration(
  request,
  env
) {
  const authorization =
    await requireGlobalModerator(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const url = new URL(request.url);

  const requestedStatus =
    url.searchParams.get("status") ??
    "pending";

  const allowedStatuses = new Set(
    Array.of(
      "pending",
      "approved",
      "rejected"
    )
  );

  const status = allowedStatuses.has(
    requestedStatus
  )
    ? requestedStatus
    : "pending";

  const result = await env.DB.prepare(`
    SELECT
      revisions.*,

      creators.slug
        AS creator_slug,

      creators.twitch_login
        AS creator_twitch_login,

      creators.twitch_display_name
        AS creator_display_name,

      creators.twitch_profile_image_url
        AS creator_profile_image_url,

      creators.public_description_markdown
        AS current_public_markdown,

      submitter.twitch_login
        AS submitter_login,

      submitter.twitch_display_name
        AS submitter_display_name

    FROM creator_profile_revisions
      AS revisions

    INNER JOIN creators
      ON creators.id =
        revisions.creator_id

    LEFT JOIN users AS submitter
      ON submitter.id =
        revisions.submitted_by_user_id

    WHERE revisions.status = ?

    ORDER BY
      revisions.submitted_at ASC,
      revisions.id ASC

    LIMIT 200
  `)
    .bind(status)
    .all();

  return json({
    status,

    descriptions:
      (result.results ?? []).map(
        revision => ({
          revision: mapRevision(revision),

          creator: {
            id: Number(
              revision.creator_id
            ),

            slug:
              revision.creator_slug,

            twitchLogin:
              revision
                .creator_twitch_login,

            twitchDisplayName:
              revision
                .creator_display_name,

            twitchProfileImageUrl:
              revision
                .creator_profile_image_url,

            currentPublicMarkdown:
              revision
                .current_public_markdown ??
              ""
          },

          submittedBy: {
            login:
              revision.submitter_login,

            displayName:
              revision
                .submitter_display_name
          }
        })
      )
  });
}

/* ============================================================
   APPROUVER
   ============================================================ */

export async function approveDescription(
  request,
  env,
  publicId
) {
  const authorization =
    await requireGlobalModerator(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const revision =
    await findRevisionByPublicId(
      env,
      publicId
    );

  if (!revision) {
    return notFound(
      "Description introuvable."
    );
  }

  if (revision.status !== "pending") {
    return json(
      {
        error:
          "Cette description n’est plus en attente."
      },
      409
    );
  }

  const body =
    (await readJson(request)) ?? {};

  const selectedMarkdown =
    body.markdown === undefined
      ? revision.markdown_content
      : body.markdown;

  const validation =
    validateCreatorDescription(
      selectedMarkdown
    );

  if (!validation.valid) {
    return json(
      {
        error:
          "La version corrigée est invalide.",

        validationErrors:
          validation.errors
      },
      400
    );
  }

  const moderationNote =
    sanitizePlainText(
      body.moderationNote,
      1000
    );

  await env.DB.batch(
    Array.of(
      env.DB.prepare(`
        UPDATE creator_profile_revisions
        SET
          markdown_content = ?,
          status = 'approved',
          reviewed_by_user_id = ?,
          reviewed_at =
            CURRENT_TIMESTAMP,
          published_at =
            CURRENT_TIMESTAMP,
          moderation_note = ?,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = 'pending'
      `).bind(
        validation.markdown,
        authorization.user.id,
        moderationNote || null,
        revision.id
      ),

      env.DB.prepare(`
        UPDATE creators
        SET
          public_description_markdown = ?,
          public_description_revision_id = ?,
          public_description_updated_at =
            CURRENT_TIMESTAMP,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        validation.markdown,
        revision.id,
        revision.creator_id
      )
    )
  );

  return json({
    success: true,
    status: "approved"
  });
}

/* ============================================================
   REFUSER
   ============================================================ */

export async function rejectDescription(
  request,
  env,
  publicId
) {
  const authorization =
    await requireGlobalModerator(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const revision =
    await findRevisionByPublicId(
      env,
      publicId
    );

  if (!revision) {
    return notFound(
      "Description introuvable."
    );
  }

  if (revision.status !== "pending") {
    return json(
      {
        error:
          "Cette description n’est plus en attente."
      },
      409
    );
  }

  const body = await readJson(request);

  const moderationNote =
    sanitizePlainText(
      body?.moderationNote,
      1000
    );

  if (!moderationNote) {
    return validationError(
      "Une explication est obligatoire pour refuser une description."
    );
  }

  await env.DB.prepare(`
    UPDATE creator_profile_revisions
    SET
      status = 'rejected',
      reviewed_by_user_id = ?,
      reviewed_at =
        CURRENT_TIMESTAMP,
      moderation_note = ?,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'pending'
  `)
    .bind(
      authorization.user.id,
      moderationNote,
      revision.id
    )
    .run();

  return json({
    success: true,
    status: "rejected"
  });
}