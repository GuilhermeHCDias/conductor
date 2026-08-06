import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The invariants of the shell that live in CSS rather than in markup. jsdom
 * applies no stylesheet, so `toHaveStyle` cannot see a CSS-Module class — these
 * read the source instead.
 *
 * Only the app's own CSS is scanned. `styles/tokens` and `styles/utilities` are
 * copied byte-for-byte from the design system and are not ours to change.
 */

const RENDERER = resolve('src/renderer/src');

function walk(dir: string, match: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'styles' ? [] : walk(path, match);
    }
    return match(entry.name) ? [path] : [];
  });
}

const MODULES = walk(RENDERER, (name) => name.endsWith('.module.css')).map((path) => ({
  name: relative(RENDERER, path),
  css: readFileSync(path, 'utf8'),
}));

const cssOf = (name: string): string => MODULES.find((module) => module.name === name)?.css ?? '';

/**
 * The declarations of every rule whose selector list contains `selector`,
 * concatenated. Every rule, not the first: a later one overriding the same
 * property would otherwise be invisible to the assertions below.
 */
function rule(css: string, selector: string): string {
  const pattern = new RegExp(
    `(^|[,{}])\\s*${selector.replace(/[.[\]"^$*+?()|\\]/g, '\\$&')}\\s*(,[^{]*)?\\{([^}]*)\\}`,
    'gm',
  );
  return [...css.matchAll(pattern)].map((match) => match[3]).join('\n');
}

it('finds the renderer’s CSS modules', () => {
  expect(MODULES.length).toBeGreaterThan(10);
});

/**
 * Criterion 1 — one blur for the window, and no region frosting inside it.
 *
 * ⏸️ Amended by the inspect spec: the window still owns the single blur of the
 * shell, but the two *floating* layers the design system ships — the command
 * menu and the dialog — carry their own, because layers above the window read
 * their depth through it ("Dialogs blur heavier than any other layer"). The
 * failure mode this guards — frost nested inside the window's panes — is
 * still forbidden: no view or region module may join this list.
 *
 * ⏸️ Amended again by the repo-connect spec: the switcher popover is the
 * third floating layer, same family as the command menu, and floats for the
 * same reason.
 */
describe('the single blur', () => {
  it('is declared only by the window and the floating layers', () => {
    const declaring = MODULES.filter((module) => module.css.includes('backdrop-filter'));

    expect(declaring.map((module) => module.name).sort()).toEqual([
      'App.module.css',
      'components/ContextMenu/ContextMenu.module.css',
      'components/Dialog/Dialog.module.css',
      'components/RepoPopover/RepoPopover.module.css',
    ]);
  });

  it('is the window’s, and is built from the --a-* tokens', () => {
    expect(rule(cssOf('App.module.css'), '.window')).toContain(
      'backdrop-filter: blur(var(--a-blur)) saturate(var(--a-saturate))',
    );
  });
});

/** Criterion 3 — each region is an alpha fill over that one blur. */
describe('region fills', () => {
  it.each([
    ['the toolbar', 'Toolbar', '.toolbar', '--a-chrome'],
    ['the sidebar', 'FlowList', '.panel', '--a-panel'],
    ['the inspector', 'DeviceMirror', '.panel', '--a-panel'],
    ['the working area', 'FlowEditor', '.column', '--a-content'],
  ])('paints %s %s', (_label, view, selector, token) => {
    expect(rule(cssOf(`views/${view}/${view}.module.css`), selector)).toContain(
      `background: var(${token})`,
    );
  });

  it.each([
    ['the sidebar search field', 'FlowList', '.searchField'],
    ['the segmented control track', '', ''],
    ['the composer', 'Composer', '.surface'],
  ])('recesses %s into --a-well', (_label, view, selector) => {
    const css =
      view === ''
        ? cssOf('components/SegmentedControl/SegmentedControl.module.css')
        : cssOf(`views/${view}/${view}.module.css`);

    expect(rule(css, selector === '' ? '.track' : selector)).toContain('background: var(--a-well)');
  });
});

/**
 * Criterion 46 — every pane declares an explicit single column. An implicit
 * grid track resolves to min-content and overflows the column it was given,
 * which is how a pane ends up putting a scrollbar on the window.
 */
describe('pane columns', () => {
  it.each([
    ['FlowList', '.panel'],
    ['FlowEditor', '.column'],
    ['DeviceMirror', '.panel'],
  ])('%s declares grid-template-columns: minmax(0, 1fr)', (view, selector) => {
    expect(rule(cssOf(`views/${view}/${view}.module.css`), selector)).toContain(
      'grid-template-columns: minmax(0, 1fr)',
    );
  });
});

