import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Db } from '../plugins/acryl-db/src/index.ts'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  length: number,
) => Promise<Buffer>

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, 64)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(':')
  if (!salt || !key) return false
  const expected = Buffer.from(key, 'hex')
  const actual = await scryptAsync(password, Buffer.from(salt, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

export function authStore(db: Db) {
  return {
    findUser(email: string) {
      return db.get<{ id: number; email: string; password_hash: string }>(
        'SELECT id, email, password_hash FROM users WHERE email = ?',
        email,
      )
    },
    async createUser(email: string, password: string): Promise<number> {
      const user = await db.get<{ id: number }>(
        'INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id',
        email,
        await hashPassword(password),
      )
      return user!.id
    },
    async startSession(userId: number): Promise<string> {
      const token = randomBytes(32).toString('hex')
      await db.run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', token, userId)
      return token
    },
    async userFor(token: string | undefined) {
      if (!token) return undefined
      return db.get<{ id: number; email: string }>(
        'SELECT users.id AS id, users.email AS email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token = ?',
        token,
      )
    },
    async endSession(token: string): Promise<void> {
      await db.run('DELETE FROM sessions WHERE token = ?', token)
    },
  }
}
