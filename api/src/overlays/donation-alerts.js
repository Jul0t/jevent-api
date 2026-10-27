import {
    json
} from "../shared/responses.js";

import {
    generateRandomToken
} from "../shared/security.js";

import {
    resolveCreatorAccess
} from "../creators/panel.js";

const CONDITION_TYPES =
    new Set([
        "default",
        "exact",
        "minimum",
        "range"
    ]);

const SELECTION_MODES =
    new Set([
        "fixed",
        "random"
    ]);

const TEXT_TRANSFORMS =
    new Set([
        "none",
        "uppercase",
        "lowercase"
    ]);

const TEXT_POSITIONS =
    new Set([
        "top",
        "center",
        "bottom"
    ]);

const ANIMATIONS =
    new Set([
        "none",
        "fade",
        "slide",
        "zoom",
        "bounce"
    ]);

const MEDIA_TYPES =
    new Set([
        "none",
        "image",
        "video"
    ]);

const ALERT_EDITOR_COLORS = [
    {
        key: "dark-green",
        label: "Vert JEvent foncé",
        value: "#173F2A"
    },
    {
        key: "light-green",
        label: "Vert JEvent clair",
        value: "#63D98A"
    },
    {
        key: "cream",
        label: "Crème",
        value: "#F2E9D8"
    }
];

const ALERT_EDITOR_FONTS = [
    "Inter",
    "Arial",
    "Montserrat",
    "Poppins",
    "Roboto",
    "Oswald",
    "Bebas Neue"
];

const TEXT_ALIGNMENTS =
    new Set([
        "left",
        "center",
        "right"
    ]);

const VIDEO_FITS =
    new Set([
        "contain",
        "cover",
        "fill"
    ]);

const MAX_ALERT_TEXT_LAYERS = 3;

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
    }
}

function cleanText(
    value,
    maximumLength = 255
) {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, maximumLength);
}

function cleanTemplate(
    value,
    maximumLength = 500
) {
    return String(value ?? "")
        .trim()
        .slice(0, maximumLength);
}

function toBoolean(
    value,
    fallback = false
) {
    if (
        value === undefined ||
        value === null
    ) {
        return fallback;
    }

    return Boolean(value);
}

function toInteger(
    value,
    {
        fallback,
        minimum,
        maximum,
        label
    }
) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return fallback;
    }

    const parsed =
        Number(value);

    if (
        !Number.isInteger(parsed) ||
        parsed < minimum ||
        parsed > maximum
    ) {
        throw new ValidationError(
            `${label} est invalide.`
        );
    }

    return parsed;
}

async function readJsonBody(request) {
    try {
        return await request.json();
    } catch {
        throw new ValidationError(
            "Le contenu envoyé est invalide."
        );
    }
}

async function requireDonationAlertAccess(
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

    const role =
        access.membership?.memberRole;

    const canManage =
        access.user.permissions
            .isSuperAdmin ||
        role === "owner" ||
        role === "delegate";

    if (!canManage) {
        return {
            allowed: false,

            response: json(
                {
                    error:
                        "Tu ne peux pas modifier les alertes de cette chaîne."
                },
                403
            )
        };
    }

    return access;
}

function normalizeRule(
    body,
    existing = null
) {
    const name =
        cleanText(
            body.name ??
            existing?.name,
            100
        );

    if (!name) {
        throw new ValidationError(
            "Le nom de l’alerte est obligatoire."
        );
    }

    const conditionType =
        cleanText(
            body.conditionType ??
            existing?.condition_type ??
            "default",
            30
        );

    if (
        !CONDITION_TYPES.has(
            conditionType
        )
    ) {
        throw new ValidationError(
            "La condition de l’alerte est invalide."
        );
    }

    let minimumAmountCents =
        toInteger(
            body.minimumAmountCents ??
            existing?.minimum_amount_cents,
            {
                fallback: null,
                minimum: 0,
                maximum: 100000000,
                label:
                    "Le montant minimum"
            }
        );

    let maximumAmountCents =
        toInteger(
            body.maximumAmountCents ??
            existing?.maximum_amount_cents,
            {
                fallback: null,
                minimum: 0,
                maximum: 100000000,
                label:
                    "Le montant maximum"
            }
        );

    if (
        conditionType === "default"
    ) {
        minimumAmountCents = null;
        maximumAmountCents = null;
    }

    if (
        conditionType === "exact"
    ) {
        if (
            minimumAmountCents === null
        ) {
            throw new ValidationError(
                "Indique le montant exact de l’alerte."
            );
        }

        maximumAmountCents =
            minimumAmountCents;
    }

    if (
        conditionType === "minimum"
    ) {
        if (
            minimumAmountCents === null
        ) {
            throw new ValidationError(
                "Indique le montant minimum de l’alerte."
            );
        }

        maximumAmountCents = null;
    }

    if (
        conditionType === "range"
    ) {
        if (
            minimumAmountCents === null ||
            maximumAmountCents === null
        ) {
            throw new ValidationError(
                "Indique le début et la fin de la tranche."
            );
        }

        if (
            maximumAmountCents <
            minimumAmountCents
        ) {
            throw new ValidationError(
                "Le montant maximum doit être supérieur au montant minimum."
            );
        }
    }

    const selectionMode =
        cleanText(
            body.selectionMode ??
            existing?.selection_mode ??
            "fixed",
            30
        );

    if (
        !SELECTION_MODES.has(
            selectionMode
        )
    ) {
        throw new ValidationError(
            "Le mode de sélection est invalide."
        );
    }

    const textTemplate =
        cleanTemplate(
            body.textTemplate ??
            existing?.text_template ??
            "{name} a donné {amount}"
        );

    const textEnabled =
        toBoolean(
            body.textEnabled,
            existing
                ? Boolean(
                    existing.text_enabled
                )
                : true
        );

    if (
        textEnabled &&
        !textTemplate
    ) {
        throw new ValidationError(
            "Le texte de l’alerte est obligatoire."
        );
    }

    const fontFamily =
        cleanText(
            body.fontFamily ??
            existing?.font_family ??
            "Inter",
            100
        ) || "Inter";

    const textTransform =
        cleanText(
            body.textTransform ??
            existing?.text_transform ??
            "none",
            30
        );

    if (
        !TEXT_TRANSFORMS.has(
            textTransform
        )
    ) {
        throw new ValidationError(
            "La transformation du texte est invalide."
        );
    }

    const textPosition =
        cleanText(
            body.textPosition ??
            existing?.text_position ??
            "bottom",
            30
        );

    if (
        !TEXT_POSITIONS.has(
            textPosition
        )
    ) {
        throw new ValidationError(
            "La position du texte est invalide."
        );
    }

    const animation =
        cleanText(
            body.animation ??
            existing?.animation ??
            "fade",
            30
        );

    if (
        !ANIMATIONS.has(
            animation
        )
    ) {
        throw new ValidationError(
            "L’animation sélectionnée est invalide."
        );
    }

    return {
        name,

        enabled:
            toBoolean(
                body.enabled,
                existing
                    ? Boolean(
                        existing.enabled
                    )
                    : true
            ),

        conditionType,
        minimumAmountCents,
        maximumAmountCents,
        selectionMode,

        textEnabled,
        textTemplate,

        textDelayMs:
            toInteger(
                body.textDelayMs ??
                existing?.text_delay_ms,
                {
                    fallback: 0,
                    minimum: 0,
                    maximum: 60000,
                    label:
                        "Le délai du texte"
                }
            ),

        alertDelayMs:
            toInteger(
                body.alertDelayMs ??
                existing?.alert_delay_ms,
                {
                    fallback: 0,
                    minimum: 0,
                    maximum: 60000,
                    label:
                        "Le délai de l’alerte"
                }
            ),

        displayDurationMs:
            toInteger(
                body.displayDurationMs ??
                existing?.display_duration_ms,
                {
                    fallback: 7000,
                    minimum: 1000,
                    maximum: 60000,
                    label:
                        "La durée d’affichage"
                }
            ),

        fontFamily,

        fontSizePx:
            toInteger(
                body.fontSizePx ??
                existing?.font_size_px,
                {
                    fallback: 42,
                    minimum: 12,
                    maximum: 200,
                    label:
                        "La taille du texte"
                }
            ),

        fontWeight:
            toInteger(
                body.fontWeight ??
                existing?.font_weight,
                {
                    fallback: 700,
                    minimum: 100,
                    maximum: 900,
                    label:
                        "L’épaisseur du texte"
                }
            ),

        textTransform,
        textPosition,
        animation,

        soundVolume:
            toInteger(
                body.soundVolume ??
                existing?.sound_volume,
                {
                    fallback: 80,
                    minimum: 0,
                    maximum: 100,
                    label:
                        "Le volume"
                }
            ),

        priority:
            toInteger(
                body.priority ??
                existing?.priority,
                {
                    fallback: 100,
                    minimum: 0,
                    maximum: 10000,
                    label:
                        "La priorité"
                }
            )
    };
}

