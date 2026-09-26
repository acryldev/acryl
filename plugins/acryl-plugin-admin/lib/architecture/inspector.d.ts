/** Bounded projection of native Cordis Fibers, services, injects, and effects. */
import type { Context } from '@deepseek-ai/cordis';
import type { CordisPlane, CordisPlaneSnapshot } from './contract.ts';
/** Inspect one Cordis context without caching or inventing cross-plane identity. */
export declare function inspectCordisContext(ctx: Context, plane: CordisPlane): CordisPlaneSnapshot;
