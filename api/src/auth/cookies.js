export function getCookie(request, name) {
  const cookieHeader =
    request.headers.get("Cookie") ?? "";

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] =
      part.trim().split("=");

    if (rawName !== name) {
      continue;
    }

    try {
      return decodeURIComponent(
        rawValue.join("=")
      );
    } catch {
      return null;
    }
  }

  return null;
}

export function makeCookie(
  name,
  value,
  {
    maxAge,
    httpOnly = false,
    secure = true,
    sameSite = "Lax",
    path = "/"
  } = {}
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `SameSite=${sameSite}`
  ];

  if (Number.isFinite(maxAge)) {
    parts.push(
      `Max-Age=${Math.floor(maxAge)}`
    );
  }

  if (httpOnly) {
    parts.push("HttpOnly");
  }

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function withCookie(response, cookie) {
  const result = new Response(
    response.body,
    response
  );

  result.headers.append(
    "Set-Cookie",
    cookie
  );

  return result;
}