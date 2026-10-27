const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const STREAMS_URL = "https://api.twitch.tv/helix/streams";
const CACHE_MS = 15_000;

let appToken = null;   // { value, expiresAt }
let liveCache = null;  // { key, at, map }

async function getAppToken(env, force = false) {
  if (!force && appToken && appToken.expiresAt > Date.now()) {
    return appToken.value;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials"
    })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.access_token) {
    throw new Error(`Token Twitch : HTTP ${res.status}`);
  }

  appToken = {
    value: data.access_token,
    // Marge de 5 min avant l'expiration
    expiresAt: Date.now() + (Number(data.expires_in ?? 3600) - 300) * 1000
  };

  return appToken.value;
}

function fetchStreams(env, ids, token) {
  const url = new URL(STREAMS_URL);
  url.searchParams.set("first", "100");
  for (const id of ids) url.searchParams.append("user_id", id);

  return fetch(url, {
    headers: {
      "Client-Id": env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`
    }
  });
}

/*
 * Renvoie une Map twitch_id -> { viewers, startedAt, title, game }
 * pour les chaînes en live, ou null si Twitch est injoignable.
 */
export async function getLiveStreams(env, twitchIds) {
  // Helix accepte 100 chaînes maximum par requête
  const ids = [...new Set(twitchIds.filter(Boolean).map(String))].slice(0, 100);
  if (ids.length === 0) return new Map();

  const key = ids.join(",");
  if (liveCache && liveCache.key === key && Date.now() - liveCache.at < CACHE_MS) {
    return liveCache.map;
  }

  try {
    let res = await fetchStreams(env, ids, await getAppToken(env));

    // Token expiré ou révoqué : on en redemande un, une seule fois
    if (res.status === 401) {
      res = await fetchStreams(env, ids, await getAppToken(env, true));
    }

    if (!res.ok) throw new Error(`Helix streams : HTTP ${res.status}`);

    const data = await res.json();
    const map = new Map();

    for (const s of data.data ?? []) {
      if (s.type !== "live") continue;
      map.set(String(s.user_id), {
        viewers: Number(s.viewer_count ?? 0),
        startedAt: s.started_at ?? null,
        title: s.title ?? "",
        game: s.game_name ?? ""
      });
    }

    liveCache = { key, at: Date.now(), map };
    return map;
  } catch (error) {
    console.error("[StreamDeck] Statut live indisponible :", error);
    return null;
  }
}