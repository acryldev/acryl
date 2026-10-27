/** Strict loopback routes for the private Desktop settings API, on the router. */

import { Acryl, type Context } from 'acrylblends'
import { error } from 'acryl-loopback-http'
import { INVALID_JSON, jsonBody, jsonContent, ownPage, readJson, type ReportError } from 'acryl-loopback-http/router'
import { afterBody } from '../api/http.ts'
import { assertDesktopProfileName } from '../profile/profile-manager.ts'
import type { DesktopMarketProvider } from '../plugins/desktop-market.ts'
import type DesktopSettingsController from './desktop-settings-controller.ts'
import type { DesktopSettingsPostResponse } from './desktop-settings-controller.ts'
import {
  DESKTOP_DIAGNOSTICS_EXPORT_PATH,
  DESKTOP_MARKET_SELECT_PATH,
  DESKTOP_PROFILE_CREATE_PATH,
  DESKTOP_PROFILE_CREATE_WINDOW_PATH,
  DESKTOP_PROFILE_DELETE_PATH,
  DESKTOP_PROFILE_ROLLBACK_PATH,
  DESKTOP_PROFILE_SELECT_PATH,
  DESKTOP_SETTINGS_PATH,
  DESKTOP_TERMINAL_OPEN_PATH,
  type DesktopMarketSelectRequest,
  type DesktopProfileCreateRequest,
} from './desktop-settings-contract.ts'

const MAX_SETTINGS_BODY_BYTES = 16 * 1024

function isExactRecord(value: unknown, key: string): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 1
    && Object.prototype.hasOwnProperty.call(value, key)
}

function parseProfileRequest(value: unknown): DesktopProfileCreateRequest | undefined {
  if (!isExactRecord(value, 'name') || typeof value.name !== 'string') return undefined
  try {
    assertDesktopProfileName(value.name)
    return { name: value.name }
  } catch {
    return undefined
  }
}

function isMarketProvider(value: unknown): value is DesktopMarketProvider {
  return value === 'disabled' || value === 'community-market' || value === 'dsh-market'
}

function parseMarketRequest(value: unknown): DesktopMarketSelectRequest | undefined {
  if (!isExactRecord(value, 'provider') || !isMarketProvider(value.provider)) return undefined
  return { provider: value.provider }
}

function isEmptyRequest(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 0
}

/** The answer, and its follow-up (the restart) once the answer has gone out; a follow-up that throws is reported, never answered. */
function postResponse<T extends object>(
  c: Context,
  statusCode: 200 | 202,
  operation: DesktopSettingsPostResponse<T>,
  operationName: string,
  reportError: ReportError,
): Response {
  const response = c.json(operation.response, statusCode)
  const after = operation.afterResponse
  if (after === undefined) return response
  return afterBody(response, () => {
    try {
      after()
    } catch (cause) {
      reportError(`${operationName} restart`, cause)
    }
  })
}

/** Every changing route: the own page, a JSON body of at most {@link MAX_SETTINGS_BODY_BYTES}. */
const change = [ownPage, jsonContent, jsonBody(MAX_SETTINGS_BODY_BYTES)] as const

/**
 * The settings routes: the renderer-safe snapshot (GET), profile creation, selection, deletion and rollback, the Market provider, the
 * terminal, the native Profile creator and the diagnostic export (POST, each with an exact body). Native causes are reported, never answered.
 */
