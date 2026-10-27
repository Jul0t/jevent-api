import { json } from "../shared/responses.js";

const encoder = new TextEncoder();

function sha256(value) {
  return crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value)
  );
}

/*
 * Renvoie null si le token est valide,
 * sinon une réponse d'erreur.
 */
export async function requireStreamDeckToken(request, env) {
  if (!env.STREAMDECK_TOKEN) {
    return json({ error: "Stream Deck non configuré." }, 503);
  }

  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return json({ error: "Accès refusé." }, 401);
  }

  // Comparaison en temps constant (hachage = même longueur)
  const [received, expected] = await Promise.all([
    sha256(match[1].trim()),
    sha256(env.STREAMDECK_TOKEN)
  ]);

  if (!crypto.subtle.timingSafeEqual(received, expected)) {
    return json({ error: "Accès refusé." }, 401);
  }

  return null;
}