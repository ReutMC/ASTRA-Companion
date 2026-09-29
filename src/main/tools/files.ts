import fs from 'fs';
import os from 'os';
import path from 'path';
import { exec } from 'child_process';
import { toolRegistry } from './index';

const ALLOWED_EXT = new Set(['.txt', '.md', '.json', '.csv', '.html', '.css', '.js', '.py']);
const FOLDERS = ['Generated', 'Research', 'Exports'];

export function astraRoot(): string {
  return path.join(os.homedir(), 'Documents', 'ASTRA');
}

export function ensureAstraDirs(): void {
  fs.mkdirSync(astraRoot(), { recursive: true });
  for (const d of FOLDERS) fs.mkdirSync(path.join(astraRoot(), d), { recursive: true });
}

function safeName(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base =
    path
      .basename(name, path.extname(name))
      .replace(/[\\/:*?"<>|]/g, '')
      .trim()
      .slice(0, 80) || 'file';
  return base + (ALLOWED_EXT.has(ext) ? ext : '.md');
}

export async function generateFile(args: {
  filename?: string;
  content?: string;
  folder?: string;
  confirm?: boolean;
}): Promise<unknown> {
  ensureAstraDirs();
  const folder = FOLDERS.includes(String(args.folder)) ? String(args.folder) : 'Generated';
  const fn = safeName(String(args.filename || 'astra.md'));
  const p = path.join(astraRoot(), folder, fn);
  if (fs.existsSync(p) && args.confirm !== true) {
    return { needsConfirmation: true, message: `File already exists: ${p}. Overwrite?`, path: p };
  }
  fs.writeFileSync(p, String(args.content ?? ''), 'utf8');
  return { ok: true, path: p, bytes: Buffer.byteLength(String(args.content ?? '')) };
}

export async function saveResearchFile(title: string, markdown: string): Promise<unknown> {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'report';
  return generateFile({ filename: `${slug}.md`, content: markdown, folder: 'Research', confirm: true });
}

function shellOpen(target: string): void {
  if (process.platform === 'win32') exec(`start "" "${target}"`, { windowsHide: true });
  else if (process.platform === 'darwin') exec(`open "${target}"`);
  else exec(`xdg-open "${target}"`);
}

export async function findFile(args: { query?: string; scope?: string }): Promise<unknown> {
  const q = String(args.query || '').toLowerCase().trim();
  if (!q) return { error: 'query is required' };
  const root = String(args.scope || '').trim() || path.join(os.homedir(), 'Documents');
  const results: { name: string; path: string }[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 6 || results.length >= 25) return;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (results.length >= 25) return;
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else if (e.name.toLowerCase().includes(q)) results.push({ name: e.name, path: fp });
    }
  };
  walk(root, 0);
  return { count: results.length, results };
}

export function registerFileTools(r: typeof toolRegistry): void {
  r.register({
    name: 'generate_file',
    permission: 'FILES',
    description:
      'Create a text file for the user in Documents/ASTRA. Allowed types: txt, md, json, csv, html, css, js, py. If the file exists, needsConfirmation is returned - ask the user first, then retry with confirm=true.',
    args: '{ "filename": "report.md", "content": "...", "folder": "Generated|Research|Exports", "confirm": false }',
    describe: (a) => `Creating file ${String(a.filename || 'file')} in Documents/ASTRA/${String(a.folder || 'Generated')}`,
    run: (a) =>
      generateFile({
        filename: String(a.filename || ''),
        content: String(a.content ?? ''),
        folder: String(a.folder || 'Generated'),
        confirm: a.confirm === true
      })
  });

  r.register({
    name: 'find_file',
    permission: 'FILES',
    description: 'Find files by name fragment. Searches Documents by default (max 25 results).',
    args: '{ "query": "invoice", "scope": "optional absolute folder" }',
    describe: (a) => `Searching for files named like "${String(a.query || '')}"`,
    run: (a) => findFile({ query: String(a.query || ''), scope: a.scope ? String(a.scope) : undefined })
  });

  r.register({
    name: 'open_file',
    permission: 'FILES',
    description: 'Find a file by name fragment and open it with the default Windows application (first match).',
    args: '{ "query": "report.md" }',
    describe: (a) => `Opening file "${String(a.query || '')}"`,
    run: async (a) => {
      const res = (await findFile({ query: String(a.query || '') })) as { results?: { path: string }[] };
      if (!res.results || !res.results.length) return { error: 'No matching file found.' };
      shellOpen(res.results[0].path);
      return { ok: true, opened: res.results[0].path };
    }
  });

  r.register({
    name: 'create_folder',
    permission: 'FILES',
    description: 'Create a folder. Relative paths are created under Documents/ASTRA; absolute paths must be inside the user profile.',
    args: '{ "path": "Projects/Space" }',
    describe: (a) => `Creating folder ${String(a.path || '')}`,
    run: async (a) => {
      let p = String(a.path || '').trim();
      if (!p) return { error: 'path is required' };
      p = path.isAbsolute(p) ? path.normalize(p) : path.join(astraRoot(), p);
      const home = os.homedir();
      if (!p.toLowerCase().startsWith(home.toLowerCase())) {
        return { error: 'For security, folders can only be created inside your user profile.' };
      }
      fs.mkdirSync(p, { recursive: true });
      return { ok: true, path: p };
    }
  });

  r.register({
    name: 'list_dir',
    permission: 'FILES',
    description: 'List the contents of a folder (default: Documents/ASTRA).',
    args: '{ "path": "optional absolute folder" }',
    describe: (a) => `Listing folder ${String(a.path || astraRoot())}`,
    run: async (a) => {
      const target = String(a.path || '').trim() || astraRoot();
      const ents = fs.readdirSync(target, { withFileTypes: true }).slice(0, 100);
      return {
        path: target,
        entries: ents.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          size: e.isFile() ? fs.statSync(path.join(target, e.name)).size : undefined
        }))
      };
    }
  });
}
