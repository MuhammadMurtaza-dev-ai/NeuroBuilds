import fs from 'fs/promises';
import path from 'path';
import type { BlogState } from '../types';

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function loadAllStates(): Promise<BlogState[]> {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(raw) as BlogState[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function saveAllStates(states: BlogState[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(STATE_FILE, JSON.stringify(states, null, 2), 'utf-8');
}

/** Insert or replace the state for state.id. Always updates updatedAt. */
export async function upsertState(state: BlogState): Promise<void> {
  const states = await loadAllStates();
  const idx = states.findIndex((s) => s.id === state.id);
  const updated: BlogState = { ...state, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    states[idx] = updated;
  } else {
    states.push(updated);
  }
  await saveAllStates(states);
}

export async function getStateById(id: string): Promise<BlogState | undefined> {
  const states = await loadAllStates();
  return states.find((s) => s.id === id);
}

export async function getPendingStates(): Promise<BlogState[]> {
  const states = await loadAllStates();
  return states.filter((s) => s.status === 'pending_approval');
}

// ── Draft file helpers (for the Edit flow) ───────────────────────────────────

export function draftFilePath(id: string): string {
  return path.join(DATA_DIR, `draft-${id}.md`);
}

export async function saveDraftFile(id: string, content: string): Promise<string> {
  await ensureDataDir();
  const filePath = draftFilePath(id);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

export async function loadDraftFile(id: string): Promise<string> {
  return fs.readFile(draftFilePath(id), 'utf-8');
}
