import {
  resolveCreatorAccess
} from "../creators/panel.js";

import {
  generateRandomToken
} from "../shared/security.js";

import {
  json
} from "../shared/responses.js";

const RAFFLE_METHODS =
  new Set([
    "ticket_per_euro",
    "highest_donor"
  ]);

const RUNNING_STATUSES =
  new Set([
    "countdown",
    "active",
    "drawing"
  ]);

async function requireRaffleAccess(
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

  const allowed =
    Boolean(
      access.user.permissions
        ?.isSuperAdmin
    ) ||
    [
      "owner",
      "delegate"
    ].includes(
      access.membership?.memberRole
    );

  if (!allowed) {
    return {
      allowed: false,

      response: json(
        {
          error:
            "Tu ne peux pas gérer les tombolas de ce créateur."
        },
        403
      )
    };
  }

  return access;
}

function cleanText(
  value,
  maximumLength
) {
  return String(value || "")
    .trim()
    .slice(0, maximumLength);
}

function createParticipantKey(
  donation
) {
  if (donation.user_id) {
    return (
      "user:" +
      Number(donation.user_id)
    );
  }

  const donorName =
    cleanText(
      donation.donor_name,
      200
    )
      .toLocaleLowerCase("fr-FR")
      .replace(/\s+/g, " ");

  if (donorName) {
    return `donor:${donorName}`;
  }

  return (
    "donation:" +
    donation.provider_donation_id
  );
}

function secureRandomInteger(
  maximum
) {
  if (
    !Number.isSafeInteger(maximum) ||
    maximum <= 0
  ) {
    throw new Error(
      "La plage aléatoire est invalide."
    );
  }

  /*
   * Suffisant pour une tombola classique.
   * Le total de tickets ne dépassera normalement
   * jamais la limite d’un entier 32 bits.
   */
  if (maximum > 0xffffffff) {
    throw new Error(
      "Le nombre de tickets est trop important."
    );
  }

  const range =
    0x100000000;

  const limit =
    Math.floor(
      range / maximum
    ) * maximum;

  const values =
    new Uint32Array(1);

  let value;

  do {
    crypto.getRandomValues(values);
    value = values[0];
  } while (value >= limit);

  return value % maximum;
}

