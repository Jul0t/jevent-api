import {
  resolveCreatorAccess
} from "../creators/panel.js";

import {
  json
} from "../shared/responses.js";

const DELIVERY_STATUSES =
  new Set([
    "waiting",
    "used",
    "dismissed",
    "all"
  ]);

async function requireQueueAccess(
  request,
  env
) {
  const access =
    await resolveCreatorAccess(
      request,
      env
    );

  if (!access.allowed) {
    return access;
  }

  const allowed =
    Boolean(
      access.user.permissions
        ?.isSuperAdmin
    ) ||
    [
      "owner",
      "delegate"
    ].includes(
      access.membership?.memberRole
    );

  if (!allowed) {
    return {
      allowed: false,

      response: json(
        {
          error:
            "Tu ne peux pas gérer les interactions de ce créateur."
        },
        403
      )
    };
  }

  return access;
}

function mapQueueUpload(
  request,
  upload,
  creatorId
) {
  const origin =
    new URL(request.url).origin;

  const fileUrl =
    origin +
    "/api/creator-panel/interactions/queue/" +
    encodeURIComponent(
      upload.public_id
    ) +
    "/file?creatorId=" +
    encodeURIComponent(
      creatorId
    );

  return {
    id:
      Number(upload.id),

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

    fileUrl,

    status:
      upload.status,

    deliveryStatus:
      upload.delivery_status,

    creditCostCents:
      Number(
        upload.credit_cost_cents
      ),

    createdAt:
      upload.created_at,

    reviewedAt:
      upload.reviewed_at,

    deliveredAt:
      upload.delivered_at,

    participant: {
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

      slug:
        upload.interaction_slug,

      type:
        upload.interaction_type
    },

    handledBy:
      upload.handler_id
        ? {
            id:
              Number(
                upload.handler_id
              ),

            twitchLogin:
              upload.handler_twitch_login,

            twitchDisplayName:
              upload.handler_display_name
          }
        : null
  };
}

async function findQueueUpload(
  env,
  creatorId,
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
      uploads.width,
      uploads.height,
      uploads.status,
      uploads.delivery_status,
      uploads.credit_cost_cents,
      uploads.created_at,
      uploads.reviewed_at,
      uploads.delivered_at,
      uploads.handled_by_user_id,

      users.twitch_login
        AS user_twitch_login,

      users.twitch_display_name
        AS user_display_name,

      users.twitch_profile_image_url
        AS user_profile_image_url,

      interactions.public_id
        AS interaction_public_id,

      interactions.slug
        AS interaction_slug,

      interactions.title
        AS interaction_title,

      interactions.interaction_type
        AS interaction_type,

      handler.id
        AS handler_id,

      handler.twitch_login
        AS handler_twitch_login,

      handler.twitch_display_name
        AS handler_display_name

    FROM interaction_uploads
      AS uploads

    INNER JOIN creator_interactions
      AS interactions
      ON interactions.id =
        uploads.interaction_id

    INNER JOIN users
      ON users.id =
        uploads.user_id

    LEFT JOIN users AS handler
      ON handler.id =
        uploads.handled_by_user_id

    WHERE uploads.public_id = ?
      AND interactions.creator_id = ?
      AND uploads.status = 'approved'

    LIMIT 1
  `)
    .bind(
      publicId,
      creatorId
    )
    .first();
}

/* =========================================================
   FILE D’ATTENTE
   ========================================================= */

export async function listCreatorInteractionQueue(
  request,
  env
) {
  const access =
    await requireQueueAccess(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const url =
    new URL(request.url);

  const requestedStatus =
    String(
      url.searchParams.get(
        "status"
      ) || "waiting"
    )
      .trim()
      .toLowerCase();

  if (
    !DELIVERY_STATUSES.has(
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

  const conditions = [
    "interactions.creator_id = ?",
    "uploads.status = 'approved'"
  ];

  const bindings = [
    access.creatorId
  ];

  if (
    requestedStatus !== "all"
  ) {
    conditions.push(
      "uploads.delivery_status = ?"
    );

    bindings.push(
      requestedStatus
    );
  }

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
        uploads.width,
        uploads.height,
        uploads.status,
        uploads.delivery_status,
        uploads.credit_cost_cents,
        uploads.created_at,
        uploads.reviewed_at,
        uploads.delivered_at,
        uploads.handled_by_user_id,

        users.twitch_login
          AS user_twitch_login,

        users.twitch_display_name
          AS user_display_name,

        users.twitch_profile_image_url
          AS user_profile_image_url,

        interactions.public_id
          AS interaction_public_id,

        interactions.slug
          AS interaction_slug,

        interactions.title
          AS interaction_title,

        interactions.interaction_type
          AS interaction_type,

        handler.id
          AS handler_id,

        handler.twitch_login
          AS handler_twitch_login,

        handler.twitch_display_name
          AS handler_display_name

      FROM interaction_uploads
        AS uploads

      INNER JOIN creator_interactions
        AS interactions
        ON interactions.id =
          uploads.interaction_id

      INNER JOIN users
        ON users.id =
          uploads.user_id

      LEFT JOIN users AS handler
        ON handler.id =
          uploads.handled_by_user_id

      WHERE ${conditions.join(
        " AND "
      )}

      ORDER BY
        uploads.created_at ASC,

        uploads.id ASC

      LIMIT 200
    `)
      .bind(...bindings)
      .all();

  const countResult =
    await env.DB.prepare(`
      SELECT
        uploads.delivery_status,
        COUNT(*) AS total

      FROM interaction_uploads
        AS uploads

      INNER JOIN creator_interactions
        AS interactions
        ON interactions.id =
          uploads.interaction_id

      WHERE interactions.creator_id = ?
        AND uploads.status = 'approved'

      GROUP BY
        uploads.delivery_status
    `)
      .bind(
        access.creatorId
      )
      .all();

  const counts = {
    waiting: 0,
    used: 0,
    dismissed: 0,
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
        row.delivery_status
      )
    ) {
      counts[
        row.delivery_status
      ] = total;
    }

    counts.total += total;
  }

  return json({
    uploads:
      (
        result.results ?? []
      ).map(
        upload =>
          mapQueueUpload(
            request,
            upload,
            access.creatorId
          )
      ),

    counts
  });
}

