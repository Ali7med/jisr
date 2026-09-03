/**
 * عقد API المشترك بين السيرفر والويب — ومرجع نماذج الهاتف عبر OpenAPI.
 *
 * المخطّط (TypeBox) هو مصدر الحقيقة: منه تُشتقّ أنواع TypeScript، وبه
 * يتحقّق Fastify من الطلبات، ومنه يُولَّد ملف OpenAPI الذي تُقاس عليه
 * اختبارات عقد الهاتف — [ADR-0010].
 */
export * from './account.js';
export * from './auth.js';
export * from './capability.js';
export * from './device.js';
export * from './integration.js';
export * from './realtime.js';
export * from './errors.js';
export * from './health.js';
