import {
  DurableObject
} from "cloudflare:workers";

import {
  processAutomaticRaffles
} from "./manage.js";

export class RaffleTimer
  extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);

    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url =
      new URL(request.url);

    if (
      request.method !== "POST" ||
      url.pathname !== "/schedule"
    ) {
      return new Response(
        "Route introuvable.",
        {
          status: 404
        }
      );
    }

    let payload = {};

    try {
      payload =
        await request.json();
    } catch {
      return Response.json(
        {
          error:
            "Corps JSON invalide."
        },
        {
          status: 400
        }
      );
    }

    const runAt =
      Number(payload.runAt);

    if (
      !Number.isFinite(runAt)
    ) {
      return Response.json(
        {
          error:
            "Date de tirage invalide."
        },
        {
          status: 400
        }
      );
    }

    const scheduledTime =
      Math.max(
        Date.now() + 500,
        runAt
      );

    const currentAlarm =
      await this.ctx.storage
        .getAlarm();

    /*
     * On remplace l’alarme seulement si :
     * - aucune alarme n’existe ;
     * - la nouvelle tombola termine avant
     *   l’alarme actuelle.
     */
    if (
      currentAlarm === null ||
      scheduledTime < currentAlarm
    ) {
      await this.ctx.storage.setAlarm(
        scheduledTime
      );
    }

    return Response.json({
      success: true,
      scheduledAt:
        new Date(
          scheduledTime
        ).toISOString()
    });
  }

  async alarm() {
    console.log(
      "[Tombola] Alarme déclenchée."
    );

    try {
      const result =
        await processAutomaticRaffles(
          this.env
        );

      console.log(
        "[Tombola] Résultat automatique :",
        result
      );
    } catch (error) {
      console.error(
        "[Tombola] Erreur du tirage automatique :",
        error
      );

      /*
       * Nouvelle tentative dans cinq secondes.
       */
      await this.ctx.storage.setAlarm(
        Date.now() + 5000
      );

      return;
    }

    await this.scheduleNextRaffle();
  }

  async scheduleNextRaffle() {
    const nextRaffle =
      await this.env.DB.prepare(`
        SELECT
          id,
          public_id,
          ends_at

        FROM creator_raffles

        WHERE draw_mode = 'automatic'

          AND status NOT IN (
            'completed',
            'cancelled'
          )

          AND datetime(ends_at)
            > datetime('now')

        ORDER BY
          datetime(ends_at) ASC,
          id ASC

        LIMIT 1
      `)
        .first();

    if (!nextRaffle?.ends_at) {
      console.log(
        "[Tombola] Aucune autre tombola automatique."
      );

      return;
    }

    const timestamp =
      Date.parse(
        nextRaffle.ends_at
      );

    if (
      !Number.isFinite(timestamp)
    ) {
      console.error(
        "[Tombola] Date invalide :",
        nextRaffle.ends_at
      );

      return;
    }

    const scheduledTime =
      Math.max(
        Date.now() + 500,
        timestamp
      );

    await this.ctx.storage.setAlarm(
      scheduledTime
    );

    console.log(
      `[Tombola] Prochaine alarme : ${nextRaffle.public_id}`,
      new Date(
        scheduledTime
      ).toISOString()
    );
  }
}