async function refreshRaffleStatuses(
  env,
  creatorId
) {
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE creator_raffles

      SET
        status = 'active',
        updated_at = CURRENT_TIMESTAMP

      WHERE creator_id = ?
        AND status = 'countdown'
        AND datetime(starts_at)
          <= datetime('now')
        AND datetime(ends_at)
          > datetime('now')
    `)
      .bind(creatorId),

    env.DB.prepare(`
      UPDATE creator_raffles

      SET
        status = 'drawing',
        updated_at = CURRENT_TIMESTAMP

      WHERE creator_id = ?
        AND status IN (
          'countdown',
          'active'
        )
        AND datetime(ends_at)
          <= datetime('now')
    `)
      .bind(creatorId)
  ]);
}

async function findRaffle(
  env,
  creatorId,
  publicId
) {
  return env.DB.prepare(`
    SELECT *
    FROM creator_raffles

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

async function synchronizeRaffleEntries(
  env,
  raffle
) {
  const result =
    await env.DB.prepare(`
      SELECT
        id,
        provider_donation_id,
        user_id,
        donor_name,
        amount_cents

      FROM interaction_donations

      WHERE creator_id = ?
        AND amount_cents > 0

        AND status NOT IN (
          'reversed',
          'cancelled'
        )

        AND datetime(
          COALESCE(
            donated_at,
            created_at
          )
        ) >= datetime(?)

        AND datetime(
          COALESCE(
            donated_at,
            created_at
          )
        ) <= datetime(?)

      ORDER BY
        datetime(
          COALESCE(
            donated_at,
            created_at
          )
        ) ASC
    `)
      .bind(
        raffle.creator_id,
        raffle.starts_at,
        raffle.ends_at
      )
      .all();

  const donations =
    result.results ?? [];

  if (donations.length === 0) {
    return;
  }

  const statements = [];

  for (const donation of donations) {
    const amountCents =
      Number(
        donation.amount_cents
      );

    const ticketCount =
      raffle.method ===
        "ticket_per_euro"
        ? Math.floor(
          amountCents / 100
        )
        : 0;

    /*
     * Un don inférieur à 1 € ne donne aucun ticket
     * dans le mode 1 € = 1 ticket.
     */
    if (
      raffle.method ===
      "ticket_per_euro" &&
      ticketCount <= 0
    ) {
      continue;
    }

    statements.push(
      env.DB.prepare(`
        INSERT OR IGNORE INTO
          raffle_entries (
            public_id,
            raffle_id,
            donation_id,
            user_id,
            participant_key,
            donor_name,
            amount_cents,
            ticket_count,
            created_at
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
          CURRENT_TIMESTAMP
        )
      `)
        .bind(
          (
            "raffle_entry_" +
            generateRandomToken(15)
          ),

          Number(raffle.id),

          Number(donation.id),

          donation.user_id
            ? Number(
              donation.user_id
            )
            : null,

          createParticipantKey(
            donation
          ),

          cleanText(
            donation.donor_name,
            200
          ) || null,

          amountCents,

          ticketCount
        )
    );
  }

  if (statements.length > 0) {
    await env.DB.batch(
      statements
    );
  }
}

async function getMappedRaffle(
  env,
  raffle
) {
  if (!raffle) {
    return null;
  }

  const summary =
    await env.DB.prepare(`
      SELECT
        COUNT(*) AS donations_count,

        COUNT(
          DISTINCT participant_key
        ) AS participants_count,

        COALESCE(
          SUM(amount_cents),
          0
        ) AS amount_cents,

        COALESCE(
          SUM(ticket_count),
          0
        ) AS ticket_count

      FROM raffle_entries

      WHERE raffle_id = ?
    `)
      .bind(raffle.id)
      .first();

  const winner =
    await env.DB.prepare(`
      SELECT
        winners.participant_key,
        winners.donor_name,
        winners.user_id,
        winners.selected_at,

        users.twitch_login,
        users.twitch_display_name,
        users.twitch_profile_image_url

      FROM raffle_winners
        AS winners

      LEFT JOIN users
        ON users.id =
          winners.user_id

      WHERE winners.raffle_id = ?

      LIMIT 1
    `)
      .bind(raffle.id)
      .first();

  return {
    id:
      Number(raffle.id),

    publicId:
      raffle.public_id,

    creatorId:
      Number(
        raffle.creator_id
      ),

    title:
      raffle.title,

    description:
      raffle.description ?? "",

    method:
      raffle.method,

    status:
      raffle.status,

    durationMinutes:
      Number(
        raffle.duration_minutes
      ),

    countdownMinutes:
      Number(
        raffle.countdown_minutes
      ),

    drawMode:
      raffle.draw_mode === "automatic"
        ? "automatic"
        : "manual",

    startsAt:
      raffle.starts_at,

    endsAt:
      raffle.ends_at,

    completedAt:
      raffle.completed_at,

    cancelledAt:
      raffle.cancelled_at,

    createdAt:
      raffle.created_at,

    updatedAt:
      raffle.updated_at,

    donationsCount:
      Number(
        summary?.donations_count ??
        0
      ),

    participantsCount:
      Number(
        summary
          ?.participants_count ??
        0
      ),

    amountCents:
      Number(
        summary?.amount_cents ??
        0
      ),

    ticketCount:
      Number(
        summary?.ticket_count ??
        0
      ),

    winner:
      winner
        ? {
          participantKey:
            winner.participant_key,

          donorName:
            winner.donor_name,

          userId:
            winner.user_id
              ? Number(
                winner.user_id
              )
              : null,

          twitchLogin:
            winner.twitch_login,

          twitchDisplayName:
            winner
              .twitch_display_name,

          twitchProfileImageUrl:
            winner
              .twitch_profile_image_url,

          selectedAt:
            winner.selected_at
        }
        : null
  };
}

/* =========================================================
   LISTER LES TOMBOLAS
   ========================================================= */

export async function listCreatorRaffles(
  request,
  env
) {
  const access =
    await requireRaffleAccess(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  await refreshRaffleStatuses(
    env,
    access.creatorId
  );

  const result =
    await env.DB.prepare(`
      SELECT *
      FROM creator_raffles

      WHERE creator_id = ?

      ORDER BY
        created_at DESC,
        id DESC

      LIMIT 100
    `)
      .bind(access.creatorId)
      .all();

  const rows =
    result.results ?? [];

  for (const raffle of rows) {
    if (
      RUNNING_STATUSES.has(
        raffle.status
      )
    ) {
      await synchronizeRaffleEntries(
        env,
        raffle
      );
    }
  }

  const raffles =
    await Promise.all(
      rows.map(
        raffle =>
          getMappedRaffle(
            env,
            raffle
          )
      )
    );

  return json({
    raffles,

    activeRaffle:
      raffles.find(
        raffle =>
          RUNNING_STATUSES.has(
            raffle.status
          )
      ) ?? null
  });
}

/* =========================================================
   CRÉER UNE TOMBOLA
   ========================================================= */

export async function createCreatorRaffle(
  request,
  env
) {
  const access =
    await requireRaffleAccess(
      request,
      env
    );

  if (!access.allowed) {
    return access.response;
  }

  let payload;

  try {
    payload =
      await request.json();
  } catch {
    return json(
      {
        error:
          "Le contenu envoyé est invalide."
      },
      400
    );
  }

  const drawMode =
    payload.drawMode === "automatic"
      ? "automatic"
      : "manual";

  const title =
    cleanText(
      payload.title,
      150
    );

  const description =
    cleanText(
      payload.description,
      1000
    );

  const method =
    String(
      payload.method || ""
    )
      .trim()
      .toLowerCase();

  const durationMinutes =
    Number(
      payload.durationMinutes
    );

  const countdownMinutes =
    Number(
      payload.countdownMinutes ?? 0
    );

  if (!title) {
    return json(
      {
        error:
          "Indique l’objet à gagner."
      },
      400
    );
  }

  if (
    !RAFFLE_METHODS.has(method)
  ) {
    return json(
      {
        error:
          "La méthode de participation est invalide."
      },
      400
    );
  }

  if (
    !Number.isInteger(
      durationMinutes
    ) ||
    durationMinutes < 1 ||
    durationMinutes > 1440
  ) {
    return json(
      {
        error:
          "La durée doit être comprise entre 1 et 1 440 minutes."
      },
      400
    );
  }

  if (
    !Number.isInteger(
      countdownMinutes
    ) ||
    countdownMinutes < 0 ||
    countdownMinutes > 60
  ) {
    return json(
      {
        error:
          "Le compte à rebours doit être compris entre 0 et 60 minutes."
      },
      400
    );
  }

  await refreshRaffleStatuses(
    env,
    access.creatorId
  );

  const existing =
    await env.DB.prepare(`
      SELECT public_id
      FROM creator_raffles

      WHERE creator_id = ?
        AND status IN (
          'countdown',
          'active',
          'drawing'
        )

      LIMIT 1
    `)
      .bind(access.creatorId)
      .first();

  if (existing) {
    return json(
      {
        error:
          "Une tombola est déjà en cours pour cette chaîne."
      },
      409
    );
  }

  const now =
    Date.now();

  const startsAt =
    new Date(
      now +
      countdownMinutes *
      60 *
      1000
    );

  const endsAt =
    new Date(
      startsAt.getTime() +
      durationMinutes *
      60 *
      1000
    );

  const publicId =
    (
      "raffle_" +
      generateRandomToken(16)
    );

  const status =
    countdownMinutes > 0
      ? "countdown"
      : "active";

  const result =
    await env.DB.prepare(`
    INSERT INTO creator_raffles (
      public_id,
      creator_id,
      title,
      description,
      method,
      status,
      duration_minutes,
      countdown_minutes,
      starts_at,
      ends_at,
      created_by_user_id,
      draw_mode,
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
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
      .bind(
        publicId,
        access.creatorId,
        title,
        description,
        method,
        status,
        durationMinutes,
        countdownMinutes,
        startsAt.toISOString(),
        endsAt.toISOString(),
        Number(access.user.id),
        drawMode
      )
      .run();

  if (
    drawMode === "automatic"
  ) {
    try {
      const timerId =
        env.RAFFLE_TIMER.idFromName(
          "global-raffle-timer"
        );

      const timer =
        env.RAFFLE_TIMER.get(
          timerId
        );

      await timer.fetch(
        "https://raffle-timer.internal/schedule",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            runAt:
              endsAt.getTime()
          })
        }
      );

      console.log(
        "[Tombola] Tirage automatique programmé :",
        publicId,
        endsAt.toISOString()
      );
    } catch (error) {
      /*
       * La tombola reste créée.
       * Le cron servira de sécurité.
       */
      console.error(
        "[Tombola] Impossible de programmer l’alarme :",
        error
      );
    }
  }

  const raffle =
    await env.DB.prepare(`
      SELECT *
      FROM creator_raffles
      WHERE id = ?
      LIMIT 1
    `)
      .bind(
        result.meta?.last_row_id
      )
      .first();

  return json(
    {
      success: true,

      raffle:
        await getMappedRaffle(
          env,
          raffle
        )
    },
    201
  );
}

/* =========================================================
   ANNULER UNE TOMBOLA
   ========================================================= */

export async function cancelCreatorRaffle(
  request,
  env,
  rawPublicId
) {
  const access =
    await requireRaffleAccess(
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

  await refreshRaffleStatuses(
    env,
    access.creatorId
  );

  const raffle =
    await findRaffle(
      env,
      access.creatorId,
      publicId
    );

  if (!raffle) {
    return json(
      {
        error:
          "Cette tombola n’existe pas."
      },
      404
    );
  }

  if (
    !RUNNING_STATUSES.has(
      raffle.status
    )
  ) {
    return json(
      {
        error:
          "Cette tombola est déjà terminée."
      },
      409
    );
  }

  await env.DB.prepare(`
    UPDATE creator_raffles

    SET
      status = 'cancelled',
      cancelled_at =
        CURRENT_TIMESTAMP,
      updated_at =
        CURRENT_TIMESTAMP

    WHERE id = ?
      AND status IN (
        'countdown',
        'active',
        'drawing'
      )
  `)
    .bind(raffle.id)
    .run();

  const updated =
    await findRaffle(
      env,
      access.creatorId,
      publicId
    );

  return json({
    success: true,

    raffle:
      await getMappedRaffle(
        env,
        updated
      )
  });
}

/* =========================================================
   TIRER UN GAGNANT
   ========================================================= */

export async function drawCreatorRaffleWinner(
  request,
  env,
  rawPublicId
) {
  const access =
    await requireRaffleAccess(
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

  await refreshRaffleStatuses(
    env,
    access.creatorId
  );

  const raffle =
    await findRaffle(
      env,
      access.creatorId,
      publicId
    );

  if (!raffle) {
    return json(
      {
        error:
          "Cette tombola n’existe pas."
      },
      404
    );
  }

  if (
    raffle.status ===
    "completed"
  ) {
    return json(
      {
        error:
          "Le gagnant a déjà été tiré."
      },
      409
    );
  }

  if (
    raffle.status ===
    "cancelled"
  ) {
    return json(
      {
        error:
          "Cette tombola a été annulée."
      },
      409
    );
  }

  await synchronizeRaffleEntries(
    env,
    raffle
  );

  let selectedEntry = null;

  if (
    raffle.method ===
    "ticket_per_euro"
  ) {
    const result =
      await env.DB.prepare(`
        SELECT
          id,
          participant_key,
          donor_name,
          user_id,
          ticket_count

        FROM raffle_entries

        WHERE raffle_id = ?
          AND ticket_count > 0

        ORDER BY id ASC
      `)
        .bind(raffle.id)
        .all();

    const entries =
      result.results ?? [];

    const totalTickets =
      entries.reduce(
        (total, entry) =>
          total +
          Number(
            entry.ticket_count
          ),
        0
      );

    if (totalTickets <= 0) {
      return json(
        {
          error:
            "Aucun ticket n’a été enregistré."
        },
        409
      );
    }

    const winningTicket =
      secureRandomInteger(
        totalTickets
      ) + 1;

    let cursor = 0;

    for (const entry of entries) {
      cursor +=
        Number(
          entry.ticket_count
        );

      if (
        winningTicket <= cursor
      ) {
        selectedEntry =
          entry;

        break;
      }
    }
  } else {
    const result =
      await env.DB.prepare(`
        SELECT
          MIN(id) AS id,
          participant_key,
          MAX(donor_name)
            AS donor_name,
          MAX(user_id)
            AS user_id,
          SUM(amount_cents)
            AS total_amount_cents

        FROM raffle_entries

        WHERE raffle_id = ?

        GROUP BY participant_key

        ORDER BY
          total_amount_cents DESC
      `)
        .bind(raffle.id)
        .all();

    const participants =
      result.results ?? [];

    if (
      participants.length === 0
    ) {
      return json(
        {
          error:
            "Aucun don n’a été enregistré."
        },
        409
      );
    }

    const highestAmount =
      Number(
        participants[0]
          .total_amount_cents
      );

    const tiedParticipants =
      participants.filter(
        participant =>
          Number(
            participant
              .total_amount_cents
          ) === highestAmount
      );

    selectedEntry =
      tiedParticipants[
      secureRandomInteger(
        tiedParticipants.length
      )
      ];
  }

  if (!selectedEntry) {
    return json(
      {
        error:
          "Impossible de sélectionner un gagnant."
      },
      500
    );
  }

  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO raffle_winners (
          raffle_id,
          raffle_entry_id,
          participant_key,
          donor_name,
          user_id,
          selected_by_user_id,
          selected_at
        )

        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          CURRENT_TIMESTAMP
        )
      `)
        .bind(
          Number(raffle.id),
          Number(selectedEntry.id),
          selectedEntry
            .participant_key,
          selectedEntry.donor_name ||
          null,
          selectedEntry.user_id
            ? Number(
              selectedEntry.user_id
            )
            : null,
          Number(access.user.id)
        ),

      env.DB.prepare(`
        UPDATE creator_raffles

        SET
          status = 'completed',
          completed_at =
            CURRENT_TIMESTAMP,
          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = ?
          AND status != 'completed'
          AND status != 'cancelled'
      `)
        .bind(raffle.id)
    ]);
  } catch (error) {
    console.error(
      "Tirage impossible :",
      error
    );

    return json(
      {
        error:
          "Le gagnant vient peut-être déjà d’être tiré."
      },
      409
    );
  }

  const updated =
    await findRaffle(
      env,
      access.creatorId,
      publicId
    );

  return json({
    success: true,

    raffle:
      await getMappedRaffle(
        env,
        updated
      )
  });
}

