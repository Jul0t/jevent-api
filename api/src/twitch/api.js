let cachedAppToken = null;
let cachedAppTokenExpiresAt = 0;

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function exchangeAuthorizationCode(
  env,
  authorizationCode
) {
  const response = await fetch(
    "https://id.twitch.tv/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret:
          env.TWITCH_CLIENT_SECRET,
        code: authorizationCode,
        grant_type: "authorization_code",
        redirect_uri:
          env.TWITCH_REDIRECT_URI
      })
    }
  );

  const data = await parseJson(response);

  if (
    !response.ok ||
    !data?.access_token
  ) {
    console.error(
      "Erreur lors de l’échange OAuth Twitch :",
      data
    );

    return null;
  }

  return {
    accessToken: data.access_token,
    refreshToken:
      data.refresh_token ?? null,
    expiresIn:
      Number(data.expires_in ?? 0),
    scopes:
      Array.isArray(data.scope)
        ? data.scope
        : []
  };
}

export async function getTwitchUserFromToken(
  env,
  accessToken
) {
  const response = await fetch(
    "https://api.twitch.tv/helix/users",
    {
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
        "Client-Id":
          env.TWITCH_CLIENT_ID
      }
    }
  );

  const data = await parseJson(response);
  const twitchUser = data?.data?.[0];

  if (!response.ok || !twitchUser) {
    console.error(
      "Erreur de récupération du compte Twitch :",
      data
    );

    return null;
  }

  return twitchUser;
}

export async function getAppAccessToken(env) {
  if (
    cachedAppToken &&
    Date.now() < cachedAppTokenExpiresAt
  ) {
    return cachedAppToken;
  }

  const response = await fetch(
    "https://id.twitch.tv/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret:
          env.TWITCH_CLIENT_SECRET,
        grant_type: "client_credentials"
      })
    }
  );

  const data = await parseJson(response);

  if (
    !response.ok ||
    !data?.access_token
  ) {
    console.error(
      "Impossible d’obtenir le jeton Twitch d’application :",
      data
    );

    return null;
  }

  cachedAppToken = data.access_token;

  cachedAppTokenExpiresAt =
    Date.now() +
    Math.max(
      60,
      Number(data.expires_in ?? 3600) - 300
    ) *
      1000;

  return cachedAppToken;
}

export async function getTwitchUserByLogin(
  env,
  rawLogin
) {
  const login = String(rawLogin ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

  if (!/^[a-z0-9_]{4,25}$/.test(login)) {
    return null;
  }

  const accessToken =
    await getAppAccessToken(env);

  if (!accessToken) {
    throw new Error(
      "Impossible de contacter Twitch."
    );
  }

  const destination = new URL(
    "https://api.twitch.tv/helix/users"
  );

  destination.searchParams.set(
    "login",
    login
  );

  const response = await fetch(
    destination.toString(),
    {
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
        "Client-Id":
          env.TWITCH_CLIENT_ID
      }
    }
  );

  const data = await parseJson(response);

  if (!response.ok) {
    console.error(
      "Recherche Twitch échouée :",
      data
    );

    throw new Error(
      "La recherche Twitch a échoué."
    );
  }

  return data?.data?.[0] ?? null;
}

export async function getTwitchStreamsByUserIds(
  env,
  rawTwitchIds
) {
  const twitchIds = Array.from(
    new Set(
      Array.from(rawTwitchIds ?? [])
        .map(value => String(value ?? "").trim())
        .filter(Boolean)
    )
  ).slice(0, 100);

  if (twitchIds.length === 0) {
    return [];
  }

  const accessToken =
    await getAppAccessToken(env);

  if (!accessToken) {
    console.error(
      "Impossible de récupérer les lives : jeton Twitch absent."
    );

    return [];
  }

  const destination = new URL(
    "https://api.twitch.tv/helix/streams"
  );

  for (const twitchId of twitchIds) {
    destination.searchParams.append(
      "user_id",
      twitchId
    );
  }

  destination.searchParams.set(
    "first",
    String(twitchIds.length)
  );

  const response = await fetch(
    destination.toString(),
    {
      headers: {
        Authorization:
          `Bearer ${accessToken}`,

        "Client-Id":
          env.TWITCH_CLIENT_ID
      }
    }
  );

  const data = await parseJson(response);

  if (!response.ok) {
    console.error(
      "Erreur lors de la récupération des lives Twitch :",
      data
    );

    return [];
  }

  return Array.isArray(data?.data)
    ? data.data
    : [];
}