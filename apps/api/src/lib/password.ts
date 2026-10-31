import bcrypt from 'bcryptjs'

import { BCRYPT_ROUNDS } from '@/config/auth'

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * A valid hash of a random value, compared against when the account does not
 * exist so "no such user" takes as long as "wrong password" (no timing oracle).
 */
const dummyHash = bcrypt.hashSync('syncspace-timing-equaliser', BCRYPT_ROUNDS)

export async function burnPasswordCheck(password: string): Promise<void> {
  await bcrypt.compare(password, dummyHash)
}
