export function applyCors(request, env, response) {
  const origin = request.headers.get("Origin");

  const allowedOrigins = String(
    env.ALLOWED_ORIGINS ??
    env.ALLOWED_ORIGIN ??
    env.SITE_URL ??
    ""
  )
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

  const result = new Response(
    response.body,
    response
  );

  if (
    origin &&
    allowedOrigins.includes(origin)
  ) {
    result.headers.set(
      "Access-Control-Allow-Origin",
      origin
    );
  }

  result.headers.set(
    "Access-Control-Allow-Credentials",
    "true"
  );

  result.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );

  result.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Bootstrap-Secret"
  );

  result.headers.set(
    "Access-Control-Max-Age",
    "86400"
  );

  result.headers.append("Vary", "Origin");

  return result;
}

export function handleOptions(request, env) {
  return applyCors(
    request,
    env,
    new Response(null, { status: 204 })
  );
}