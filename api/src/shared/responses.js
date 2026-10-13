export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export function redirect(destination, status = 302) {
  return new Response(null, {
    status,
    headers: {
      Location: destination,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export function notFound(
  message = "Route introuvable."
) {
  return json({ error: message }, 404);
}

export function unauthorized(
  message = "Connexion requise."
) {
  return json({ error: message }, 401);
}

export function forbidden(
  message = "Accès refusé."
) {
  return json({ error: message }, 403);
}

export function validationError(
  message,
  fields = {}
) {
  return json(
    {
      error: message,
      fields
    },
    400
  );
}

export function internalError(requestId) {
  return json(
    {
      error: "Une erreur interne est survenue.",
      requestId
    },
    500
  );
}