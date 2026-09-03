import type { IntegrationEntry } from '../types.ts';
import { TUYA_INFO } from './config.ts';
import { createTuyaIntegration } from './integration.ts';

/** السطر الذي يُسجَّل في `registry.ts` — لا شيء غيره يعرف Tuya. */
export const tuyaEntry: IntegrationEntry = {
  info: TUYA_INFO,
  create: (context) => createTuyaIntegration(context),
};

export { createTuyaIntegration } from './integration.ts';
export { TUYA_ID, TUYA_INFO } from './config.ts';