/** Criterion 2 — the pane row's two track lists. */
describe('the pane row', () => {
  it('reserves the sidebar, both hairlines and the inspector when the sidebar shows', () => {
    expect(rule(cssOf('App.module.css'), '.panes[data-sidebar="true"]')).toContain(
      'grid-template-columns: minmax(200px, 268px) 1px minmax(0, 1fr) 1px auto',
    );
  });

  it('drops the sidebar track and its hairline when it does not', () => {
    expect(rule(cssOf('App.module.css'), '.panes')).toContain(
      'grid-template-columns: minmax(0, 1fr) 1px auto',
    );
  });
});

/**
 * Criterion 9 — reduced motion is carried by the tokens in `motion.css`, so a
 * hardcoded duration is a transition that keeps moving after the user asked
 * everything to stop.
 */
describe('motion', () => {
  it.each(MODULES)('$name states no duration of its own', ({ css }) => {
    const transitions = css.match(/transition:[^;]*/g) ?? [];

    for (const declaration of transitions) {
      expect(declaration).not.toMatch(/\d+m?s\b/);
    }
  });

  it.each(MODULES)('$name scales presses by the token, not by a number', ({ css }) => {
    expect(css).not.toMatch(/transform:\s*scale\(\s*[\d.]/);
  });

  // Everything that animates is a DS entrance on token clocks (the inspect
  // spec's floating layers) — the fake caret's hardcoded 1s blink left with
  // the editable body, whose caret is the platform's own.
  // `utilities/animation.css` neutralises the entrances under reduced motion
  // (`animation-duration: .01ms !important`, one iteration), which is what
  // criterion 9 is protecting; nothing may animate on any hardcoded clock.
  // ⏸️ Amended by the repo-connect spec: the resolver's progress spinner is
  // the DS's own `cd-spin`, on the token clock — reduced motion stops it
  // like everything else.
  it.each(MODULES)('$name animates only a DS entrance, on token clocks', ({ css }) => {
    const animations = css.match(/animation:[^;]*/g) ?? [];

    for (const declaration of animations) {
      expect(declaration).toMatch(
        /^animation: cd-((fade-in|menu-in|dialog-in) var\(--dur-(base|slow)\) var\(--ease-(out|spring|glass)\)|spin var\(--dur-lazy\) linear infinite)$/,
      );
    }
  });
});

/** Criteria 13 and 38 — a name that cannot fit ellipsises rather than growing
 * its region or wrapping onto a second line. */
describe('truncation', () => {
  it.each([
    ['the document title', 'views/Toolbar/Toolbar.module.css', '.title'],
    ['the toolbar subtitle', 'views/Toolbar/Toolbar.module.css', '.subtitle'],
    ['the device serial', 'views/DeviceMirror/DeviceMirror.module.css', '.serial'],
    ['a flow name', 'views/FlowList/FlowList.module.css', '.name'],
    ['the open document’s name', 'views/FlowEditor/FlowEditor.module.css', '.documentName'],
  ])('truncates %s', (_label, file, selector) => {
    const declarations = rule(cssOf(file), selector);

    expect(declarations).toContain('overflow: hidden');
    expect(declarations).toContain('text-overflow: ellipsis');
    expect(declarations).toContain('white-space: nowrap');
  });
});

/** Criteria 21, 34 and 54 — focus is a glow, and the assistant's is its own. */
describe('focus', () => {
  it('glows the sidebar search in the accent', () => {
    const declarations = rule(
      cssOf('views/FlowList/FlowList.module.css'),
      '.searchField:focus-within',
    );

    expect(declarations).toContain('box-shadow: var(--glow-accent)');
    expect(declarations).toContain('border-color: var(--accent-edge)');
  });

  it('glows the composer in the assistant’s blue, not in the accent', () => {
    const declarations = rule(cssOf('views/Composer/Composer.module.css'), '.surface:focus-within');

    expect(declarations).toContain('box-shadow: var(--glow-ai)');
    expect(declarations).not.toContain('--glow-accent');
  });

  it.each([
    ['the composer', 'views/Composer/Composer.module.css', '.input', '.surface'],
    ['the sidebar search', 'views/FlowList/FlowList.module.css', '.searchInput', '.searchField'],
  ])('draws one ring around %s, not two', (_label, file, control, field) => {
    const css = cssOf(file);

    expect(rule(css, `${control}:focus-visible`)).toContain('box-shadow: none');
    expect(rule(css, `${field}:focus-within`)).toMatch(/box-shadow: var\(--glow-(accent|ai)\)/);
  });

  it('never suppresses a focus ring without replacing it', () => {
    for (const { css } of MODULES) {
      const wrapperGlows = /:focus-within[^{]*\{[^}]*box-shadow: var\(--glow-(accent|ai)\)/.test(
        css,
      );

      for (const declarations of css.match(/:focus-visible[^{]*\{[^}]*\}/g) ?? []) {
        if (wrapperGlows && /box-shadow: none/.test(declarations)) {
          continue;
        }
        expect(declarations).toMatch(/box-shadow: var\(--glow-(accent|ai)\)/);
      }
    }
  });
});

/**
 * Criterion 7's renderer half — the OS draws the traffic lights over the
 * toolbar, so the toolbar has to hold that space open. The other half is
 * `trafficLightPosition` in `window.test.ts`; the two numbers only agree by
 * being written down together.
 */
describe('the traffic-light inset', () => {
  const toolbar = cssOf('views/Toolbar/Toolbar.module.css');

  it('starts the toolbar 14px in', () => {
    expect(rule(toolbar, '.toolbar')).toContain('padding: 0 10px 0 14px');
  });

  it('reserves the rest of the 70px the lights span', () => {
    expect(rule(toolbar, '.trafficLightInset')).toContain('width: calc(70px - 14px)');
  });

  // The lights are positioned from the real window's origin. Inset the drawn
  // window from it — as the kit does, because it is a web mock — and they land
  // in the margin rather than in the toolbar.
  it('paints the window edge to edge, so the toolbar starts at the window origin', () => {
    const desktop = rule(cssOf('App.module.css'), '.desktop');

    expect(desktop).not.toMatch(/padding|margin|inset/);
    expect(rule(cssOf('App.module.css'), '.window')).not.toContain('border-radius');
  });
});

/** Criterion 8 — the toolbar drags the window; its controls do not. */
describe('the drag region', () => {
  it('is the toolbar background', () => {
    expect(rule(cssOf('views/Toolbar/Toolbar.module.css'), '.toolbar')).toContain(
      '-webkit-app-region: drag',
    );
  });

  it('excludes everything inside it that can be clicked', () => {
    expect(cssOf('views/Toolbar/Toolbar.module.css')).toContain('-webkit-app-region: no-drag');
  });

  // ⏸️ Amended by the repo-connect spec: the connect window renders no
  // toolbar, so its top strip is the one other thing the frameless window
  // can be dragged by.
  it('is declared nowhere else', () => {
    const declaring = MODULES.filter((module) => module.css.includes('-webkit-app-region'));

    expect(declaring.map((module) => module.name).sort()).toEqual([
      'views/Connect/Connect.module.css',
      'views/Toolbar/Toolbar.module.css',
    ]);
  });
});

/**
 * Criteria that name a specific token or measurement. The view tests prove the
 * behaviour — which element is selected, which line is washed — and these prove
 * that the element so marked is painted the way the criterion says.
 */
describe('what the criteria name', () => {
  const toolbar = cssOf('views/Toolbar/Toolbar.module.css');
  const flowList = cssOf('views/FlowList/FlowList.module.css');
  const editor = cssOf('views/FlowEditor/FlowEditor.module.css');
  const mirror = cssOf('views/DeviceMirror/DeviceMirror.module.css');

  /** Criterion 11. */
  it('fills the Run button with the accent', () => {
    const run = rule(toolbar, '.run');

    expect(run).toContain('background: var(--accent)');
    expect(run).toContain('color: var(--accent-on)');
    expect(run).toContain('height: 28px');
    expect(run).toContain('border-radius: var(--a-radius-field)');
    expect(run).toContain('box-shadow: var(--a-refract)');
  });

  /** Criterion 12. */
  it('turns the Run button quiet-red while running', () => {
    const stopping = rule(toolbar, '.run[data-running="true"]');

    expect(stopping).toContain('background: var(--state-fail-quiet)');
    expect(stopping).toContain('color: var(--state-fail)');
  });

  it('draws the progress line 2px of accent along the top of the panes', () => {
    const progress = rule(cssOf('App.module.css'), '.progress');

    expect(progress).toContain('background: var(--accent)');
    expect(progress).toContain('height: 2px');
    expect(progress).toContain('top: 0');
  });

  /** Criterion 14. */
  it('lays the sidebar out as header · search · rows · bar', () => {
    expect(rule(flowList, '.panel')).toContain('grid-template-rows: 38px auto minmax(0, 1fr) 34px');
  });

  /** Criterion 16 — the dot's colours, wherever it is used. */
  it.each([
    ['pass', '--state-pass'],
    ['fail', '--state-fail'],
    ['running', '--state-running'],
    ['never', '--state-idle'],
  ])('colours a %s dot with %s', (state, token) => {
    expect(
      rule(cssOf('components/StatusDot/StatusDot.module.css'), `.dot[data-state="${state}"]`),
    ).toContain(`background: var(${token})`);
  });

  /** Criterion 17 — an AppKit selection, never a tint. */
  it('fills the selected flow row solid with the accent', () => {
    expect(rule(flowList, '.row[data-selected="true"]')).toContain('background: var(--accent)');
    expect(rule(flowList, '.row[data-selected="true"] .name')).toContain('color: var(--accent-on)');
  });

  /** Criterion 18. */
  it('fills a hovered flow row with the hover glass, and marks AI rows in --ai', () => {
    expect(rule(flowList, '.row:hover')).toContain('background: var(--glass-hover)');
    expect(rule(flowList, '.aiMark')).toContain('color: var(--ai)');
  });

  /** Criterion 22. */
  it('lays the working area out as five rows', () => {
    expect(rule(editor, '.column')).toContain(
      'grid-template-rows: 38px minmax(120px, 0.95fr) 38px minmax(0, 1.05fr) auto',
    );
  });

  /** Criterion 23 — a name and a glyph, no tab fill and no tab border. */
  it('sets the document name in the accent glyph, and marks it dirty in accent', () => {
    const dirty = rule(editor, '.dirty');

    expect(rule(editor, '.documentGlyph')).toContain('color: var(--accent)');
    expect(rule(editor, '.documentName')).toContain('color: var(--text-primary)');
    expect(dirty).toContain('background: var(--accent)');
    expect(dirty).toContain('width: 5px');
    expect(dirty).toContain('height: 5px');
  });

  /** Criterion 26. */
  it('sets the YAML body in the code face over a right-aligned gutter', () => {
    expect(rule(editor, '.yaml')).toContain('font: var(--type-code)');
    expect(rule(editor, '.gutter')).toContain('color: var(--editor-gutter)');
    expect(rule(editor, '.gutter')).toContain('text-align: right');
  });

  it.each([
    ['key', '--syn-key'],
    ['anchor', '--syn-anchor'],
    ['string', '--syn-string'],
    ['number', '--syn-number'],
    ['punct', '--syn-punct'],
    ['comment', '--syn-comment'],
  ])('colours a %s span with %s', (kind, token) => {
    expect(rule(editor, `.token[data-token="${kind}"]`)).toContain(`color: var(${token})`);
  });

  /** Criterion 27. */
  it.each([
    ['ai', '--ai-quiet', '--ai'],
    ['error', '--state-fail-quiet', '--state-fail'],
  ])('washes a %s line in %s behind a bar of %s', (wash, fill, bar) => {
    const declarations = rule(editor, `.line[data-line="${wash}"]`);

    expect(declarations).toContain(`background: var(${fill})`);
    expect(declarations).toContain(`box-shadow: inset 2px 0 0 0 var(${bar})`);
  });

  /** Criterion 28, amended by editability: the caret is the textarea's native
   * one, painted with the editor's token — and the typed text itself stays
   * transparent, so what the eye reads is always the coloured underlay. */
  it('paints the native caret with the editor token over invisible input text', () => {
    const input = rule(editor, '.editorInput');

    expect(input).toContain('caret-color: var(--editor-caret)');
    expect(input).toContain('color: transparent');
    expect(input).toContain('font: inherit');
  });

  /** Criterion 29 — a raised puck on a recessed track. */
  it('raises the selected segment off its track', () => {
    const segmented = cssOf('components/SegmentedControl/SegmentedControl.module.css');
    const selected = rule(segmented, '.segment[data-selected="true"]');

    expect(rule(segmented, '.track')).toContain('background: var(--a-well)');
    expect(selected).toContain('background: var(--glass-3)');
    expect(selected).toContain('box-shadow: var(--shadow-1)');
    expect(selected).toContain('border-color: var(--a-hair)');
  });

  /**
   * Amended by hand: the menu floats over the mirror's screenshot, and the
   * dark theme's 17%-alpha frost cannot carry text over that — so this one
   * layer fills with the opaque content material instead of --glass-3.
   */
  it('fills the context menu with the content material, not the thin frost', () => {
    expect(rule(cssOf('components/ContextMenu/ContextMenu.module.css'), '.menu')).toContain(
      'background: var(--material-content)',
    );
  });

  /** Criterion 31. */
  it('greys the run report’s empty-state glyph', () => {
    expect(rule(cssOf('views/RunPanel/RunPanel.module.css'), '.emptyGlyph')).toContain(
      'color: var(--text-disabled)',
    );
  });

  /** Criterion 35. */
  it('lays the inspector out as a header over the bay', () => {
    expect(rule(mirror, '.panel')).toContain('grid-template-rows: 38px minmax(0, 1fr)');
  });

  /**
   * Criterion 42 — the phone is a real device, so nothing about its chrome may
   * flip with the app's theme. Its own palette is declared once, on `.phone`.
   */
  it('paints the phone from a palette of its own', () => {
    const phone = rule(mirror, '.phone');

    for (const token of ['--phone-bezel', '--phone-bar', '--phone-glyph', '--phone-text']) {
      expect(phone).toContain(`${token}:`);
    }
    // Everything the bezel itself paints comes from that palette, never from a
    // theme token that light mode would invert.
    for (const declaration of phone.match(/^\s*(background|border|box-shadow):[^;]*/gm) ?? []) {
      expect(declaration).toMatch(/var\(--phone-|var\(--border-hair\)/);
      expect(declaration).not.toMatch(/var\(--(edge|shadow|glass|a)-/);
    }
  });

  /**
   * Criterion 24 supersedes 42's drawn chrome: the status bar and the nav bar
   * are gone, because they were furniture for a mirror this panel does not
   * draw. What is on the screen now are controls, and they are painted from the
   * phone's palette for the same reason the bezel is.
   */
  it('draws no status bar and no nav bar', () => {
    expect(mirror).not.toContain('.statusBar');
    expect(mirror).not.toContain('.navBar');
  });

  /** Still on the screen, so still painted from the phone's palette. */
  it('paints .deviceChoice from that palette too', () => {
    expect(rule(mirror, '.deviceChoice')).toContain('background: var(--phone-choice)');
  });

  /**
   * `.viewer` was on that list, then moved off the phone into a footer under
   * the bay. Criterion 23 removes it outright — the `maestro mcp` child behind
   * it answers `inspect_screen` now, and nothing in the app opens a viewer URL
   * — so the rules go with the markup rather than lingering as dead CSS that
   * the next reader has to prove is unused.
   */
  it('carries no rules for the removed viewer control', () => {
    expect(mirror).not.toContain('.viewer');
    expect(mirror).not.toContain('.footer');
  });

  it('gives the phone its own drop shadow', () => {
    expect(rule(mirror, '.footprint')).toContain('filter: drop-shadow(var(--device-drop))');
  });

  /** Criterion 43. */
  it('fills the phone screen with --device-screen', () => {
    expect(rule(mirror, '.display')).toContain('background: var(--device-screen)');
  });

  /**
   * Criterion 13 — the highlight states the tree's answer, it never glides
   * toward it. Animating its geometry means the box on screen carries the
   * *previous* element's size and place for the duration, which reads as the
   * wrong height or width on every hover.
   */
  it('snaps the highlight instead of animating its geometry', () => {
    expect(rule(mirror, '.highlight')).not.toContain('transition');
  });

  /**
   * The overlay lives in the canvas's pre-transform space, so the phone's fit
   * scale would shrink its chrome with the picture. The label counter-scales
   * to stay readable, and the border divides by the same factor so 1.5px on
   * screen means 1.5px at any fit.
   */
  it('keeps the label and the border optically constant across fits', () => {
    expect(rule(mirror, '.highlightLabel')).toContain(
      'transform: scale(calc(1 / var(--fit-scale, 1)))',
    );
    expect(rule(mirror, '.highlight')).toContain('calc(var(--border-thick) / var(--fit-scale, 1))');
  });
});

/**
 * The design system's `utilities/` ships five classes that each declare their
 * own `backdrop-filter`. They are copied verbatim and cannot be edited, so the
 * one-blur guard above excludes them — which leaves criterion 1 exactly one
 * `className="cd-glass-2"` away from breaking with that guard still green.
 */
describe('the vendored glass utilities', () => {
  const TSX = walk(RENDERER, (name) => name.endsWith('.tsx') && !name.includes('.test.')).map(
    (path) => ({ name: relative(RENDERER, path), code: readFileSync(path, 'utf8') }),
  );

  it.each(TSX)('$name uses none of them', ({ code }) => {
    expect(code).not.toMatch(/cd-glass-[123]|cd-vibrant|cd-content|cd-sheen|cd-sunken/);
  });
});
