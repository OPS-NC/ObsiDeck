import { z } from "zod";

// Lexical checks only; the Vault class performs the authoritative validation.
export const vaultPath = z.string().min(1).max(1024);

export const createNoteSchema = z.object({
  path: vaultPath,
  content: z.string().optional(),
});

export const saveNoteSchema = z.object({
  path: vaultPath,
  content: z.string(),
  baseVersion: z.string().regex(/^[a-f0-9]{32}$/).optional(),
});

export const createFolderSchema = z.object({
  path: vaultPath,
});

export const renameSchema = z.object({
  from: vaultPath,
  to: vaultPath,
});

export const searchQuerySchema = z.object({
  q: z.string().max(200),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
