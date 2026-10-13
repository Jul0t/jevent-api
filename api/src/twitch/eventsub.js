const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

function hex(buffer) {
    return [...new Uint8Array(buffer)]
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function createSignature(secret, message) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        {
            name: "HMAC",
            hash: "SHA-256"
        },
        false,
        ["sign"]
    );

    const signature =
        await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(message)
        );

    return `sha256=${hex(signature)}`;
}

function safeEqual(first, second) {
    if (!first || !second || first.length !== second.length) {
        return false;
    }

    let result = 0;

    for (let index = 0; index < first.length; index++) {
        result |= first.charCodeAt(index) ^
            second.charCodeAt(index);
    }

    return result === 0;
}

function parisDateKey(timestamp) {
    const parts = new Intl.DateTimeFormat(
        "fr-FR",
        {
            timeZone: "Europe/Paris",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).formatToParts(new Date(timestamp));

    const values = Object.fromEntries(
        parts
            .filter(part => part.type !== "literal")
            .map(part => [
                part.type,
                part.value
            ])
    );

    return `${values.year}-${values.month}-${values.day}`;
}

export async function handleTwitchEventSub(
    request,
    env
) {
    if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
            status: 405
        });
    }

    const rawBody =
        await request.text();

    const messageId =
        request.headers.get(
            "Twitch-Eventsub-Message-Id"
        );

    const timestamp =
        request.headers.get(
            "Twitch-Eventsub-Message-Timestamp"
        );

    const receivedSignature =
        request.headers.get(
            "Twitch-Eventsub-Message-Signature"
        );

    const messageType =
        request.headers.get(
            "Twitch-Eventsub-Message-Type"
        );

    if (
        !messageId ||
        !timestamp ||
        !receivedSignature
    ) {
        return new Response("Missing headers", {
            status: 400
        });
    }

    const timestampMs =
        Date.parse(timestamp);

    if (
        !Number.isFinite(timestampMs) ||
        Math.abs(Date.now() - timestampMs) >
        MAX_MESSAGE_AGE_MS
    ) {
        return new Response("Message too old", {
            status: 403
        });
    }

    const expectedSignature =
        await createSignature(
            env.TWITCH_EVENTSUB_SECRET,
            messageId +
            timestamp +
            rawBody
        );

    if (
        !safeEqual(
            expectedSignature,
            receivedSignature
        )
    ) {
        return new Response("Invalid signature", {
            status: 403
        });
    }

    let payload;

    try {
        payload = JSON.parse(rawBody);
    } catch {
        return new Response("Invalid JSON", {
            status: 400
        });
    }

    if (
        messageType ===
        "webhook_callback_verification"
    ) {
        const subscriptionId =
            payload.subscription?.id;

        if (subscriptionId) {
            await env.DB.prepare(`
      UPDATE twitch_eventsub_subscriptions
      SET
        status = 'enabled',
        updated_at = CURRENT_TIMESTAMP
      WHERE subscription_id = ?
    `)
                .bind(subscriptionId)
                .run();
        }

        return new Response(
            String(payload.challenge ?? ""),
            {
                status: 200,
                headers: {
                    "Content-Type": "text/plain"
                }
            }
        );
    }

    if (messageType === "revocation") {
        const subscriptionId =
            payload.subscription?.id;

        if (subscriptionId) {
            await env.DB.prepare(`
        UPDATE twitch_eventsub_subscriptions
        SET
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE subscription_id = ?
      `)
                .bind(
                    payload.subscription.status ??
                    "revoked",
                    subscriptionId
                )
                .run();
        }

        return new Response(null, {
            status: 204
        });
    }

    if (
        messageType !== "notification" ||
        payload.subscription?.type !==
        "channel.chat.message"
    ) {
        return new Response(null, {
            status: 204
        });
    }

    const event =
        payload.event ?? {};

    const broadcasterTwitchId =
        String(
            event.broadcaster_user_id ?? ""
        );

    const creator =
        await env.DB.prepare(`
      SELECT id
      FROM creators
      WHERE twitch_id = ?
        AND active = 1
        AND archived = 0
      LIMIT 1
    `)
            .bind(broadcasterTwitchId)
            .first();

    if (!creator) {
        return new Response(null, {
            status: 204
        });
    }

    const inserted =
        await env.DB.prepare(`
      INSERT OR IGNORE INTO
        twitch_eventsub_events (
          message_id,
          broadcaster_user_id,
          received_at
        )
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `)
            .bind(
                messageId,
                broadcasterTwitchId
            )
            .run();

    if (Number(inserted.meta?.changes ?? 0) === 0) {
        return new Response(null, {
            status: 204
        });
    }

    const fragments =
        event.message?.fragments ?? [];

    const emotesCount =
        fragments.filter(
            fragment =>
                fragment.type === "emote"
        ).length;

    const statDate =
        parisDateKey(
            request.headers.get(
                "Twitch-Eventsub-Message-Timestamp"
            )
        );

    await env.DB.prepare(`
    INSERT INTO twitch_chat_daily_stats (
      creator_id,
      stat_date,
      messages_count,
      emotes_count
    )
    VALUES (?, ?, 1, ?)
    ON CONFLICT (creator_id, stat_date)
    DO UPDATE SET
      messages_count =
        messages_count + 1,
      emotes_count =
        emotes_count + excluded.emotes_count
  `)
        .bind(
            Number(creator.id),
            statDate,
            emotesCount
        )
        .run();

    return new Response(null, {
        status: 204
    });
}

