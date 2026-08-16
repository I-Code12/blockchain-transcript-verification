$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$blockchainPath = Join-Path $projectRoot "blockchain"
$expectedWallet = "0xFc961d52dAc318ef302c603E9364640CaC6347d4"

function ConvertFrom-LocalSecureString {
    param([Security.SecureString]$Value)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

Write-Host "NexusVerify - Ethereum Sepolia deployment" -ForegroundColor Cyan
Write-Host "Expected registrar wallet: $expectedWallet"
Write-Host "Use only a dedicated demonstration wallet. Nothing entered here is written to a file." -ForegroundColor Yellow
Write-Host "The Alchemy key previously shared in chat must be rotated before continuing." -ForegroundColor Yellow
Write-Host ""

$confirmation = Read-Host "Type DEPLOY to continue"
if ($confirmation -cne "DEPLOY") {
    Write-Host "Cancelled. No blockchain transaction was sent."
    exit 1
}

$rpcSecure = Read-Host "Paste the NEW rotated Sepolia RPC URL" -AsSecureString
$keySecure = Read-Host "Paste the private key for $expectedWallet" -AsSecureString
$rpcUrl = $null
$privateKey = $null

try {
    $rpcUrl = ConvertFrom-LocalSecureString $rpcSecure
    $privateKey = ConvertFrom-LocalSecureString $keySecure
    if ([string]::IsNullOrWhiteSpace($rpcUrl) -or [string]::IsNullOrWhiteSpace($privateKey)) {
        throw "The RPC URL and private key are required."
    }

    $env:BLOCKCHAIN_DEPLOYMENT = "sepolia"
    $env:BLOCKCHAIN_NETWORK_NAME = "Ethereum Sepolia"
    $env:BLOCKCHAIN_RPC_URL = $rpcUrl.Trim()
    $env:BLOCK_EXPLORER_URL = "https://sepolia.etherscan.io"
    $env:REGISTRAR_PRIVATE_KEY = $privateKey.Trim()
    $env:EXPECTED_REGISTRAR_ADDRESS = $expectedWallet
    $env:EXPECTED_CHAIN_ID = "11155111"

    Push-Location $blockchainPath
    try {
        Write-Host "Checking the contract and wallet..." -ForegroundColor Cyan
        & npm.cmd run compile
        if ($LASTEXITCODE -ne 0) { throw "Contract compilation failed." }
        & npm.cmd run preflight:public
        if ($LASTEXITCODE -ne 0) { throw "Sepolia preflight failed." }

        Write-Host "Deploying TranscriptRegistry to Sepolia..." -ForegroundColor Cyan
        & npm.cmd run deploy
        if ($LASTEXITCODE -ne 0) { throw "Contract deployment failed." }
    }
    finally {
        Pop-Location
    }

    $deploymentFile = Join-Path $blockchainPath "deployments\sepolia.json"
    if (-not (Test-Path -LiteralPath $deploymentFile)) {
        throw "Deployment finished without producing the expected deployment record."
    }
    $deployment = Get-Content -LiteralPath $deploymentFile -Raw | ConvertFrom-Json
    Write-Host ""
    Write-Host "Sepolia deployment complete." -ForegroundColor Green
    Write-Host "Contract: $($deployment.address)"
    Write-Host "Transaction: https://sepolia.etherscan.io/tx/$($deployment.transactionHash)"
    Write-Host "The local deployment record contains no RPC URL or private key."
}
catch {
    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
finally {
    $env:BLOCKCHAIN_DEPLOYMENT = $null
    $env:BLOCKCHAIN_NETWORK_NAME = $null
    $env:BLOCKCHAIN_RPC_URL = $null
    $env:BLOCK_EXPLORER_URL = $null
    $env:REGISTRAR_PRIVATE_KEY = $null
    $env:EXPECTED_REGISTRAR_ADDRESS = $null
    $env:EXPECTED_CHAIN_ID = $null
    $rpcUrl = $null
    $privateKey = $null
}
