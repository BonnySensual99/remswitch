Add-Type -AssemblyName System.Security

$pfxBytes = [System.IO.File]::ReadAllBytes("$PSScriptRoot\..\debug_cert.pfx")
$flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable -bor [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::PersistKeySet
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfxBytes, 'remswitch', $flags)

Write-Host "Cert Subject: $($cert.Subject)"
Write-Host "Has Private Key: $($cert.HasPrivateKey)"

# Export leaf cert PEM
$certB64 = [Convert]::ToBase64String($cert.RawData)
$certLines = $certB64 -split '(?<=\G.{64})(?=.)'
$certPem = "-----BEGIN CERTIFICATE-----`n" + ($certLines -join "`n") + "`n-----END CERTIFICATE-----`n"
[System.IO.File]::WriteAllText("$PSScriptRoot\..\leaf-cert.pem", $certPem, [System.Text.Encoding]::ASCII)
Write-Host "Leaf cert exported"

# Try RSA key export
try {
    $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
    if ($rsa -ne $null) {
        $keyBytes = $rsa.ExportPkcs8PrivateKey()
        $keyB64 = [Convert]::ToBase64String($keyBytes)
        $keyLines = $keyB64 -split '(?<=\G.{64})(?=.)'
        $keyPem = "-----BEGIN PRIVATE KEY-----`n" + ($keyLines -join "`n") + "`n-----END PRIVATE KEY-----`n"
        [System.IO.File]::WriteAllText("$PSScriptRoot\..\leaf-key.pem", $keyPem, [System.Text.Encoding]::ASCII)
        Write-Host "RSA private key exported"
    }
} catch {
    Write-Host "RSA failed: $_"
}

# Try ECDSA key export
try {
    $ecdsa = [System.Security.Cryptography.X509Certificates.ECDsaCertificateExtensions]::GetECDsaPrivateKey($cert)
    if ($ecdsa -ne $null) {
        $keyBytes = $ecdsa.ExportPkcs8PrivateKey()
        $keyB64 = [Convert]::ToBase64String($keyBytes)
        $keyLines = $keyB64 -split '(?<=\G.{64})(?=.)'
        $keyPem = "-----BEGIN PRIVATE KEY-----`n" + ($keyLines -join "`n") + "`n-----END PRIVATE KEY-----`n"
        [System.IO.File]::WriteAllText("$PSScriptRoot\..\leaf-key.pem", $keyPem, [System.Text.Encoding]::ASCII)
        Write-Host "ECDSA private key exported"
    }
} catch {
    Write-Host "ECDSA failed: $_"
}

Write-Host "Done"