export async function createChatMessageSubscription(
    env,
    {
        accessToken,
        creatorId,
        broadcasterTwitchId
    }
) {
    const callbackUrl =
        env.TWITCH_EVENTSUB_CALLBACK_URL ??
        "https://api.jevent.julot.fr/api/twitch/eventsub";

    const existing =
        await env.DB.prepare(`
      SELECT subscription_id, status
      FROM twitch_eventsub_subscriptions
      WHERE creator_id = ?
        AND subscription_type =
          'channel.chat.message'
        AND status IN (
          'enabled',
          'webhook_callback_verification_pending'
        )
      LIMIT 1
    `)
            .bind(creatorId)
            .first();

    if (existing) {
        return existing;
    }

    const tokenResponse = await fetch(
        "https://id.twitch.tv/oauth2/token",
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                client_id: env.TWITCH_CLIENT_ID,
                client_secret: env.TWITCH_CLIENT_SECRET,
                grant_type: "client_credentials"
            })
        }
    );

    const tokenData =
        await tokenResponse.json();

    if (
        !tokenResponse.ok ||
        !tokenData.access_token
    ) {
        throw new Error(
            "Impossible de récupérer le token App Twitch."
        );
    }

    const appAccessToken =
        tokenData.access_token;

    const response = await fetch(
        "https://api.twitch.tv/helix/eventsub/subscriptions",
        {
            method: "POST",
            headers: {
                "Client-Id":
                    env.TWITCH_CLIENT_ID,

                Authorization:
                    `Bearer ${appAccessToken}`,

                "Content-Type":
                    "application/json"
            },
            body: JSON.stringify({
                type: "channel.chat.message",
                version: "1",

                condition: {
                    broadcaster_user_id:
                        String(broadcasterTwitchId),

                    user_id:
                        String(broadcasterTwitchId)
                },

                transport: {
                    method: "webhook",

                    callback: callbackUrl,

                    secret:
                        env.TWITCH_EVENTSUB_SECRET
                }
            })
        }
    );

    const data =
        await response.json();

    if (!response.ok) {
        throw new Error(
            data.message ??
            `Twitch EventSub a répondu ${response.status}.`
        );
    }

    const subscription =
        data.data?.[0];

    if (!subscription?.id) {
        throw new Error(
            "Twitch n’a pas renvoyé d’abonnement."
        );
    }

    await env.DB.prepare(`
    INSERT INTO twitch_eventsub_subscriptions (
      subscription_id,
      creator_id,
      broadcaster_user_id,
      subscription_type,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `)
        .bind(
            subscription.id,
            creatorId,
            String(broadcasterTwitchId),
            "channel.chat.message",
            subscription.status
        )
        .run();

    return subscription;
}
