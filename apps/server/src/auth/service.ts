import { createHash, randomBytes } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { AuthSession, AuthTokens, UserProfile } from '@jisr/shared';
import type { Repositories, UserRecord } from '../db/repositories.ts';
import { normalizeEmail } from '../db/prisma-repositories.ts';

/** أخطاء المصادقة المعروفة — تترجمها المسارات إلى عقد `ApiError`. */
export type AuthFailure =
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN';

export class AuthError extends Error {
  /** لا نستخدم «خصائص المعامل»: Node يشغّل TypeScript بحذف الأنواع فقط. */
  readonly failure: AuthFailure;

  constructor(failure: AuthFailure) {
    super(failure);
    this.name = 'AuthError';
    this.failure = failure;
  }
}

export interface AccessTokenIssuer {
  sign(payload: { sub: string }): string;
}

export interface AuthServiceOptions {
  readonly repositories: Repositories;
  readonly issuer: AccessTokenIssuer;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlDays: number;
  readonly now?: () => Date;
}

/**
 * معاملات Argon2id — أعلى من الافتراضي المنخفض، وضمن ما يحتمله VPS صغير.
 * 19 ميغا و2 تكرار توصية OWASP الدنيا لـ Argon2id.
 */
const ARGON_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/**
 * تجزئة وهمية تُقارَن بها كلمة المرور حين لا يوجد المستخدم — كي يستغرق
 * الفشل زمناً مماثلاً للنجاح، فلا يُستدلّ على وجود البريد من سرعة الردّ.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZS1zYWx0LXZhbHVl$3s5RQ0uJ3M3dQ0Xx3rY7wq0kFhV0wYyq6bQz1n0aJ2c';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toProfile(user: UserRecord): UserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

export interface AuthService {
  register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<AuthSession>;
  login(input: { email: string; password: string }): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  logout(refreshToken: string): Promise<void>;
  profile(userId: string): Promise<UserProfile | null>;
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  const { repositories, issuer, accessTokenTtlSeconds, refreshTokenTtlDays } = options;
  const now = options.now ?? (() => new Date());

  async function issueTokens(userId: string): Promise<AuthTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now().getTime() + refreshTokenTtlDays * 86_400_000);
    await repositories.refreshTokens.create({
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    });
    return {
      accessToken: issuer.sign({ sub: userId }),
      refreshToken,
      expiresInSeconds: accessTokenTtlSeconds,
      tokenType: 'Bearer',
    };
  }

  return {
    async register({ email, password, displayName }) {
      const normalized = normalizeEmail(email);
      if (await repositories.users.findByEmail(normalized)) {
        throw new AuthError('EMAIL_TAKEN');
      }
      const user = await repositories.users.create({
        email: normalized,
        passwordHash: await argonHash(password, ARGON_OPTIONS),
        displayName: displayName.trim(),
      });
      return { user: toProfile(user), tokens: await issueTokens(user.id) };
    },

    async login({ email, password }) {
      const user = await repositories.users.findByEmail(normalizeEmail(email));
      const passwordOk = await argonVerify(user?.passwordHash ?? DUMMY_HASH, password).catch(
        () => false,
      );
      if (!user || !passwordOk) {
        throw new AuthError('INVALID_CREDENTIALS');
      }
      return { user: toProfile(user), tokens: await issueTokens(user.id) };
    },

    /** تدوير إلزامي: الرمز المستعمل يُبطَل فوراً ويُصدر بديله. */
    async refresh(refreshToken) {
      const at = now();
      const tokenHash = hashToken(refreshToken);
      const stored = await repositories.refreshTokens.findValidByHash(tokenHash, at);
      if (!stored) {
        throw new AuthError('INVALID_REFRESH_TOKEN');
      }
      await repositories.refreshTokens.revokeByHash(tokenHash, at);
      return issueTokens(stored.userId);
    },

    async logout(refreshToken) {
      await repositories.refreshTokens.revokeByHash(hashToken(refreshToken), now());
    },

    async profile(userId) {
      const user = await repositories.users.findById(userId);
      return user ? toProfile(user) : null;
    },
  };
}
