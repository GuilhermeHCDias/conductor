import type { CSSProperties } from 'react';

/**
 * The generated Maestro flow, syntax-highlighted. Read-mostly: users edit by clicking
 * the mirror or asking the assistant, so this favours legibility over editing affordances.
 */
export interface YamlEditorProps {
  /** Raw .yaml text. Highlighting covers keys, flow keywords, strings, numbers/booleans and comments. */
  value?: string;
  /** 1-based line with the caret. Gets the active-line wash and a blinking caret. */
  activeLine?: number;
  /** 1-based lines that failed on the last run — red wash + red left bar. */
  errorLines?: number[];
  /** 1-based lines the assistant just wrote — blue AI wash + blue left bar. Clear these once acknowledged. */
  aiLines?: number[];
  showGutter?: boolean;
  padding?: string;
  onLineClick?: (line: number) => void;
  style?: CSSProperties;
}

export declare function YamlEditor(props: YamlEditorProps): JSX.Element;
