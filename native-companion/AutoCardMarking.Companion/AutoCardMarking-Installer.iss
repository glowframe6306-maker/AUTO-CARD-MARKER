#define MyAppName "AUTO CARD MARKING"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "MI CORTEX X"
#define MyAppExeName "AutoCardMarking.Companion.exe"

[Setup]
AppId={{C2B6F9A1-6D31-4E5D-91A8-ACM2026FINAL}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\AUTO CARD MARKING
DefaultGroupName=AUTO CARD MARKING
OutputDir=.\installer-output
OutputBaseFilename=AUTO-CARD-MARKING-Windows-Setup-v1.0.1
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
Uninstallable=yes
CreateAppDir=yes
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no

[Files]
Source: "C:\Users\Administrator\AUTO-CARD-MARKING\native-companion\AutoCardMarking.Companion\publish-windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\AUTO CARD MARKING"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autoprograms}\AUTO CARD MARKING"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch AUTO CARD MARKING"; Flags: nowait postinstall skipifsilent
