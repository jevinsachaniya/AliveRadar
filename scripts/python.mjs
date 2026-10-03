// npm convenience bridge. All API, worker, database and operational logic is Python.
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const python =
  process.env.PYTHON ||
  resolve(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
if (!existsSync(python) && !process.env.PYTHON) {
  console.error('Python environment missing. Run uv sync --extra dev (see README).');
  process.exit(1);
}
const child = spawn(python, process.argv.slice(2), { stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
