import {
  requireAuthentication
} from "../auth/permissions.js";

import {
  generateRandomToken
} from "../shared/security.js";

import {
  createChatMessageSubscription
} from "./eventsub.js";

const SCOPES = "user:read:chat";
const STATE_DURATION_SECONDS = 600;
const STATE_COOKIE = "twitch_chat_oauth_state";

function redirectTo(
  env,
  slug,
  status,
  message = null
) {
  const url = new URL(
    "/createur.html",
    env.SITE_URL
  );

  if (slug) {
    url.searchParams.set("slug", slug);
  }

  url.searchParams.set(
    "twitchChat",
    status
  );

  if (message) {
    url.searchParams.set(
      "error",
      message
    );
  }

  const response =
    new Response(null, {
      status: 302,
      headers: {
        Location: url.toString()
      }
    });

  response.headers.append(
    "Set-Cookie",
    clearStateCookie()
  );

  return response;
}

function createStateCookie(state) {
  return [
    `${STATE_COOKIE}=${encodeURIComponent(state)}`,
    "Max-Age=600",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

function clearStateCookie() {
  return [
    `${STATE_COOKIE}=`,
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

function getCookie(
  request,
  name
) {
  const cookieHeader =
    request.headers.get("Cookie") ?? "";

  const cookies =
    cookieHeader.split(";");

  for (const cookie of cookies) {
    const [key, ...values] =
      cookie.trim().split("=");

    if (key === name) {
      return decodeURIComponent(
        values.join("=")
      );
    }
  }

  return "";
}

function jsonError(
  message,
  status
) {
  return new Response(
    JSON.stringify({
      error: message
    }),
    {
      status,
      headers: {
        "Content-Type":
          "application/json"
      }
    }
  );
}

async function getAuthorizedCreator(
  request,
  env,
  creatorId
) {
  const authentication =
    await requireAuthentication(
      request,
      env
    );

  if (!authentication.allowed) {
    return authentication;
  }

  const user =
    authentication.user;

  const isAdmin =
    Boolean(
      user.permissions?.isSuperAdmin
    );

  const membership =
    (
      user.creatorMemberships ?? []
    ).find(
      item =>
        Number(item.creatorId) ===
        Number(creatorId)
    );

  const isOwner =
    membership?.memberRole ===
    "owner";

  if (!isAdmin && !isOwner) {
    return {
      allowed: false,
      response: jsonError(
        "Tu ne peux pas activer la collecte de ce créateur.",
        403
      )
    };
  }

  const creator =
    await env.DB.prepare(`
      SELECT
        id,
        slug,
        twitch_id
      FROM creators
      WHERE id = ?
        AND archived = 0
      LIMIT 1
    `)
      .bind(Number(creatorId))
      .first();

  if (!creator) {
    return {
      allowed: false,
      response: jsonError(
        "Créateur introuvable.",
        404
      )
    };
  }

  return {
    allowed: true,
    authentication,
    creator
  };
}

export async function startChatAuthorization(
  request,
  env
) {
  if (
    !env.TWITCH_CLIENT_ID ||
    !env.TWITCH_CHAT_REDIRECT_URI
  ) {
    return jsonError(
      "La connexion Twitch pour le chat n’est pas configurée.",
      500
    );
  }

  const url =
    new URL(request.url);

  const creatorId =
    Number(
      url.searchParams.get(
        "creatorId"
      )
    );

  if (
    !Number.isInteger(creatorId) ||
    creatorId < 1
  ) {
    return jsonError(
      "Identifiant de créateur invalide.",
      400
    );
  }

  const access =
    await getAuthorizedCreator(
      request,
      env,
      creatorId
    );

  if (!access.allowed) {
    return access.response;
  }

  const state =
    generateRandomToken(32);

  const expiresAt =
    new Date(
      Date.now() +
        STATE_DURATION_SECONDS *
          1000
    ).toISOString();

  await env.DB.prepare(`
    INSERT INTO twitch_chat_oauth_states (
      state,
      creator_id,
      expires_at
    )
    VALUES (?, ?, ?)
  `)
    .bind(
      state,
      creatorId,
      expiresAt
    )
    .run();

  const parameters =
    new URLSearchParams({
      client_id:
        env.TWITCH_CLIENT_ID,

      redirect_uri:
        env.TWITCH_CHAT_REDIRECT_URI,

      response_type: "code",
      scope: SCOPES,
      state,
      force_verify: "true"
    });

  const response =
    new Response(null, {
      status: 302,
      headers: {
        Location:
          "https://id.twitch.tv/oauth2/authorize?" +
          parameters.toString(),

        "Set-Cookie":
          createStateCookie(state)
      }
    });

  return response;
}

export async function finishChatAuthorization(
  request,
  env
) {
  const url =
    new URL(request.url);

  const state =
    url.searchParams.get("state") ?? "";

  const savedState =
    getCookie(
      request,
      STATE_COOKIE
    );

  if (
    !state ||
    !savedState ||
    state !== savedState
  ) {
    return redirectTo(
      env,
      null,
      "error",
      "État OAuth Twitch invalide."
    );
  }

  const oauthState =
    await env.DB.prepare(`
      SELECT
        state,
        creator_id,
        expires_at
      FROM twitch_chat_oauth_states
      WHERE state = ?
      LIMIT 1
    `)
      .bind(state)
      .first();

  if (
    !oauthState ||
    new Date(oauthState.expires_at) <=
      new Date()
  ) {
    return redirectTo(
      env,
      null,
      "error",
      "La demande OAuth Twitch a expiré."
    );
  }

  await env.DB.prepare(`
    DELETE FROM twitch_chat_oauth_states
    WHERE state = ?
  `)
    .bind(state)
    .run();

  const creator =
    await env.DB.prepare(`
      SELECT
        id,
        slug,
        twitch_id
      FROM creators
      WHERE id = ?
        AND archived = 0
      LIMIT 1
    `)
      .bind(oauthState.creator_id)
      .first();

  if (!creator) {
    return redirectTo(
      env,
      null,
      "error",
      "Créateur introuvable."
    );
  }

  const errorDescription =
    url.searchParams.get(
      "error_description"
    );

  const code =
    url.searchParams.get("code");

  if (!code) {
    return redirectTo(
      env,
      creator.slug,
      "error",
      errorDescription ??
        "Autorisation Twitch refusée."
    );
  }

  if (
    !env.TWITCH_CLIENT_ID ||
    !env.TWITCH_CLIENT_SECRET ||
    !env.TWITCH_CHAT_REDIRECT_URI
  ) {
    return redirectTo(
      env,
      creator.slug,
      "error",
      "La connexion Twitch n’est pas configurée."
    );
  }

  const tokenResponse =
    await fetch(
      "https://id.twitch.tv/oauth2/token",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          new URLSearchParams({
            client_id:
              env.TWITCH_CLIENT_ID,

            client_secret:
              env.TWITCH_CLIENT_SECRET,

            code,

            grant_type:
              "authorization_code",

            redirect_uri:
              env.TWITCH_CHAT_REDIRECT_URI
          })
      }
    );

  let tokenData = {};

  try {
    tokenData =
      await tokenResponse.json();
  } catch {
    tokenData = {};
  }

  if (
    !tokenResponse.ok ||
    !tokenData.access_token
  ) {
    return redirectTo(
      env,
      creator.slug,
      "error",
      "Impossible de récupérer le token Twitch."
    );
  }

  const userResponse =
    await fetch(
      "https://api.twitch.tv/helix/users",
      {
        headers: {
          "Client-Id":
            env.TWITCH_CLIENT_ID,

          Authorization:
            `Bearer ${tokenData.access_token}`
        }
      }
    );

  let userData = {};

  try {
    userData =
      await userResponse.json();
  } catch {
    userData = {};
  }

  const twitchUser =
    userData.data?.[0];

  if (!twitchUser) {
    return redirectTo(
      env,
      creator.slug,
      "error",
      "Impossible de récupérer ton compte Twitch."
    );
  }

  if (
    String(twitchUser.id) !==
    String(creator.twitch_id)
  ) {
    return redirectTo(
      env,
      creator.slug,
      "error",
      "Tu dois autoriser le compte Twitch correspondant à ce créateur."
    );
  }

  if (
    !env.TWITCH_TOKEN_ENCRYPTION_KEY
  ) {
    return redirectTo(
      env,
      creator.slug,
      "error",
      "Le chiffrement des tokens Twitch n’est pas configuré."
    );
  }

  const encryptedAccessToken =
    await encryptToken(
      env,
      tokenData.access_token
    );

  const encryptedRefreshToken =
    await encryptToken(
      env,
      tokenData.refresh_token ?? ""
    );

  const tokenExpiresAt =
    new Date(
      Date.now() +
        Number(
          tokenData.expires_in ?? 0
        ) *
          1000
    ).toISOString();

  await env.DB.prepare(`
    INSERT INTO twitch_chat_connections (
      creator_id,
      twitch_user_id,
      encrypted_access_token,
      encrypted_refresh_token,
      token_expires_at,
      status,
      connected_at,
      updated_at
    )
    VALUES (
      ?, ?, ?, ?, ?,
      'connected',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (creator_id)
    DO UPDATE SET
      twitch_user_id =
        excluded.twitch_user_id,

      encrypted_access_token =
        excluded.encrypted_access_token,

      encrypted_refresh_token =
        excluded.encrypted_refresh_token,

      token_expires_at =
        excluded.token_expires_at,

      status = 'connected',
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
  `)
    .bind(
      oauthState.creator_id,
      twitchUser.id,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt
    )
    .run();

  try {
    await createChatMessageSubscription(
      env,
      {
        accessToken:
          tokenData.access_token,

        creatorId:
          oauthState.creator_id,

        broadcasterTwitchId:
          twitchUser.id
      }
    );
  } catch (error) {
    console.error(
      "Impossible de créer l’abonnement EventSub :",
      error
    );

    await env.DB.prepare(`
      UPDATE twitch_chat_connections
      SET
        status = 'error',
        last_error = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE creator_id = ?
    `)
      .bind(
        String(
          error.message ??
            "Erreur EventSub"
        ).slice(0, 1000),

        oauthState.creator_id
      )
      .run();

    return redirectTo(
      env,
      creator.slug,
      "error",
      "Autorisation réussie, mais la collecte n’a pas pu être activée."
    );
  }

  return redirectTo(
    env,
    creator.slug,
    "connected"
  );
}

function bytesToBase64(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(
      byte
    );
  }

  return btoa(binary);
}

function base64ToBytes(value) {
  const binary =
    atob(value);

  return Uint8Array.from(
    binary,
    character =>
      character.charCodeAt(0)
  );
}

async function getEncryptionKey(env) {
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(
      env.TWITCH_TOKEN_ENCRYPTION_KEY
    ),
    {
      name: "AES-GCM"
    },
    false,
    ["encrypt"]
  );
}

async function encryptToken(
  env,
  token
) {
  const iv =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  const encrypted =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv
      },
      await getEncryptionKey(env),
      new TextEncoder().encode(
        String(token)
      )
    );

  return [
    bytesToBase64(iv),
    bytesToBase64(
      new Uint8Array(encrypted)
    )
  ].join(".");
}