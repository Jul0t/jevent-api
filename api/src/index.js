import {
  json,
  notFound,
  internalError
} from "./shared/responses.js";

import {
  applyCors,
  handleOptions
} from "./shared/cors.js";

import {
  getCurrentUserRoute,
  logoutRoute
} from "./auth/routes.js";

import {
  startTwitchLogin,
  finishTwitchLogin
} from "./auth/twitch.js";

import {
  receiveTwitchStats
} from "./internal/twitch-stats.js";

import {
  searchCreatorRoute,
  createCreatorRoute,
  listAdminCreatorsRoute
} from "./creators/routes.js";

import {
  getCreatorPanel,
  completeCreatorOnboarding,
  updateCreatorStreamlabsGoalUrl
} from "./creators/panel.js";

import {
  listCreatorDonations,
  updateDonationHistorySettings,
  revealCreatorDonation,
  deleteCreatorDonationTests
} from "./creators/donation-history.js";

import {
  getDescriptionWorkspace,
  saveDescriptionDraft,
  submitDescription,
  cancelDescriptionSubmission,
  listDescriptionsForModeration,
  approveDescription,
  rejectDescription,
} from "./creators/descriptions.js";

import {
  listPublicCreators,
  getPublicCreatorBySlug,
  redirectToCreatorDonation
} from "./creators/public.js";

import {
  listPublicProgram,
  getPublicProgramEntry,
  listPublicProgramByCreator
} from "./program/public.js";

import {
  listManageableProgram,
  createProgramEntry,
  updateProgramEntry,
  cancelProgramEntry,
  deleteProgramEntry
} from "./program/manage.js";

import {
  listManageableGoals,
  createGoal,
  updateGoal,
  deleteGoal
} from "./goals/manage.js";

import {
  listPublicGoals,
} from "./goals/public.js";

import {
  listStreamlabsMembers,
  importStreamlabsMember,
  listAdminCreators,
  updateAdminCreator
} from "./admin/creators.js";

import {
  getAdminStatsOverview
} from "./admin/stats.js";

import {
  handleTwitchEventSub
} from "./twitch/eventsub.js";

import {
  startChatAuthorization,
  finishChatAuthorization
} from "./twitch/chat-auth.js";

import {
  listTwitchChannels
} from "./internal/twitch-channels.js";

import {
  getAdminDashboardPreferences,
  updateAdminDashboardPreferences
} from "./admin/dashboard-preferences.js";

import {
  listAdminUsers,
  updateUserSuperAdminRole
} from "./admin/users.js";

import {
  redirectToPublicShop
} from "./shop/public.js";

import {
  ingestTwitchViewerStats
} from "./internal/twitch-viewer-stats.js";

import {
  getPrivateAccountProfile
} from "./account/profile.js";

import {
  listAdminBadges,
  createAdminBadge,
  updateAdminBadge,
  setAdminBadgeActive,
  deleteAdminBadge,
  listAdminBadgeAssignments,
  updateAdminBadgeAssignment
} from "./admin/badges.js";

import {
  updateBadgeShowcase
} from "./account/badge-showcase.js";

import {
  getInteractionAccount
} from "./interactions/account.js";

import {
  listAdminInteractions,
  createAdminInteraction,
  updateAdminInteraction,
  deleteAdminInteraction
} from "./admin/interactions.js";

import {
  createInteractionEffect,
  getNextInteractionEffect,
  completeInteractionEffect
} from "./interactions/effects.js";

import {
  listAdminInteractionUploads,
  getAdminInteractionUploadFile,
  moderateAdminInteractionUpload
} from "./admin/interaction-uploads.js";

import {
  createInteractionEffect
} from "./interactions/effects.js";

import {
  syncStreamlabsCharityDonations
} from "./interactions/streamlabs-donations.js";

import {
  listCreatorInteractionQueue,
  getCreatorInteractionQueueFile,
  updateCreatorInteractionQueueItem
} from "./interactions/creator-queue.js";

import {
  listCreatorRaffles,
  createCreatorRaffle,
  cancelCreatorRaffle,
  drawCreatorRaffleWinner,
  deleteCreatorRaffle,
  getPublicRaffleOverlay,
  processAutomaticRaffles
} from "./raffles/manage.js";