export function desktopSettingsRoutes(controller: DesktopSettingsController, reportError: ReportError = () => {}): Acryl {
  const invalidJson = (c: Context): Response => c.json(error('invalid JSON request'), 400)
  return new Acryl()
    .get(DESKTOP_SETTINGS_PATH, ownPage, (c) => {
      try {
        return c.json(controller.read())
      } catch (cause) {
        reportError('read settings', cause)
        return c.json(error('desktop settings unavailable'), 500)
      }
    })
    // Create one safe Web profile without changing the active generation.
    .post(DESKTOP_PROFILE_CREATE_PATH, ...change, async (c) => {
      const value = await readJson(c)
      if (value === INVALID_JSON) return invalidJson(c)
      const request = parseProfileRequest(value)
      if (request === undefined) return c.json(error('invalid profile creation request'), 400)
      try {
        return c.json(controller.createProfile(request.name), 201)
      } catch (cause) {
        reportError('create profile', cause)
        return c.json(error('profile could not be created'), 409)
      }
    })
    // Select one compatible profile through the restart-safe launcher service.
    .post(DESKTOP_PROFILE_SELECT_PATH, ...change, async (c) => {
      const value = await readJson(c)
      if (value === INVALID_JSON) return invalidJson(c)
      const request = parseProfileRequest(value)
      if (request === undefined) return c.json(error('invalid profile selection request'), 400)
      try {
        const operation = await controller.selectProfile(request.name)
        return postResponse(c, operation.response.restartRequired ? 202 : 200, operation, 'select profile', reportError)
      } catch (cause) {
        reportError('select profile', cause)
        return c.json(error('profile could not be selected'), 409)
      }
    })
    // Delete one inactive user profile and return a fresh settings projection.
    .post(DESKTOP_PROFILE_DELETE_PATH, ...change, async (c) => {
      const value = await readJson(c)
      if (value === INVALID_JSON) return invalidJson(c)
      const request = parseProfileRequest(value)
      if (request === undefined) return c.json(error('invalid profile deletion request'), 400)
      try {
        return c.json(await controller.deleteProfile(request.name))
      } catch (cause) {
        reportError('delete profile', cause)
        return c.json(error('profile could not be deleted'), 409)
      }
    })
    // Persist one Market provider and queue the restart only after persistence succeeds.
    .post(DESKTOP_MARKET_SELECT_PATH, ...change, async (c) => {
      const value = await readJson(c)
      if (value === INVALID_JSON) return invalidJson(c)
      const request = parseMarketRequest(value)
      if (request === undefined) return c.json(error('invalid Market selection request'), 400)
      try {
        const operation = await controller.selectMarket(request.provider)
        return postResponse(c, operation.response.restartRequired ? 202 : 200, operation, 'select Market provider', reportError)
      } catch (cause) {
        reportError('select Market provider', cause)
        return c.json(error('Market selection could not be saved'), 500)
      }
    })
    // Open the launcher-owned DSH terminal from an exact empty request.
    .post(DESKTOP_TERMINAL_OPEN_PATH, ...change, async (c) => {
      const value = await readJson(c)
      if (value === INVALID_JSON) return invalidJson(c)
      if (!isEmptyRequest(value)) return c.json(error('invalid terminal request'), 400)
      try {
        return c.json(controller.openTerminal())
      } catch (cause) {
        reportError('open terminal', cause)
        return c.json(error('terminal could not be opened'), 500)
      }
    })
    // Export diagnostics from an exact empty request.
    .post(DESKTOP_DIAGNOSTICS_EXPORT_PATH, ...change, async (c) => {
      const value = await readJson(c)
      if (value === INVALID_JSON) return invalidJson(c)
      if (!isEmptyRequest(value)) return c.json(error('invalid diagnostic export request'), 400)
      try {
        return c.json(await controller.exportDiagnostics())
      } catch (cause) {
        reportError('export diagnostics', cause)
        return c.json(error('diagnostics could not be exported'), 500)
      }
    })
    // Open the isolated native Profile creator from an exact empty request.
    .post(DESKTOP_PROFILE_CREATE_WINDOW_PATH, ...change, async (c) => {
      const value = await readJson(c)
      if (value === INVALID_JSON) return invalidJson(c)
      if (!isEmptyRequest(value)) return c.json(error('invalid Profile creator request'), 400)
      try {
        return c.json(controller.openProfileCreator())
      } catch (cause) {
        reportError('open Profile creator', cause)
        return c.json(error('Profile creator could not be opened'), 500)
      }
    })
    // Restore the last-known-good Profile from an exact empty request.
    .post(DESKTOP_PROFILE_ROLLBACK_PATH, ...change, async (c) => {
      const value = await readJson(c)
      if (value === INVALID_JSON) return invalidJson(c)
      if (!isEmptyRequest(value)) return c.json(error('invalid Profile rollback request'), 400)
      try {
        return postResponse(c, 202, controller.rollbackProfile(), 'restore last-known-good Profile', reportError)
      } catch (cause) {
        reportError('prepare last-known-good Profile restore', cause)
        return c.json(error('last-known-good Profile could not be restored'), 409)
      }
    })
}

export const desktopSettingsRouteConstants = Object.freeze({
  maxBodyBytes: MAX_SETTINGS_BODY_BYTES,
})
