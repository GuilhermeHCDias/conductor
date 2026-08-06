import React from 'react';

const KEYWORDS = /^(appId|tags|env|onFlowStart|onFlowComplete|name)$/;

function tokenize(line) {
  const out = [];
  const push = (t, v) => v && out.push({ t, v });
  const commentAt = line.indexOf('#');
  let body = line;
  let comment = '';
  if (commentAt >= 0) {
    body = line.slice(0, commentAt);
    comment = line.slice(commentAt);
  }
  const doc = body.match(/^\s*---\s*$/);
  if (doc) {
    push('punct', body);
    push('comment', comment);
    return out;
  }
  const m = body.match(/^(\s*)(-\s*)?([A-Za-z_][\w.-]*)(:)(.*)$/);
  if (m) {
    push('plain', m[1]);
    push('dash', m[2]);
    push(KEYWORDS.test(m[3]) ? 'anchor' : 'key', m[3]);
    push('punct', m[4]);
    const rest = m[5];
    if (rest) {
      if (/^\s*(true|false|null|\d+(\.\d+)?)\s*$/.test(rest)) push('number', rest);
      else push('string', rest);
    }
  } else {
    const d = body.match(/^(\s*)(-\s*)(.*)$/);
    if (d) {
      push('plain', d[1]);
      push('dash', d[2]);
      push('string', d[3]);
    } else push('plain', body);
  }
  push('comment', comment);
  return out;
}

const COLORS = {
  key: 'var(--syn-key)',
  anchor: 'var(--syn-anchor)',
  string: 'var(--syn-string)',
  number: 'var(--syn-number)',
  punct: 'var(--syn-punct)',
  dash: 'var(--syn-punct)',
  comment: 'var(--syn-comment)',
  plain: 'var(--text-primary)',
};

export function YamlEditor({
  value = '',
  activeLine,
  errorLines = [],
  aiLines = [],
  showGutter = true,
  padding = 'var(--space-5) 0',
  onLineClick,
  style,
  ...rest
}) {
  const lines = value.replace(/\n$/, '').split('\n');
  const total = Math.max(lines.length + 1, 1);
  const width = String(total).length;
  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        overflow: 'auto',
        background: 'var(--editor-bg)',
        padding,
        font: 'var(--type-code)',
        letterSpacing: 'var(--ls-mono)',
        tabSize: 2,
        ...style,
      }}
      {...rest}
    >
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const text = lines[i] != null ? lines[i] : '';
        const isActive = n === activeLine;
        const isError = errorLines.includes(n);
        const isAi = aiLines.includes(n);
        return (
          <div
            key={n}
            onClick={() => onLineClick && onLineClick(n)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-5)',
              minHeight: 'calc(var(--size-13) * var(--lh-code))',
              padding: '0 var(--space-6) 0 var(--space-5)',
              background: isError
                ? 'var(--state-fail-quiet)'
                : isAi
                  ? 'var(--ai-quiet)'
                  : isActive
                    ? 'var(--editor-active-line)'
                    : 'transparent',
              boxShadow: isAi
                ? 'inset 2px 0 0 0 var(--ai)'
                : isError
                  ? 'inset 2px 0 0 0 var(--state-fail)'
                  : 'none',
              cursor: onLineClick ? 'text' : 'default',
            }}
          >
            {showGutter ? (
              <span
                style={{
                  flex: 'none',
                  width: width + 'ch',
                  textAlign: 'right',
                  color: isActive ? 'var(--text-secondary)' : 'var(--editor-gutter)',
                  userSelect: 'none',
                }}
              >
                {n}
              </span>
            ) : null}
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: 0 }}>
              {tokenize(text).map((tk, j) => (
                <span key={j} style={{ color: COLORS[tk.t] }}>
                  {tk.v}
                </span>
              ))}
              {isActive ? (
                <span
                  style={{
                    display: 'inline-block',
                    width: 1.5,
                    height: '1.05em',
                    marginLeft: 1,
                    verticalAlign: 'text-bottom',
                    background: 'var(--editor-caret)',
                    animation: 'cd-caret 1s steps(1) infinite',
                  }}
                />
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
