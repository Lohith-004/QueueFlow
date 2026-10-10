import bcrypt from 'bcrypt';

export const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hashes a plaintext password using bcrypt with 12 salt rounds.
 *
 * @param password - Plaintext password to hash
 * @returns Cryptographically secure bcrypt hash string
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Constant-time comparison between plaintext password and stored bcrypt hash.
 *
 * @param password - Plaintext password candidate
 * @param hash - Stored bcrypt hash
 * @returns True if password matches hash, false otherwise
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
