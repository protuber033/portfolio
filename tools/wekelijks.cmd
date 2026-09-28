@echo off
REM Wordt elke zondag door de Windows-taakplanner gestart.
REM Werkt de gegevens bij en bouwt de pagina opnieuw. Publiceren doe je zelf
REM met git push, zodat er nooit iets ongevraagd online komt.

setlocal
set "PATH=%PATH%;C:\Program Files\nodejs"
cd /d "C:\temp\samih-portfolio"

set "LOG=%~dp0..\update-log.txt"

echo. >> "%LOG%"
echo ================================================== >> "%LOG%"
echo   wekelijkse controle  %date%  %time% >> "%LOG%"
echo ================================================== >> "%LOG%"

call npm run update >> "%LOG%" 2>&1

if errorlevel 1 (
  echo   ER GING IETS MIS - zie hierboven >> "%LOG%"
) else (
  git status --short >> "%LOG%" 2>&1
  echo   klaar. Staat hierboven iets? Dan is er werk: teksten schrijven of git push. >> "%LOG%"
)

endlocal
