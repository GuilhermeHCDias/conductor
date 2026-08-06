import type { CSSProperties, ReactNode } from "react";

/**
 * One turn in the assistant column. User turns are glass bubbles aligned right;
 * assistant turns are unbubbled prose under a blue "Conductor" byline.
 */
export interface ChatMessageProps {
  role?: "user" | "assistant";
  children?: ReactNode;
  /** Proposed YAML. Rendered in a blue-edged sunken block with an insert action. */
  code?: string;
  /** Filename shown on the code block header. */
  codeLabel?: string;
  /** Appends the snippet to the open flow. Omit to render the block read-only. */
  onInsert?: () => void;
  onCopy?: () => void;
  /** Streaming/thinking placeholder. */
  pending?: boolean;
  style?: CSSProperties;
}

export declare function ChatMessage(props: ChatMessageProps): JSX.Element;
