import {
  json
} from "../shared/responses.js";

const SHOP_OPENING_AT =
  "2026-10-12T00:00:00+02:00";

export function redirectToPublicShop(
  request,
  env
) {
  const openingTime =
    new Date(
      SHOP_OPENING_AT
    ).getTime();

  /*
   * Même si quelqu’un modifie la date
   * de son ordinateur, le Worker utilise
   * l’heure du serveur.
   */

  if (Date.now() < openingTime) {
    return json(
      {
        error:
          "La boutique n’est pas encore ouverte.",
        openingAt:
          SHOP_OPENING_AT
      },
      404
    );
  }

  if (!env.SHOP_URL) {
    console.error(
      "Le secret SHOP_URL est absent."
    );

    return json(
      {
        error:
          "La boutique n’est pas configurée."
      },
      500
    );
  }

  let destination;

  try {
    destination =
      new URL(env.SHOP_URL);
  } catch {
    return json(
      {
        error:
          "L’adresse de la boutique est invalide."
      },
      500
    );
  }

  if (
    destination.protocol !== "https:"
  ) {
    return json(
      {
        error:
          "L’adresse de la boutique doit utiliser HTTPS."
      },
      500
    );
  }

  return new Response(
    null,
    {
      status: 302,

      headers: {
        Location:
          destination.toString(),

        "Cache-Control":
          "no-store"
      }
    }
  );
}