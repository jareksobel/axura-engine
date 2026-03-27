/**
 * OpenAPI 3.1 specification for Axura Engine.
 *
 * Kept as a plain TypeScript object so it can be imported by tests or
 * tooling that validates the spec at build time.  The route handler at
 * GET /api/openapi serialises it to JSON.
 *
 * Extend this file as new endpoints are added.
 */

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title:       'Axura Engine API',
    version:     '1.0.0',
    description: 'Internal REST API for the Axura insurance platform.',
    contact: {
      name:  'Axura Platform Team',
      email: 'dev@axura.pl',
    },
  },
  servers: [
    { url: '/api', description: 'Current deployment' },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type:         'http',
        scheme:       'bearer',
        bearerFormat: 'JWT',
        description:  'Auth0 JWT issued to the calling application or user.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code:    { type: 'string' },
              message: { type: 'string' },
              details: { },
            },
            required: ['code', 'message'],
          },
        },
      },
    },
  },
  paths: {
    // ── Health ──────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags:        ['System'],
        operationId: 'getHealth',
        summary:     'Health check',
        security:    [],
        responses: {
          '200': { description: 'Service is healthy' },
          '503': { description: 'DB unreachable' },
        },
      },
    },

    // ── OpenAPI ─────────────────────────────────────────────────────────────
    '/openapi': {
      get: {
        tags:        ['System'],
        operationId: 'getOpenApiSpec',
        summary:     'OpenAPI specification',
        security:    [],
        responses: {
          '200': { description: 'OpenAPI 3.1 spec as JSON' },
        },
      },
    },

    // ── Vehicles ────────────────────────────────────────────────────────────
    '/vehicles': {
      get: {
        tags:        ['Vehicles'],
        operationId: 'listVehicles',
        summary:     'List vehicles (paginated)',
        parameters: [
          { name: 'page',    in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',   in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'dealer',  in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Paginated vehicle list' },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        tags:        ['Vehicles'],
        operationId: 'registerVehicle',
        summary:     'Register vehicle + VIN decode',
        responses: {
          '201': { description: 'Vehicle registered' },
          '409': { description: 'VIN already registered' },
        },
      },
    },
    '/vehicles/{vin}': {
      get: {
        tags:        ['Vehicles'],
        operationId: 'getVehicle',
        summary:     'Vehicle detail + assessment history',
        parameters: [{ name: 'vin', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Vehicle detail' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/vehicles/{vin}/assessment': {
      get: {
        tags:        ['Vehicles'],
        operationId: 'getLatestAssessment',
        summary:     'Latest GREEN assessment for a vehicle',
        parameters: [{ name: 'vin', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Latest assessment' },
          '404': { description: 'No GREEN assessment found' },
        },
      },
    },

    // ── ESI Files ───────────────────────────────────────────────────────────
    '/esi-files/upload-url': {
      post: {
        tags:        ['ESI Files'],
        operationId: 'createUploadUrl',
        summary:     'Get presigned R2 PUT URL for ESI PDF upload',
        responses: {
          '200': { description: 'Presigned URL + file ID' },
        },
      },
    },
    '/esi-files': {
      post: {
        tags:        ['ESI Files'],
        operationId: 'registerEsiFile',
        summary:     'Register ESI file metadata after upload',
        responses: {
          '201': { description: 'File registered' },
        },
      },
    },
    '/esi-files/{id}': {
      get: {
        tags:        ['ESI Files'],
        operationId: 'getEsiFile',
        summary:     'ESI file metadata + download URL',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'File metadata' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/esi-files/{id}/photos': {
      post: {
        tags:        ['ESI Files'],
        operationId: 'addPhoto',
        summary:     'Add inspection photo to ESI file',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '201': { description: 'Photo added' },
        },
      },
    },

    // ── Assessments ─────────────────────────────────────────────────────────
    '/assessments': {
      get: {
        tags:        ['Assessments'],
        operationId: 'listAssessments',
        summary:     'List assessments (filtered)',
        responses: {
          '200': { description: 'Assessment list' },
        },
      },
    },
    '/assessments/esi': {
      post: {
        tags:        ['Assessments'],
        operationId: 'triggerEsiAssessment',
        summary:     'Trigger ESI pipeline',
        responses: {
          '202': { description: 'Assessment queued / completed' },
        },
      },
    },
    '/assessments/obd': {
      post: {
        tags:        ['Assessments'],
        operationId: 'submitObdScan',
        summary:     'Submit OBD2 scan',
        responses: {
          '201': { description: 'OBD assessment created' },
        },
      },
    },
    '/assessments/{id}': {
      get: {
        tags:        ['Assessments'],
        operationId: 'getAssessment',
        summary:     'Full assessment detail',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Assessment detail' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/assessments/{id}/review': {
      post: {
        tags:        ['Assessments'],
        operationId: 'reviewAssessment',
        summary:     'Operator manual review',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '201': { description: 'Review recorded' },
        },
      },
    },

    // ── Rules ────────────────────────────────────────────────────────────────
    '/rules': {
      get: {
        tags:        ['Rules'],
        operationId: 'listRules',
        summary:     'List all rule set versions',
        responses: { '200': { description: 'Rule set list' } },
      },
      post: {
        tags:        ['Rules'],
        operationId: 'createRuleSet',
        summary:     'Create draft rule set',
        responses: { '201': { description: 'Draft created' } },
      },
    },
    '/rules/active': {
      get: {
        tags:        ['Rules'],
        operationId: 'getActiveRuleSet',
        summary:     'Active rule set',
        responses: { '200': { description: 'Active rule set' } },
      },
    },
    '/rules/simulate': {
      post: {
        tags:        ['Rules'],
        operationId: 'simulateRuleSet',
        summary:     'Dry-run rule set against historical assessments',
        responses: { '200': { description: 'Simulation results' } },
      },
    },
    '/rules/{version}': {
      get: {
        tags:        ['Rules'],
        operationId: 'getRuleSet',
        summary:     'Specific rule set version',
        parameters: [{ name: 'version', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Rule set' }, '404': { description: 'Not found' } },
      },
    },
    '/rules/{version}/activate': {
      post: {
        tags:        ['Rules'],
        operationId: 'activateRuleSet',
        summary:     'Atomic activate of a draft rule set',
        parameters: [{ name: 'version', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Activated' } },
      },
    },

    // ── Policies ─────────────────────────────────────────────────────────────
    '/policies': {
      get: {
        tags:        ['Policies'],
        operationId: 'listPolicies',
        summary:     'List policies (filtered)',
        responses: { '200': { description: 'Policy list' } },
      },
      post: {
        tags:        ['Policies'],
        operationId: 'createPolicy',
        summary:     'Create policy (status: pending_payment)',
        responses: { '201': { description: 'Policy created' } },
      },
    },
    '/policies/preview': {
      post: {
        tags:        ['Policies'],
        operationId: 'previewPremium',
        summary:     'Premium preview (no persistence)',
        responses: { '200': { description: 'Preview result' } },
      },
    },
    '/policies/{id}': {
      get: {
        tags:        ['Policies'],
        operationId: 'getPolicy',
        summary:     'Policy detail',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Policy detail' }, '404': { description: 'Not found' } },
      },
    },
    '/policies/{id}/pay': {
      post: {
        tags:        ['Policies'],
        operationId: 'confirmPayment',
        summary:     'Confirm payment → activate policy',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Policy activated' } },
      },
    },
    '/policies/{id}/pdf': {
      get: {
        tags:        ['Policies'],
        operationId: 'getPolicyPdf',
        summary:     'Get (or generate) policy PDF',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'PDF URL or redirect' } },
      },
    },
    '/policies/{id}/cancel': {
      patch: {
        tags:        ['Policies'],
        operationId: 'cancelPolicy',
        summary:     'Cancel policy',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Cancelled' } },
      },
    },

    // ── Users ────────────────────────────────────────────────────────────────
    '/users': {
      get: {
        tags:        ['Users'],
        operationId: 'listUsers',
        summary:     'List users',
        responses: { '200': { description: 'User list' } },
      },
      post: {
        tags:        ['Users'],
        operationId: 'createUser',
        summary:     'Create user (+ Auth0 provision + password-reset email)',
        responses: { '201': { description: 'User created' } },
      },
    },
    '/users/{id}': {
      get: {
        tags:        ['Users'],
        operationId: 'getUser',
        summary:     'User detail + roles',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'User detail' }, '404': { description: 'Not found' } },
      },
      patch: {
        tags:        ['Users'],
        operationId: 'updateUser',
        summary:     'Update / deactivate user (+ Auth0 block sync)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' } },
      },
    },
    '/users/{id}/permissions': {
      get: {
        tags:        ['Users'],
        operationId: 'getUserPermissions',
        summary:     'Effective permissions + direct overrides',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Permissions' } },
      },
      patch: {
        tags:        ['Users'],
        operationId: 'setUserPermissions',
        summary:     'Set direct permission overrides',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' } },
      },
    },

    // ── Dealers ──────────────────────────────────────────────────────────────
    '/dealers': {
      get: {
        tags:        ['Dealers'],
        operationId: 'listDealers',
        summary:     'List dealers',
        responses: { '200': { description: 'Dealer list' } },
      },
      post: {
        tags:        ['Dealers'],
        operationId: 'createDealer',
        summary:     'Create dealer',
        responses: { '201': { description: 'Dealer created' } },
      },
    },
    '/dealers/{id}': {
      get: {
        tags:        ['Dealers'],
        operationId: 'getDealer',
        summary:     'Dealer detail',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Dealer detail' }, '404': { description: 'Not found' } },
      },
      patch: {
        tags:        ['Dealers'],
        operationId: 'updateDealer',
        summary:     'Update dealer',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Updated' } },
      },
    },
    '/dealers/{id}/users': {
      get: {
        tags:        ['Dealers'],
        operationId: 'listDealerUsers',
        summary:     'List dealer users',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'User list' } },
      },
      post: {
        tags:        ['Dealers'],
        operationId: 'createDealerUser',
        summary:     'Create dealer user (+ Auth0 org provision)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '201': { description: 'User created' } },
      },
    },

    // ── Roles ────────────────────────────────────────────────────────────────
    '/roles': {
      get: {
        tags:        ['Roles'],
        operationId: 'listRoles',
        summary:     'List roles (with permissions)',
        responses: { '200': { description: 'Role list' } },
      },
      post: {
        tags:        ['Roles'],
        operationId: 'createRole',
        summary:     'Create role (with permissions)',
        responses: { '201': { description: 'Role created' } },
      },
    },
    '/roles/{id}': {
      patch: {
        tags:        ['Roles'],
        operationId: 'updateRole',
        summary:     'Update name/description/permissions',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Updated' } },
      },
      delete: {
        tags:        ['Roles'],
        operationId: 'deleteRole',
        summary:     'Delete role (if no users assigned)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '204': { description: 'Deleted' }, '409': { description: 'Role in use' } },
      },
    },
  },
} as const;
