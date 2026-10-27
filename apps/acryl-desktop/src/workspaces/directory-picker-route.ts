import { Acryl } from 'acrylblends'
import { error } from 'acryl-loopback-http'
import { INVALID_JSON, jsonBody, ownPage, readJson, type ReportError } from 'acryl-loopback-http/router'
import { jsonContent } from '../api/http.ts'
import {
  DESKTOP_DIRECTORY_PICKER_PATH,
  DESKTOP_DIRECTORY_VALIDATOR_PATH,
  type DesktopDirectoryPickerResponse,
  type DesktopDirectoryValidationRequest,
  type DesktopDirectoryValidationResponse,
} from './directory-picker-contract.ts'

const MAX_VALIDATION_BODY_BYTES = 16 * 1024

function isValidationRequest(value: unknown): value is DesktopDirectoryValidationRequest {
  if (typeof value !== 'object' || value === null || !('path' in value)) return false
  const path = (value as { path?: unknown }).path
  return typeof path === 'string' && path.trim().length > 0
}

/** What the native routes call: the system folder chooser, and the volume check a selected workspace must pass. */
export interface DesktopDirectoryNative {
  pickDirectory(): Promise<string | null>
  validateDirectory(path: string): Promise<boolean>
}

/**
 * The native directory picker (POST, no body read) and the validation of a renderer-selected workspace before it can be persisted
 * (POST `{ path }`). A native failure is reported and answered 500 without its cause.
 */
export function directoryPickerRoutes(native: DesktopDirectoryNative, reportError: ReportError = () => {}): Acryl {
  return new Acryl()
    .post(DESKTOP_DIRECTORY_PICKER_PATH, ownPage, async (c) => {
      try {
        const response: DesktopDirectoryPickerResponse = { path: await native.pickDirectory() }
        return c.json(response)
      } catch (cause: unknown) {
        reportError('open the native directory picker', cause)
        return c.json(error('native directory picker failed'), 500)
      }
    })
    .post(DESKTOP_DIRECTORY_VALIDATOR_PATH, ownPage, jsonContent, jsonBody(MAX_VALIDATION_BODY_BYTES), async (c) => {
      const value = await readJson(c)
      if (value === INVALID_JSON || !isValidationRequest(value)) return c.json(error('invalid directory validation request'), 400)
      try {
        const response: DesktopDirectoryValidationResponse = { allowed: await native.validateDirectory(value.path) }
        return c.json(response)
      } catch (cause: unknown) {
        reportError('validate a workspace directory', cause)
        return c.json(error('directory validation failed'), 500)
      }
    })
}
