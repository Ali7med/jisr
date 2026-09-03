import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '@jisr/shared';
import { IntegrationError, statusForKind } from './integrations/errors.ts';

/**
 * فشل متوقّع نعرف رمزه ورسالته — تُرمى من الخدمات وتُترجم هنا مرة واحدة
 * بدل `try/catch` في كل مسار.
 */
export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiFailure';
    this.status = status;
    this.code = code;
  }

  /** المورد غير موجود — أو ليس للمستخدم. لا نفرّق: عدم التفريق يمنع الاستكشاف. */
  static notFound(message: string): ApiFailure {
    return new ApiFailure(404, 'NOT_FOUND', message);
  }
}

/**
 * يوحّد كل الأخطاء على عقد `ApiError`: رمز للتشخيص، ورسالة **عربية تشرح
 * ما العمل** (القاعدة الحاكمة 4). لا يتسرّب أي نصّ إنجليزي افتراضي من
 * Fastify، ولا أي تفصيل داخلي للمستخدم.
 */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const body: ApiError = {
      code: 'NOT_FOUND',
      message: 'المسار المطلوب غير موجود — تأكّد من العنوان أو راجع توثيق الواجهة.',
      details: { method: request.method, url: request.url },
    };
    void reply.code(404).send(body);
  });

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const status = error.statusCode ?? 500;

    if (error instanceof ApiFailure) {
      return reply.code(error.status).send({ code: error.code, message: error.message });
    }

    /**
     * خطأ من تكامل: الرسالة عربية جاهزة وقد كتبها التكامل، والتفاصيل
     * الأصلية (كود الشركة ونصّها الإنجليزي) تذهب للسجلّ لا للمستخدم.
     */
    if (error instanceof IntegrationError) {
      request.log.warn(
        { integrationId: error.integrationId, code: error.code, raw: error.rawMessage },
        'خطأ من تكامل',
      );
      const body: ApiError = {
        code: `INTEGRATION_${error.kind.toUpperCase()}`,
        message: error.message,
      };
      return reply.code(statusForKind(error.kind)).send(body);
    }

    if (error.validation) {
      const body: ApiError = {
        code: 'VALIDATION_FAILED',
        message: 'البيانات المرسلة غير مكتملة أو غير صالحة — راجع الحقول وأعد المحاولة.',
        details: {
          issues: error.validation.map((issue) => issue.message ?? 'حقل غير صالح'),
        },
      };
      return reply.code(400).send(body);
    }

    if (status === 429) {
      const body: ApiError = {
        code: 'RATE_LIMITED',
        message: 'طلبات كثيرة خلال وقت قصير — انتظر دقيقة ثم أعد المحاولة.',
      };
      return reply.code(429).send(body);
    }

    if (status >= 500) {
      // التفاصيل تذهب للسجلّ لا للمستخدم
      request.log.error({ err: error }, 'خطأ غير متوقّع');
      const body: ApiError = {
        code: 'INTERNAL_ERROR',
        message: 'حدث خطأ غير متوقّع عندنا — حاول بعد قليل، وإن تكرّر فأبلغنا.',
      };
      return reply.code(500).send(body);
    }

    const body: ApiError = {
      code: error.code ?? 'REQUEST_FAILED',
      message: error.message,
    };
    return reply.code(status).send(body);
  });
}
