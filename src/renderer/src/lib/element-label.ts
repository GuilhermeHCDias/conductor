import type { TreeNode } from '@shared/types';

/**
 * Criterion 14: how the highlight and the command menu name an element — the
 * DS format `Kind · "text"`. The kind is the class name's last segment; the
 * text is the tree's own string, literally (§12 rule 4 — never transcribed
 * from pixels), falling back to content-desc, then resource-id.
 */
export function elementLabel(node: TreeNode): string {
  const kind = node.className?.split('.').at(-1) ?? 'View';
  const text = node.text ?? node.contentDescription ?? node.resourceId;
  return text === null ? kind : `${kind} · "${text}"`;
}
