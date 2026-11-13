import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export function browserCandidates(env = process.env) {
  return [
    env.ProgramFiles && join(env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['ProgramFiles(x86)'] && join(env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['ProgramFiles(x86)'] && join(env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    env.ProgramFiles && join(env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean);
}
export function openRoomRun(url = 'http://localhost:8787/') {
  const browser = browserCandidates().find(existsSync);
  if (!browser) { console.log('Open this URL in Chrome or Microsoft Edge: ' + url); return; }
  const child = spawn(browser, ['--new-window', url], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.log('Open this URL in Chrome or Microsoft Edge: ' + url));
  child.unref();
}

