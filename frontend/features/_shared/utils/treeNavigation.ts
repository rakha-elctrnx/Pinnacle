/**
 * treeNavigation.ts — Pure utilities for flat visible-node list
 * computation and keyboard-driven focus navigation in the sidebar tree.
 *
 * These functions are side-effect-free and operate on plain arrays
 * so they can be called on every keypress without performance concerns
 * for trees up to ~1000 nodes.
 */

import type { TreeNode } from '../types/shared'

/** Flat entry representing a node visible in the rendered tree order. */
export interface VisibleNode {
  path: string
  node: TreeNode
  depth: number
}

/**
 * Walk the tree in visual order (depth-first), collecting only nodes
 * whose parent chain is fully expanded. Matches the render logic of
 * `TreeNodeItem` in ConnectionSidebar.
 */
export function getVisibleNodes(
  treeNodes: TreeNode[],
  expandedPaths: string[],
  parentPath = '',
  depth = 0,
): VisibleNode[] {
  const result: VisibleNode[] = []
  for (const node of treeNodes) {
    const nodePath = parentPath ? `${parentPath}/${node.label}` : node.label
    result.push({ path: nodePath, node, depth })
    if (node.children && expandedPaths.includes(nodePath)) {
      result.push(
        ...getVisibleNodes(node.children, expandedPaths, nodePath, depth + 1),
      )
    }
  }
  return result
}

/** Return the path of the node immediately after `currentPath`, or null if last. */
export function getNextNode(
  visibleNodes: VisibleNode[],
  currentPath: string,
): string | null {
  const idx = visibleNodes.findIndex((n) => n.path === currentPath)
  if (idx < 0 || idx >= visibleNodes.length - 1) return null
  return visibleNodes[idx + 1].path
}

/** Return the path of the node immediately before `currentPath`, or null if first. */
export function getPreviousNode(
  visibleNodes: VisibleNode[],
  currentPath: string,
): string | null {
  const idx = visibleNodes.findIndex((n) => n.path === currentPath)
  if (idx <= 0) return null
  return visibleNodes[idx - 1].path
}

/** Extract the parent path from a node path string. Returns null for root nodes. */
export function getParentPath(nodePath: string): string | null {
  const lastSlash = nodePath.lastIndexOf('/')
  return lastSlash > 0 ? nodePath.substring(0, lastSlash) : null
}

/** Return the path of the first node in the visible list. */
export function getFirstVisibleNode(
  visibleNodes: VisibleNode[],
): string | null {
  return visibleNodes.length > 0 ? visibleNodes[0].path : null
}

/** Return the path of the last node in the visible list. */
export function getLastVisibleNode(visibleNodes: VisibleNode[]): string | null {
  return visibleNodes.length > 0
    ? visibleNodes[visibleNodes.length - 1].path
    : null
}
