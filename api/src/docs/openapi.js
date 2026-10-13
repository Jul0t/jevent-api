export const openApiDocument = {
  openapi: "3.1.0",

  info: {
    title: "JEvent API",
    version: "1.0.0",
    description:
      "Documentation officielle de l’API JEvent 26."
  },

  servers: [
    {
      url: "https://api.jevent.julot.fr",
      description: "API bêta"
    }
  ],

  tags: [
    {
      name: "Système",
      description: "État de fonctionnement de l’API."
    },
    {
      name: "Authentification",
      description: "Connexion et session utilisateur."
    },
    {
      name: "Créateurs publics",
      description: "Informations publiques des créateurs."
    }
  ],

  paths: {
    "/api/health": {
      get: {
        tags: ["Système"],
        summary: "Vérifier l’état de l’API",
        security: [],

        responses: {
          "200": {
            description: "L’API fonctionne correctement.",

            content: {
              "application/json": {
                schema: {
                  type: "object",

                  properties: {
                    success: {
                      type: "boolean"
                    },

                    application: {
                      type: "string"
                    },

                    timestamp: {
                      type: "string",
                      format: "date-time"
                    }
                  },

                  required: [
                    "success",
                    "application",
                    "timestamp"
                  ]
                },

                example: {
                  success: true,
                  application: "JEvent 26 API",
                  timestamp:
                    "2026-10-13T12:00:00.000Z"
                }
              }
            }
          }
        }
      }
    },

    "/api/database-health": {
      get: {
        tags: ["Système"],
        summary: "Vérifier la base de données",
        security: [],

        responses: {
          "200": {
            description:
              "État de la connexion à la base de données.",

            content: {
              "application/json": {
                example: {
                  success: true,
                  database: true
                }
              }
            }
          }
        }
      }
    },

    "/api/auth/me": {
      get: {
        tags: ["Authentification"],
        summary: "Récupérer la session actuelle",

        responses: {
          "200": {
            description:
              "État de connexion de l’utilisateur.",

            content: {
              "application/json": {
                examples: {
                  connected: {
                    summary: "Utilisateur connecté",

                    value: {
                      authenticated: true,
                      user: {
                        id: 1,
                        login: "exemple",
                        displayName: "Exemple"
                      },

                      session: {
                        expiresAt:
                          "2026-11-13T12:00:00.000Z"
                      }
                    }
                  },

                  disconnected: {
                    summary: "Utilisateur déconnecté",

                    value: {
                      authenticated: false,
                      user: null
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

    "/api/auth/logout": {
      post: {
        tags: ["Authentification"],
        summary: "Déconnecter l’utilisateur",

        responses: {
          "200": {
            description: "Session supprimée.",

            content: {
              "application/json": {
                example: {
                  success: true
                }
              }
            }
          }
        }
      }
    },

    "/api/creators": {
      get: {
        tags: ["Créateurs publics"],
        summary: "Lister les créateurs",
        security: [],

        responses: {
          "200": {
            description:
              "Liste publique des créateurs.",

            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true
                }
              }
            }
          }
        }
      }
    },

    "/api/creators/{slug}": {
      get: {
        tags: ["Créateurs publics"],
        summary: "Récupérer un créateur",
        security: [],

        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            description:
              "Identifiant textuel du créateur.",

            schema: {
              type: "string"
            },

            example: "julot"
          }
        ],

        responses: {
          "200": {
            description: "Créateur trouvé.",

            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true
                }
              }
            }
          },

          "404": {
            description: "Créateur introuvable.",

            content: {
              "application/json": {
                example: {
                  error:
                    "Le créateur demandé est introuvable."
                }
              }
            }
          }
        }
      }
    }
  },

  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "jevent_v2_session",
        description:
          "Cookie de session obtenu après la connexion Twitch."
      }
    },

    schemas: {
      Error: {
        type: "object",

        properties: {
          error: {
            type: "string"
          }
        },

        required: ["error"]
      }
    }
  },

  security: [
    {
      sessionCookie: []
    }
  ]
};