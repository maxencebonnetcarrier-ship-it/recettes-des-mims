<#
.SYNOPSIS
  Installe (ou retire) la tache planifiee du guetteur des envies de Recettes des Mim's.
.DESCRIPTION
  Pose aussi le raccourci « Guetteur des Mim's » du Bureau (regler_guetteur.ps1).
  Toutes les 30 minutes, tant que la session est ouverte, pythonw lance guetteur.py sans fenetre.
  Le guetteur ne fait rien tant que MIMS_HUB_URL et MIMS_HUB_TOKEN ne sont pas regles (setx).
  Journal : %LOCALAPPDATA%\mims-guetteur\guetteur.log
.EXAMPLE
  powershell -NoProfile -File installer_guetteur.ps1            # installe ou remplace la tache
  powershell -NoProfile -File installer_guetteur.ps1 -Retirer   # la retire
#>
param([switch]$Retirer)
$ErrorActionPreference = 'Stop'
$Nom = 'Recettes des Mims - guetteur'
# raccourci du Bureau : regler le mot de passe la 1re fois, voir les envies, lancer une recherche
$Raccourci = Join-Path ([Environment]::GetFolderPath('Desktop')) "Guetteur des Mim's.lnk"
if ($Retirer) {
  Unregister-ScheduledTask -TaskName $Nom -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Raccourci -ErrorAction SilentlyContinue
  Write-Host "Tache « $Nom » et raccourci retires."
  exit 0
}
$Depot = $PSScriptRoot
$Python = (Get-Command python -ErrorAction Stop).Source
$SansFenetre = Join-Path (Split-Path $Python) 'pythonw.exe'
if (-not (Test-Path $SansFenetre)) { throw "pythonw.exe introuvable a cote de $Python" }
$Action = New-ScheduledTaskAction -Execute $SansFenetre -Argument ('"' + (Join-Path $Depot 'guetteur.py') + '"') -WorkingDirectory $Depot
$Declencheur = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 3650)
$Reglages = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $Nom -Action $Action -Trigger $Declencheur -Settings $Reglages -Force `
  -Description 'Lit les envies de plats des telephones, ajoute la recette (Marmiton, Saveurs, Journal des Femmes), teste et met l''app en ligne. guetteur.py' | Out-Null
Write-Host "Tache « $Nom » installee : toutes les 30 min, $SansFenetre $Depot\guetteur.py"
$Lien = (New-Object -ComObject WScript.Shell).CreateShortcut($Raccourci)
$Lien.TargetPath = (Get-Command powershell.exe).Source
$Lien.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $Depot 'regler_guetteur.ps1') + '"'
$Lien.WorkingDirectory = $Depot
$Lien.Description = 'Guetteur des envies : regler le partage, voir les envies, lancer une recherche'
$Lien.Save()
Write-Host "Raccourci pose : $Raccourci"
