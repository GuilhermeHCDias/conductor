import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COMMAND_GROUPS } from '../../lib/command-templates';
import { ACTION_ICONS, Icon } from './Icon';

describe('Icon', () => {
  it('draws the named glyph at the requested size', () => {
    const { container } = render(<Icon name="play" size={18} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('width', '18');
    expect(svg).toHaveAttribute('height', '18');
    expect(svg?.querySelector('path')).toBeInTheDocument();
  });

  // Icons take their colour from the control around them, which is how the same
  // glyph reads on a filled Run button and on a ghost toolbar button.
  it('strokes in currentColor at the design system weight', () => {
    const { container } = render(<Icon name="crosshair" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('stroke-width', '1.75');
    expect(svg).toHaveAttribute('fill', 'none');
  });

  // Criterion 51 puts the accessible name on the control, not on the glyph.
  it('is hidden from the accessibility tree', () => {
    const { container } = render(<Icon name="sparkles" />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  /** Criterion 24 — every command the menu offers has its DS glyph, drawable.
   * The mapping is the design system's `ACTION_ICONS`, verbatim. */
  it('maps every menu command to a glyph it can draw', () => {
    for (const group of COMMAND_GROUPS) {
      for (const command of group.commands) {
        const name = ACTION_ICONS[command];

        const { container, unmount } = render(<Icon name={name} />);
        expect(
          container.querySelector('svg path, svg circle, svg line, svg rect'),
          `${command} → ${name}`,
        ).toBeInTheDocument();
        unmount();
      }
    }
  });

  it('follows the DS mapping for the signature commands', () => {
    expect(ACTION_ICONS.tapOn).toBe('mouse-pointer-click');
    expect(ACTION_ICONS.longPressOn).toBe('hand');
    expect(ACTION_ICONS.inputText).toBe('text-cursor-input');
    expect(ACTION_ICONS.assertVisible).toBe('eye');
  });
});
