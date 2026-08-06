import type { ChangeEventHandler, CSSProperties } from 'react';

/** Assistant input at the foot of the chat column. Focus ring is blue `--glow-ai`, not the violet accent — this is AI territory. */
export interface ChatComposerProps {
  value?: string;
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  /** Fired on click or ⌘/Ctrl+Enter. */
  onSubmit?: (value: string) => void;
  placeholder?: string;
  /** Attached element pill above the field, e.g. 'Text · "Pedidos pendentes"'. */
  context?: string;
  disabled?: boolean;
  /** Spinner in the send button while a reply streams. */
  busy?: boolean;
  style?: CSSProperties;
}

export declare function ChatComposer(props: ChatComposerProps): JSX.Element;
