/**
 * Sandbox security tests — write_file validation + open_path allowlist.
 */
import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { astraRoot, validateWrite } from '../agent/src/tools/filesystem'
import { isAllowedPath } from '../agent/src/tools/windowsApps'

const HOME = '/home/tester'

describe('validateWrite sandbox', () => {
  it('rejects path traversal', () => {
    expect(validateWrite('Research', '../../evil.exe', HOME).ok).toBe(false)
    expect(validateWrite('Generated', 'sub/../../evil.exe', HOME).ok).toBe(false)
    expect(validateWrite('Research', 'a\\..\\..\\evil.txt', HOME).ok).toBe(false)
  })

  it('rejects disallowed extensions', () => {
    for (const f of ['evil.exe', 'evil.bat', 'evil.sh', 'evil.cmd', 'evil.ps1', 'evil', 'noext']) {
      expect(validateWrite('Research', f, HOME).ok).toBe(false)
    }
  })

  it('rejects unknown folders', () => {
    expect(validateWrite('Downloads', 'a.md', HOME).ok).toBe(false)
    expect(validateWrite('../system32', 'a.md', HOME).ok).toBe(false)
    expect(validateWrite('', 'a.md', HOME).ok).toBe(false)
  })

  it('rejects empty filenames', () => {
    expect(validateWrite('Research', '', HOME).ok).toBe(false)
    expect(validateWrite('Research', '   ', HOME).ok).toBe(false)
  })

  it('accepts a valid research note inside the sandbox', () => {
    const v = validateWrite('Research', 'report.md', HOME)
    expect(v.ok).toBe(true)
    expect(v.absPath).toBe(path.join(HOME, 'Documents', 'ASTRA', 'Research', 'report.md'))
    expect(v.absPath.startsWith(astraRoot(HOME))).toBe(true)
  })

  it('accepts every allowed extension in every allowed folder', () => {
    for (const folder of ['Generated', 'Research', 'Exports']) {
      for (const ext of ['txt', 'md', 'json', 'csv', 'html', 'css', 'js', 'py']) {
        expect(validateWrite(folder, `file.${ext}`, HOME).ok).toBe(true)
      }
    }
  })
})

describe('isAllowedPath (open_path guard)', () => {
  it('accepts subpaths of the user profile', () => {
    expect(isAllowedPath('C:\\Users\\tester\\Documents\\a.txt', 'C:\\Users\\tester')).toBe(true)
    expect(isAllowedPath('/home/tester/Downloads', '/home/tester')).toBe(true)
    expect(isAllowedPath('/home/tester', '/home/tester')).toBe(true)
  })

  it('rejects Windows / System32 / Program Files', () => {
    expect(isAllowedPath('C:\\Windows\\explorer.exe', 'C:\\Users\\tester')).toBe(false)
    expect(isAllowedPath('C:\\Users\\tester\\..\\..\\Windows\\x', 'C:\\Users\\tester')).toBe(false)
    expect(isAllowedPath('C:\\Program Files\\Evil\\x.exe', 'C:\\Users\\tester')).toBe(false)
  })

  it('rejects paths outside the user profile', () => {
    expect(isAllowedPath('D:\\Downloads\\x', 'C:\\Users\\tester')).toBe(false)
    expect(isAllowedPath('/etc/passwd', '/home/tester')).toBe(false)
  })

  it('rejects ".." escapes', () => {
    expect(isAllowedPath('/home/tester/../secret', '/home/tester')).toBe(false)
    expect(isAllowedPath('/home/tester/Documents/../..', '/home/tester')).toBe(false)
  })
})
