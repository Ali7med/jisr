import { Type, type Static } from '@sinclair/typebox';

/** استجابة `/health` — تقرؤها المراقبة والنشر ([ADR-0014]). */
export const HealthResponse = Type.Object(
  {
    status: Type.Union([Type.Literal('ok'), Type.Literal('degraded')]),
    version: Type.String(),
    uptimeSeconds: Type.Number({ minimum: 0 }),
    at: Type.String({ format: 'date-time' }),
  },
  { $id: 'HealthResponse', additionalProperties: false },
);
export type HealthResponse = Static<typeof HealthResponse>;
