/**
 * عقود الوصول للبيانات.
 *
 * الغرض ليس التجريد لذاته: هو أن يبقى منطق المصادقة قابلاً للاختبار بلا
 * قاعدة بيانات حيّة، وأن يظلّ استبدال التخزين لاحقاً تغييراً موضعياً.
 */

export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly createdAt: Date;
}

export interface RefreshTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: {
    email: string;
    passwordHash: string;
    displayName: string;
  }): Promise<UserRecord>;
}

export interface RefreshTokenRepository {
  create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findValidByHash(tokenHash: string, now: Date): Promise<RefreshTokenRecord | null>;
  revokeByHash(tokenHash: string, now: Date): Promise<void>;
  revokeAllForUser(userId: string, now: Date): Promise<void>;
}

export interface Repositories {
  readonly users: UserRepository;
  readonly refreshTokens: RefreshTokenRepository;
}
