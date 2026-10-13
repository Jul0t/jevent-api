import {
  requireAuthentication
} from "../auth/permissions.js";

import {
  json
} from "../shared/responses.js";

const VALID_STATUSES =
  new Set([
    "pending",
    "approved",
    "rejected",
    "cancelled"
  ]);

async function requireAdmin(
  request,
  env
) {
  const authorization =
    await requireAuthentication(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization;
  }

  if (
    !authorization.user
      .permissions
      ?.isSuperAdmin
  ) {
    return {
      allowed: false,

      response: json(
        {
          error:
            "Cette route est réservée aux administrateurs."
        },
        403
      )
    };
  }

  return authorization;
}

function cleanModerationNote(value) {
  return String(value || "")
    .trim()
    .slice(0, 500);
}

function mapUpload(
  request,
  upload
) {
  const origin =
    new URL(request.url).origin;

  return {
    id:
      Number(upload.id),

    publicId:
      upload.public_id,

    status:
      upload.status,

    originalName:
      upload.original_name,

    contentType:
      upload.content_type,

    fileSizeBytes:
      Number(
        upload.file_size_bytes
      ),

    sha256:
      upload.sha256,

    width:
      upload.width === null
        ? null
        : Number(upload.width),

    height:
      upload.height === null
        ? null
        : Number(upload.height),

    creditCostCents:
      Number(
        upload.credit_cost_cents
      ),

    creditRefunded:
      Boolean(
        upload.credit_refunded
      ),

    moderationNote:
      upload.moderation_note ??
      "",

    createdAt:
      upload.created_at,

    updatedAt:
      upload.updated_at,

    reviewedAt:
      upload.reviewed_at,

    fileUrl:
      origin +
      "/api/admin/interaction-uploads/" +
      encodeURIComponent(
        upload.public_id
      ) +
      "/file",

    user: {
      id:
        Number(upload.user_id),

      twitchLogin:
        upload.user_twitch_login,

      twitchDisplayName:
        upload.user_display_name,

      twitchProfileImageUrl:
        upload.user_profile_image_url
    },

    interaction: {
      id:
        Number(
          upload.interaction_id
        ),

      publicId:
        upload.interaction_public_id,

      title:
        upload.interaction_title,

      type:
        upload.interaction_type
    },

    creator: {
      id:
        Number(
          upload.creator_id
        ),

      slug:
        upload.creator_slug,

      displayName:
        upload.creator_name,

      profileImageUrl:
        upload.creator_profile_image_url
    },

    reviewer:
      upload.reviewer_id
        ? {
            id:
              Number(
                upload.reviewer_id
              ),

            twitchLogin:
              upload.reviewer_twitch_login,

            twitchDisplayName:
              upload.reviewer_display_name
          }
        : null
  };
}

async function findUpload(
  env,
  publicId
) {
  return env.DB.prepare(`
    SELECT
      uploads.id,
      uploads.public_id,
      uploads.user_id,
      uploads.interaction_id,
      uploads.storage_key,
      uploads.original_name,
      uploads.content_type,
      uploads.file_size_bytes,
      uploads.sha256,
      uploads.width,
      uploads.height,
      uploads.status,
      uploads.credit_cost_cents,
      uploads.credit_refunded,
      uploads.moderation_note,
      uploads.reviewed_by_user_id,
      uploads.reviewed_at,
      uploads.created_at,
      uploads.updated_at,

      users.twitch_login
        AS user_twitch_login,

      users.twitch_display_name
        AS user_display_name,

      users.twitch_profile_image_url
        AS user_profile_image_url,

      interactions.public_id
        AS interaction_public_id,

      interactions.title
        AS interaction_title,

      interactions.interaction_type
        AS interaction_type,

      creators.id
        AS creator_id,

      creators.slug
        AS creator_slug,

      creators.twitch_display_name
        AS creator_name,

      creators.twitch_profile_image_url
        AS creator_profile_image_url,

      reviewer.id
        AS reviewer_id,

      reviewer.twitch_login
        AS reviewer_twitch_login,

      reviewer.twitch_display_name
        AS reviewer_display_name

    FROM interaction_uploads
      AS uploads

    INNER JOIN users
      ON users.id =
        uploads.user_id

    LEFT JOIN creator_interactions
      AS interactions
      ON interactions.id =
        uploads.interaction_id

    LEFT JOIN creators
      ON creators.id =
        interactions.creator_id

    LEFT JOIN users AS reviewer
      ON reviewer.id =
        uploads.reviewed_by_user_id

    WHERE uploads.public_id = ?

    LIMIT 1
  `)
    .bind(publicId)
    .first();
}

/* =========================================================
   LISTE DES PARTICIPATIONS
   ========================================================= */