function mapVariant(variant) {
    return {
        publicId:
            variant.public_id,

        name:
            variant.name,

        enabled:
            Boolean(
                variant.enabled
            ),

        mediaType:
            variant.media_type,

        imageStorageKey:
            variant.image_storage_key,

        videoStorageKey:
            variant.video_storage_key,

        soundStorageKey:
            variant.sound_storage_key,

        weight:
            Number(
                variant.weight ?? 1
            ),

        displayOrder:
            Number(
                variant.display_order ?? 100
            ),

        layout:
            normalizeAlertLayout(
                variant.layout_json
            ),

        createdAt:
            variant.created_at,

        updatedAt:
            variant.updated_at
    };
}

function mapRule(
    rule,
    variants = []
) {
    return {
        publicId:
            rule.public_id,

        name:
            rule.name,

        enabled:
            Boolean(
                rule.enabled
            ),

        conditionType:
            rule.condition_type,

        minimumAmountCents:
            rule.minimum_amount_cents === null
                ? null
                : Number(
                    rule.minimum_amount_cents
                ),

        maximumAmountCents:
            rule.maximum_amount_cents === null
                ? null
                : Number(
                    rule.maximum_amount_cents
                ),

        selectionMode:
            rule.selection_mode,

        textEnabled:
            Boolean(
                rule.text_enabled
            ),

        textTemplate:
            rule.text_template,

        textDelayMs:
            Number(
                rule.text_delay_ms
            ),

        alertDelayMs:
            Number(
                rule.alert_delay_ms
            ),

        displayDurationMs:
            Number(
                rule.display_duration_ms
            ),

        fontFamily:
            rule.font_family,

        fontSizePx:
            Number(
                rule.font_size_px
            ),

        fontWeight:
            Number(
                rule.font_weight
            ),

        textTransform:
            rule.text_transform,

        textPosition:
            rule.text_position,

        animation:
            rule.animation,

        soundVolume:
            Number(
                rule.sound_volume
            ),

        priority:
            Number(
                rule.priority
            ),

        variants:
            variants.map(
                mapVariant
            ),

        createdAt:
            rule.created_at,

        updatedAt:
            rule.updated_at
    };
}

async function findRule(
    env,
    creatorId,
    publicId
) {
    return env.DB.prepare(`
    SELECT *
    FROM creator_donation_alert_rules
    WHERE creator_id = ?
      AND public_id = ?
    LIMIT 1
  `)
        .bind(
            creatorId,
            publicId
        )
        .first();
}

async function getRuleVariants(
    env,
    ruleId
) {
    const result =
        await env.DB.prepare(`
      SELECT *
      FROM creator_donation_alert_variants
      WHERE rule_id = ?
      ORDER BY
        display_order ASC,
        id ASC
    `)
            .bind(ruleId)
            .all();

    return result.results ?? [];
}

/* =========================================================
   LISTER LES ALERTES
   ========================================================= */

export async function listDonationAlerts(
    request,
    env
) {
    const access =
        await requireDonationAlertAccess(
            request,
            env
        );

    if (!access.allowed) {
        return access.response;
    }

    const result =
        await env.DB.prepare(`
      SELECT *
      FROM creator_donation_alert_rules
      WHERE creator_id = ?
      ORDER BY
        priority DESC,
        id ASC
    `)
            .bind(access.creatorId)
            .all();

    const rules =
        await Promise.all(
            (result.results ?? []).map(
                async rule =>
                    mapRule(
                        rule,
                        await getRuleVariants(
                            env,
                            rule.id
                        )
                    )
            )
        );

    return json({
        rules,

        editor: {
            canvas: {
                width: 1920,
                height: 1080
            },

            limits: {
                maximumTextLayers: 3,
                maximumVideoLayers: 1
            },

            colors:
                ALERT_EDITOR_COLORS,

            fonts:
                ALERT_EDITOR_FONTS,

            variables: [
                {
                    key: "{name}",
                    label:
                        "Nom de la personne"
                },
                {
                    key: "{amount}",
                    label:
                        "Montant du don"
                },
                {
                    key: "{message}",
                    label:
                        "Message du don"
                },
                {
                    key: "{creator}",
                    label:
                        "Nom du créateur"
                }
            ]
        }
    });
}

/* =========================================================
   CRÉER UNE ALERTE
   ========================================================= */

export async function createDonationAlert(
    request,
    env
) {
    const access =
        await requireDonationAlertAccess(
            request,
            env
        );

    if (!access.allowed) {
        return access.response;
    }

    try {
        const body =
            await readJsonBody(request);

        const rule =
            normalizeRule(body);

        const publicId =
            `alert_${generateRandomToken(12)}`;

        await env.DB.prepare(`
      INSERT INTO creator_donation_alert_rules (
        public_id,
        creator_id,
        name,
        enabled,
        condition_type,
        minimum_amount_cents,
        maximum_amount_cents,
        selection_mode,
        text_enabled,
        text_template,
        text_delay_ms,
        alert_delay_ms,
        display_duration_ms,
        font_family,
        font_size_px,
        font_weight,
        text_transform,
        text_position,
        animation,
        sound_volume,
        priority,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `)
            .bind(
                publicId,
                access.creatorId,
                rule.name,
                rule.enabled ? 1 : 0,
                rule.conditionType,
                rule.minimumAmountCents,
                rule.maximumAmountCents,
                rule.selectionMode,
                rule.textEnabled ? 1 : 0,
                rule.textTemplate,
                rule.textDelayMs,
                rule.alertDelayMs,
                rule.displayDurationMs,
                rule.fontFamily,
                rule.fontSizePx,
                rule.fontWeight,
                rule.textTransform,
                rule.textPosition,
                rule.animation,
                rule.soundVolume,
                rule.priority,
                Number(access.user.id)
            )
            .run();

        const created =
            await findRule(
                env,
                access.creatorId,
                publicId
            );

        return json(
            {
                success: true,
                rule:
                    mapRule(created)
            },
            201
        );
    } catch (error) {
        if (
            error instanceof
            ValidationError
        ) {
            return json(
                {
                    error:
                        error.message
                },
                400
            );
        }

        throw error;
    }
}

/* =========================================================
   MODIFIER UNE ALERTE
   ========================================================= */

