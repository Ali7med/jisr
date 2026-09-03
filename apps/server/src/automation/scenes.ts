import type { Scene, SceneInput, SceneRunResult } from '@jisr/shared';
import type { Repositories, SceneRecord } from '../db/repositories.ts';
import type { DevicesService } from '../devices/service.ts';
import { ApiFailure } from '../errors.ts';

/**
 * المشاهد — **عابرة للشركات بلا سطر خاص بأيّها**: الخطوة تُوجَّه بمعرّف
 * العقد المركّب، والتنفيذ يمرّ بخدمة الأجهزة نفسها التي تحرس الملكية.
 */
export interface ScenesService {
  list(userId: string): Promise<Scene[]>;
  create(userId: string, input: SceneInput): Promise<Scene>;
  remove(userId: string, sceneId: string): Promise<void>;
  run(userId: string, sceneId: string): Promise<SceneRunResult>;
  /** تشغيل مشهد كإجراء أتمتة — المالك معروف من الأتمتة نفسها. */
  runOwned(userId: string, scene: SceneRecord): Promise<SceneRunResult>;
}

const NOT_FOUND = 'لم نعثر على هذا المشهد — قد يكون حُذف. حدّث القائمة.';

function toScene(record: SceneRecord): Scene {
  return {
    id: record.id,
    name: record.name,
    icon: record.icon,
    steps: record.steps,
    createdAt: record.createdAt.toISOString(),
  };
}

export function createScenesService(options: {
  repositories: Repositories;
  devices: DevicesService;
  now?: () => Date;
}): ScenesService {
  const { repositories, devices } = options;
  const now = options.now ?? (() => new Date());

  async function runSteps(userId: string, scene: SceneRecord): Promise<SceneRunResult> {
    const failures: { deviceId: string; message: string }[] = [];

    for (const step of scene.steps) {
      try {
        await devices.execute(userId, step.deviceId, [{ key: step.key, value: step.value }]);
      } catch (error) {
        // **النجاح الجزئي حقيقة لا استثناء**: جهاز غير متصل لا يُلغي
        // المشهد كله، والواجهة تقول أي خطوة فشلت ولماذا.
        failures.push({
          deviceId: step.deviceId,
          message: error instanceof Error ? error.message : 'تعذّر تنفيذ الخطوة.',
        });
      }
    }

    return {
      sceneId: scene.id,
      succeeded: scene.steps.length - failures.length,
      failed: failures.length,
      failures,
      at: now().toISOString(),
    };
  }

  return {
    async list(userId) {
      return (await repositories.scenes.listByUser(userId)).map(toScene);
    },

    async create(userId, input) {
      return toScene(
        await repositories.scenes.create(userId, {
          name: input.name.trim(),
          icon: input.icon,
          steps: input.steps,
        }),
      );
    },

    async remove(userId, sceneId) {
      const scene = await repositories.scenes.findOwned(userId, sceneId);
      if (!scene) throw ApiFailure.notFound(NOT_FOUND);
      await repositories.scenes.remove(sceneId);
    },

    async run(userId, sceneId) {
      const scene = await repositories.scenes.findOwned(userId, sceneId);
      if (!scene) throw ApiFailure.notFound(NOT_FOUND);
      return runSteps(userId, scene);
    },

    runOwned: (userId, scene) => runSteps(userId, scene),
  };
}
