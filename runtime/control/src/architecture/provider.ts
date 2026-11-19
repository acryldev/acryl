import { type Context, Service } from '@deepseek-ai/cordis'
import {
  projectRuntimeArchitecture,
  type ArchitecturePlane,
  type RuntimeArchitectureSnapshot,
} from './projection.ts'

export interface AcrRuntimeArchitecture {
  snapshot(plane: ArchitecturePlane): RuntimeArchitectureSnapshot
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    acrRuntimeArchitecture: AcrRuntimeArchitecture
  }
}

export class AcrRuntimeArchitectureService extends Service implements AcrRuntimeArchitecture {
  constructor(ctx: Context) {
    super(ctx, 'acrRuntimeArchitecture')
  }

  snapshot(plane: ArchitecturePlane): RuntimeArchitectureSnapshot {
    return projectRuntimeArchitecture(this.ctx, plane)
  }
}

export default AcrRuntimeArchitectureService