export async function listAdminInteractionUploads(
  request,
  env
) {
  const authorization =
    await requireAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const url =
    new URL(request.url);

  const requestedStatus =
    String(
      url.searchParams.get(
        "status"
      ) || "pending"
    ).trim();

  const creatorId =
    Number(
      url.searchParams.get(
        "creatorId"
      ) || 0
    );

  const search =
    String(
      url.searchParams.get(
        "search"
      ) || ""
    )
      .trim()
      .slice(0, 100);

  const conditions = [];
  const bindings = [];

  if (
    requestedStatus !== "all"
  ) {
    if (
      !VALID_STATUSES.has(
        requestedStatus
      )
    ) {
      return json(
        {
          error:
            "Le statut demandé est invalide."
        },
        400
      );
    }

    conditions.push(
      "uploads.status = ?"
    );

    bindings.push(
      requestedStatus
    );
  }

  if (
    Number.isInteger(creatorId) &&
    creatorId > 0
  ) {
    conditions.push(
      "creators.id = ?"
    );

    bindings.push(
      creatorId
    );
  }

  if (search) {
    conditions.push(`
      (
        uploads.original_name
          LIKE ?

        OR users.twitch_login
          LIKE ?

        OR users.twitch_display_name
          LIKE ?

        OR interactions.title
          LIKE ?

        OR creators.twitch_display_name
          LIKE ?
      )
    `);

    const pattern =
      `%${search}%`;

    bindings.push(
      pattern,
      pattern,
      pattern,
      pattern,
      pattern
    );
  }

  const whereClause =
    conditions.length > 0
      ? (
          "WHERE " +
          conditions.join(
            " AND "
          )
        )
      : "";

  const result =
    await env.DB.prepare(`
      SELECT
        uploads.id,
        uploads.public_id,
        uploads.user_id,
        uploads.interaction_id,
        uploads.original_name,
        uploads.content_type,
        uploads.file_size_bytes,
        uploads.sha256,
        uploads.width,
        uploads.height,
        uploads.status,
        uploads.credit_cost_cents,
        uploads.credit_refunded,
        uploads.moderation_note,
        uploads.reviewed_by_user_id,
        uploads.reviewed_at,
        uploads.created_at,
        uploads.updated_at,

        users.twitch_login
          AS user_twitch_login,

        users.twitch_display_name
          AS user_display_name,

        users.twitch_profile_image_url
          AS user_profile_image_url,

        interactions.public_id
          AS interaction_public_id,

        interactions.title
          AS interaction_title,

        interactions.interaction_type
          AS interaction_type,

        creators.id
          AS creator_id,

        creators.slug
          AS creator_slug,

        creators.twitch_display_name
          AS creator_name,

        creators.twitch_profile_image_url
          AS creator_profile_image_url,

        reviewer.id
          AS reviewer_id,

        reviewer.twitch_login
          AS reviewer_twitch_login,

        reviewer.twitch_display_name
          AS reviewer_display_name

      FROM interaction_uploads
        AS uploads

      INNER JOIN users
        ON users.id =
          uploads.user_id

      LEFT JOIN creator_interactions
        AS interactions
        ON interactions.id =
          uploads.interaction_id

      LEFT JOIN creators
        ON creators.id =
          interactions.creator_id

      LEFT JOIN users AS reviewer
        ON reviewer.id =
          uploads.reviewed_by_user_id

      ${whereClause}

      ORDER BY
        CASE uploads.status
          WHEN 'pending' THEN 1
          WHEN 'approved' THEN 2
          WHEN 'rejected' THEN 3
          ELSE 4
        END,

        uploads.created_at ASC

      LIMIT 200
    `)
      .bind(...bindings)
      .all();

  const countResult =
    await env.DB.prepare(`
      SELECT
        status,
        COUNT(*) AS total

      FROM interaction_uploads

      GROUP BY status
    `)
      .all();

  const counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    total: 0
  };

  for (
    const row of
    countResult.results ?? []
  ) {
    const total =
      Number(row.total ?? 0);

    if (
      Object.hasOwn(
        counts,
        row.status
      )
    ) {
      counts[row.status] =
        total;
    }

    counts.total += total;
  }

  return json({
    uploads:
      (
        result.results ?? []
      ).map(
        upload =>
          mapUpload(
            request,
            upload
          )
      ),

    counts
  });
}

/* =========================================================
   LECTURE PRIVÉE DE L’IMAGE
   ========================================================= */

export async function getAdminInteractionUploadFile(
  request,
  env,
  rawPublicId
) {
  const authorization =
    await requireAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  if (!env.INTERACTION_UPLOADS) {
    return json(
      {
        error:
          "Le stockage R2 n’est pas configuré."
      },
      500
    );
  }

  const publicId =
    String(
      rawPublicId || ""
    ).trim();

  const upload =
    await env.DB.prepare(`
      SELECT
        storage_key,
        original_name,
        content_type

      FROM interaction_uploads

      WHERE public_id = ?

      LIMIT 1
    `)
      .bind(publicId)
      .first();

  if (!upload) {
    return json(
      {
        error:
          "Cette participation n’existe pas."
      },
      404
    );
  }

  const object =
    await env.INTERACTION_UPLOADS.get(
      upload.storage_key
    );

  if (!object) {
    return json(
      {
        error:
          "Le fichier est introuvable."
      },
      404
    );
  }

  const headers =
    new Headers();

  object.writeHttpMetadata(
    headers
  );

  headers.set(
    "Content-Type",
    upload.content_type
  );

  headers.set(
    "Content-Disposition",
    "inline; filename*=UTF-8''" +
      encodeURIComponent(
        upload.original_name
      )
  );

  headers.set(
    "Cache-Control",
    "private, no-store"
  );

  headers.set(
    "X-Content-Type-Options",
    "nosniff"
  );

  headers.set(
    "ETag",
    object.httpEtag
  );

  return new Response(
    object.body,
    {
      status: 200,
      headers
    }
  );
}

