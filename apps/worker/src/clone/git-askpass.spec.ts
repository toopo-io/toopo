import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ASKPASS_PASSWORD_ENV,
  ASKPASS_USERNAME_ENV,
  type AskpassSetup,
  prepareAskpass,
} from './git-askpass';

const CREDS = { username: 'x-access-token', password: 'ghs_supersecret_installation_token' };

/** Run the generated askpass script under Node with a prompt + the setup env. */
function runAskpassScript(setup: AskpassSetup, prompt: string): Promise<string> {
  const scriptPath = path.join(path.dirname(setup.env.GIT_ASKPASS), 'askpass.mjs');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, prompt], {
      env: { ...process.env, ...setup.env },
    });
    let out = '';
    child.stdout.on('data', (data: Buffer) => {
      out += data.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', () => resolve(out.trim()));
  });
}

describe('prepareAskpass', () => {
  let setup: AskpassSetup | null = null;

  afterEach(async () => {
    await setup?.cleanup();
    setup = null;
  });

  it('emits the username on a Username prompt and the token on a Password prompt', async () => {
    setup = await prepareAskpass(CREDS);
    expect(await runAskpassScript(setup, "Username for 'https://github.com': ")).toBe(
      'x-access-token',
    );
    expect(
      await runAskpassScript(setup, "Password for 'https://x-access-token@github.com': "),
    ).toBe(CREDS.password);
  });

  it('confines the token to the password env var — never the script or wrapper files', async () => {
    setup = await prepareAskpass(CREDS);
    const dir = path.dirname(setup.env.GIT_ASKPASS);
    const script = await readFile(path.join(dir, 'askpass.mjs'), 'utf8');
    const wrapper = await readFile(setup.env.GIT_ASKPASS, 'utf8');

    expect(script).not.toContain(CREDS.password);
    expect(wrapper).not.toContain(CREDS.password);
    expect(setup.env[ASKPASS_PASSWORD_ENV]).toBe(CREDS.password);
    expect(setup.env[ASKPASS_USERNAME_ENV]).toBe(CREDS.username);
    // The wrapper execs Node on the script (the glue that makes GIT_ASKPASS run).
    expect(wrapper).toContain(process.execPath);
    expect(wrapper).toContain('askpass.mjs');
  });

  it('cleanup removes the temp askpass directory', async () => {
    const local = await prepareAskpass(CREDS);
    const dir = path.dirname(local.env.GIT_ASKPASS);
    await local.cleanup();
    await expect(stat(dir)).rejects.toThrow();
  });
});
