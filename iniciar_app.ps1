# Script para iniciar la aplicación Flask
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "            INICIANDO APLICACION FLASK - MAPA DE PROYECTOS" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  La aplicacion se abrira automaticamente en tu navegador" -ForegroundColor Green
Write-Host "  URL: http://localhost:5000" -ForegroundColor Green
Write-Host ""
Write-Host "  Para detener el servidor, presiona Ctrl+C" -ForegroundColor Yellow
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

# Cambiar al directorio del script
Set-Location $PSScriptRoot

# Esperar un momento antes de abrir el navegador
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 5
    Start-Process "http://localhost:5000"
} | Out-Null

# Ejecutar la aplicación
python app.py