export async function updateDonationAlert(
    request,
    env,
    rawPublicId
) {
    const access =
        await requireDonationAlertAccess(
            request,
            env
        );

    if (!access.allowed) {
        return access.response;
    }

    const publicId =
        cleanText(
            rawPublicId,
            150
        );

    const existing =
        await findRule(
            env,
            access.creatorId,
            publicId
        );

    if (!existing) {
        return json(
            {
                error:
                    "Cette alerte n’existe pas."
            },
            404
        );
    }

    try {
        const body =
            await readJsonBody(request);

        const rule =
            normalizeRule(
                body,
                existing
            );

        if (rule.selectionMode === "fixed") {
            const result =
                await env.DB.prepare(`
            SELECT COUNT(*) AS total
            FROM creator_donation_alert_variants
            WHERE rule_id = ?
        `)
                    .bind(existing.id)
                    .first();

            if (Number(result?.total || 0) > 1) {
                return json(
                    {
                        error:
                            "Supprime les variantes supplémentaires avant de sélectionner Animation fixe."
                    },
                    400
                );
            }
        }

        if (rule.selectionMode === "fixed") {
            const result =
                await env.DB.prepare(`
            SELECT COUNT(*) AS total
            FROM creator_donation_alert_variants
            WHERE rule_id = ?
        `)
                    .bind(existing.id)
                    .first();

            if (Number(result?.total || 0) > 1) {
                return json(
                    {
                        error:
                            "Supprime les variantes supplémentaires avant de choisir Variante fixe."
                    },
                    400
                );
            }
        }

        await env.DB.prepare(`
      UPDATE creator_donation_alert_rules
      SET
        name = ?,
        enabled = ?,
        condition_type = ?,
        minimum_amount_cents = ?,
        maximum_amount_cents = ?,
        selection_mode = ?,
        text_enabled = ?,
        text_template = ?,
        text_delay_ms = ?,
        alert_delay_ms = ?,
        display_duration_ms = ?,
        font_family = ?,
        font_size_px = ?,
        font_weight = ?,
        text_transform = ?,
        text_position = ?,
        animation = ?,
        sound_volume = ?,
        priority = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
            .bind(
                rule.name,
                rule.enabled ? 1 : 0,
                rule.conditionType,
                rule.minimumAmountCents,
                rule.maximumAmountCents,
                rule.selectionMode,
                rule.textEnabled ? 1 : 0,
                rule.textTemplate,
                rule.textDelayMs,
                rule.alertDelayMs,
                rule.displayDurationMs,
                rule.fontFamily,
                rule.fontSizePx,
                rule.fontWeight,
                rule.textTransform,
                rule.textPosition,
                rule.animation,
                rule.soundVolume,
                rule.priority,
                existing.id
            )
            .run();

        const updated =
            await findRule(
                env,
                access.creatorId,
                publicId
            );

        const variants =
            await getRuleVariants(
                env,
                updated.id
            );

        return json({
            success: true,

            rule:
                mapRule(
                    updated,
                    variants
                )
        });
    } catch (error) {
        if (
            error instanceof
            ValidationError
        ) {
            return json(
                {
                    error:
                        error.message
                },
                400
            );
        }

        throw error;
    }
}

/* =========================================================
   SUPPRIMER UNE ALERTE
   ========================================================= */

export async function deleteDonationAlert(
    request,
    env,
    rawPublicId
) {
    const access =
        await requireDonationAlertAccess(
            request,
            env
        );

    if (!access.allowed) {
        return access.response;
    }

    const publicId =
        cleanText(
            rawPublicId,
            150
        );

    const existing =
        await findRule(
            env,
            access.creatorId,
            publicId
        );

    if (!existing) {
        return json(
            {
                error:
                    "Cette alerte n’existe pas."
            },
            404
        );
    }

    await env.DB.prepare(`
    DELETE FROM creator_donation_alert_rules
    WHERE id = ?
  `)
        .bind(existing.id)
        .run();

    return json({
        success: true
    });
}

/* =========================================================
   VARIANTES DES ALERTES
   ========================================================= */

function boundedNumber(
    value,
    fallback,
    minimum,
    maximum
) {
    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return Math.min(
        maximum,
        Math.max(
            minimum,
            number
        )
    );
}

function parseLayoutJson(value) {
    if (!value) {
        return null;
    }

    if (
        typeof value === "object" &&
        !Array.isArray(value)
    ) {
        return value;
    }

    try {
        const parsed =
            JSON.parse(value);

        return (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
        )
            ? parsed
            : null;
    } catch {
        return null;
    }
}

function defaultAlertLayout() {
    return {
        version: 1,

        canvas: {
            width: 1920,
            height: 1080
        },

        video: {
            visible: true,
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            opacity: 1,
            fit: "cover",
            rotation: 0,
            zIndex: 0
        },

        texts: [
            {
                id: "text_1",
                name: "Texte principal",
                visible: true,

                template:
                    "{name} a donné {amount}",

                x: 360,
                y: 790,
                width: 1200,

                fontFamily: "Inter",
                fontSizePx: 64,
                fontWeight: 800,

                color: "#F2E9D8",
                textAlign: "center",

                opacity: 1,
                rotation: 0,
                zIndex: 10,

                delayMs: 0,
                durationMs: 7000,
                animation: "fade"
            }
        ]
    };
}

function normalizeHexColor(
    value,
    fallback = "#F2E9D8"
) {
    const color =
        String(value ?? "")
            .trim()
            .toUpperCase();

    return /^#[0-9A-F]{6}$/.test(color)
        ? color
        : fallback;
}

function normalizeVideoLayer(value) {
    const source =
        (
            value &&
            typeof value === "object"
        )
            ? value
            : {};

    const fit =
        String(
            source.fit ?? "cover"
        ).toLowerCase();

    return {
        visible:
            source.visible !== false,

        x:
            boundedNumber(
                source.x,
                0,
                -1920,
                3840
            ),

        y:
            boundedNumber(
                source.y,
                0,
                -1080,
                2160
            ),

        width:
            boundedNumber(
                source.width,
                1920,
                50,
                3840
            ),

        height:
            boundedNumber(
                source.height,
                1080,
                50,
                2160
            ),

        opacity:
            boundedNumber(
                source.opacity,
                1,
                0,
                1
            ),

        fit:
            VIDEO_FITS.has(fit)
                ? fit
                : "cover",

        rotation:
            boundedNumber(
                source.rotation,
                0,
                -180,
                180
            ),

        /*
         * La vidéo reste derrière les textes.
         */
        zIndex: 0
    };
}

function normalizeTextLayer(
    value,
    index
) {
    const source =
        (
            value &&
            typeof value === "object"
        )
            ? value
            : {};

    const fontFamily =
        cleanText(
            source.fontFamily,
            100
        );

    const textAlign =
        String(
            source.textAlign ?? "center"
        ).toLowerCase();

    const animation =
        String(
            source.animation ?? "fade"
        ).toLowerCase();

    const fontWeight =
        boundedNumber(
            source.fontWeight,
            800,
            100,
            900
        );

    return {
        id:
            cleanText(
                source.id,
                60
            ) ||
            `text_${index + 1}`,

        name:
            cleanText(
                source.name,
                100
            ) ||
            `Texte ${index + 1}`,

        visible:
            source.visible !== false,

        template:
            cleanTemplate(
                source.template ??
                "{name} a donné {amount}",
                500
            ),

        x:
            boundedNumber(
                source.x,
                360,
                -1920,
                3840
            ),

        y:
            boundedNumber(
                source.y,
                790,
                -1080,
                2160
            ),

        width:
            boundedNumber(
                source.width,
                1200,
                50,
                3840
            ),

        fontFamily:
            ALERT_EDITOR_FONTS.includes(
                fontFamily
            )
                ? fontFamily
                : "Inter",

        fontSizePx:
            boundedNumber(
                source.fontSizePx,
                64,
                12,
                250
            ),

        fontWeight:
            Math.round(
                fontWeight / 100
            ) * 100,

        color:
            normalizeHexColor(
                source.color
            ),

        textAlign:
            TEXT_ALIGNMENTS.has(
                textAlign
            )
                ? textAlign
                : "center",

        opacity:
            boundedNumber(
                source.opacity,
                1,
                0,
                1
            ),

        rotation:
            boundedNumber(
                source.rotation,
                0,
                -180,
                180
            ),

        zIndex:
            boundedNumber(
                source.zIndex,
                10 + index,
                1,
                100
            ),

        delayMs:
            boundedNumber(
                source.delayMs,
                0,
                0,
                60000
            ),

        durationMs:
            boundedNumber(
                source.durationMs,
                7000,
                1000,
                60000
            ),

        animation:
            ANIMATIONS.has(animation)
                ? animation
                : "fade"
    };
}

function normalizeAlertLayout(value) {
    const defaults =
        defaultAlertLayout();

    const parsed =
        parseLayoutJson(value);

    if (!parsed) {
        return defaults;
    }

    const boundedNumber = (
        value,
        fallback,
        minimum,
        maximum
    ) => {
        const number = Number(value);

        const result =
            Number.isFinite(number)
                ? number
                : fallback;

        return Math.min(
            maximum,
            Math.max(minimum, result)
        );
    };

    const animations = new Set([
        "none",
        "fade",
        "slide-up",
        "slide-down",
        "slide-left",
        "slide-right",
        "scale",
        "zoom",
        "bounce"
    ]);

    const normalizeAnimation = (
        value,
        fallback = "fade"
    ) => {
        const animation =
            String(value ?? "").trim();

        return animations.has(animation)
            ? animation
            : fallback;
    };

    const durationMs =
        boundedNumber(
            parsed.durationMs,
            6000,
            1000,
            300000
        );

    const sourceVideo =
        parsed.video &&
            typeof parsed.video === "object"
            ? parsed.video
            : {};

    const normalizedVideo =
        normalizeVideoLayer(
            sourceVideo
        );

    const video = {
        ...normalizedVideo,

        id: "video",
        type: "video",

        name:
            String(
                sourceVideo.name ??
                normalizedVideo.name ??
                "Vidéo"
            ).slice(0, 100),

        locked:
            Boolean(sourceVideo.locked),

        aspectRatio:
            boundedNumber(
                sourceVideo.aspectRatio,
                boundedNumber(
                    sourceVideo.width,
                    1920,
                    30,
                    3840
                ) /
                boundedNumber(
                    sourceVideo.height,
                    1080,
                    30,
                    2160
                ),
                0.01,
                100
            ),

        delayMs:
            boundedNumber(
                sourceVideo.delayMs,
                0,
                0,
                60000
            ),

        durationMs:
            boundedNumber(
                sourceVideo.durationMs,
                durationMs,
                100,
                60000
            ),

        loop:
            Boolean(sourceVideo.loop),

        muted:
            sourceVideo.muted !== false,

        enterAnimation:
            normalizeAnimation(
                sourceVideo.enterAnimation ??
                sourceVideo.animation,
                "fade"
            ),

        exitAnimation:
            normalizeAnimation(
                sourceVideo.exitAnimation,
                "fade"
            )
    };

    const sourceTexts =
        Array.isArray(parsed.texts)
            ? parsed.texts
            : defaults.texts;

    const texts =
        sourceTexts
            .slice(
                0,
                MAX_ALERT_TEXT_LAYERS
            )
            .map((sourceText, index) => {
                const text =
                    sourceText &&
                        typeof sourceText ===
                        "object"
                        ? sourceText
                        : {};

                const normalized =
                    normalizeTextLayer(
                        text,
                        index
                    );

                return {
                    ...normalized,

                    type: "text",

                    locked:
                        Boolean(text.locked),

                    height:
                        boundedNumber(
                            text.height,
                            normalized.height ??
                            160,
                            30,
                            2160
                        ),

                    lineHeight:
                        boundedNumber(
                            text.lineHeight,
                            normalized.lineHeight ??
                            1.15,
                            0.5,
                            3
                        ),

                    textShadow:
                        text.textShadow !==
                        false,

                    delayMs:
                        boundedNumber(
                            text.delayMs,
                            0,
                            0,
                            60000
                        ),

                    durationMs:
                        boundedNumber(
                            text.durationMs,
                            durationMs,
                            100,
                            60000
                        ),

                    enterAnimation:
                        normalizeAnimation(
                            text.enterAnimation ??
                            text.animation,
                            "fade"
                        ),

                    exitAnimation:
                        normalizeAnimation(
                            text.exitAnimation,
                            "fade"
                        )
                };
            });

    return {
        version: 2,

        durationMs,

        canvas: {
            width:
                boundedNumber(
                    parsed.canvas?.width,
                    1920,
                    320,
                    3840
                ),

            height:
                boundedNumber(
                    parsed.canvas?.height,
                    1080,
                    180,
                    2160
                )
        },

        video,

        texts
    };
}

function normalizeVariant(
    body,
    existing = null
) {
    const name =
        cleanText(
            body.name ??
            existing?.name,
            100
        );

    if (!name) {
        throw new ValidationError(
            "Le nom de la variante est obligatoire."
        );
    }

    const mediaType =
        cleanText(
            body.mediaType ??
            existing?.media_type ??
            "none",
            30
        );

    if (!MEDIA_TYPES.has(mediaType)) {
        throw new ValidationError(
            "Le type de média est invalide."
        );
    }

    return {
        name,

        enabled:
            toBoolean(
                body.enabled,
                existing
                    ? Boolean(existing.enabled)
                    : true
            ),

        mediaType,

        weight:
            toInteger(
                body.weight ??
                existing?.weight,
                {
                    fallback: 1,
                    minimum: 1,
                    maximum: 1000,
                    label: "Le poids aléatoire"
                }
            ),

        displayOrder:
            toInteger(
                body.displayOrder ??
                existing?.display_order,
                {
                    fallback: 100,
                    minimum: 0,
                    maximum: 10000,
                    label: "L’ordre d’affichage"
                }
            ),

        layout:
            normalizeAlertLayout(
                body.layout ??
                existing?.layout_json
            )
    };
}

async function findVariant(
    env,
    creatorId,
    rulePublicId,
    variantPublicId
) {
    return env.DB.prepare(`
    SELECT
      variants.*
    FROM creator_donation_alert_variants
      AS variants

    INNER JOIN creator_donation_alert_rules
      AS rules
      ON rules.id = variants.rule_id

    WHERE rules.creator_id = ?
      AND rules.public_id = ?
      AND variants.public_id = ?

    LIMIT 1
  `)
        .bind(
            creatorId,
            rulePublicId,
            variantPublicId
        )
        .first();
}

async function findDefaultDonationAlertTemplate(
    env
) {
    return env.DB.prepare(`
        SELECT
            id,
            public_id,
            name,
            image_storage_key,
            video_storage_key,
            sound_storage_key,
            media_type,
            layout_json
        FROM donation_alert_templates
        WHERE enabled = 1
          AND is_default = 1
        ORDER BY id DESC
        LIMIT 1
    `)
        .first();
}

/* =========================================================
   CRÉER UNE VARIANTE
   ========================================================= */

async function deleteDonationAlertMediaIfUnused(
    env,
    storageKey
) {
    if (
        !env.MEDIA ||
        !storageKey
    ) {
        return;
    }

    const reference =
        await env.DB.prepare(`
            SELECT 1 AS found
            FROM (
                SELECT id
                FROM creator_donation_alert_variants
                WHERE image_storage_key = ?
                   OR video_storage_key = ?
                   OR sound_storage_key = ?

                UNION ALL

                SELECT id
                FROM donation_alert_templates
                WHERE image_storage_key = ?
                   OR video_storage_key = ?
                   OR sound_storage_key = ?
            )
            LIMIT 1
        `)
            .bind(
                storageKey,
                storageKey,
                storageKey,
                storageKey,
                storageKey,
                storageKey
            )
            .first();

    if (reference) {
        return;
    }

    await env.MEDIA.delete(
        storageKey
    );
}

export async function createDonationAlertVariant(
    request,
    env,
    rawRulePublicId
) {
    const access =
        await requireDonationAlertAccess(
            request,
            env
        );

    if (!access.allowed) {
        return access.response;
    }

    const rulePublicId =
        cleanText(
            rawRulePublicId,
            150
        );

    const rule =
        await findRule(
            env,
            access.creatorId,
            rulePublicId
        );

    if (!rule) {
        return json(
            {
                error:
                    "Cette règle d’alerte n’existe pas."
            },
            404
        );
    }

    if (rule.selection_mode === "fixed") {
        const existingVariant =
            await env.DB.prepare(`
            SELECT id
            FROM creator_donation_alert_variants
            WHERE rule_id = ?
            LIMIT 1
        `)
                .bind(rule.id)
                .first();

        if (existingVariant) {
            return json(
                {
                    error:
                        "Une alerte en variante fixe ne peut contenir qu’une seule variante."
                },
                400
            );
        }
    }

    if (rule.selection_mode === "fixed") {
        const existingVariant =
            await env.DB.prepare(`
            SELECT id
            FROM creator_donation_alert_variants
            WHERE rule_id = ?
            LIMIT 1
        `)
                .bind(rule.id)
                .first();

        if (existingVariant) {
            return json(
                {
                    error:
                        "Une animation fixe ne peut contenir qu’une seule variante."
                },
                400
            );
        }
    }

    try {
        const body =
            await readJsonBody(request);

        const variant =
            normalizeVariant(body);

        const publicId =
            `variant_${generateRandomToken(12)}`;

        const template =
            await findDefaultDonationAlertTemplate(
                env
            );

        if (!template) {
            console.warn(
                "[Alertes] Aucun modèle d’alerte par défaut n’est configuré."
            );
        }

        const imageStorageKey =
            template?.image_storage_key ??
            null;

        const videoStorageKey =
            template?.video_storage_key ??
            null;

        const soundStorageKey =
            template?.sound_storage_key ??
            null;

        const mediaType =
            template?.media_type ??
            variant.mediaType;

        const layoutJson =
            template?.layout_json ??
            JSON.stringify(
                variant.layout
            );

        await env.DB.prepare(`
            INSERT INTO
                creator_donation_alert_variants (
                    public_id,
                    rule_id,
                    name,
                    enabled,
                    image_storage_key,
                    video_storage_key,
                    sound_storage_key,
                    media_type,
                    weight,
                    display_order,
                    layout_json,
                    created_at,
                    updated_at
                )
            VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
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
                publicId,
                rule.id,
                variant.name,
                variant.enabled
                    ? 1
                    : 0,

                imageStorageKey,
                videoStorageKey,
                soundStorageKey,

                mediaType,
                variant.weight,
                variant.displayOrder,
                layoutJson
            )
            .run();

        const created =
            await findVariant(
                env,
                access.creatorId,
                rulePublicId,
                publicId
            );

        return json(
            {
                success: true,

                variant:
                    mapVariant(created)
            },
            201
        );
    } catch (error) {
        if (
            error instanceof
            ValidationError
        ) {
            return json(
                {
                    error:
                        error.message
                },
                400
            );
        }

        throw error;
    }
}

