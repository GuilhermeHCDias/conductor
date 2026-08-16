import { describe, expect, it } from 'vitest';
import { documentTitle } from './document-title';

/**
 * Criteria 8–9 of the adherence spec, derived pure: a document names itself
 * and reports its own state, and with nothing open the window falls back to
 * the project it is pointed at.
 */

const REPO = { org: 'loja-verde', name: 'pnp-fast-mode', branch: 'main' };

describe('with a flow open', () => {
  /** Criterion 8 — the document names itself, whatever the repo is. */
  it('titles with the flow and counts its commands', () => {
    expect(
      documentTitle({ openName: 'pix.yaml', commandCount: 3, running: false, repo: REPO }),
    ).toEqual({ title: 'pix.yaml', subtitle: '3 commands · saved on this Mac' });
  });

  it('says “command” in the singular', () => {
    expect(
      documentTitle({ openName: 'pix.yaml', commandCount: 1, running: false, repo: REPO }).subtitle,
    ).toBe('1 command · saved on this Mac');
  });

  it('reports a run in progress instead of the save state', () => {
    expect(
      documentTitle({ openName: 'pix.yaml', commandCount: 2, running: true, repo: REPO }).subtitle,
    ).toBe('2 commands · running');
  });

  /** A flow with no commands yet is a normal state, not a special case. */
  it('counts zero commands in the plural', () => {
    expect(
      documentTitle({ openName: 'pix.yaml', commandCount: 0, running: false, repo: REPO }).subtitle,
    ).toBe('0 commands · saved on this Mac');
  });
});

describe('with no flow open', () => {
  /** Criterion 9 — the project takes the title, address and branch below. */
  it('titles with the repo and addresses it by org, name and branch', () => {
    expect(documentTitle({ openName: null, commandCount: 0, running: false, repo: REPO })).toEqual({
      title: 'pnp-fast-mode',
      subtitle: 'loja-verde/pnp-fast-mode · main',
    });
  });

  /** A repo with no branch degrades to the address alone, the shape the
   * sidebar's own bar already uses. */
  it('says only the address when the repo reports no branch', () => {
    expect(
      documentTitle({
        openName: null,
        commandCount: 0,
        running: false,
        repo: { ...REPO, branch: null },
      }),
    ).toEqual({ title: 'pnp-fast-mode', subtitle: 'loja-verde/pnp-fast-mode' });
  });

  /**
   * Unreachable in the app — no active repo means the connect window, which
   * draws no toolbar — but the function is total, and it never falls back to
   * the “—” placeholder criterion 9 retired.
   */
  it('says nothing at all when there is no repo either', () => {
    expect(documentTitle({ openName: null, commandCount: 0, running: false, repo: null })).toEqual({
      title: '',
      subtitle: '',
    });
  });
});
