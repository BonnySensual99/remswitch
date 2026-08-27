param(
    [string]$InPfx = "$PSScriptRoot\..\deceive_official.pfx",
    [string]$OutPfx = "$PSScriptRoot\..\deceive_node_compat.pfx",
    [string]$OutPass = "remswitch"
)

Add-Type -AssemblyName System.Security

# Import the official Deceive PFX (no passphrase - it's from their server)
$pfxBytes = [System.IO.File]::ReadAllBytes($InPfx)

# Try to load - no passphrase
try {
    $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable `
           -bor [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfxBytes, '', $flags)
    Write-Host "Loaded cert: $($cert.Subject)"
    Write-Host "Has private key: $($cert.HasPrivateKey)"
    Write-Host "Valid until: $($cert.NotAfter)"
} catch {
    Write-Host "Error loading PFX: $_"
    exit 1
}

# Get all certs in the collection (leaf + chain)
$certCollection = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
try {
    $certCollection.Import($pfxBytes, '', [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)
    Write-Host "Loaded $($certCollection.Count) certs in chain"
    foreach ($c in $certCollection) {
        Write-Host "  - $($c.Subject) (HasKey: $($c.HasPrivateKey))"
    }
} catch {
    Write-Host "Collection import error: $_"
}

# Re-export with legacy crypto (triple-DES + SHA1 which OpenSSL/Node supports)
try {
    $exportBytes = $certCollection.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $OutPass)
    [System.IO.File]::WriteAllBytes($OutPfx, $exportBytes)
    Write-Host "Exported to $OutPfx ($($exportBytes.Length) bytes)"
} catch {
    Write-Host "Export error: $_"
    # Try exporting just the main cert with private key
    try {
        $exportBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $OutPass)
        [System.IO.File]::WriteAllBytes($OutPfx, $exportBytes)
        Write-Host "Exported single cert to $OutPfx ($($exportBytes.Length) bytes)"
    } catch {
        Write-Host "Single cert export error: $_"
    }
}
