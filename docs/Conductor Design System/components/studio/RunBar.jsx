import React from 'react';
import { Button } from '../core/Button.jsx';
import { IconButton } from '../core/IconButton.jsx';
import { Select } from '../core/Select.jsx';

export function RunBar({
  env,
  envOptions = [],
  onEnvChange,
  running = false,
  onRun,
  onRunAll,
  onStop,
  extra,
  style,
  ...rest
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-5)',
        height: 'var(--toolbar-h)',
        padding: '0 var(--space-5)',
        flex: 'none',
        borderTop: 'var(--border-hair) solid var(--edge-1)',
        borderBottom: 'var(--border-hair) solid var(--edge-1)',
        ...style,
      }}
      {...rest}
    >
      {extra}
      <span style={{ flex: 1 }} />
      {envOptions.length ? (
        <Select size="sm" icon="variable" value={env} options={envOptions} onChange={onEnvChange} />
      ) : null}
      {running ? (
        <Button variant="danger" icon="circle-stop" onClick={onStop}>
          Stop
        </Button>
      ) : (
        <Button variant="primary" icon="play" onClick={onRun}>
          Run Test
        </Button>
      )}
      {onRunAll ? (
        <Button icon="list-checks" onClick={onRunAll} disabled={running}>
          Run All Tests
        </Button>
      ) : null}
      <IconButton icon="chevron-down" label="Run options" size="md" variant="glass" />
    </div>
  );
}
