import type { Channel, Response, Result } from '@shared/ipc';
import { BrowserWindow, type IpcMainInvokeEvent, ipcMain } from 'electron';
import type { ZodType } from 'zod';
import { isRendererUrl } from '../window';

/**
 * Registers one `ipcMain.handle` channel. Every handler in the app goes
 * through here, so the three guarantees below hold everywhere by construction:
 * the sender is checked before any work happens, the arguments are parsed with
 * the channel's schema, and the outcome — success or failure — leaves as a
 * `Result` value rather than as an exception across the boundary.
 */
export function handle<C extends Channel, A extends unknown[]>(
  channel: C,
  schema: ZodType<A>,
  fn: (...args: A) => Response<C> | Promise<Response<C>>,
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<Result<Response<C>>> => {
    if (!isTrustedSender(event)) {
      return failure(
        'ipc/untrusted-sender',
        `Rejected ${channel}: the sender is not the application window.`,
      );
    }

    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`)
        .join('; ');
      return failure('ipc/invalid-args', `Invalid arguments for ${channel}. ${detail}`);
    }

    try {
      return { ok: true, data: await fn(...parsed.data) };
    } catch (error) {
      // Reaching here means a handler threw, and throwing across IPC is
      // reserved for bugs — so this is one. It leaves as a value for the
      // renderer, but it must also leave a trail in main, or the bug is
      // invisible to everyone except the user who hit it.
      console.error(`IPC handler for ${channel} threw:`, error);
      return failure(
        'ipc/handler-failed',
        error instanceof Error ? error.message : `${channel} failed.`,
      );
    }
  });
}

/**
 * Electron checklist item 17: a handler must never trust its sender. Only the
 * top frame of one of our own windows, still on the renderer's own URL, counts.
 */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  // Electron leaves the frame object behind when the frame itself is destroyed
  // — a reload or a window close racing an invoke in flight — and every getter
  // on it then throws. An untrusted answer is the right one, and it has to be
  // an answer rather than an exception: the failure still has to cross the
  // boundary as a `Result`.
  try {
    const frame = event.senderFrame;
    if (frame === null) {
      return false;
    }
    // A subframe is never the application window, however it came to exist.
    if (frame !== event.sender.mainFrame) {
      return false;
    }
    if (BrowserWindow.fromWebContents(event.sender) === null) {
      return false;
    }
    return isRendererUrl(frame.url);
  } catch {
    return false;
  }
}

function failure(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}
