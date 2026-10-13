import {
  json
} from "../shared/responses.js";

import {
  requireAdminAccess
} from "./access.js";

const DEFAULT_LAYOUT = [
  "creators",
  "active-creators",
  "streamlabs-members",
  "available-imports",
  "global-raised",
  "messages",
  "emotes",
  "goals",
  "program-entries",
  "streamlabs-configured"
];

const ALLOWED_WIDGETS =
  new Set(DEFAULT_LAYOUT);

function normalizeLayout(value) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_LAYOUT];
  }

  const uniqueWidgets = [];

  for (const widget of value) {
    const widgetId =
      String(widget ?? "").trim();

    if (
      ALLOWED_WIDGETS.has(widgetId) &&
      !uniqueWidgets.includes(widgetId)
    ) {
      uniqueWidgets.push(widgetId);
    }
  }

  return uniqueWidgets;
}

export async function getAdminDashboardPreferences(
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

  const userId =
    Number(access.user.id);

  const preferences =
    await env.DB.prepare(`
      SELECT layout_json
      FROM admin_dashboard_preferences
      WHERE user_id = ?
      LIMIT 1
    `)
      .bind(userId)
      .first();

  let layout =
    [...DEFAULT_LAYOUT];

  if (preferences?.layout_json) {
    try {
      layout = normalizeLayout(
        JSON.parse(
          preferences.layout_json
        )
      );
    } catch {
      layout =
        [...DEFAULT_LAYOUT];
    }
  }

  return json({
    layout,
    defaultLayout:

DEFAULT_LAYOUT
  });
}

export async function updateAdminDashboardPreferences(
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

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        error:
          "Le contenu envoyé est invalide."
      },
      400
    );
  }

  if (!Array.isArray(body?.layout)) {
    return json(
      {
        error:
          "La disposition est invalide."
      },
      400
    );
  }

  const layout =
    normalizeLayout(body.layout);

  const userId =
    Number(access.user.id);

  await env.DB.prepare(`
    INSERT INTO admin_dashboard_preferences (
      user_id,
      layout_json,
      updated_at
    )
    VALUES (
      ?,
      ?,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(user_id)
    DO UPDATE SET
      layout_json =
        excluded.layout_json,
      updated_at =
        CURRENT_TIMESTAMP
  `)
    .bind(
      userId,
      JSON.stringify(layout)
    )
    .run();

  return json({
    success: true,
    layout
  });
}