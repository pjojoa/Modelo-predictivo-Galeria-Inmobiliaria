@echo off
REM ============================================================================
REM   SCRIPT PRINCIPAL - INICIA LA APLICACION FLASK
REM   Ejecuta este archivo para iniciar la aplicacion de la forma mas facil
REM ============================================================================

chcp 65001 >nul
cd /d "%~dp0"

title INICIAR APLICACION FLASK - MAPA DE PROYECTOS

color 0B
cls
echo.
echo ================================================================================
echo            APLICACION FLASK - MAPA DE PROYECTOS INMOBILIARIOS
echo ================================================================================
echo.
echo  Este script iniciara la aplicacion Flask automaticamente
echo  Se abrira el navegador en: http://localhost:5000
echo.
echo ================================================================================
echo.

REM Verificar Flask primero
python -c "import flask" >nul 2>&1
if errorlevel 1 (
    color 0E
    echo [ADVERTENCIA] Flask no esta instalado
    echo.
    echo Instalando dependencias necesarias...
    echo.
    pip install -r requirements.txt
    if errorlevel 1 (
        color 0C
        echo.
        echo [ERROR] No se pudieron instalar las dependencias
        echo.
        echo Por favor, instala Flask manualmente:
        echo pip install flask
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencias instaladas correctamente
    echo.
    timeout /t 2 /nobreak >nul
)

color 0A
echo.
echo ================================================================================
echo                    INICIANDO APLICACION...
echo ================================================================================
echo.
echo  La aplicacion se abrira automaticamente en tu navegador
echo  URL: http://localhost:5000
echo.
echo  Para detener el servidor, presiona Ctrl+C en esta ventana
echo.
echo ================================================================================
echo.

REM Iniciar la aplicacion
python app.py

REM Si llegamos aqui, la aplicacion se cerro
color 0E
echo.
echo La aplicacion se ha cerrado.
pause


