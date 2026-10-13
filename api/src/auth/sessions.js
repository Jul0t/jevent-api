import {
  getCookie,
  makeCookie
} from "./cookies.js";

import {
  generateRandomToken,
  hashSecret
} from "../shared/security.js";

export const SESSION_COOKIE_NAME =
  "jevent_v2_session";

export const SESSION_DURATION_SECONDS =
  60 * 60 * 24 * 30;

export async function createSession(
  request,
  env,
  userId
) {
  const sessionToken =
    generateRandomToken(32);

  const tokenHash =
    await hashSecret(
      sessionToken,
      env.TOKEN_PEPPER
    );

  const expiresAt = new Date(
    Date.now() +
    SESSION_DURATION_SECONDS * 1000
  ).toISOString();

  const ipAddress =
    request.headers.get("CF-Connecting-IP") ??
    null;

  const userAgent =
    request.headers.get("User-Agent") ??
    null;

  await env.DB.prepare(`
    INSERT INTO sessions (
      token_hash,
      user_id,
      expires_at,
      ip_address,
      user_agent,
      created_at,
      last_seen_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      tokenHash,
      userId,
      expiresAt,
      ipAddress,
      userAgent
    )
    .run();

  return {
    token: sessionToken,
    expiresAt,
    maxAge: SESSION_DURATION_SECONDS
  };
}

export function createSessionCookie(session) {
  return makeCookie(
    SESSION_COOKIE_NAME,
    session.token,
    {
      maxAge: session.maxAge,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

export function createExpiredSessionCookie() {
  return makeCookie(
    SESSION_COOKIE_NAME,
    "",
    {
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

export async function getSession(
  request,
  env
) {
  const sessionToken = getCookie(
    request,
    SESSION_COOKIE_NAME
  );

  if (!sessionToken) {
    return null;
  }

  const tokenHash = await hashSecret(
    sessionToken,
    env.TOKEN_PEPPER
  );

  const session = await env.DB.prepare(`
    SELECT
      sessions.id,
      sessions.user_id,
      sessions.expires_at,
      sessions.last_seen_at,

      users.twitch_id,
      users.twitch_login,
      users.twitch_display_name,
      users.twitch_profile_image_url,
      users.created_at

    FROM sessions

    INNER JOIN users
      ON users.id = sessions.user_id

    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
      AND users.disabled_at IS NULL

    LIMIT 1
  `)
    .bind(
      tokenHash,
      new Date().toISOString()
    )
    .first();

  if (!session) {
    return null;
  }

  await touchSession(env, session);

  return {
    id: Number(session.id),
    userId: Number(session.user_id),
    expiresAt: session.expires_at,

    user: {
      id: Number(session.user_id),
      twitchId: session.twitch_id,
      login: session.twitch_login,
      displayName:
        session.twitch_display_name,
      profileImageUrl:
        session.twitch_profile_image_url,
      createdAt: session.created_at
    }
  };
}

async function touchSession(env, session) {
  const lastSeenAt = session.last_seen_at
    ? new Date(session.last_seen_at).getTime()
    : 0;

  if (
    lastSeenAt &&
    Date.now() - lastSeenAt <
      5 * 60 * 1000
  ) {
    return;
  }

  await env.DB.prepare(`
    UPDATE sessions
    SET last_seen_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(session.id)
    .run();
}

export async function deleteSession(
  request,
  env
) {
  const sessionToken = getCookie(
    request,
    SESSION_COOKIE_NAME
  );

  if (!sessionToken) {
    return;
  }

  const tokenHash = await hashSecret(
    sessionToken,
    env.TOKEN_PEPPER
  );

  await env.DB.prepare(`
    DELETE FROM sessions
    WHERE token_hash = ?
  `)
    .bind(tokenHash)
    .run();
}

export async function deleteExpiredSessions(env) {
  const result = await env.DB.prepare(`
    DELETE FROM sessions
    WHERE expires_at <= ?
  `)
    .bind(new Date().toISOString())
    .run();

  return Number(result.meta?.changes ?? 0);
}