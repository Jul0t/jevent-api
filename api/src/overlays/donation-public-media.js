import {
  json
} from "../shared/responses.js";

const MEDIA_COLUMNS = {
  image: "image_storage_key",
  video: "video_storage_key",
  sound: "sound_storage_key"
};

const DEFAULT_CONTENT_TYPES = {
  image: "image/webp",
  video: "video/webm",
  sound: "audio/mpeg"
};

export async function getPublicDonationAlertMedia(
  request,
  env,
  rawToken,
  rawRulePublicId,
  rawVariantPublicId,
  rawMediaKind
) {
  const token =
    String(
      rawToken || ""
    ).trim();

  /*
   * Deux formes d'appel sont acceptées :
   *
   * Format complet :
   * token, rulePublicId, variantPublicId, mediaKind
   *
   * Format court :
   * token, variantPublicId, mediaKind
   *
   * Pour le format court :
   * rawRulePublicId contient en réalité le variantPublicId
   * rawVariantPublicId contient en réalité le mediaKind
   * rawMediaKind est undefined
   */
  const hasExplicitRule =
    rawMediaKind !== undefined &&
    rawMediaKind !== null &&
    String(
      rawMediaKind
    ).trim() !== "";

  const rulePublicId =
    hasExplicitRule
      ? String(
        rawRulePublicId || ""
      ).trim()
      : "";

  const variantPublicId =
    hasExplicitRule
      ? String(
        rawVariantPublicId || ""
      ).trim()
      : String(
        rawRulePublicId || ""
      ).trim();

  const mediaKind =
    (
      hasExplicitRule
        ? String(
          rawMediaKind || ""
        )
        : String(
          rawVariantPublicId || ""
        )
    )
      .trim()
      .toLowerCase();

  const column =
    MEDIA_COLUMNS[
    mediaKind
    ];

  console.log(
    "[Donation media] Validation",
    {
      pathname:
        new URL(
          request.url
        ).pathname,

      token,
      rulePublicId:
        rulePublicId || null,

      variantPublicId,
      mediaKind,

      routeFormat:
        hasExplicitRule
          ? "complete"
          : "court"
    }
  );

  if (
    !token ||
    !variantPublicId ||
    !column
  ) {
    return json(
      {
        error:
          "Le média demandé est invalide."
      },
      400
    );
  }

  /*
   * Le filtre sur rules.public_id est ajouté
   * uniquement lorsque l'URL contient la règle.
   */
  const ruleCondition =
    rulePublicId
      ? `
                AND rules.public_id = ?
            `
      : "";

  const statement =
    env.DB.prepare(`
            SELECT
                variants.${column}
                    AS storage_key

            FROM creator_overlays
                AS overlays

            INNER JOIN
                creator_donation_alert_rules
                    AS rules

                ON rules.creator_id =
                    overlays.creator_id

            INNER JOIN
                creator_donation_alert_variants
                    AS variants

                ON variants.rule_id =
                    rules.id

            WHERE overlays.access_token = ?

                AND overlays.overlay_type =
                    'donations'

                AND overlays.enabled = 1

                ${ruleCondition}

                AND variants.public_id = ?

                AND variants.enabled = 1

            LIMIT 1
        `);

  const media =
    rulePublicId
      ? await statement
        .bind(
          token,
          rulePublicId,
          variantPublicId
        )
        .first()
      : await statement
        .bind(
          token,
          variantPublicId
        )
        .first();

  if (!media?.storage_key) {
    return json(
      {
        error:
          "Ce média n’existe pas."
      },
      404
    );
  }

  const object =
    await env.MEDIA.get(
      media.storage_key
    );

  if (!object) {
    return json(
      {
        error:
          "Le fichier média est introuvable."
      },
      404
    );
  }

  const headers =
    new Headers();

  if (
    typeof object.writeHttpMetadata ===
    "function"
  ) {
    object.writeHttpMetadata(
      headers
    );
  }

  if (
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      DEFAULT_CONTENT_TYPES[
      mediaKind
      ]
    );
  }

  headers.set(
    "Cache-Control",  
    "private, no-cache, must-revalidate"
  );

  headers.set(
    "Pragma",
    "no-cache"
  );

  headers.set(
    "Expires",
    "0"
  );

  headers.set(
    "Vary",
    "Range"
  );

  if (object.httpEtag) {
    headers.set(
      "ETag",
      object.httpEtag
    );
  }

  headers.set(
    "X-Content-Type-Options",
    "nosniff"
  );

  return new Response(
    object.body,
    {
      status: 200,
      headers
    }
  );
}