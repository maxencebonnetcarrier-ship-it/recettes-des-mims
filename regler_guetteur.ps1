<#
.SYNOPSIS
  Guetteur des envies de Recettes des Mim's : réglage du partage, puis recherche des plats demandés.
.DESCRIPTION
  Ouvert par le raccourci « Guetteur des Mim's » du Bureau (posé par installer_guetteur.ps1).
  1re fois : demande le mot de passe de partage (le même que dans l'app, Réglages › Partage à deux), le
  vérifie auprès du hub, puis l'enregistre dans les réglages de CE PC (MIMS_HUB_URL, MIMS_HUB_TOKEN). Il
  n'est jamais affiché, ni écrit dans le dépôt (qui est public).
  Ensuite : montre les envies notées sur les téléphones et ce que le guetteur en fera, puis lance la
  recherche tout de suite si on le veut (sinon la tâche planifiée la lance toutes les 30 min).
.PARAMETER ChangerMotDePasse
  Redemander le mot de passe même s'il est déjà réglé.
.PARAMETER Adresse
  Adresse du hub (défaut : réglage existant, sinon celle de hub\DEPLOIEMENT.md).
.PARAMETER Essai
  Vérifier et montrer, sans rien enregistrer ni lancer (tests automatiques).
#>
param([switch]$ChangerMotDePasse, [string]$Adresse = '', [switch]$Essai)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'
try { $Host.UI.RawUI.WindowTitle = "Guetteur des Mim's" } catch { }
$Depot = $PSScriptRoot
$Guetteur = Join-Path $Depot 'guetteur.py'

function Lire-Reglage([string]$Nom) {
  $v = [Environment]::GetEnvironmentVariable($Nom, 'Process')
  if (-not $v) { $v = [Environment]::GetEnvironmentVariable($Nom, 'User') }
  return $v
}
function Fin([int]$Code) {
  if (-not $Essai) { Write-Host ''; Read-Host 'Entrée pour fermer' | Out-Null }
  exit $Code
}
# 'ok', 'refuse', ou la raison d'un échec
function Tester-Hub([string]$Url, [string]$Jeton) {
  $sep = if ($Url.Contains('?')) { '&' } else { '?' }
  try { $r = Invoke-RestMethod -Uri ($Url + $sep + 'token=' + [uri]::EscapeDataString($Jeton)) -TimeoutSec 60 }
  catch {
    $corps = $null
    try { $corps = $_.ErrorDetails.Message | ConvertFrom-Json } catch { }
    if ($corps -and $corps.error -eq 'token') { return 'refuse' }
    return "injoignable : $($_.Exception.Message)"
  }
  if ($r.ok) { return 'ok' }
  if ($r.error -eq 'token') { return 'refuse' }
  return "réponse inattendue : $($r.error)"
}

Write-Host ''
Write-Host "Guetteur des envies — Recettes des Mim's" -ForegroundColor Cyan

# 1. adresse du hub : publique (elle est dans le dépôt), c'est le mot de passe qui protège le partage
if (-not $Adresse) { $Adresse = Lire-Reglage 'MIMS_HUB_URL' }
if (-not $Adresse) {
  $doc = Join-Path $Depot 'hub\DEPLOIEMENT.md'
  if (Test-Path $doc) {
    $m = [regex]::Match((Get-Content -Raw -Encoding UTF8 $doc), 'https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec')
    if ($m.Success) { $Adresse = $m.Value }
  }
}
if (-not $Adresse) { $Adresse = (Read-Host "Adresse du hub (dans l'app : Réglages › Partage à deux, elle finit par /exec)").Trim() }
Write-Host "Partage : $Adresse"

# 2. mot de passe : demandé seulement s'il manque, s'il ne marche plus, ou sur demande
$Jeton = Lire-Reglage 'MIMS_HUB_TOKEN'
$etat = if ($Jeton -and -not $ChangerMotDePasse) { Tester-Hub $Adresse $Jeton } else { 'absent' }
$nouveau = $false
$essais = 0
while ($etat -ne 'ok') {
  if ($etat -eq 'refuse') { Write-Host 'Mot de passe refusé par le partage.' -ForegroundColor Yellow }
  elseif ($etat -ne 'absent') {
    Write-Host "Partage $etat" -ForegroundColor Yellow
    Write-Host 'Vérifie la connexion internet, puis relance le raccourci.'
    Fin 1
  }
  if ($essais -ge 3) { Write-Host "Trois essais refusés : rien n'est enregistré." -ForegroundColor Yellow; Fin 1 }
  $essais++
  $test = [Environment]::GetEnvironmentVariable('MIMS_REGLAGE_TEST_TOKEN', 'Process')   # tests automatiques seulement
  if ($test) { $Jeton = $test }
  else {
    $s = Read-Host "Mot de passe de partage (le même que dans l'app, Réglages › Partage à deux)" -AsSecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { $Jeton = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
  }
  if (-not $Jeton) { $etat = 'absent'; continue }
  $etat = Tester-Hub $Adresse $Jeton
  $nouveau = $true
}
if ($nouveau -and -not $Essai) {
  [Environment]::SetEnvironmentVariable('MIMS_HUB_URL', $Adresse, 'User')
  [Environment]::SetEnvironmentVariable('MIMS_HUB_TOKEN', $Jeton, 'User')
  Write-Host 'Mot de passe accepté et enregistré sur ce PC : le guetteur lit tes envies toutes les 30 min.' -ForegroundColor Green
} else {
  Write-Host 'Partage joignable, mot de passe accepté.' -ForegroundColor Green
}
$env:MIMS_HUB_URL = $Adresse
$env:MIMS_HUB_TOKEN = $Jeton

# 3. les envies notées sur les téléphones, et ce que le guetteur en fera
Write-Host ''
& python $Guetteur --apercu
$code = $LASTEXITCODE
if ($Essai) { exit $code }
if ($code -eq 0) {
  Write-Host ''
  $rep = Read-Host 'Chercher et ajouter maintenant les plats « à chercher » ? (O/n)'
  if ($rep -notmatch '^\s*[nN]') {
    Write-Host "Recherche en cours, une à deux minutes par plat. Si une recette est ajoutée, tous les tests sont lancés puis l'app est mise en ligne."
    & python $Guetteur
    Write-Host ''
    Write-Host 'Recherche terminée. Le détail est dans %LOCALAPPDATA%\mims-guetteur\guetteur.log' -ForegroundColor Cyan
  }
} elseif ($code -eq 3) {
  Write-Host ''
  Write-Host 'Rien à chercher pour le moment.'
}
Fin 0
