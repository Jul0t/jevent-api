import { json } from "../shared/responses.js";
import { requireStreamDeckToken } from "./auth.js";
import { getLiveStreams } from "./twitch-live.js";

// Même filtre que le site (goals/public.js)
const DONATION_FILTER =
  "status = 'credited' AND currency = 'EUR'";

function formatLastDonation(row, hideDetails) {
  if (!row) return null;

  // Pas de pseudo tant que l'overlay n'a pas révélé le don
  const canShowName =
    !hideDetails || Boolean(row.revealed_at);

  return {
    amountCents: Number(row.amount_cents ?? 0),
    donorName: canShowName
      ? (row.donor_name || "Anonyme")
      : null,
    donatedAt: row.donated_at ?? null,
    creatorId: row.creator_id === null
      ? null
      : Number(row.creator_id)
  };
}

function formatGoal(goal, totalCents) {
  if (!goal) return null;

  const targetCents = Number(goal.target_amount_cents);

  return {
    title: goal.title,
    targetCents,
    remainingCents: targetCents - totalCents
  };
}

export async function getStreamDeckStats(request, env) {
  const denied = await requireStreamDeckToken(request, env);
  if (denied) return denied;

  const [
    creatorsResult,
    totalsResult,
    lastResult,
    goalsResult,
    globalGoalsResult
  ] = await env.DB.batch([
    // 1. Créateurs actifs
    env.DB.prepare(`
      SELECT id, slug, twitch_id, twitch_display_name, twitch_profile_image_url,
             hide_donation_details_until_overlay
      FROM creators
      WHERE archived = 0 AND active = 1
      ORDER BY display_order ASC,
               twitch_display_name COLLATE NOCASE ASC
    `),

    // 2. Totaux par créateur
    env.DB.prepare(`
      SELECT creator_id,
             COUNT(*) AS donation_count,
             COALESCE(SUM(amount_cents), 0) AS total_cents
      FROM interaction_donations
      WHERE ${DONATION_FILTER}
      GROUP BY creator_id
    `),

    // 3. Dernier don de chaque créateur
    env.DB.prepare(`
      SELECT id, creator_id, donor_name, amount_cents,
             donated_at, revealed_at
      FROM (
        SELECT id, creator_id, donor_name, amount_cents,
               donated_at, revealed_at,
               ROW_NUMBER() OVER (
                 PARTITION BY creator_id ORDER BY id DESC
               ) AS rn
        FROM interaction_donations
        WHERE ${DONATION_FILTER}
      )
      WHERE rn = 1
    `),

    // 4. Objectifs "créateur" + "partagés"
    env.DB.prepare(`
      SELECT goals.id, goals.title, goals.target_amount_cents,
             goals.display_order, goals.creator_id AS creator_id
      FROM goals
      WHERE goals.scope_type = 'creator'
        AND goals.creator_id IS NOT NULL
        AND goals.is_visible = 1
        AND goals.status != 'cancelled'

      UNION ALL

      SELECT goals.id, goals.title, goals.target_amount_cents,
             goals.display_order, goal_creators.creator_id
      FROM goals
      JOIN goal_creators ON goal_creators.goal_id = goals.id
      WHERE goals.scope_type = 'shared'
        AND goals.is_visible = 1
        AND goals.status != 'cancelled'

      ORDER BY target_amount_cents ASC, display_order ASC, id ASC
    `),

    // 5. Objectifs globaux
    env.DB.prepare(`
      SELECT title, target_amount_cents
      FROM goals
      WHERE scope_type = 'global'
        AND is_visible = 1
        AND status != 'cancelled'
      ORDER BY target_amount_cents ASC, display_order ASC, id ASC
    `)
  ]);

  // Totaux
  const totals = new Map();
  let globalTotal = 0;
  let globalCount = 0;

  for (const row of totalsResult.results ?? []) {
    const totalCents = Number(row.total_cents ?? 0);
    const donationCount = Number(row.donation_count ?? 0);

    globalTotal += totalCents;
    globalCount += donationCount;

    if (row.creator_id !== null) {
      totals.set(Number(row.creator_id), {
        totalCents,
        donationCount
      });
    }
  }

  const creatorRows = creatorsResult.results ?? [];

  const liveStreams = await getLiveStreams(
    env,
    creatorRows.map(c => c.twitch_id)
  );

  const hideById = new Map(
    creatorRows.map(c => [
      Number(c.id),
      Number(c.hide_donation_details_until_overlay) === 1
    ])
  );

  // Derniers dons
  const lastByCreator = new Map();
  let globalLast = null;

  for (const row of lastResult.results ?? []) {
    if (row.creator_id !== null) {
      lastByCreator.set(Number(row.creator_id), row);
    }

    if (!globalLast || Number(row.id) > Number(globalLast.id)) {
      globalLast = row;
    }
  }

  // Objectifs groupés par créateur
  const goalsByCreator = new Map();

  for (const goal of goalsResult.results ?? []) {
    const id = Number(goal.creator_id);
    if (!goalsByCreator.has(id)) goalsByCreator.set(id, []);
    goalsByCreator.get(id).push(goal);
  }

  const creators = creatorRows.map(c => {
    const id = Number(c.id);
    const { totalCents, donationCount } =
      totals.get(id) ?? { totalCents: 0, donationCount: 0 };

    // Même règle que le site : atteint si total >= cible
    const next = (goalsByCreator.get(id) ?? []).find(
      g => Number(g.target_amount_cents) > totalCents
    );

    return {
      id,
      slug: c.slug,
      name: c.twitch_display_name,
      avatarUrl: c.twitch_profile_image_url ?? null,
      live: liveStreams ? liveStreams.has(String(c.twitch_id)) : null,
      viewers: liveStreams?.get(String(c.twitch_id))?.viewers ?? null,
      totalCents,
      donationCount,
      lastDonation: formatLastDonation(
        lastByCreator.get(id),
        hideById.get(id)
      ),
      nextGoal: formatGoal(next, totalCents)
    };
  });

  // Prochain objectif global
  const nextGlobal = (globalGoalsResult.results ?? []).find(
    g => Number(g.target_amount_cents) > globalTotal
  );

  // Don global : masqué par défaut si créateur inconnu
  const globalHide =
    globalLast?.creator_id == null
      ? true
      : (hideById.get(Number(globalLast.creator_id)) ?? true);

  return json({
    updatedAt: new Date().toISOString(),
    currency: "EUR",
    global: {
      totalCents: globalTotal,
      donationCount: globalCount,
      lastDonation: formatLastDonation(globalLast, globalHide),
      nextGoal: formatGoal(nextGlobal, globalTotal)
    },
    creators
  });
}