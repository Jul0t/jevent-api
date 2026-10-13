import {
  json,
  forbidden
} from "../shared/responses.js";

import {
  generateRandomToken
} from "../shared/security.js";

import {
  resolveCreatorAccess
} from "../creators/panel.js";

const OVERLAY_TYPES =
  new Set([
    "raffle",
    "donations",
    "donation_bar"
  ]);

const OVERLAY_PATHS = {
  raffle: "tombola",
  donations: "dons",
  donation_bar: "barre-dons"
};

async function requireOverlayAccess(
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

  const canManage =
    access.user.permissions
      .isSuperAdmin ||
    [
      "owner",
      "delegate"
    ].includes(
      access.membership?.memberRole
    );

  if (!canManage) {
    return {
      allowed: false,

      response: forbidden(
        "Tu ne peux pas gérer les overlays de ce créateur."
      )
    };
  }

  return access;
}

function parseSettings(value) {
  try {
    const settings =
      JSON.parse(
        value || "{}"
      );

    return (
      settings &&
      typeof settings === "object"
        ? settings
        : {}
    );
  } catch {
    return {};
  }
}

function mapOverlay(
  env,
  overlay
) {
  const overlayPath =
    OVERLAY_PATHS[
      overlay.overlay_type
    ];

  const siteUrl =
    String(
      env.SITE_URL ||
      "https://jevent.julot.fr"
    ).replace(/\/+$/, "");

  return {
    publicId:
      overlay.public_id,

    overlayType:
      overlay.overlay_type,

    enabled:
      Boolean(overlay.enabled),

    settings:
      parseSettings(
        overlay.settings_json
      ),

    url:
      `${siteUrl}/overlay/` +
      `${overlayPath}/` +
      encodeURIComponent(
        overlay.access_token
      ),

    tokenRotatedAt:
      overlay.token_rotated_at,

    createdAt:
      overlay.created_at,

    updatedAt:
      overlay.updated_at
  };
}

async function findCreatorOverlay(
  env,
  creatorId,
  overlayType
) {
  return env.DB.prepare(`
    SELECT
      public_id,
      overlay_type,
      access_token,
      enabled,
      settings_json,
      token_rotated_at,
      created_at,
      updated_at

    FROM creator_overlays

    WHERE creator_id = ?
      AND overlay_type = ?

    LIMIT 1
  `)
    .bind(
      creatorId,
      overlayType
    )
    .first();
}

export async function listCreatorOverlays(
  request,
  env
) {
  const access =
    await requireOverlayAccess(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        public_id,
        overlay_type,
        access_token,
        enabled,
        settings_json,
        token_rotated_at,
        created_at,
        updated_at

      FROM creator_overlays

      WHERE creator_id = ?

      ORDER BY
        CASE overlay_type
          WHEN 'raffle' THEN 1
          WHEN 'donations' THEN 2
          WHEN 'donation_bar' THEN 3
          ELSE 4
        END
    `)
      .bind(
        access.creatorId
      )
      .all();

  return json({
    overlays:
      (result.results ?? [])
        .map(overlay =>
          mapOverlay(
            env,
            overlay
          )
        )
  });
}

export async function createCreatorOverlay(
  request,
  env
) {
  const access =
    await requireOverlayAccess(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  let payload = {};

  try {
    payload =
      await request.json();
  } catch {
    return json(
      {
        error:
          "Le corps JSON est invalide."
      },
      400
    );
  }

  const overlayType =
    String(
      payload.overlayType || ""
    ).trim();

  if (
    !OVERLAY_TYPES.has(
      overlayType
    )
  ) {
    return json(
      {
        error:
          "Ce type d’overlay est invalide."
      },
      400
    );
  }

  const existing =
    await findCreatorOverlay(
      env,
      access.creatorId,
      overlayType
    );

  if (existing) {
    return json({
      success: true,
      alreadyCreated: true,

      overlay:
        mapOverlay(
          env,
          existing
        )
    });
  }

  const publicId =
    `overlay_${
      generateRandomToken(12)
    }`;

  const accessToken =
    generateRandomToken(32);

  await env.DB.prepare(`
    INSERT INTO creator_overlays (
      public_id,
      creator_id,
      overlay_type,
      access_token,
      enabled,
      settings_json,
      created_by_user_id,
      token_rotated_at,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      1,
      '{}',
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      publicId,
      access.creatorId,
      overlayType,
      accessToken,
      Number(access.user.id)
    )
    .run();

  const overlay =
    await findCreatorOverlay(
      env,
      access.creatorId,
      overlayType
    );

  return json(
    {
      success: true,
      alreadyCreated: false,

      overlay:
        mapOverlay(
          env,
          overlay
        )
    },
    201
  );
}

export async function rotateCreatorOverlayToken(
  request,
  env,
  rawOverlayType
) {
  const access =
    await requireOverlayAccess(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  const overlayType =
    String(
      rawOverlayType || ""
    ).trim();

  if (
    !OVERLAY_TYPES.has(
      overlayType
    )
  ) {
    return json(
      {
        error:
          "Ce type d’overlay est invalide."
      },
      400
    );
  }

  const existing =
    await findCreatorOverlay(
      env,
      access.creatorId,
      overlayType
    );

  if (!existing) {
    return json(
      {
        error:
          "Cet overlay n’a pas encore été créé."
      },
      404
    );
  }

  const accessToken =
    generateRandomToken(32);

  await env.DB.prepare(`
    UPDATE creator_overlays

    SET
      access_token = ?,
      token_rotated_at =
        CURRENT_TIMESTAMP,
      updated_at =
        CURRENT_TIMESTAMP

    WHERE creator_id = ?
      AND overlay_type = ?
  `)
    .bind(
      accessToken,
      access.creatorId,
      overlayType
    )
    .run();

  const overlay =
    await findCreatorOverlay(
      env,
      access.creatorId,
      overlayType
    );

  return json({
    success: true,

    overlay:
      mapOverlay(
        env,
        overlay
      )
  });
}