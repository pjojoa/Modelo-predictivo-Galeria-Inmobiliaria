@echo off
chcp 65001 >nul
cd /d "%~dp0"
title APLICACION FLASK - MAPA DE PROYECTOS (FASE 2)
color 0A
cls

echo.
echo ================================================================================
echo            APLICACION FLASK - MAPA DE PROYECTOS INMOBILIARIOS
echo                         FASE 2: ML Y METRICAS AVANZADAS
echo ================================================================================
echo.
echo  Iniciando aplicacion con las mejoras de Fase 2:
echo  - Feature Engineering Avanzado
echo  - Modelo RandomForest
echo  - Score Compuesto
echo  - Validacion Temporal
echo.
echo  La aplicacion se abrira automaticamente en: http://localhost:5000
echo.
echo ================================================================================
echo.

REM Abrir navegador después de 5 segundos
start "" cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:5000"

REM Ejecutar la aplicación
python app.py

pause