/* =========================================================
   MODIFIER UNE VARIANTE
   ========================================================= */

export async function updateDonationAlertVariant(
    request,
    env,
    rawRulePublicId,
    rawVariantPublicId
) {
    const access =
        await requireDonationAlertAccess(
            request,
            env
        );

    if (!access.allowed) {
        return access.response;
    }

    const rulePublicId =
        cleanText(
            rawRulePublicId,
            150
        );

    const variantPublicId =
        cleanText(
            rawVariantPublicId,
            150
        );

    const existing =
        await findVariant(
            env,
            access.creatorId,
            rulePublicId,
            variantPublicId
        );

    if (!existing) {
        return json(
            {
                error:
                    "Cette variante n’existe pas."
            },
            404
        );
    }

    try {
        const body =
            await readJsonBody(request);

        const variant =
            normalizeVariant(
                body,
                existing
            );

        await env.DB.prepare(`
      UPDATE creator_donation_alert_variants
      SET
        name = ?,
        enabled = ?,
        media_type = ?,
        weight = ?,
        display_order = ?,
        layout_json = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
            .bind(
                variant.name,
                variant.enabled ? 1 : 0,
                variant.mediaType,
                variant.weight,
                variant.displayOrder,
                JSON.stringify(variant.layout),
                existing.id
            )
            .run();

        const updated =
            await findVariant(
                env,
                access.creatorId,
                rulePublicId,
                variantPublicId
            );

        return json({
            success: true,
            variant:
                mapVariant(updated)
        });
    } catch (error) {
        if (
            error instanceof
            ValidationError
        ) {
            return json(
                {
                    error: error.message
                },
                400
            );
        }

        throw error;
    }
}

/* =========================================================
   SUPPRIMER UNE VARIANTE
   ========================================================= */

export async function deleteDonationAlertVariant(
    request,
    env,
    rawRulePublicId,
    rawVariantPublicId
) {
    const access =
        await requireDonationAlertAccess(
            request,
            env
        );

    if (!access.allowed) {
        return access.response;
    }

    const rulePublicId =
        cleanText(
            rawRulePublicId,
            150
        );

    const variantPublicId =
        cleanText(
            rawVariantPublicId,
            150
        );

    const existing =
        await findVariant(
            env,
            access.creatorId,
            rulePublicId,
            variantPublicId
        );

    if (!existing) {
        return json(
            {
                error:
                    "Cette variante n’existe pas."
            },
            404
        );
    }

    await env.DB.prepare(`
    DELETE FROM creator_donation_alert_variants
    WHERE id = ?
  `)
        .bind(existing.id)
        .run();

    const storageKeys = [
        existing.image_storage_key,
        existing.video_storage_key,
        existing.sound_storage_key
    ].filter(Boolean);

    if (
        env.MEDIA &&
        storageKeys.length > 0
    ) {
        await Promise.allSettled(
            storageKeys.map(
                storageKey =>
                    deleteDonationAlertMediaIfUnused(
                        env,
                        storageKey
                    ))
        );
    }

    return json({
        success: true
    });
}

/* =========================================================
   MÉDIAS DES VARIANTES
   ========================================================= */

const VARIANT_MEDIA = {
    image: {
        maximumSize: 10 * 1024 * 1024,

        contentTypes: new Map([
            ["image/jpeg", "jpg"],
            ["image/png", "png"],
            ["image/webp", "webp"],
            ["image/gif", "gif"]
        ])
    },

    video: {
        maximumSize: 50 * 1024 * 1024,

        contentTypes: new Map([
            ["video/mp4", "mp4"],
            ["video/webm", "webm"]
        ])
    },

    sound: {
        maximumSize: 15 * 1024 * 1024,

        contentTypes: new Map([
            ["audio/mpeg", "mp3"],
            ["audio/ogg", "ogg"],
            ["audio/wav", "wav"],
            ["audio/webm", "webm"]
        ])
    }
};

async function readMediaFile(
    request,
    mediaKind
) {
    const configuration =
        VARIANT_MEDIA[mediaKind];

    if (!configuration) {
        throw new ValidationError(
            "Le type de média est invalide."
        );
    }

    let formData;

    try {
        formData =
            await request.formData();
    } catch {
        throw new ValidationError(
            "Le fichier envoyé est invalide."
        );
    }

    const file =
        formData.get("file");

    if (
        !file ||
        typeof file.arrayBuffer !==
        "function"
    ) {
        throw new ValidationError(
            "Sélectionne un fichier."
        );
    }

    const contentType =
        String(
            file.type ?? ""
        ).toLowerCase();

    const extension =
        configuration.contentTypes.get(
            contentType
        );

    if (!extension) {
        throw new ValidationError(
            mediaKind === "image"
                ? "Utilise une image JPEG, PNG, WEBP ou GIF."
                : mediaKind === "video"
                    ? "Utilise une vidéo MP4 ou WEBM."
                    : "Utilise un son MP3, OGG, WAV ou WEBM."
        );
    }

    const size =
        Number(file.size ?? 0);

    if (
        !Number.isFinite(size) ||
        size <= 0
    ) {
        throw new ValidationError(
            "Le fichier est vide."
        );
    }

    if (
        size >
        configuration.maximumSize
    ) {
        const maximumMegabytes =
            Math.round(
                configuration.maximumSize /
                1024 /
                1024
            );

        throw new ValidationError(
            `Le fichier ne doit pas dépasser ${maximumMegabytes} Mo.`
        );
    }

    return {
        file,
        size,
        contentType,
        extension
    };
}

function buildVariantMediaStorageKey({
    creatorId,
    rulePublicId,
    variantPublicId,
    mediaKind,
    extension
}) {
    const token =
        generateRandomToken(24);

    return [
        "donation-alerts",
        String(creatorId),
        rulePublicId,
        variantPublicId,
        mediaKind,
        `${token}.${extension}`
    ].join("/");
}

async function updateVariantMediaKey(
    env,
    variantId,
    mediaKind,
    storageKey
) {
    if (mediaKind === "image") {
        await env.DB.prepare(`
      UPDATE creator_donation_alert_variants
      SET
        image_storage_key = ?,
        media_type = 'image',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
            .bind(
                storageKey,
                variantId
            )
            .run();

        return;
    }

    if (mediaKind === "video") {
        await env.DB.prepare(`
      UPDATE creator_donation_alert_variants
      SET
        video_storage_key = ?,
        media_type = 'video',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
            .bind(
                storageKey,
                variantId
            )
            .run();

        return;
    }

    await env.DB.prepare(`
    UPDATE creator_donation_alert_variants
    SET
      sound_storage_key = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
        .bind(
            storageKey,
            variantId
        )
        .run();
}

async function removeVariantMediaKey(
    env,
    variantId,
    mediaKind
) {
    if (mediaKind === "image") {
        await env.DB.prepare(`
      UPDATE creator_donation_alert_variants
      SET
        image_storage_key = NULL,
        media_type =
          CASE
            WHEN media_type = 'image'
              THEN 'none'
            ELSE media_type
          END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
            .bind(variantId)
            .run();

        return;
    }

    if (mediaKind === "video") {
        await env.DB.prepare(`
      UPDATE creator_donation_alert_variants
      SET
        video_storage_key = NULL,
        media_type =
          CASE
            WHEN media_type = 'video'
              THEN 'none'
            ELSE media_type
          END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
            .bind(variantId)
            .run();

        return;
    }

    await env.DB.prepare(`
    UPDATE creator_donation_alert_variants
    SET
      sound_storage_key = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
        .bind(variantId)
        .run();
}

function getVariantMediaStorageKey(
    variant,
    mediaKind
) {
    if (mediaKind === "image") {
        return variant.image_storage_key;
    }

    if (mediaKind === "video") {
        return variant.video_storage_key;
    }

    return variant.sound_storage_key;
}

/* =========================================================
   ENVOYER UN MÉDIA
   ========================================================= */

export async function getDonationAlertVariantMedia(
    request,
    env,
    rawRulePublicId,
    rawVariantPublicId,
    rawMediaKind
) {
    const access =
        await requireDonationAlertAccess(
            request,
            env
        );

    if (!access.allowed) {
        return access.response;
    }

    const rulePublicId =
        cleanText(
            rawRulePublicId,
            150
        );

    const variantPublicId =
        cleanText(
            rawVariantPublicId,
            150
        );

    const mediaKind =
        cleanText(
            rawMediaKind,
            20
        );

    if (
        !["image", "video", "sound"]
            .includes(mediaKind)
    ) {
        return json(
            {
                error:
                    "Ce type de média est invalide."
            },
            400
        );
    }

    if (!env.MEDIA) {
        return json(
            {
                error:
                    "Le stockage des médias n’est pas configuré."
            },
            500
        );
    }

    const variant =
        await findVariant(
            env,
            access.creatorId,
            rulePublicId,
            variantPublicId
        );

    if (!variant) {
        return json(
            {
                error:
                    "Cette variante n’existe pas."
            },
            404
        );
    }

    const storageKey =
        getVariantMediaStorageKey(
            variant,
            mediaKind
        );

    if (!storageKey) {
        return json(
            {
                error:
                    "Aucun média n’est configuré."
            },
            404
        );
    }

    const rangeHeader =
        request.headers.get(
            "Range"
        );

    const object =
        rangeHeader
            ? await env.MEDIA.get(
                storageKey,
                {
                    range:
                        request.headers
                }
            )
            : await env.MEDIA.get(
                storageKey
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

    /*
     * Récupère les métadonnées HTTP enregistrées
     * dans R2.
     */
    object.writeHttpMetadata(
        headers
    );

    headers.set(
        "ETag",
        object.httpEtag
    );

    headers.set(
        "Accept-Ranges",
        "bytes"
    );

    headers.set(
        "Cache-Control",
        "private, max-age=3600"
    );

    /*
     * Détermine un Content-Type fiable à partir
     * de l'extension du fichier.
     */
    const normalizedStorageKey =
        storageKey.toLowerCase();

    let contentType =
        object.httpMetadata?.contentType ||
        "application/octet-stream";

    if (
        normalizedStorageKey.endsWith(
            ".webm"
        )
    ) {
        contentType =
            "video/webm";
    } else if (
        normalizedStorageKey.endsWith(
            ".mp4"
        )
    ) {
        contentType =
            "video/mp4";
    } else if (
        normalizedStorageKey.endsWith(
            ".ogg"
        ) ||
        normalizedStorageKey.endsWith(
            ".oga"
        )
    ) {
        contentType =
            "audio/ogg";
    } else if (
        normalizedStorageKey.endsWith(
            ".mp3"
        )
    ) {
        contentType =
            "audio/mpeg";
    } else if (
        normalizedStorageKey.endsWith(
            ".wav"
        )
    ) {
        contentType =
            "audio/wav";
    } else if (
        normalizedStorageKey.endsWith(
            ".webp"
        )
    ) {
        contentType =
            "image/webp";
    } else if (
        normalizedStorageKey.endsWith(
            ".png"
        )
    ) {
        contentType =
            "image/png";
    } else if (
        normalizedStorageKey.endsWith(
            ".jpg"
        ) ||
        normalizedStorageKey.endsWith(
            ".jpeg"
        )
    ) {
        contentType =
            "image/jpeg";
    }

    headers.set(
        "Content-Type",
        contentType
    );

    /*
     * Si R2 a renvoyé une portion du fichier,
     * on répond avec HTTP 206.
     */
    if (object.range) {
        let offset = 0;
        let length =
            object.size;

        if (
            typeof object.range.offset ===
            "number"
        ) {
            offset =
                object.range.offset;

            length =
                typeof object.range.length ===
                    "number"
                    ? object.range.length
                    : object.size - offset;
        } else if (
            typeof object.range.suffix ===
            "number"
        ) {
            length =
                Math.min(
                    object.range.suffix,
                    object.size
                );

            offset =
                object.size - length;
        }

        const end =
            offset + length - 1;

        headers.set(
            "Content-Range",
            `bytes ${offset}-${end}/${object.size}`
        );

        headers.set(
            "Content-Length",
            String(length)
        );

        return new Response(
            object.body,
            {
                status: 206,
                headers
            }
        );
    }

    headers.set(
        "Content-Length",
        String(object.size)
    );

    return new Response(
        object.body,
        {
            status: 200,
            headers
        }
    );
}

export async function uploadDonationAlertVariantMedia(
    request,
    env,
    rawRulePublicId,
    rawVariantPublicId,
    rawMediaKind
) {
    const access =
        await requireDonationAlertAccess(
            request,
            env
        );

    if (!access.allowed) {
        return access.response;
    }

    if (!env.MEDIA) {
        return json(
            {
                error:
                    "Le stockage des médias n’est pas configuré."
            },
            500
        );
    }

    const rulePublicId =
        cleanText(
            rawRulePublicId,
            150
        );

    const variantPublicId =
        cleanText(
            rawVariantPublicId,
            150
        );

    const mediaKind =
        cleanText(
            rawMediaKind,
            20
        ).toLowerCase();

    if (!VARIANT_MEDIA[mediaKind]) {
        return json(
            {
                error:
                    "Le type de média est invalide."
            },
            400
        );
    }

    const variant =
        await findVariant(
            env,
            access.creatorId,
            rulePublicId,
            variantPublicId
        );

    if (!variant) {
        return json(
            {
                error:
                    "Cette variante n’existe pas."
            },
            404
        );
    }

    if (
        mediaKind === "video" &&
        new URL(request.url).searchParams.has("multipart")
    ) {
        return uploadJulotLargeVideo(
            request,
            env,
            access,
            variant,
            rulePublicId,
            variantPublicId
        );
    }

    let uploadedStorageKey = null;

    try {
        const media =
            await readMediaFile(
                request,
                mediaKind
            );

        uploadedStorageKey =
            buildVariantMediaStorageKey({
                creatorId:
                    access.creatorId,

                rulePublicId,
                variantPublicId,
                mediaKind,

                extension:
                    media.extension
            });

        const oldStorageKey =
            getVariantMediaStorageKey(
                variant,
                mediaKind
            );

        await env.MEDIA.put(
            uploadedStorageKey,
            media.file.stream(),
            {
                httpMetadata: {
                    contentType:
                        media.contentType,

                    cacheControl:
                        "public, max-age=31536000, immutable"
                },

                customMetadata: {
                    creatorId:
                        String(
                            access.creatorId
                        ),

                    rulePublicId,
                    variantPublicId,
                    mediaKind,

                    originalName:
                        cleanText(
                            media.file.name,
                            200
                        )
                }
            }
        );

        try {
            await updateVariantMediaKey(
                env,
                variant.id,
                mediaKind,
                uploadedStorageKey
            );
        } catch (error) {
            await env.MEDIA.delete(
                uploadedStorageKey
            ).catch(() => { });

            uploadedStorageKey = null;

            throw error;
        }

        if (
            oldStorageKey &&
            oldStorageKey !==
            uploadedStorageKey
        ) {
            await deleteDonationAlertMediaIfUnused(
                env,
                oldStorageKey
            ).catch(() => { });
        }

        const updated =
            await findVariant(
                env,
                access.creatorId,
                rulePublicId,
                variantPublicId
            );

        return json({
            success: true,

            media: {
                kind:
                    mediaKind,

                contentType:
                    media.contentType,

                size:
                    media.size
            },

            variant:
                mapVariant(updated)
        });
    } catch (error) {
        if (
            error instanceof
            ValidationError
        ) {
            return json(
                {
                    error:
                        error.message
                },
                400
            );
        }

        throw error;
    }
}

/* =========================================================
   SUPPRIMER UN MÉDIA
   ========================================================= */

export async function deleteDonationAlertVariantMedia(
    request,
    env,
    rawRulePublicId,
    rawVariantPublicId,
    rawMediaKind
) {
    const access =
        await requireDonationAlertAccess(
            request,
            env
        );

    if (!access.allowed) {
        return access.response;
    }

    const rulePublicId =
        cleanText(
            rawRulePublicId,
            150
        );

    const variantPublicId =
        cleanText(
            rawVariantPublicId,
            150
        );

    const mediaKind =
        cleanText(
            rawMediaKind,
            20
        ).toLowerCase();

    if (!VARIANT_MEDIA[mediaKind]) {
        return json(
            {
                error:
                    "Le type de média est invalide."
            },
            400
        );
    }

    const variant =
        await findVariant(
            env,
            access.creatorId,
            rulePublicId,
            variantPublicId
        );

    if (!variant) {
        return json(
            {
                error:
                    "Cette variante n’existe pas."
            },
            404
        );
    }

    const storageKey =
        getVariantMediaStorageKey(
            variant,
            mediaKind
        );

    await removeVariantMediaKey(
        env,
        variant.id,
        mediaKind
    );

    if (
        storageKey &&
        env.MEDIA
    ) {
        await deleteDonationAlertMediaIfUnused(
            env,
            storageKey
        ).catch(error => {
            console.error(
                "Impossible de supprimer le média R2 :",
                error
            );
        });
    }

    const updated =
        await findVariant(
            env,
            access.creatorId,
            rulePublicId,
            variantPublicId
        );

    return json({
        success: true,

        variant:
            mapVariant(updated)
    });
}

function publicOverlayMediaUrl(
    request,
    accessToken,
    variantPublicId,
    mediaKind
) {
    const origin =
        new URL(request.url).origin;

    return (
        origin +
        "/api/overlays/dons/" +
        encodeURIComponent(accessToken) +
        "/media/" +
        encodeURIComponent(
            variantPublicId
        ) +
        "/" +
        encodeURIComponent(mediaKind)
    );
}

export async function getPublicDonationAlertRules(
    request,
    env,
    creatorId,
    accessToken
) {
    const result =
        await env.DB.prepare(`
      SELECT *
      FROM creator_donation_alert_rules
      WHERE creator_id = ?
        AND enabled = 1
      ORDER BY
        priority DESC,
        id ASC
    `)
            .bind(creatorId)
            .all();

    const rules =
        await Promise.all(
            (result.results ?? []).map(
                async rule => {
                    const variantResult =
                        await env.DB.prepare(`
              SELECT *
              FROM creator_donation_alert_variants
              WHERE rule_id = ?
                AND enabled = 1
              ORDER BY
                display_order ASC,
                id ASC
            `)
                            .bind(rule.id)
                            .all();

                    const variants =
                        (
                            variantResult.results ??
                            []
                        ).map(variant => {
                            const mapped =
                                mapVariant(variant);

                            return {
                                publicId:
                                    mapped.publicId,

                                name:
                                    mapped.name,

                                enabled:
                                    mapped.enabled,

                                mediaType:
                                    mapped.mediaType,

                                weight:
                                    mapped.weight,

                                displayOrder:
                                    mapped.displayOrder,

                                layout:
                                    mapped.layout,

                                media: {
                                    imageUrl:
                                        variant.image_storage_key
                                            ? publicOverlayMediaUrl(
                                                request,
                                                accessToken,
                                                variant.public_id,
                                                "image"
                                            )
                                            : null,

                                    videoUrl:
                                        variant.video_storage_key
                                            ? publicOverlayMediaUrl(
                                                request,
                                                accessToken,
                                                variant.public_id,
                                                "video"
                                            )
                                            : null,

                                    soundUrl:
                                        variant.sound_storage_key
                                            ? publicOverlayMediaUrl(
                                                request,
                                                accessToken,
                                                variant.public_id,
                                                "sound"
                                            )
                                            : null
                                },

                                createdAt:
                                    mapped.createdAt,

                                updatedAt:
                                    mapped.updatedAt
                            };
                        });

                    const mappedRule =
                        mapRule(
                            rule,
                            variants
                        );

                    return {
                        ...mappedRule,

                        /*
                         * On réinjecte les variantes publiques complètes.
                         * mapRule ne doit pas supprimer le layout,
                         * l’identifiant public ou les URLs des médias.
                         */
                        variants
                    };
                }
            )
        );

    return rules;
}

/* =========================================================
   VIDÉOS VOLUMINEUSES — JULOT UNIQUEMENT
   ========================================================= */

const JULOT_VIDEO_MAX_BYTES = 1024 ** 3;
const JULOT_VIDEO_PART_BYTES = 16 * 1024 * 1024;

async function largeVideoSigningKey(env) {
    return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(
            "jevent-large-video-v1:" + env.TOKEN_PEPPER
        ),
        {
            name: "HMAC",
            hash: "SHA-256"
        },
        false,
        ["sign", "verify"]
    );
}

async function createLargeVideoToken(env, data) {
    const payload = JSON.stringify(data);

    const signature = await crypto.subtle.sign(
        "HMAC",
        await largeVideoSigningKey(env),
        new TextEncoder().encode(payload)
    );

    const hex = Array.from(
        new Uint8Array(signature),
        byte => byte.toString(16).padStart(2, "0")
    ).join("");

    return payload + "~" + hex;
}

async function readLargeVideoToken(env, token) {
    try {
        if (
            typeof token !== "string" ||
            token.length > 4000
        ) {
            return null;
        }

        const separator = token.lastIndexOf("~");

        if (separator < 0) {
            return null;
        }

        const payload = token.slice(0, separator);
        const hex = token.slice(separator + 1);

        if (!/^[a-f0-9]{64}$/.test(hex)) {
            return null;
        }

        const signature = Uint8Array.from(
            hex.match(/.{2}/g),
            value => parseInt(value, 16)
        );

        const valid = await crypto.subtle.verify(
            "HMAC",
            await largeVideoSigningKey(env),
            signature,
            new TextEncoder().encode(payload)
        );

        if (!valid) {
            return null;
        }

        const data = JSON.parse(payload);

        if (
            !Number.isFinite(data.expiresAt) ||
            data.expiresAt < Date.now()
        ) {
            return null;
        }

        return data;
    } catch {
        return null;
    }
}

async function uploadJulotLargeVideo(
    request,
    env,
    access,
    variant,
    rulePublicId,
    variantPublicId
) {
    if (Number(access.creatorId) !== 1) {
        return json(
            {
                error:
                    "Les imports volumineux sont réservés à Julot."
            },
            403
        );
    }

    if (!env.TOKEN_PEPPER) {
        return json(
            {
                error:
                    "Le secret TOKEN_PEPPER n’est pas configuré."
            },
            500
        );
    }

    const url = new URL(request.url);
    const action = url.searchParams.get("multipart");

    if (action === "start") {
        const body = await request.json().catch(() => null);

        const size = Number(body?.size);

        const contentType = String(
            body?.contentType || ""
        ).toLowerCase();

        const extension = {
            "video/webm": "webm",
            "video/mp4": "mp4"
        }[contentType];

        if (
            !extension ||
            !Number.isSafeInteger(size) ||
            size < 1 ||
            size > JULOT_VIDEO_MAX_BYTES
        ) {
            return json(
                {
                    error:
                        "Choisis une vidéo WebM ou MP4 de 1 Gio maximum."
                },
                400
            );
        }

        const key = buildVariantMediaStorageKey({
            creatorId: access.creatorId,
            rulePublicId,
            variantPublicId,
            mediaKind: "video",
            extension
        });

        const upload = await env.MEDIA.createMultipartUpload(
            key,
            {
                httpMetadata: {
                    contentType,
                    cacheControl:
                        "public, max-age=31536000, immutable"
                },
                customMetadata: {
                    creatorId: String(access.creatorId),
                    rulePublicId,
                    variantPublicId,
                    mediaKind: "video"
                }
            }
        );

        const token = await createLargeVideoToken(
            env,
            {
                creatorId: Number(access.creatorId),
                variantId: Number(variant.id),
                key,
                uploadId: upload.uploadId,
                size,
                expiresAt:
                    Date.now() + 12 * 60 * 60 * 1000
            }
        );

        return json({
            token,
            partSize: JULOT_VIDEO_PART_BYTES
        });
    }

    const session = await readLargeVideoToken(
        env,
        url.searchParams.get("uploadToken")
    );

    if (
        !session ||
        session.creatorId !== Number(access.creatorId) ||
        session.variantId !== Number(variant.id)
    ) {
        return json(
            {
                error:
                    "L’autorisation d’import est invalide ou expirée."
            },
            403
        );
    }

    const upload = env.MEDIA.resumeMultipartUpload(
        session.key,
        session.uploadId
    );

    const partCount = Math.ceil(
        session.size / JULOT_VIDEO_PART_BYTES
    );

    if (action === "part") {
        const partNumber = Number(
            url.searchParams.get("partNumber")
        );

        if (
            !Number.isInteger(partNumber) ||
            partNumber < 1 ||
            partNumber > partCount
        ) {
            return json(
                { error: "Numéro de morceau invalide." },
                400
            );
        }

        const expectedSize = Math.min(
            JULOT_VIDEO_PART_BYTES,
            session.size -
            (partNumber - 1) * JULOT_VIDEO_PART_BYTES
        );

        const contentLength = Number(
            request.headers.get("Content-Length")
        );

        if (contentLength !== expectedSize) {
            return json(
                {
                    error:
                        "La taille du morceau envoyé est incorrecte."
                },
                400
            );
        }

        const bytes = await request.arrayBuffer();

        if (bytes.byteLength !== expectedSize) {
            return json(
                { error: "Morceau incomplet." },
                400
            );
        }

        const part = await upload.uploadPart(
            partNumber,
            bytes
        );

        return json({
            partNumber: part.partNumber,
            etag: part.etag
        });
    }

    if (action === "abort") {
        await upload.abort().catch(() => { });

        return json({ success: true });
    }

    if (action === "complete") {
        const body = await request.json().catch(() => null);
        const parts = body?.parts;

        if (
            !Array.isArray(parts) ||
            parts.length !== partCount ||
            !parts.every(
                (part, index) =>
                    part?.partNumber === index + 1 &&
                    typeof part.etag === "string" &&
                    part.etag.length > 0
            )
        ) {
            return json(
                {
                    error:
                        "La liste des morceaux est incomplète."
                },
                400
            );
        }

        // Permet de réessayer si la réponse précédente
        // a été perdue après la finalisation dans R2.
        let object = await env.MEDIA.head(session.key);

        if (!object) {
            object = await upload.complete(
                parts.map(part => ({
                    partNumber: part.partNumber,
                    etag: part.etag
                }))
            );
        }

        if (object.size !== session.size) {
            await env.MEDIA.delete(session.key);

            return json(
                {
                    error:
                        "La taille finale de la vidéo est incorrecte."
                },
                400
            );
        }

        const oldStorageKey =
            getVariantMediaStorageKey(
                variant,
                "video"
            );

        await updateVariantMediaKey(
            env,
            variant.id,
            "video",
            session.key
        );

        if (
            oldStorageKey &&
            oldStorageKey !== session.key
        ) {
            await deleteDonationAlertMediaIfUnused(
                env,
                oldStorageKey
            ).catch(() => { });
        }

        return json({ success: true });
    }

    return json(
        { error: "Opération d’import inconnue." },
        400
    );
}