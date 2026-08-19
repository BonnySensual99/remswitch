const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const executable = path.join(__dirname, '..', 'release', 'win-unpacked', 'RemSwitcher.exe');
if (!fs.existsSync(executable)) {
    console.error('No existe la compilación empaquetada. Ejecuta npm run build primero.');
    process.exit(1);
}

const child = spawn(executable, ['--smoke-test'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });

const timeout = setTimeout(() => {
    child.kill();
    console.error('El smoke empaquetado agotó el tiempo de espera.');
    process.exit(1);
}, 20000);

child.on('error', (error) => {
    clearTimeout(timeout);
    console.error(error.message);
    process.exit(1);
});
child.on('close', (code) => {
    clearTimeout(timeout);
    if (code !== 0) {
        console.error(output || `El smoke empaquetado terminó con código ${code}.`);
        process.exit(1);
    }
    process.stdout.write(output || 'Packaged smoke: precarga y botones OK\n');
});
