const TEAM_ID =
  "984964121642539025";

const PROVIDER =
  "streamlabs_charity";

const MAXIMUM_PAGES = 3;

function extractDonations(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (
    Array.isArray(payload?.data)
  ) {
    return payload.data;
  }

  if (
    Array.isArray(
      payload?.donations
    )
  ) {
    return payload.donations;
  }

  return [];
}

function extractPossibleCodes(
  message
) {
  return (
    String(message || "")
      .toUpperCase()
      .match(
        /JEV-[A-Z0-9_-]{6,40}/g
      ) ?? []
  );
}

async function findWalletFromMessage(
  env,
  message
) {
  const codes =
    [
      ...new Set(
        extractPossibleCodes(
          message
        )
      )
    ];

  for (const code of codes) {
    const wallet =
      await env.DB.prepare(`
        SELECT
          user_id,
          personal_code
        FROM interaction_wallets
        WHERE personal_code = ?
          COLLATE NOCASE
        LIMIT 1
      `)
        .bind(code)
        .first();

    if (wallet) {
      return {
        wallet,
        code:
          wallet.personal_code
      };
    }
  }

  return null;
}

async function findCreator(
  env,
  memberId
) {
  if (!memberId) {
    return null;
  }

  return env.DB.prepare(`
    SELECT id
    FROM creators
    WHERE streamlabs_member_id = ?
    LIMIT 1
  `)
    .bind(String(memberId))
    .first();
}

function normalizeDonation(row) {
  const donation =
    row?.donation ?? row;

  const providerDonationId =
    String(
      donation?.id ??
      row?.id ??
      ""
    ).trim();

  const message =
    String(
      donation?.comment?.text ??
      donation?.message ??
      ""
    ).trim();

  const donorName =
    String(
      donation?.display_name ??
      donation?.donor_name ??
      ""
    )
      .trim()
      .slice(0, 200);

  const currency =
    String(
      donation?.team_currency ??
      donation?.converted_currency ??
      donation?.original_currency ??
      "EUR"
    )
      .trim()
      .toUpperCase();

  const rawAmount =
    Number(
      donation?.team_amount ??
      donation?.converted_amount ??
      donation?.original_amount ??
      0
    );

  const amountCents =
    Number.isFinite(rawAmount)
      ? Math.max(
        0,
        Math.round(
          rawAmount * 100
        )
      )
      : 0;

  return {
    providerDonationId,
    message,
    donorName,
    currency,
    amountCents,

    memberId:
      donation?.team_member_id
        ? String(
          donation.team_member_id
        )
        : null,

    donatedAt:
      donation?.created_at ??
      null,

    rawPayloadJson:
      JSON.stringify(row)
  };
}

async function donationAlreadyExists(
  env,
  providerDonationId
) {
  const result =
    await env.DB.prepare(`
      SELECT 1 AS found
      FROM interaction_donations
      WHERE provider = ?
        AND provider_donation_id = ?
      LIMIT 1
    `)
      .bind(
        PROVIDER,
        providerDonationId
      )
      .first();

  return Boolean(result);
}

async function importDonation(
  env,
  row
) {
  const donation =
    normalizeDonation(row);

  if (
    !donation.providerDonationId ||
    donation.amountCents <= 0
  ) {
    return "invalid";
  }

  if (
    await donationAlreadyExists(
      env,
      donation.providerDonationId
    )
  ) {
    return "existing";
  }

  if (donation.currency !== "EUR") {
    console.warn(
      "[Dons] Monnaie ignorée :",
      donation.currency,
      donation.providerDonationId
    );

    return "currency";
  }

  const match =
    await findWalletFromMessage(
      env,
      donation.message
    );

  const creator =
    await findCreator(
      env,
      donation.memberId
    );

  const userId =
    match
      ? Number(match.wallet.user_id)
      : null;

  const creditedCents =
    match
      ? donation.amountCents
      : 0;

  const insertion =
    await env.DB.prepare(`
      INSERT OR IGNORE INTO
        interaction_donations (
          provider,
          provider_donation_id,
          user_id,
          creator_id,
          recognized_code,
          donor_name,
          donation_message,
          amount_cents,
          credited_cents,
          currency,
          status,
          donated_at,
          raw_payload_json,
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
        'credited',
        ?,
        ?,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `)
      .bind(
        PROVIDER,
        donation.providerDonationId,
        userId,

        creator
          ? Number(creator.id)
          : null,

        match?.code ?? null,
        donation.donorName || null,
        donation.message || null,
        donation.amountCents,
        creditedCents,
        donation.currency,
        donation.donatedAt,
        donation.rawPayloadJson
      )
      .run();

  if (
    Number(
      insertion.meta?.changes ?? 0
    ) === 0
  ) {
    return "existing";
  }

  return match
    ? "credited"
    : "unmatched";
}

async function fetchDonationPage(
  page
) {
  const url =
    new URL(
      `https://streamlabscharity.com/api/v1/teams/${TEAM_ID}/donations`
    );

  url.searchParams.set(
    "page",
    String(page)
  );

  const response =
    await fetch(
      url.toString(),
      {
        headers: {
          Accept:
            "application/json"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `Streamlabs Charity HTTP ${response.status}`
    );
  }

  return extractDonations(
    await response.json()
  );
}

export async function syncStreamlabsCharityDonations(
  env
) {
  const results = {
    received: 0,
    credited: 0,
    existing: 0,
    unmatched: 0,
    invalid: 0,
    currency: 0
  };

  for (
    let page = 1;
    page <= MAXIMUM_PAGES;
    page += 1
  ) {
    const donations =
      await fetchDonationPage(
        page
      );

    if (
      donations.length === 0
    ) {
      break;
    }

    results.received +=
      donations.length;

    for (const donation of donations) {
      try {
        const status =
          await importDonation(
            env,
            donation
          );

        if (
          Object.hasOwn(
            results,
            status
          )
        ) {
          results[status] += 1;
        }
      } catch (error) {
        console.error(
          "[Dons] Import impossible :",
          error
        );
      }
    }
  }

  console.log(
    "[Dons] Synchronisation terminée :",
    results
  );

  return results;
}