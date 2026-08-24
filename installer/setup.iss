; Script de Inno Setup para Control de Pases e Incidencias SESEQ.
; Compilar con ISCC.exe (Inno Setup) una vez generado dist\ControlPasesSESEQ.exe con PyInstaller:
;   ISCC installer\setup.iss
;
; Instala por usuario (sin requerir permisos de administrador), ya que es una
; herramienta personal de un trabajador y no siempre habrá permisos de admin
; en el equipo de la dependencia.

#define MyAppName "Control de Pases e Incidencias SESEQ"
#define MyAppVersion "1.4.8"
#define MyAppPublisher "SESEQ - Direccion de Recursos Humanos"
#define MyAppExeName "ControlPasesSESEQ.exe"

[Setup]
AppId={{B7B6C6F0-6C2E-4C9B-9C7E-CONTROLPASESSESEQ}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
VersionInfoVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\ControlPasesSESEQ
DefaultGroupName={#MyAppName}
PrivilegesRequired=lowest
OutputBaseFilename=ControlPasesSESEQ_Setup
OutputDir=..\dist_installer
Compression=lzma
SolidCompression=yes
SetupIconFile=..\assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
DisableProgramGroupPage=yes
ArchitecturesInstallIn64BitMode=x64compatible
; Si la app (o WebView2) sigue abierta de una instalación previa, cerrarla
; automáticamente en vez de fallar al sobrescribir el .exe. Evita que quede
; una versión vieja "atorada" interfiriendo con la nueva.
CloseApplications=force
RestartApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"

[Files]
; onedir: PyInstaller deja el .exe junto a una carpeta _internal\ con todas
; las DLLs/datos. Hay que copiar la carpeta completa, no solo el .exe.
Source: "..\dist\ControlPasesSESEQ\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir {#MyAppName}"; Flags: nowait postinstall skipifsilent
