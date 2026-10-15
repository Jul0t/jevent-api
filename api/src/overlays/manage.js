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

import {
  getPublicRaffleOverlay
} from "../raffles/manage.js";

import {
  getPublicDonationAlertRules
} from "./donation-alerts.js";

const OVERLAY_TYPES =
  new Set([
    "raffle",
    "donations",
    "donation_bar",
    "donation_goals"
  ]);

const OVERLAY_PATHS = {
  raffle: "tombola",
  donations: "dons",
  donation_bar: "barre-dons",
  donation_goals: "objectifs-dons"
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
          WHEN 'donation_goals' THEN 4
          ELSE 5
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
    `overlay_${generateRandomToken(12)
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

export async function updateCreatorOverlaySettings(
  request,
  env,
  rawOverlayType
) {
  const access =
    await requireOverlayAccess(request, env);

  if (!access.allowed) {
    return access.response;
  }

  const overlayType =
    String(rawOverlayType || "").trim();

  if (!OVERLAY_TYPES.has(overlayType)) {
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

  let payload;

  try {
    payload = await request.json();
  } catch {
    return json(
      {
        error:
          "Le corps JSON est invalide."
      },
      400
    );
  }

  const currentSettings =
    parseSettings(existing.settings_json);

  const settings = {
    ...currentSettings
  };

  if (overlayType === "donation_goals") {
    const requestedSpeed =
      Number(payload.scrollSpeed);

    settings.scrollEnabled =
      payload.scrollEnabled === true;

    settings.scrollSpeed =
      Number.isFinite(requestedSpeed)
        ? Math.min(
          200,
          Math.max(
            10,
            Math.round(requestedSpeed)
          )
        )
        : 35;
  }

  await env.DB.prepare(`
    UPDATE creator_overlays

    SET
      settings_json = ?,
      updated_at = CURRENT_TIMESTAMP

    WHERE creator_id = ?
      AND overlay_type = ?
  `)
    .bind(
      JSON.stringify(settings),
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
      mapOverlay(env, overlay)
  });
}

export async function getPublicOverlay(
  request,
  env,
  rawAccessToken
) {

  const accessToken =
    String(
      rawAccessToken || ""
    ).trim();

  if (
    !accessToken ||
    accessToken.length < 20
  ) {

    let raffle = null;

    if (
      overlay.overlay_type ===
      "raffle"
    ) {
      raffle =
        await getPublicRaffleOverlay(
          env,
          overlay.creator_id
        );
    }

    return json(
      {
        error:
          "Overlay introuvable."
      },
      404
    );
  }

  const overlay =
    await env.DB.prepare(`
      SELECT
        creator_overlays.public_id,
        creator_overlays.overlay_type,
        creator_overlays.enabled,
        creator_overlays.settings_json,
        creator_overlays.created_at,
        creator_overlays.updated_at,

        creators.id
          AS creator_id,

        creators.public_id
          AS creator_public_id,

        creators.slug
          AS creator_slug,

        creators.twitch_display_name
          AS creator_display_name,

        creators.twitch_profile_image_url
          AS creator_profile_image_url

      FROM creator_overlays

      INNER JOIN creators
        ON creators.id =
          creator_overlays.creator_id

      WHERE creator_overlays.access_token = ?
        AND creator_overlays.enabled = 1
        AND creators.active = 1
        AND creators.archived = 0

      LIMIT 1
    `)
      .bind(accessToken)
      .first();

  if (!overlay) {
    return json(
      {
        error:
          "Overlay introuvable."
      },
      404
    );
  }

  let donationAlerts = null;
  let raffle = null;

  if (
    overlay.overlay_type ===
    "donations"
  ) {
    donationAlerts = {
      rules:
        await getPublicDonationAlertRules(
          request,
          env,
          Number(overlay.creator_id),
          accessToken
        )
    };
  }

  if (
    overlay.overlay_type ===
    "raffle"
  ) {
    raffle =
      await getPublicRaffleOverlay(
        env,
        Number(overlay.creator_id)
      );
  }

  return json({
    overlay: {
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

      donationAlerts,

      raffle,

      creator: {
        publicId:
          overlay.creator_public_id,

        slug:
          overlay.creator_slug,

        displayName:
          overlay.creator_display_name,

        profileImageUrl:
          overlay.creator_profile_image_url
      },

      createdAt:
        overlay.created_at,

      updatedAt:
        overlay.updated_at
    }
  });
}