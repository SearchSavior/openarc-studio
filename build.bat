@echo off
setlocal EnableDelayedExpansion

:: Initialize the MSVC environment first
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"

echo OpenArc Studio Build (Windows)
echo ==============================
echo.

REM --- Check bun ---
where bun >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] bun is not installed. See https://bun.sh
    exit /b 1
)
for /f "tokens=*" %%a in ('bun --version 2^>nul') do set BUN_VER=%%a
echo [OK] bun %BUN_VER%

REM --- Check rust ---
where rustc >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] Rust is not installed. See https://rustup.rs
    exit /b 1
)
for /f "tokens=*" %%a in ('rustc --version 2^>nul') do set RUSTC_VER=%%a
echo [OK] %RUSTC_VER%



REM --- Check MSVC linker ---
where link >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] MSVC link.exe not found in PATH
    echo     Install Visual Studio Build Tools with "Desktop development with C++"
    echo     and run this script from a Developer Command Prompt for VS.
    exit /b 1
)
echo [OK] link.exe (MSVC)

REM --- Check WebView2 (optional, just a warning) ---
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] WebView2 Runtime
) else (
    echo [!] WebView2 Runtime not detected — the app may not run without it
    echo     Download from: https://developer.microsoft.com/microsoft-edge/webview2/
)

echo.
echo Installing frontend dependencies...
call bun install
if %errorlevel% neq 0 (
    echo [X] bun install failed
    exit /b 1
)

echo.
echo Building release bundles...
call bun run tauri build
if %errorlevel% neq 0 (
    echo [X] Build failed
    exit /b 1
)

echo.
echo [OK] Build complete
echo Artifacts are in src-tauri\target\release\bundle\
echo.

endlocal
