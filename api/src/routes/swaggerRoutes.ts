import { FastifyInstance, FastifyPluginAsync } from 'fastify';

export const swaggerRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'CertiFlow API Documentation',
      version: '1.0.0',
      description:
        'Interactive OpenAPI 3.0 Specification for the CertiFlow Certificate Issuance Platform.\n\n' +
        '### Available Personas (Switchable via `/api/auth/login`):\n' +
        '- **Anika** (`training_centre`, Central District, Apex Skills TC) &bull; ID: `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`\n' +
        '- **Dev** (`district_officer`, Central District) &bull; ID: `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`\n' +
        '- **Meera** (`district_officer`, Central District) &bull; ID: `cccccccc-cccc-cccc-cccc-cccccccccccc`\n' +
        '- **Kabir** (`district_officer`, Central District) &bull; ID: `dddddddd-dddd-dddd-dddd-dddddddddddd`\n' +
        '- **Neha** (`quality_team`, Statewide QA) &bull; ID: `eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee`\n' +
        '- **Farah** (`state_office`, Statewide Authority) &bull; ID: `ffffffff-ffff-ffff-ffff-ffffffffffff`\n',
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Local Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Provide JWT token obtained from `/api/auth/login`',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            statusCode: { type: 'integer' },
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: {
              type: 'string',
              enum: ['training_centre', 'district_officer', 'quality_team', 'state_office'],
            },
            district_id: { type: 'string', nullable: true },
            centre_id: { type: 'string', nullable: true },
          },
        },
        Batch: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            centre_id: { type: 'string', format: 'uuid' },
            district_id: { type: 'string', format: 'uuid' },
            course_name: { type: 'string' },
            status: {
              type: 'string',
              enum: [
                'draft',
                'district_review',
                'quality_review',
                'state_review',
                'approved',
                'rejected',
                'sent_back',
              ],
            },
            round: { type: 'integer' },
            version: { type: 'integer' },
            submitted_at: { type: 'string', format: 'date-time', nullable: true },
            step_due_at: { type: 'string', format: 'date-time', nullable: true },
            escalation_level: { type: 'integer' },
            candidate_count: { type: 'integer' },
          },
        },
      },
    },
    paths: {
      '/': {
        get: {
          tags: ['Health & Discovery'],
          summary: 'Default Root Endpoint',
          description: 'Root endpoint for port 4000. Redirects browser requests to /docs and returns service discovery JSON for API clients.',
          responses: {
            200: { description: 'API status and discovery links' },
            302: { description: 'Redirect to /docs (Swagger UI) for browser requests' },
          },
        },
      },
      '/healthz': {
        get: {
          tags: ['Health'],
          summary: 'Liveness Probe',
          description: 'Kubernetes/Docker liveness probe returning API server status and uptime.',
          responses: {
            200: {
              description: 'Liveness status OK',
            },
          },
        },
      },
      '/readyz': {
        get: {
          tags: ['Health'],
          summary: 'Readiness Probe',
          description: 'Verifies PostgreSQL and Redis connectivity before routing traffic.',
          responses: {
            200: { description: 'All database and cache services connected' },
            503: { description: 'One or more dependencies offline' },
          },
        },
      },
      '/api/auth/users': {
        get: {
          tags: ['Authentication & Personas'],
          summary: 'List Available Switchable Personas',
          description: 'Returns pre-seeded users across all 4 programme roles (no passwords needed).',
          responses: {
            200: {
              description: 'List of personas',
            },
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Authentication & Personas'],
          summary: 'Login / Switch Persona',
          description:
            'Switches active persona and returns a signed JWT. The server reads role and district STRICTLY from token claims.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['userId'],
                  properties: {
                    userId: {
                      type: 'string',
                      format: 'uuid',
                      example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                      description: 'UUID of the persona to authenticate as',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Signed JWT Token and user details',
            },
          },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Authentication & Personas'],
          summary: 'Get Authenticated Session Profile',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Current user profile extracted strictly from verified JWT' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/api/batches': {
        get: {
          tags: ['Batches'],
          summary: 'List Scoped Batches',
          description: 'Returns batches scoped to caller role (Training centres see only own centre; District officers see own district; State/QA see all).',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'List of batches' },
          },
        },
        post: {
          tags: ['Batches'],
          summary: 'Create New Batch',
          description: 'Creates a new draft batch. Allowed only for training_centre role.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['course_name'],
                  properties: {
                    course_name: { type: 'string', example: 'Solar Panel Technician' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Batch created' },
            403: { description: 'Forbidden (Not training centre)' },
          },
        },
      },
      '/api/batches/{id}': {
        get: {
          tags: ['Batches'],
          summary: 'Get Batch Details & Candidates',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            200: { description: 'Batch details with candidates' },
            404: { description: 'Batch not found' },
          },
        },
      },
      '/api/batches/{id}/candidates/upload': {
        post: {
          tags: ['Batches'],
          summary: 'Upload Candidates Spreadsheet (CSV/XLSX)',
          description:
            'Uploads XLSX or CSV with columns: `name, phone, course, score`. Neutralizes CSV formula injection, performs row-by-row validation, and enforces all-or-nothing insertion.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Candidates parsed and saved' },
            400: { description: 'Validation errors collected across all invalid rows' },
          },
        },
      },
      '/api/batches/{id}/submit': {
        post: {
          tags: ['Batches'],
          summary: 'Submit Batch for Review',
          description: 'Advances batch from draft to district_review.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            200: { description: 'Batch submitted for District Review' },
          },
        },
      },
      '/api/queue/waiting-for-me': {
        get: {
          tags: ['Approvals & Queue'],
          summary: 'Officer Queue ("Waiting for Me")',
          description: 'Returns all batches currently awaiting decision from the authenticated user.',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Queue list' },
          },
        },
      },
      '/api/batches/{id}/decision': {
        post: {
          tags: ['Approvals & Queue'],
          summary: 'Submit Review Decision',
          description:
            'Atomic decision transaction with `SELECT ... FOR UPDATE`. Quorum requires 2 different district officers. Loser of concurrent race gets 409 Conflict.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['decision'],
                  properties: {
                    decision: {
                      type: 'string',
                      enum: ['approve', 'reject', 'send_back'],
                      example: 'approve',
                    },
                    reason: {
                      type: 'string',
                      example: 'Documents verified and pass criteria',
                      description: 'Mandatory when decision is send_back or reject',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Decision recorded' },
            409: { description: 'Concurrent race conflict or duplicate officer review' },
          },
        },
      },
      '/api/batches/{id}/timeline': {
        get: {
          tags: ['Approvals & Queue'],
          summary: 'Batch Decision Timeline',
          description: 'Returns complete decision history across all review rounds.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            200: { description: 'Timeline events' },
          },
        },
      },
      '/api/verify': {
        get: {
          tags: ['Certificates & Verification'],
          summary: 'Public Certificate Verification',
          description:
            'Public verification lookup by certificate number and verification code. Cached in Redis with short TTL.',
          parameters: [
            { name: 'cert_number', in: 'query', required: true, schema: { type: 'string' }, example: 'CERT-2026-000001' },
            { name: 'verify_code', in: 'query', required: true, schema: { type: 'string' }, example: 'CF8A2B9C' },
          ],
          responses: {
            200: { description: 'Verification result (valid, cancelled, or not found)' },
          },
        },
      },
      '/api/certificates/{id}/cancel': {
        post: {
          tags: ['Certificates & Verification'],
          summary: 'Cancel / Revoke Certificate',
          description:
            'Allowed ONLY for state_office (Farah). Requires mandatory reason. Immediately purges Redis verification cache.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['cancel_reason'],
                  properties: {
                    cancel_reason: { type: 'string', example: 'Disqualified due to fraudulent prerequisite documents' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Certificate cancelled and cache cleared' },
            403: { description: 'Forbidden (Not State Office)' },
          },
        },
      },
      '/api/batches/stuck': {
        get: {
          tags: ['SLA Escalations & Trace'],
          summary: 'Stuck Batches Board',
          description: 'Batches breaching SLA deadlines. Restricted to state_office role.',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Stuck batches list' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/api/escalations/trigger-scan': {
        post: {
          tags: ['SLA Escalations & Trace'],
          summary: 'Trigger SLA Escalation Scan',
          description: 'Evaluates batches past step_due_at and advances Level 0 -> 1 -> 2.',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Scan summary' },
          },
        },
      },
      '/api/batches/{id}/trace': {
        get: {
          tags: ['SLA Escalations & Trace'],
          summary: 'End-to-End Batch Trace',
          description: 'Returns append-only audit trail, outbox events, and WhatsApp delivery logs.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            200: { description: 'Audit logs, outbox events, and deliveries' },
          },
        },
      },
      '/api/events/stream': {
        get: {
          tags: ['Real-time Events (SSE)'],
          summary: 'Server-Sent Events (SSE) Stream',
          description: 'Authenticated real-time stream filtered strictly by caller role and district.',
          parameters: [
            { name: 'token', in: 'query', schema: { type: 'string' }, description: 'JWT authentication token' },
          ],
          responses: {
            200: { description: 'EventSource text/event-stream' },
          },
        },
      },
    },
  };

  // Serve raw OpenAPI JSON
  fastify.get('/openapi.json', async (_request, reply) => {
    return reply.status(200).send(openApiSpec);
  });

  // Serve Swagger UI on /docs and /documentation with pre-authenticated persona tokens
  const renderSwaggerHtml = () => {
    // Generate valid signed tokens for demo personas
    const anikaToken = fastify.jwt.sign({
      sub: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'Anika',
      email: 'anika@certiflow.local',
      role: 'training_centre',
      district_id: '11111111-1111-1111-1111-111111111111',
      centre_id: '22222222-2222-2222-2222-222222222222',
    });

    const devToken = fastify.jwt.sign({
      sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      name: 'Dev',
      email: 'dev@certiflow.local',
      role: 'district_officer',
      district_id: '11111111-1111-1111-1111-111111111111',
      centre_id: null,
    });

    const farahToken = fastify.jwt.sign({
      sub: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      name: 'Farah',
      email: 'farah@certiflow.local',
      role: 'state_office',
      district_id: null,
      centre_id: null,
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CertiFlow API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://fav.farm/📜" />
  <style>
    body { margin: 0; background: #fafafa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .custom-header {
      background: #1e1b4b;
      color: white;
      padding: 16px 24px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 3px solid #4f46e5;
    }
    .custom-header h1 { margin: 0; font-size: 18px; font-weight: 700; }
    .custom-header p { margin: 2px 0 0; font-size: 11px; color: #c7d2fe; }
    .persona-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .persona-btn {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #fff;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .persona-btn:hover {
      background: #4f46e5;
      border-color: #6366f1;
    }
    .persona-btn.active {
      background: #10b981;
      border-color: #059669;
    }
    .auth-status-pill {
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid #10b981;
      color: #a7f3d0;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="custom-header">
    <div>
      <h1>CertiFlow &bull; Swagger API Explorer</h1>
      <p>Fastify + TypeScript Certificate Issuance Engine with Pre-Authenticated Personas</p>
    </div>
    <div class="persona-bar">
      <span style="font-size: 11px; color: #a5b4fc;">Quick Authorize Persona:</span>
      <button class="persona-btn active" id="btn-anika" onclick="setAuth('anika')">
        👤 Anika (Training Centre)
      </button>
      <button class="persona-btn" id="btn-dev" onclick="setAuth('dev')">
        👤 Dev (District Officer)
      </button>
      <button class="persona-btn" id="btn-farah" onclick="setAuth('farah')">
        👤 Farah (State Office)
      </button>
      <span class="auth-status-pill" id="auth-status">✓ Authenticated as Anika</span>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui-standalone-preset.js"></script>
  <script>
    const TOKENS = {
      anika: "${anikaToken}",
      dev: "${devToken}",
      farah: "${farahToken}"
    };

    function setAuth(personaKey) {
      const token = TOKENS[personaKey];
      if (!token) return;

      if (window.ui) {
        window.ui.preauthorizeApiKey('bearerAuth', token);
      }

      document.querySelectorAll('.persona-btn').forEach(btn => btn.classList.remove('active'));
      const activeBtn = document.getElementById('btn-' + personaKey);
      if (activeBtn) activeBtn.classList.add('active');

      const names = { anika: 'Anika (Training Centre)', dev: 'Dev (District Officer)', farah: 'Farah (State Office)' };
      document.getElementById('auth-status').textContent = '✓ Authenticated as ' + names[personaKey];
    }

    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        persistAuthorization: true
      });

      // Automatically pre-authorize with Anika (Training Centre) token on load
      setTimeout(() => {
        setAuth('anika');
      }, 500);
    };
  </script>
</body>
</html>`;
  };

  // Serve Swagger UI on /docs and /documentation
  fastify.get('/docs', async (_request, reply) => {
    return reply.type('text/html').send(renderSwaggerHtml());
  });

  fastify.get('/documentation', async (_request, reply) => {
    return reply.type('text/html').send(renderSwaggerHtml());
  });
};
