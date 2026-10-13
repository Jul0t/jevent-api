import {
  json,
  redirect
} from "../shared/responses.js";

import {
  generateRandomToken,
  safeEqual
} from "../shared/security.js";

import {
  getCookie,
  makeCookie,
  withCookie
} from "./cookies.js";

import {
  createSession,
  createSessionCookie
} from "./sessions.js";

import {
  findUserByTwitchId,
  upsertTwitchUser,
  ensureViewerRole
} from "./users.js";

import {
  exchangeAuthorizationCode,
  getTwitchUserFromToken
} from "../twitch/api.js";

import {
  attachPreRegisteredCreator
} from "../creators/claim.js";

const OAUTH_STATE_COOKIE =
  "jevent_v2_oauth_state";

const OAUTH_RETURN_COOKIE =
  "jevent_v2_oauth_return";

const OAUTH_COOKIE_DURATION =
  10 * 60;

const ALLOWED_RETURN_PATHS = new Set(
  Array.of(
    "/",
    "/compte.html",
    "/createur-panel.html",
    "/createur-panel-beta.html",
    "/programme-panel-beta.html",
    "/moderation.html",
    "/moderation-beta.html",
    "/admin.html",
    "/admin-beta.html"
  )
);

function normalizeReturnPath(value) {
  const path = String(value ?? "").trim();

  return ALLOWED_RETURN_PATHS.has(path)
    ? path
    : "/compte.html";
}

function createOAuthCookie(name, value) {
  return makeCookie(name, value, {
    maxAge: OAUTH_COOKIE_DURATION,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/"
  });
}

function expireOAuthCookie(name) {
  return makeCookie(name, "", {
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/"
  });
}

function redirectWithAuthError(env, message) {
  const destination = new URL(
    "/",
    env.SITE_URL
  );

  destination.searchParams.set(
    "error",
    message
  );

  return redirect(destination.toString());
}

export function startTwitchLogin(
  request,
  env
) {
  if (
    !env.TWITCH_CLIENT_ID ||
    !env.TWITCH_REDIRECT_URI
  ) {
    return json(
      {
        error:
          "La connexion Twitch n’est pas configurée."
      },
      500
    );
  }

  const requestUrl = new URL(request.url);

  const returnPath = normalizeReturnPath(
    requestUrl.searchParams.get("returnTo")
  );

  const state = generateRandomToken(32);

  const parameters = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    redirect_uri:
      env.TWITCH_REDIRECT_URI,
    response_type: "code",
    state,
    force_verify: "false"
  });

  const authorizationUrl =
    "https://id.twitch.tv/oauth2/authorize?" +
    parameters.toString();

  let response = redirect(
    authorizationUrl
  );

  response = withCookie(
    response,
    createOAuthCookie(
      OAUTH_STATE_COOKIE,
      state
    )
  );

  response = withCookie(
    response,
    createOAuthCookie(
      OAUTH_RETURN_COOKIE,
      returnPath
    )
  );

  return response;
}

export async function finishTwitchLogin(
  request,
  env
) {
  const url = new URL(request.url);

  const twitchError =
    url.searchParams.get("error");

  if (twitchError) {
    return redirectWithAuthError(
      env,
      url.searchParams.get(
        "error_description"
      ) ||
        "La connexion Twitch a été annulée."
    );
  }

  const authorizationCode =
    url.searchParams.get("code");

  const returnedState =
    url.searchParams.get("state");

  const expectedState = getCookie(
    request,
    OAUTH_STATE_COOKIE
  );

  const returnPath = normalizeReturnPath(
    getCookie(
      request,
      OAUTH_RETURN_COOKIE
    )
  );

  if (
    !authorizationCode ||
    !returnedState ||
    !expectedState ||
    !safeEqual(
      returnedState,
      expectedState
    )
  ) {
    return redirectWithAuthError(
      env,
      "La vérification de sécurité Twitch a échoué."
    );
  }

  const token =
    await exchangeAuthorizationCode(
      env,
      authorizationCode
    );

  if (!token) {
    return redirectWithAuthError(
      env,
      "Twitch a refusé la connexion."
    );
  }

  const twitchUser =
    await getTwitchUserFromToken(
      env,
      token.accessToken
    );

  if (!twitchUser) {
    return redirectWithAuthError(
      env,
      "Impossible de récupérer ton compte Twitch."
    );
  }

  const existingUser =
    await findUserByTwitchId(
      env,
      twitchUser.id
    );

  const user = await upsertTwitchUser(
    env,
    twitchUser
  );

  if (!user || user.disabled_at) {
    return redirectWithAuthError(
      env,
      "Ce compte n’est pas autorisé à se connecter."
    );
  }

  await ensureViewerRole(env, user.id);

    const creatorAttachment =
    await attachPreRegisteredCreator(
      env,
      user
    );

  const session = await createSession(
    request,
    env,
    user.id
  );

    const destinationPath =
    creatorAttachment?.requiresOnboarding
      ? "/createur-panel-beta.html"
      : returnPath;

  const destination = new URL(
    destinationPath,
    env.SITE_URL
  );

  if (
    creatorAttachment?.requiresOnboarding
  ) {
    destination.searchParams.set(
      "welcome",
      "1"
    );
  } else if (!existingUser) {
    destination.searchParams.set(
      "welcome",
      "1"
    );
  }

  let response = redirect(
    destination.toString()
  );

  response = withCookie(
    response,
    createSessionCookie(session)
  );

  response = withCookie(
    response,
    expireOAuthCookie(
      OAUTH_STATE_COOKIE
    )
  );

  response = withCookie(
    response,
    expireOAuthCookie(
      OAUTH_RETURN_COOKIE
    )
  );

  return response;
}