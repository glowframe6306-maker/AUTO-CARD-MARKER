# Windows Authenticode Signing Setup Report

Date: 2026-09-16
Project: `native-companion/AutoCardMarking.Companion`

## Result

**SIGNING NOT COMPLETED**

No usable trusted Authenticode Code Signing certificate was available in either:

- `Cert:\CurrentUser\My`
- `Cert:\LocalMachine\My`

The search required a private key, Code Signing EKU `1.3.6.1.5.5.7.3.3`, and current validity. No matching certificate was found. No certificate was created, and no security settings were changed.

## Build Configuration

- Target: `net10.0-windows10.0.19041.0`
- Runtime: `win-x64`
- Configuration: `Release`
- `WindowsPackageType`: `None`
- `WindowsAppSDKSelfContained`: `true`
- `UseMonoRuntime`: `false`
- Current Release output: `native-companion/AutoCardMarking.Companion/bin/Release/net10.0-windows10.0.19041.0/win-x64/AutoCardMarking.Companion.exe`

## SignTool

Installed Microsoft SignTool discovered at:

`C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe`

The installed SignTool build does not support a `version` command. It was successfully invoked for signature verification.

## Existing EXE Verification

The existing distributable was not modified:

`frontend/public/downloads/AutoCardMarking-Windows.exe`

- Authenticode status: `NotSigned`
- SignTool verification: `No signature found`
- SHA-256: `38F7F1D9C39658A5C80A377C7A4FD6F68A51D0480B1A48C2A6D79E3128B66EFD`

## Next Requirement

Obtain or provide a trusted Authenticode code-signing certificate with its private key, valid dates, and Code Signing EKU `1.3.6.1.5.5.7.3.3`. After that certificate is available, sign the final Release EXE with SHA-256 and an approved RFC 3161 timestamp service, then verify the signature before replacing the public download copy.

A self-signed or otherwise untrusted certificate must not be used to claim removal of Edge or SmartScreen reputation warnings.
