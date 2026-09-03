import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '@jisr/shared';

declare module 'fastify' {
  interface FastifyInstance {
    /** يحرس المسارات: توكن صالح أو 401 بعقد `ApiError`. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export interface JwtPluginOptions {
  readonly secret: string;
  readonly expiresInSeconds: number;
}

export const jwtPlugin = fp<JwtPluginOptions>(async (app, opts) => {
  await app.register(fastifyJwt, {
    secret: opts.secret,
    sign: { expiresIn: opts.expiresInSeconds },
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      const body: ApiError = {
        code: 'UNAUTHORIZED',
        message: 'تحتاج تسجيل دخول للوصول — أرسل رمز الوصول في ترويسة Authorization.',
      };
      await reply.code(401).send(body);
    }
  });
});
