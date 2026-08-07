import { describe, expect, it } from 'vitest';
import { countCommands, flowBody, flowExtensionOf, hasFlowExtension } from './flow-classify';

/**
 * §7.1 pinned: a flow is a header with `appId:` before `---`, never a mere
 * `.yml` extension. These rules were born inside `FlowService`; they live
 * here so the repo resolver's flow count and the index cannot drift apart.
 */

describe('flowBody', () => {
  it('accepts a header with appId before the separator', () => {
    expect(flowBody('appId: com.example.app\n---\n- launchApp:\n')).toBe('- launchApp:\n');
  });

  /** §7.1 — a workspace `config.yaml` has no separator and is not a flow. */
  it('refuses a file with no separator', () => {
    expect(flowBody('flows:\n  - "*.yml"\n')).toBeNull();
  });

  /** §7.1 — subflows and data files may carry `---` without an appId. */
  it('refuses a header without appId', () => {
    expect(flowBody('tags:\n  - smoke\n---\n- tapOn: x\n')).toBeNull();
  });

  it('reads only the header for the appId line', () => {
    expect(flowBody('name: x\n---\nappId: com.example.app\n')).toBeNull();
  });
});

describe('countCommands', () => {
  it('counts only top-level command lines', () => {
    expect(countCommands('- launchApp:\n    clearState: true\n- tapOn: "Entrar"\n')).toBe(2);
  });

  it('never counts nested list items', () => {
    expect(countCommands('- runFlow:\n    commands:\n      - tapOn: x\n')).toBe(1);
  });
});

describe('flowExtensionOf', () => {
  const extensions = ['.yml', '.yaml'];

  it('answers the extension as the file wears it, case preserved', () => {
    expect(flowExtensionOf('pix.yml', extensions)).toBe('.yml');
    expect(flowExtensionOf('pix.YAML', extensions)).toBe('.YAML');
  });

  it('answers nothing for a non-flow file', () => {
    expect(flowExtensionOf('notes.md', extensions)).toBe('');
    expect(hasFlowExtension('notes.md', extensions)).toBe(false);
    expect(hasFlowExtension('pix.yaml', extensions)).toBe(true);
  });
});