/* =========================================================
   IMAGE PRIVÉE
   ========================================================= */

export async function getCreatorInteractionQueueFile(
  request,
  env,
  rawPublicId
) {
  const access =
    await requireQueueAccess(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
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
    await findQueueUpload(
      env,
      access.creatorId,
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

  if (object.httpEtag) {
    headers.set(
      "ETag",
      object.httpEtag
    );
  }

  return new Response(
    object.body,
    {
      status: 200,
      headers
    }
  );
}

/* =========================================================
   UTILISER OU IGNORER
   ========================================================= */

export async function updateCreatorInteractionQueueItem(
  request,
  env,
  rawPublicId
) {
  const access =
    await requireQueueAccess(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

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

  const deliveryStatus =
    action === "use"
      ? "used"
      : action === "dismiss"
        ? "dismissed"
        : null;

  if (!deliveryStatus) {
    return json(
      {
        error:
          "L’action doit être use ou dismiss."
      },
      400
    );
  }

  const publicId =
    String(
      rawPublicId || ""
    ).trim();

  const upload =
    await findQueueUpload(
      env,
      access.creatorId,
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
    upload.delivery_status !==
      "waiting"
  ) {
    return json(
      {
        error:
          "Cette participation a déjà été traitée."
      },
      409
    );
  }

  const result =
    await env.DB.prepare(`
      UPDATE interaction_uploads

      SET
        delivery_status = ?,

        delivered_at =
          CURRENT_TIMESTAMP,

        handled_by_user_id = ?,

        updated_at =
          CURRENT_TIMESTAMP

      WHERE public_id = ?
        AND status = 'approved'
        AND delivery_status = 'waiting'

        AND interaction_id IN (
          SELECT id
          FROM creator_interactions
          WHERE creator_id = ?
        )
    `)
      .bind(
        deliveryStatus,
        Number(access.user.id),
        publicId,
        access.creatorId
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
          "Cette participation vient d’être traitée par quelqu’un d’autre."
      },
      409
    );
  }

  const updatedUpload =
    await findQueueUpload(
      env,
      access.creatorId,
      publicId
    );

  return json({
    success: true,

    upload:
      mapQueueUpload(
        request,
        updatedUpload,
        access.creatorId
      )
  });
}