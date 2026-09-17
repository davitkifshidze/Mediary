@echo off
REM Double-click this to start the whole Mediary dev environment in one Git Bash window.
start "" "C:\Program Files\Git\git-bash.exe" -c "cd '%~dp0' && ./start-dev.sh; exec bash"
