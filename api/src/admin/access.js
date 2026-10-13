import {
  requireAuthentication
} from "../auth/permissions.js";

import {
  forbidden
} from "../shared/responses.js";

export async function requireAdminAccess(
  request,
  env
) {
  const authentication =
    await requireAuthentication(
      request,
      env
    );

  if (!authentication.allowed) {
    return authentication;
  }

  if (
    !authentication.user?.permissions
      ?.isSuperAdmin
  ) {
    return {
      allowed: false,
      response: forbidden(
        "Cette action est réservée aux Admins."
      )
    };
  }

  return authentication;
}
