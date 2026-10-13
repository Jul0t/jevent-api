import {
  openApiDocument
} from "./openapi.js";

const DOCS_HOST =
  "docs.jevent.julot.fr";

const DOCS_URL =
  `https://${DOCS_HOST}`;

function openApiResponse() {
  return new Response(
    JSON.stringify(
      openApiDocument,
      null,
      2
    ),
    {
      status: 200,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "public, max-age=300",

        "X-Content-Type-Options":
          "nosniff"
      }
    }
  );
}

function documentationPage() {
  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>JEvent API</title>

  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.1/swagger-ui.css"
  >

  <style>
    html {
      box-sizing: border-box;
      overflow-y: scroll;
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }

    body {
      margin: 0;
      background: #f6f7fb;
    }

    .swagger-ui .topbar {
      display: none;
    }

    .swagger-ui .info {
      margin: 38px 0 28px;
    }
  </style>
</head>

<body>
  <div id="swagger-ui"></div>

  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.1/swagger-ui-bundle.js"></script>

  <script>
    window.addEventListener(
      "DOMContentLoaded",
      () => {
        SwaggerUIBundle({
          url: "/openapi.json",
          dom_id: "#swagger-ui",

          deepLinking: true,
          displayRequestDuration: true,
          filter: true,

          docExpansion: "list",

          supportedSubmitMethods: [
            "get"
          ],

          requestInterceptor(request) {
            request.credentials =
              "include";

            return request;
          },

          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIBundle
              .SwaggerUIStandalonePreset
          ],

          layout:
            "BaseLayout"
        });
      }
    );
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,

    headers: {
      "Content-Type":
        "text/html; charset=utf-8",

      "Cache-Control":
        "public, max-age=300",

      "X-Content-Type-Options":
        "nosniff",

      "Content-Security-Policy": [
        "default-src 'self'",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "img-src 'self' data: https:",
        "connect-src 'self' https://api-beta.jevent.julot.fr"
      ].join("; ")
    }
  });
}

export function handleDocumentation(
  request
) {
  const url = new URL(request.url);

  const isDocumentationHost =
    url.hostname === DOCS_HOST;

  if (
    !isDocumentationHost &&
    request.method === "GET" &&
    (
      url.pathname === "/docs" ||
      url.pathname === "/docs/"
    )
  ) {
    return Response.redirect(
      DOCS_URL,
      302
    );
  }

  if (
    request.method === "GET" &&
    (
      (
        isDocumentationHost &&
        url.pathname === "/openapi.json"
      ) ||
      (
        !isDocumentationHost &&
        url.pathname ===
          "/api/openapi.json"
      )
    )
  ) {
    return openApiResponse();
  }

  if (!isDocumentationHost) {
    return null;
  }

  if (request.method !== "GET") {
    return new Response(
      "Méthode non autorisée.",
      {
        status: 405,
        headers: {
          Allow: "GET"
        }
      }
    );
  }

  if (
    url.pathname === "/" ||
    url.pathname === "/docs" ||
    url.pathname === "/docs/" ||
    url.pathname === "/index.html"
  ) {
    return documentationPage();
  }

  return new Response(
    "Page introuvable.",
    {
      status: 404
    }
  );
}