/* =========================================================
   ACCEPTATION OU REFUS
   ========================================================= */

export async function moderateAdminInteractionUpload(
  request,
  env,
  rawPublicId
) {
  const authorization =
    await requireAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const publicId =
    String(
      rawPublicId || ""
    ).trim();

  let payload;

  try {
    payload =
      await request.json();
  } catch {
    return json(
      {
        error:
          "Le contenu envoyé est invalide."
      },
      400
    );
  }

  const action =
    String(
      payload.action || ""
    )
      .trim()
      .toLowerCase();

  if (
    ![
      "approve",
      "reject"
    ].includes(action)
  ) {
    return json(
      {
        error:
          "L’action doit être approve ou reject."
      },
      400
    );
  }

  const note =
    cleanModerationNote(
      payload.note
    );

  if (
    action === "reject" &&
    !note
  ) {
    return json(
      {
        error:
          "Indique la raison du refus."
      },
      400
    );
  }

  const upload =
    await findUpload(
      env,
      publicId
    );

  if (!upload) {
    return json(
      {
        error:
          "Cette participation n’existe pas."
      },
      404
    );
  }

  if (
    upload.status !==
      "pending"
  ) {
    return json(
      {
        error:
          "Cette participation a déjà été modérée."
      },
      409
    );
  }

  const reviewerId =
    Number(
      authorization.user.id
    );

  if (
    action === "approve"
  ) {
    const result =
      await env.DB.prepare(`
        UPDATE interaction_uploads

        SET
          status = 'approved',

          moderation_note =
            NULL,

          reviewed_by_user_id =
            ?,

          reviewed_at =
            CURRENT_TIMESTAMP,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = ?
          AND status = 'pending'
      `)
        .bind(
          reviewerId,
          Number(upload.id)
        )
        .run();

    if (
      Number(
        result.meta?.changes ?? 0
      ) === 0
    ) {
      return json(
        {
          error:
            "Cette participation vient d’être modérée par quelqu’un d’autre."
        },
        409
      );
    }
  } else {
    const uploadId =
      Number(upload.id);

    const userId =
      Number(upload.user_id);

    const refundAmount =
      Number(
        upload.credit_cost_cents
      );

    const results =
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE interaction_wallets

          SET
            balance_cents =
              balance_cents + ?,

            total_spent_cents =
              CASE
                WHEN total_spent_cents >= ?
                THEN
                  total_spent_cents - ?
                ELSE 0
              END,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE user_id = ?

            AND EXISTS (
              SELECT 1
              FROM interaction_uploads

              WHERE id = ?
                AND status = 'pending'
                AND credit_refunded = 0
            )
        `)
          .bind(
            refundAmount,
            refundAmount,
            refundAmount,
            userId,
            uploadId
          ),

        env.DB.prepare(`
          INSERT INTO
            interaction_credit_ledger (
              user_id,
              entry_type,
              amount_cents,
              balance_after_cents,
              upload_id,
              reference_key,
              note,
              created_by_user_id,
              created_at
            )

          SELECT
            uploads.user_id,
            'image_refund',
            uploads.credit_cost_cents,
            wallets.balance_cents,
            uploads.id,
            uploads.public_id,
            ?,
            ?,
            CURRENT_TIMESTAMP

          FROM interaction_uploads
            AS uploads

          INNER JOIN interaction_wallets
            AS wallets
            ON wallets.user_id =
              uploads.user_id

          WHERE uploads.id = ?
            AND uploads.status =
              'pending'
            AND uploads.credit_refunded =
              0
        `)
          .bind(
            "Remboursement après refus : " +
              note,
            reviewerId,
            uploadId
          ),

        env.DB.prepare(`
          UPDATE interaction_uploads

          SET
            status = 'rejected',

            credit_refunded = 1,

            moderation_note = ?,

            reviewed_by_user_id =
              ?,

            reviewed_at =
              CURRENT_TIMESTAMP,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE id = ?
            AND status = 'pending'
            AND credit_refunded = 0
        `)
          .bind(
            note,
            reviewerId,
            uploadId
          )
      ]);

    const updateResult =
      results[2];

    if (
      Number(
        updateResult
          ?.meta
          ?.changes ?? 0
      ) === 0
    ) {
      return json(
        {
          error:
            "Cette participation vient d’être modérée par quelqu’un d’autre."
        },
        409
      );
    }
  }

  const updatedUpload =
    await findUpload(
      env,
      publicId
    );

  return json({
    success: true,

    upload:
      mapUpload(
        request,
        updatedUpload
      )
  });
}