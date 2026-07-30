import { z } from 'zod';

/**
 * The single IPC contract: channel names, one Zod schema per channel payload,
 * the `Result` union, and the `ConductorApi` type derived from them. Main
 * imports the schemas to validate; the preload implements `ConductorApi`; the
 * renderer imports types only.
 */

/** `<domain>:<action>`, kebab-case. Declared here and nowhere else. */
export const CHANNELS = {
  appInfo: 'app:info',
  configGet: 'config:get',
} as const;

/** Channels that take no request payload still validate their argument list. */
const noArguments = z.tuple([]);

const appInfoResponse = z.object({
  appVersion: z.string(),
  electronVersion: z.string(),
  chromeVersion: z.string(),
  nodeVersion: z.string(),
  platform: z.string(),
});

/** The shape of `CONFIG` as it crosses to the sandboxed renderer, which has
 * no `process.env` of its own (.context.md §2). */
const configGetResponse = z.object({
  APP_ID: z.string(),
  REPO_URL: z.string(),
  REPO_BASE_BRANCH: z.string(),
  FLOWS_DIR: z.string(),
  FLOW_EXTENSIONS: z.array(z.string()).readonly(),
});

export const IPC = {
  [CHANNELS.appInfo]: { request: noArguments, response: appInfoResponse },
  [CHANNELS.configGet]: { request: noArguments, response: configGetResponse },
} as const;

export type Channel = keyof typeof IPC;
export type Request<C extends Channel> = z.infer<(typeof IPC)[C]['request']>;
export type Response<C extends Channel> = z.infer<(typeof IPC)[C]['response']>;

/**
 * Expected failures cross the boundary as values, not exceptions: Electron
 * strips custom fields from rejected `invoke`s, and the doctor UX needs stable
 * `code`s to tell one failure from another. Throwing is reserved for bugs.
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/** One named function per channel — the whole surface of `window.conductor`. */
export interface ConductorApi {
  appInfo: (...args: Request<'app:info'>) => Promise<Result<Response<'app:info'>>>;
  configGet: (...args: Request<'config:get'>) => Promise<Result<Response<'config:get'>>>;
}
