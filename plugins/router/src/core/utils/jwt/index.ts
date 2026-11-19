/**
 * @module
 * JWT utility.
 */

import { decode, sign, verify, verifyWithJwks } from './jwt.ts'
export const Jwt = { sign, verify, decode, verifyWithJwks }