import {
  getPublicCreatorRaffle
} from "./raffles/public.js";

import {
  listCreatorOverlays,
  createCreatorOverlay,
  rotateCreatorOverlayToken,
  getPublicOverlay,
  updateCreatorOverlaySettings,
} from "./overlays/manage.js";

import {
  listDonationAlerts,
  createDonationAlert,
  updateDonationAlert,
  deleteDonationAlert,

  createDonationAlertVariant,
  updateDonationAlertVariant,
  deleteDonationAlertVariant,

  uploadDonationAlertVariantMedia,
  deleteDonationAlertVariantMedia,
  getDonationAlertVariantMedia,
  getPublicDonationAlertRules

} from "./overlays/donation-alerts.js";

import {
  getNextDonationDelivery,
  revealDonationDelivery,
  completeDonationDelivery
} from "./overlays/donation-delivery.js";

import {
  getPublicDonationAlertMedia
} from "./overlays/donation-public-media.js";

import {
  createDonationOverlayTest
} from "./overlays/donation-tests.js";

export {
  RaffleTimer
} from "./raffles/timer.js";

async function route(request, env) {
  const url = new URL(request.url);

  /* ========================================================
     ACCOUNT
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/account/profile"
  ) {
    return getPrivateAccountProfile(
      request,
      env
    );
  }

  if (
    request.method === "PUT" &&
    url.pathname ===
    "/api/account/badge-showcase"
  ) {
    return updateBadgeShowcase(
      request,
      env
    );
  }

  /* ========================================================
     ADMIN
     ======================================================== */

  const badgeAssignmentsMatch =
    url.pathname.match(
      /^\/api\/admin\/badges\/([^/]+)\/assignments$/
    );

  if (
    request.method === "GET" &&
    badgeAssignmentsMatch
  ) {
    return listAdminBadgeAssignments(
      request,
      env,
      decodeURIComponent(
        badgeAssignmentsMatch[1]
      )
    );
  }

  const badgeAssignmentUserMatch =
    url.pathname.match(
      /^\/api\/admin\/badges\/([^/]+)\/assignments\/(\d+)$/
    );

  if (
    request.method === "PUT" &&
    badgeAssignmentUserMatch
  ) {
    return updateAdminBadgeAssignment(
      request,
      env,

      decodeURIComponent(
        badgeAssignmentUserMatch[1]
      ),

      badgeAssignmentUserMatch[2]
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/admin/badges"
  ) {
    return listAdminBadges(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
    "/api/admin/badges"
  ) {
    return createAdminBadge(
      request,
      env
    );
  }

  const badgeActiveMatch =
    url.pathname.match(
      /^\/api\/admin\/badges\/([^/]+)\/active$/
    );

  if (
    request.method === "PUT" &&
    badgeActiveMatch
  ) {
    return setAdminBadgeActive(
      request,
      env,
      decodeURIComponent(
        badgeActiveMatch[1]
      )
    );
  }

  const adminBadgeMatch =
    url.pathname.match(
      /^\/api\/admin\/badges\/([^/]+)$/
    );

  if (
    request.method === "PUT" &&
    adminBadgeMatch
  ) {
    return updateAdminBadge(
      request,
      env,
      decodeURIComponent(
        adminBadgeMatch[1]
      )
    );
  }

  if (
    request.method === "DELETE" &&
    adminBadgeMatch
  ) {
    return deleteAdminBadge(
      request,
      env,
      decodeURIComponent(
        adminBadgeMatch[1]
      )
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/admin/streamlabs/members"
  ) {
    return listStreamlabsMembers(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
    "/api/admin/streamlabs/import"
  ) {
    return importStreamlabsMember(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/admin/stats/overview"
  ) {
    return getAdminStatsOverview(
      request,
      env
    );
  }
  if (
    request.method === "GET" &&
    url.pathname === "/api/admin/creators"
  ) {
    return listAdminCreators(
      request,
      env
    );
  }

  const adminCreatorMatch =
    url.pathname.match(
      /^\/api\/admin\/creators\/(\d+)$/
    );

  if (
    request.method === "PUT" &&
    adminCreatorMatch
  ) {
    return updateAdminCreator(
      request,
      env,
      adminCreatorMatch[1]
    );
  }

  const dashboardPathname =
    new URL(request.url).pathname;

  if (
    request.method === "GET" &&
    dashboardPathname ===
    "/api/admin/dashboard/preferences"
  ) {
    return getAdminDashboardPreferences(
      request,
      env
    );
  }

  if (
    request.method === "PUT" &&
    dashboardPathname ===
    "/api/admin/dashboard/preferences"
  ) {
    return updateAdminDashboardPreferences(
      request,
      env
    );
  }

  const adminUsersUrl =
    new URL(request.url);

  if (
    request.method === "GET" &&
    adminUsersUrl.pathname ===
    "/api/admin/users"
  ) {
    return listAdminUsers(
      request,
      env
    );
  }

  const superAdminRoleMatch =
    adminUsersUrl.pathname.match(
      /^\/api\/admin\/users\/(\d+)\/super-admin$/
    );

  if (
    request.method === "PUT" &&
    superAdminRoleMatch
  ) {
    return updateUserSuperAdminRole(
      request,
      env,
      superAdminRoleMatch[1]
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/admin/interactions"
  ) {
    return listAdminInteractions(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
    "/api/admin/interactions"
  ) {
    return createAdminInteraction(
      request,
      env
    );
  }

  const adminInteractionMatch =
    url.pathname.match(
      /^\/api\/admin\/interactions\/([^/]+)$/
    );

  if (
    request.method === "PUT" &&
    adminInteractionMatch
  ) {
    return updateAdminInteraction(
      request,
      env,
      decodeURIComponent(
        adminInteractionMatch[1]
      )
    );
  }

  if (
    request.method === "DELETE" &&
    adminInteractionMatch
  ) {
    return deleteAdminInteraction(
      request,
      env,
      decodeURIComponent(
        adminInteractionMatch[1]
      )
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/admin/interaction-uploads"
  ) {
    return listAdminInteractionUploads(
      request,
      env
    );
  }

  const adminInteractionUploadFileMatch =
    url.pathname.match(
      /^\/api\/admin\/interaction-uploads\/([^/]+)\/file$/
    );

  if (
    request.method === "GET" &&
    adminInteractionUploadFileMatch
  ) {
    return getAdminInteractionUploadFile(
      request,
      env,
      decodeURIComponent(
        adminInteractionUploadFileMatch[1]
      )
    );
  }

  const adminInteractionModerationMatch =
    url.pathname.match(
      /^\/api\/admin\/interaction-uploads\/([^/]+)\/moderate$/
    );

  if (
    request.method === "PUT" &&
    adminInteractionModerationMatch
  ) {
    return moderateAdminInteractionUpload(
      request,
      env,
      decodeURIComponent(
        adminInteractionModerationMatch[1]
      )
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/creator-panel/donations"
  ) {
    return listCreatorDonations(
      request,
      env
    );
  }

  if (
    request.method === "PATCH" &&
    url.pathname ===
    "/api/creator-panel/donations/settings"
  ) {
    return updateDonationHistorySettings(
      request,
      env
    );
  }

  const revealCreatorDonationMatch =
    url.pathname.match(
      /^\/api\/creator-panel\/donations\/(-?\d+)\/reveal$/
    );

  if (
    request.method === "POST" &&
    revealCreatorDonationMatch
  ) {
    return revealCreatorDonation(
      request,
      env,
      revealCreatorDonationMatch[1]
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/creator-panel/interactions/queue"
  ) {
    return listCreatorInteractionQueue(
      request,
      env
    );
  }

  const creatorQueueFileMatch =
    url.pathname.match(
      /^\/api\/creator-panel\/interactions\/queue\/([^/]+)\/file$/
    );

  if (
    request.method === "GET" &&
    creatorQueueFileMatch
  ) {
    return getCreatorInteractionQueueFile(
      request,
      env,
      decodeURIComponent(
        creatorQueueFileMatch[1]
      )
    );
  }

  const creatorQueueItemMatch =
    url.pathname.match(
      /^\/api\/creator-panel\/interactions\/queue\/([^/]+)$/
    );

  if (
    request.method === "PUT" &&
    creatorQueueItemMatch
  ) {
    return updateCreatorInteractionQueueItem(
      request,
      env,
      decodeURIComponent(
        creatorQueueItemMatch[1]
      )
    );
  }

  /* ========================================================
     SANTÉ DE L’API
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname === "/api/health"
  ) {
    return json({
      success: true,
      application: "JEvent 26 API",
      timestamp: new Date().toISOString()
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/database-health"
  ) {
    const database = await env.DB.prepare(`
      SELECT 1 AS healthy
    `).first();

    return json({
      success: true,
      database:
        Number(database?.healthy) === 1
    });
  }

  /* ========================================================
     AUTHENTIFICATION
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/auth/twitch/start"
  ) {
    return startTwitchLogin(request, env);
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/auth/twitch/callback"
  ) {
    return finishTwitchLogin(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/auth/me"
  ) {
    return getCurrentUserRoute(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/auth/logout"
  ) {
    return logoutRoute(request, env);
  }

  if (
    request.method === "PUT" &&
    url.pathname ===
    "/api/creator-panel/streamlabs"
  ) {
    return updateCreatorStreamlabsGoalUrl(
      request,
      env
    );
  }

  /* ========================================================
     CRÉATEURS PUBLICS
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname === "/api/creators"
  ) {
    return listPublicCreators(
      request,
      env
    );
  }

  const publicCreatorMatch =
    url.pathname.match(
      /^\/api\/creators\/([^/]+)$/
    );

  if (
    request.method === "GET" &&
    publicCreatorMatch
  ) {
    return getPublicCreatorBySlug(
      request,
      env,
      decodeURIComponent(
        publicCreatorMatch[1]
      )
    );
  }

  /* ========================================================
     REDIRECTION DES DONS
     ======================================================== */

  const creatorDonationMatch =
    url.pathname.match(
      /^\/don\/([^/]+)$/
    );

  if (
    request.method === "GET" &&
    creatorDonationMatch
  ) {
    return redirectToCreatorDonation(
      request,
      env,
      decodeURIComponent(
        creatorDonationMatch[1]
      )
    );
  }

  /* ========================================================
     ADMINISTRATION DES CRÉATEURS
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/admin/twitch/search"
  ) {
    return searchCreatorRoute(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/admin/creators"
  ) {
    return listAdminCreatorsRoute(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
    "/api/admin/creators"
  ) {
    return createCreatorRoute(
      request,
      env
    );
  }

  /* ========================================================
     PANEL CRÉATEUR
     ======================================================== */

  if (
    request.method === "DELETE" &&
    url.pathname ===
    "/api/creator-panel/donation-tests"
  ) {
    return deleteCreatorDonationTests(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/creator-panel"
  ) {
    return getCreatorPanel(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
    "/api/creator-panel/onboarding/complete"
  ) {
    return completeCreatorOnboarding(
      request,
      env
    );
  }
  /* ========================================================
     RAFFLES
     ======================================================== */

  const deleteCreatorRaffleMatch =
    url.pathname.match(
      /^\/api\/creator-panel\/raffles\/([^/]+)$/
    );

  if (
    request.method === "DELETE" &&
    deleteCreatorRaffleMatch
  ) {
    return deleteCreatorRaffle(
      request,
      env,
      decodeURIComponent(
        deleteCreatorRaffleMatch[1]
      )
    );
  }

  if (
    url.pathname ===
    "/api/creator-panel/raffles"
  ) {
    if (request.method === "GET") {
      return listCreatorRaffles(
        request,
        env
      );
    }

    if (request.method === "POST") {
      return createCreatorRaffle(
        request,
        env
      );
    }
  }

  const cancelRaffleMatch =
    url.pathname.match(
      /^\/api\/creator-panel\/raffles\/([^/]+)\/cancel$/
    );

  if (
    request.method === "POST" &&
    cancelRaffleMatch
  ) {
    return cancelCreatorRaffle(
      request,
      env,
      decodeURIComponent(
        cancelRaffleMatch[1]
      )
    );
  }

  const drawRaffleMatch =
    url.pathname.match(
      /^\/api\/creator-panel\/raffles\/([^/]+)\/draw$/
    );

  if (
    request.method === "POST" &&
    drawRaffleMatch
  ) {
    return drawCreatorRaffleWinner(
      request,
      env,
      decodeURIComponent(
        drawRaffleMatch[1]
      )
    );
  }

  const publicCreatorRaffleMatch =
    url.pathname.match(
      /^\/api\/raffles\/creator\/([^/]+)$/
    );

  if (
    request.method === "GET" &&
    publicCreatorRaffleMatch
  ) {
    return getPublicCreatorRaffle(
      request,
      env,
      decodeURIComponent(
        publicCreatorRaffleMatch[1]
      )
    );
  }

  /* ========================================================
     DESCRIPTIONS DES CRÉATEURS
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/creator-panel/description"
  ) {
    return getDescriptionWorkspace(
      request,
      env
    );
  }

  if (
    request.method === "PUT" &&
    url.pathname ===
    "/api/creator-panel/description/draft"
  ) {
    return saveDescriptionDraft(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
    "/api/creator-panel/description/submit"
  ) {
    return submitDescription(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
    "/api/creator-panel/description/cancel"
  ) {
    return cancelDescriptionSubmission(
      request,
      env
    );
  }
  /* ========================================================
     TWITCH
     ======================================================== */

  if (
    request.method === "POST" &&
    url.pathname === "/api/twitch/eventsub"
  ) {
    return handleTwitchEventSub(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/twitch/chat/authorize"
  ) {
    return startChatAuthorization(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/auth/twitch/chat/callback"
  ) {
    return finishChatAuthorization(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/internal/twitch/stats"
  ) {
    return receiveTwitchStats(request, env);
  }

  if (
    request.method === "GET" &&
    new URL(request.url).pathname ===
    "/api/internal/twitch/channels"
  ) {
    return listTwitchChannels(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
    "/api/internal/twitch/viewer-stats"
  ) {
    return ingestTwitchViewerStats(
      request,
      env
    );
  }

  /* ========================================================
     MODÉRATION DES DESCRIPTIONS
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/moderation/descriptions"
  ) {
    return listDescriptionsForModeration(
      request,
      env
    );
  }

  const approveDescriptionMatch =
    url.pathname.match(
      /^\/api\/moderation\/descriptions\/([^/]+)\/approve$/
    );

  if (
    request.method === "POST" &&
    approveDescriptionMatch
  ) {
    return approveDescription(
      request,
      env,
      decodeURIComponent(
        approveDescriptionMatch[1]
      )
    );
  }

  const rejectDescriptionMatch =
    url.pathname.match(
      /^\/api\/moderation\/descriptions\/([^/]+)\/reject$/
    );

  if (
    request.method === "POST" &&
    rejectDescriptionMatch
  ) {
    return rejectDescription(
      request,
      env,
      decodeURIComponent(
        rejectDescriptionMatch[1]
      )
    );
  }

  /* ========================================================
     GESTION DES OBJECTIFS
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname === "/api/goals/manage"
  ) {
    return listManageableGoals(
      request,
      env
    );
  }

  const publicCreatorGoalsMatch =
    url.pathname.match(
      /^\/api\/goals\/creator\/([^/]+)$/
    );

  if (
    request.method === "GET" &&
    publicCreatorGoalsMatch
  ) {
    return listPublicGoals(
      request,
      env,
      decodeURIComponent(
        publicCreatorGoalsMatch[1]
      )
    );
  }


  if (
    request.method === "POST" &&
    url.pathname === "/api/goals/manage"
  ) {
    return createGoal(request, env);
  }

  const goalMatch =
    url.pathname.match(
      /^\/api\/goals\/manage\/([^/]+)$/
    );

  if (
    request.method === "PUT" &&
    goalMatch
  ) {
    return updateGoal(
      request,
      env,
      decodeURIComponent(goalMatch[1])
    );
  }

  if (
    request.method === "DELETE" &&
    goalMatch
  ) {
    return deleteGoal(
      request,
      env,
      decodeURIComponent(goalMatch[1])
    );
  }


  /* ========================================================
     GESTION DU PROGRAMME

     Ces routes doivent obligatoirement être placées avant
     la route dynamique publique /api/program/:publicId.
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname === "/api/program/manage"
  ) {
    return listManageableProgram(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/program/manage"
  ) {
    return createProgramEntry(
      request,
      env
    );
  }

  const cancelProgramEntryMatch =
    url.pathname.match(
      /^\/api\/program\/manage\/([^/]+)\/cancel$/
    );

  if (
    request.method === "POST" &&
    cancelProgramEntryMatch
  ) {
    return cancelProgramEntry(
      request,
      env,
      decodeURIComponent(
        cancelProgramEntryMatch[1]
      )
    );
  }

  const managedProgramEntryMatch =
    url.pathname.match(
      /^\/api\/program\/manage\/([^/]+)$/
    );

  if (
    request.method === "PUT" &&
    managedProgramEntryMatch
  ) {
    return updateProgramEntry(
      request,
      env,
      decodeURIComponent(
        managedProgramEntryMatch[1]
      )
    );
  }

  if (
    request.method === "DELETE" &&
    managedProgramEntryMatch
  ) {
    return deleteProgramEntry(
      request,
      env,
      decodeURIComponent(
        managedProgramEntryMatch[1]
      )
    );
  }

  /* ========================================================
     OVERLAYS
     ======================================================== */

  const revealDonationDeliveryMatch =
    url.pathname.match(
      /^\/api\/overlays\/([^/]+)\/donations\/([^/]+)\/reveal$/
    );

  if (
    request.method === "POST" &&
    revealDonationDeliveryMatch
  ) {
    return revealDonationDelivery(
      request,
      env,
      decodeURIComponent(
        revealDonationDeliveryMatch[1]
      ),
      decodeURIComponent(
        revealDonationDeliveryMatch[2]
      )
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
    "/api/creator-panel/donation-alerts/test"
  ) {
    return createDonationOverlayTest(
      request,
      env
    );
  }

  const publicDonationAlertMediaMatch =
    url.pathname.match(
      /^\/api\/overlays\/([^/]+)\/donation-alerts\/([^/]+)\/variants\/([^/]+)\/media\/(image|video|sound)$/
    );

  if (
    request.method === "GET" &&
    publicDonationAlertMediaMatch
  ) {
    return getPublicDonationAlertMedia(
      request,
      env,
      decodeURIComponent(
        publicDonationAlertMediaMatch[1]
      ),
      decodeURIComponent(
        publicDonationAlertMediaMatch[2]
      ),
      decodeURIComponent(
        publicDonationAlertMediaMatch[3]
      ),
      publicDonationAlertMediaMatch[4]
    );
  }

  const nextDonationDeliveryMatch =
    url.pathname.match(
      /^\/api\/overlays\/([^/]+)\/donations\/next$/
    );

  if (
    request.method === "POST" &&
    nextDonationDeliveryMatch
  ) {
    return getNextDonationDelivery(
      request,
      env,
      decodeURIComponent(
        nextDonationDeliveryMatch[1]
      )
    );
  }

  const completeDonationDeliveryMatch =
    url.pathname.match(
      /^\/api\/overlays\/([^/]+)\/donations\/([^/]+)\/complete$/
    );

  if (
    request.method === "POST" &&
    completeDonationDeliveryMatch
  ) {
    return completeDonationDelivery(
      request,
      env,

      decodeURIComponent(
        completeDonationDeliveryMatch[1]
      ),

      decodeURIComponent(
        completeDonationDeliveryMatch[2]
      )
    );
  }

  const publicDonationOverlayMediaMatch =
    url.pathname.match(
      /^\/api\/overlays\/dons\/([^/]+)\/media\/([^/]+)\/(image|video|sound)$/
    );

  if (
    request.method === "GET" &&
    publicDonationOverlayMediaMatch
  ) {
    return getPublicDonationAlertMedia(
      request,
      env,
      decodeURIComponent(
        publicDonationOverlayMediaMatch[1]
      ),
      decodeURIComponent(
        publicDonationOverlayMediaMatch[2]
      ),
      publicDonationOverlayMediaMatch[3]
    );
  }

  const publicOverlayMatch =
    url.pathname.match(
      /^\/api\/overlays\/([^/]+)$/
    );

  if (
    request.method === "GET" &&
    publicOverlayMatch
  ) {
    return getPublicOverlay(
      request,
      env,
      decodeURIComponent(
        publicOverlayMatch[1]
      )
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/creator-panel/overlays"
  ) {
    return listCreatorOverlays(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
    "/api/creator-panel/overlays"
  ) {
    return createCreatorOverlay(
      request,
      env
    );
  }

  const rotateOverlayMatch =
    url.pathname.match(
      /^\/api\/creator-panel\/overlays\/([^/]+)\/rotate$/
    );

  const overlaySettingsMatch =
    url.pathname.match(
      /^\/api\/creator-panel\/overlays\/([^/]+)\/settings$/
    );

  if (
    request.method === "PATCH" &&
    overlaySettingsMatch
  ) {
    return updateCreatorOverlaySettings(
      request,
      env,
      decodeURIComponent(
        overlaySettingsMatch[1]
      )
    );
  }

  if (
    request.method === "POST" &&
    rotateOverlayMatch
  ) {
    return rotateCreatorOverlayToken(
      request,
      env,
      decodeURIComponent(
        rotateOverlayMatch[1]
      )
    );
  }

  if (
    url.pathname ===
    "/api/creator-panel/donation-alerts"
  ) {
    if (request.method === "GET") {
      return listDonationAlerts(
        request,
        env
      );
    }

    if (request.method === "POST") {
      return createDonationAlert(
        request,
        env
      );
    }
  }

  const donationAlertVariantMediaMatch =
    url.pathname.match(
      /^\/api\/creator-panel\/donation-alerts\/([^/]+)\/variants\/([^/]+)\/media\/(image|video|sound)$/
    );

  if (donationAlertVariantMediaMatch) {
    const rulePublicId =
      decodeURIComponent(
        donationAlertVariantMediaMatch[1]
      );

    const variantPublicId =
      decodeURIComponent(
        donationAlertVariantMediaMatch[2]
      );

    const mediaKind =
      donationAlertVariantMediaMatch[3];

    if (
      request.method === "GET"
    ) {
      return getDonationAlertVariantMedia(
        request,
        env,
        decodeURIComponent(
          donationAlertVariantMediaMatch[1]
        ),
        decodeURIComponent(
          donationAlertVariantMediaMatch[2]
        ),
        donationAlertVariantMediaMatch[3]
      );
    }

    if (request.method === "POST") {
      return uploadDonationAlertVariantMedia(
        request,
        env,
        rulePublicId,
        variantPublicId,
        mediaKind
      );
    }

    if (request.method === "DELETE") {
      return deleteDonationAlertVariantMedia(
        request,
        env,
        rulePublicId,
        variantPublicId,
        mediaKind
      );
    }
  }

  const donationAlertMatch =
    url.pathname.match(
      /^\/api\/creator-panel\/donation-alerts\/([^/]+)$/
    );

  if (donationAlertMatch) {
    const publicId =
      decodeURIComponent(
        donationAlertMatch[1]
      );

    if (request.method === "PUT") {
      return updateDonationAlert(
        request,
        env,
        publicId
      );
    }

    if (request.method === "DELETE") {
      return deleteDonationAlert(
        request,
        env,
        publicId
      );
    }
  }

  const donationAlertVariantMatch =
    url.pathname.match(
      /^\/api\/creator-panel\/donation-alerts\/([^/]+)\/variants\/([^/]+)$/
    );

  if (donationAlertVariantMatch) {
    const rulePublicId =
      decodeURIComponent(
        donationAlertVariantMatch[1]
      );

    const variantPublicId =
      decodeURIComponent(
        donationAlertVariantMatch[2]
      );

    if (request.method === "PUT") {
      return updateDonationAlertVariant(
        request,
        env,
        rulePublicId,
        variantPublicId
      );
    }

    if (request.method === "DELETE") {
      return deleteDonationAlertVariant(
        request,
        env,
        rulePublicId,
        variantPublicId
      );
    }
  }

  const donationAlertVariantsMatch =
    url.pathname.match(
      /^\/api\/creator-panel\/donation-alerts\/([^/]+)\/variants$/
    );

  if (
    request.method === "POST" &&
    donationAlertVariantsMatch
  ) {
    return createDonationAlertVariant(
      request,
      env,
      decodeURIComponent(
        donationAlertVariantsMatch[1]
      )
    );
  }

  /* ========================================================
     INTERACTIONS
     ======================================================== */

  if (
    request.method === "POST" &&
    url.pathname ===
    "/api/interactions/effects"
  ) {
    return createInteractionEffect(
      request,
      env
    );
  }

  const nextEffectMatch =
    url.pathname.match(
      /^\/api\/overlays\/([^/]+)\/effects\/next$/
    );

  if (
    request.method === "POST" &&
    nextEffectMatch
  ) {
    return getNextInteractionEffect(
      request,
      env,
      decodeURIComponent(
        nextEffectMatch[1]
      )
    );
  }

  const completeEffectMatch =
    url.pathname.match(
      /^\/api\/overlays\/([^/]+)\/effects\/([^/]+)\/complete$/
    );

  if (
    request.method === "POST" &&
    completeEffectMatch
  ) {
    return completeInteractionEffect(
      request,
      env,
      decodeURIComponent(
        completeEffectMatch[1]
      ),
      decodeURIComponent(
        completeEffectMatch[2]
      )
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
    "/api/interactions/account"
  ) {
    return getInteractionAccount(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
    "/api/interactions/uploads"
  ) {
    return createInteractionUpload(
      request,
      env
    );
  }

  /* ========================================================
     PROGRAMME PUBLIC
     ======================================================== */

  const creatorProgramMatch =
    url.pathname.match(
      /^\/api\/program\/creator\/([^/]+)$/
    );

  if (
    request.method === "GET" &&
    creatorProgramMatch
  ) {
    return listPublicProgramByCreator(
      request,
      env,
      decodeURIComponent(
        creatorProgramMatch[1]
      )
    );
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/program"
  ) {
    return listPublicProgram(
      request,
      env
    );
  }

  const publicProgramEntryMatch =
    url.pathname.match(
      /^\/api\/program\/([^/]+)$/
    );

  if (
    request.method === "GET" &&
    publicProgramEntryMatch
  ) {
    return getPublicProgramEntry(
      request,
      env,
      decodeURIComponent(
        publicProgramEntryMatch[1]
      )
    );
  }

  return notFound();
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    const shopPathname =
      new URL(request.url).pathname;

    if (
      request.method === "GET" &&
      shopPathname === "/api/shop"
    ) {
      return redirectToPublicShop(
        request,
        env
      );
    }

    try {
      const response = await route(
        request,
        env
      );

      return applyCors(
        request,
        env,
        response
      );
    } catch (error) {
      console.error(error);

      return applyCors(
        request,
        env,
        internalError()
      );
    }
  },

  async scheduled(
    controller,
    env,
    ctx
  ) {
    console.log(
      "[Cron] Déclenché :",
      controller.cron
    );

    ctx.waitUntil(
      (async () => {
        /*
         * Une erreur Streamlabs ne doit jamais
         * empêcher les tirages automatiques.
         */
        try {
          await syncStreamlabsCharityDonations(
            env
          );
        } catch (error) {
          console.error(
            "[Cron] Synchronisation Streamlabs échouée :",
            error
          );
        }

        try {
          console.log(
            "[Cron] Recherche des tombolas automatiques…"
          );

          const result =
            await processAutomaticRaffles(
              env
            );

          console.log(
            "[Cron] Tirages automatiques terminés :",
            result
          );
        } catch (error) {
          console.error(
            "[Cron] Tirage automatique échoué :",
            error
          );

          throw error;
        }
      })()
    );
  }
};