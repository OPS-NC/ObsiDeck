// Types shared between the API and the browser. Paths are always relative to
// the vault root, using "/" as separator, never absolute host paths.

export interface FileNode {
  type: "file";
  name: string;
  path: string;
  mtime: number;
  size: number;
}

export interface FolderNode {
  type: "folder";
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = FileNode | FolderNode;

export interface TreeResponse {
  vaultName: string;
  root: FolderNode;
}

export interface NoteResponse {
  path: string;
  content: string;
  version: string;
  mtime: number;
}

export interface SaveResponse {
  path: string;
  version: string;
  mtime: number;
}

export interface ConflictResponse {
  error: string;
  code: "CONFLICT";
  currentVersion: string;
}

export interface SearchHit {
  path: string;
  name: string;
  line: number;
  snippet: string;
  matchStart: number;
  matchLength: number;
  matches: number;
}

export interface SearchResponse {
  query: string;
  hits: SearchHit[];
  truncated: boolean;
}

export type VaultEventKind = "add" | "change" | "unlink" | "addDir" | "unlinkDir";

export interface VaultEvent {
  kind: VaultEventKind;
  path: string;
}

export interface ApiError {
  error: string;
  code?: string;
}
