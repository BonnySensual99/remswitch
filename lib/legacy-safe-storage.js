const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function unwrapDpapiKey(encryptedKey) {
    if (!Buffer.isBuffer(encryptedKey) || encryptedKey.subarray(0, 5).toString('ascii') !== 'DPAPI') {
        throw new Error('Clave Chromium no válida.');
    }
    const payload = encryptedKey.subarray(5).toString('base64');
    const script = `Add-Type -AssemblyName System.Security;[Console]::OutputEncoding=[Text.Encoding]::UTF8;$d=[System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${payload}'),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Convert]::ToBase64String($d)`;
    const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8', windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024
    }).trim();
    return Buffer.from(result, 'base64');
}

function decryptChromiumValue(value, key) {
    if (!Buffer.isBuffer(value) || value.subarray(0, 3).toString('ascii') !== 'v10' || value.length < 32) {
        throw new Error('Blob Chromium no válido.');
    }
    const nonce = value.subarray(3, 15);
    const tag = value.subarray(value.length - 16);
    const ciphertext = value.subarray(15, value.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function decryptWithLocalState(value, localStatePath) {
    const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
    const encodedKey = localState?.os_crypt?.encrypted_key;
    if (!encodedKey) throw new Error('Local State no contiene la clave esperada.');
    const key = unwrapDpapiKey(Buffer.from(encodedKey, 'base64'));
    try {
        return decryptChromiumValue(value, key);
    } finally {
        key.fill(0);
    }
}

function decryptFromCandidates(value, candidatePaths) {
    for (const candidate of candidatePaths) {
        try {
            if (!fs.existsSync(candidate)) continue;
            const result = decryptWithLocalState(value, candidate);
            if (result) return result;
        } catch {}
    }
    throw new Error('No se pudo migrar la clave cifrada de la versión anterior.');
}

module.exports = { decryptChromiumValue, decryptFromCandidates, decryptWithLocalState, unwrapDpapiKey };