async function selectAutomaticRaffleWinner(
  env,
  raffle
) {
  if (
    raffle.method ===
    "ticket_per_euro"
  ) {
    const result =
      await env.DB.prepare(`
        SELECT
          id,
          participant_key,
          donor_name,
          user_id,
          ticket_count

        FROM raffle_entries

        WHERE raffle_id = ?
          AND ticket_count > 0

        ORDER BY id ASC
      `)
        .bind(raffle.id)
        .all();

    const entries =
      result.results ?? [];

    const totalTickets =
      entries.reduce(
        (total, entry) =>
          total +
          Number(entry.ticket_count),
        0
      );

    if (totalTickets <= 0) {
      return null;
    }

    const winningTicket =
      secureRandomInteger(
        totalTickets
      ) + 1;

    let cursor = 0;

    for (const entry of entries) {
      cursor +=
        Number(entry.ticket_count);

      if (winningTicket <= cursor) {
        return entry;
      }
    }

    return null;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        MIN(id) AS id,
        participant_key,

        MAX(donor_name)
          AS donor_name,

        MAX(user_id)
          AS user_id,

        SUM(amount_cents)
          AS total_amount_cents

      FROM raffle_entries

      WHERE raffle_id = ?

      GROUP BY participant_key

      ORDER BY
        total_amount_cents DESC
    `)
      .bind(raffle.id)
      .all();

  const participants =
    result.results ?? [];

  if (participants.length === 0) {
    return null;
  }

  const highestAmount =
    Number(
      participants[0]
        .total_amount_cents
    );

  const tiedParticipants =
    participants.filter(
      participant =>
        Number(
          participant
            .total_amount_cents
        ) === highestAmount
    );

  return tiedParticipants[
    secureRandomInteger(
      tiedParticipants.length
    )
  ];
}

async function drawAutomaticRaffle(
  env,
  raffle
) {
  await synchronizeRaffleEntries(
    env,
    raffle
  );

  const selectedEntry =
    await selectAutomaticRaffleWinner(
      env,
      raffle
    );

  if (!selectedEntry) {
    await env.DB.prepare(`
    UPDATE creator_raffles

    SET
      status = 'cancelled',
      updated_at =
        CURRENT_TIMESTAMP

    WHERE id = ?
      AND draw_mode =
        'automatic'

      AND status NOT IN (
        'completed',
        'cancelled'
      )
  `)
      .bind(
        raffle.id
      )
      .run();

    console.log(
      `[Tombola] ${raffle.public_id} annulée automatiquement : aucun participant.`
    );

    return true;
  }

  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO raffle_winners (
        raffle_id,
        raffle_entry_id,
        participant_key,
        donor_name,
        user_id,
        selected_by_user_id,
        selected_at
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        NULL,
        CURRENT_TIMESTAMP
      )
    `)
      .bind(
        Number(raffle.id),
        Number(selectedEntry.id),
        selectedEntry.participant_key,
        selectedEntry.donor_name || null,
        selectedEntry.user_id
          ? Number(
            selectedEntry.user_id
          )
          : null
      ),

    env.DB.prepare(`
      UPDATE creator_raffles

      SET
        status = 'completed',
        completed_at =
          CURRENT_TIMESTAMP,
        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
        AND draw_mode = 'automatic'
        AND status != 'completed'
        AND status != 'cancelled'
    `)
      .bind(raffle.id)
  ]);

  console.log(
    `[Tombola] Tirage automatique terminé : ${raffle.public_id}.`
  );

  return true;
}

export async function processAutomaticRaffles(
  env
) {
  const result =
    await env.DB.prepare(`
      SELECT *
      FROM creator_raffles

      WHERE draw_mode = 'automatic'

        AND status NOT IN (
          'completed',
          'cancelled'
        )

        AND datetime(ends_at)
          <= datetime('now')

      ORDER BY ends_at ASC

      LIMIT 50
    `)
      .all();

  const raffles =
    result.results ?? [];

  let completed = 0;

  for (const raffle of raffles) {
    try {
      const success =
        await drawAutomaticRaffle(
          env,
          raffle
        );

      if (success) {
        completed += 1;
      }
    } catch (error) {
      console.error(
        `[Tombola] Échec du tirage automatique ${raffle.public_id} :`,
        error
      );
    }
  }

  return {
    checked: raffles.length,
    completed
  };
}