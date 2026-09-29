; ============================================================================
;  ASTRA — custom NSIS macros for electron-builder
; ----------------------------------------------------------------------------
;  Wired in by desktop/electron-builder.yml:
;
;      nsis:
;        include: ../installer/installer.nsh
;
;  electron-builder inserts ${customInstall} into its install section and
;  ${customUnInstall} into the uninstaller (note the canonical lowercase
;  spelling — `customInstall` / `customUnInstall`).
;
;  What this does:
;    • creates %LOCALAPPDATA%\ASTRA and writes com.astra.host.json there,
;      pointing at $INSTDIR\resources\native-host\host.bat
;      (allowed_origins uses the placeholder PASTE-YOUR-EXTENSION-ID —
;      Chrome requires the EXACT unpacked-extension id, so the user finalises
;      registration with resources\native-host\install-host.ps1 -ExtensionId <ID>,
;      which rewrites the same manifest file with the real id)
;    • registers the manifest for Chrome and Edge under HKCU
;    • creates %USERPROFILE%\Documents\ASTRA\{Generated,Research,Exports}
;
;  NSIS escaping notes (why this file looks the way it does):
;    • backslash is NOT an escape char in NSIS strings — "\\" is literally two
;      backslashes, which is exactly what JSON needs for Windows paths;
;    • `$$` renders a literal `$`, `$\"` a literal quote, `$\r$\n` a CRLF;
;    • JSON lines are written with backtick-delimited strings so embedded `"`
;      needs no escaping;
;    • $LOCALAPPDATA / $INSTDIR contain SINGLE backslashes at runtime, so the
;      _ASTRA_JsonEscapeBackslashes macro doubles them char-by-char before the
;      path goes into the JSON file.
; ============================================================================

!ifndef ASTRA_INSTALLER_NSH
!define ASTRA_INSTALLER_NSH

!include "LogicLib.nsh"

; dedicated vars so we never clobber registers electron-builder's section uses
Var AstraJsonHostPath      ; install-dir host.bat path with \\ escaping for JSON
Var AstraEscIdx            ; escape-loop cursor
Var AstraEscLen            ; escape-loop source length
Var AstraEscChr            ; escape-loop current character
Var AstraFileHandle        ; manifest file handle

; --------------------------------------------------------------------------
; _ASTRA_JsonEscapeBackslashes <source string> <dest var>
; Replaces every "\" with "\\" so the path is valid JSON.
; --------------------------------------------------------------------------
!macro _ASTRA_JsonEscapeBackslashes _ASTRA_SRC _ASTRA_OUT
  StrCpy ${_ASTRA_OUT} ""
  StrLen $AstraEscLen ${_ASTRA_SRC}
  StrCpy $AstraEscIdx 0
_astra_json_escape_loop:
  ${If} $AstraEscIdx >= $AstraEscLen
    Goto _astra_json_escape_done
  ${EndIf}
  StrCpy $AstraEscChr ${_ASTRA_SRC} 1 $AstraEscIdx
  ${If} $AstraEscChr == "\"
    StrCpy ${_ASTRA_OUT} "${_ASTRA_OUT}\\"
  ${Else}
    StrCpy ${_ASTRA_OUT} "${_ASTRA_OUT}$AstraEscChr"
  ${EndIf}
  IntOp $AstraEscIdx $AstraEscIdx + 1
  Goto _astra_json_escape_loop
_astra_json_escape_done:
!macroend

; ==========================================================================
; customInstall
; ==========================================================================
!macro customInstall
  DetailPrint "ASTRA: creating workspace folders…"
  CreateDirectory "$DOCUMENTS\ASTRA"
  CreateDirectory "$DOCUMENTS\ASTRA\Generated"
  CreateDirectory "$DOCUMENTS\ASTRA\Research"
  CreateDirectory "$DOCUMENTS\ASTRA\Exports"

  DetailPrint "ASTRA: registering native messaging host (Chrome / Edge)…"
  CreateDirectory "$LOCALAPPDATA\ASTRA"

  ; host.bat with JSON-escaped backslashes (C:\\…\\host.bat)
  !insertmacro _ASTRA_JsonEscapeBackslashes "$INSTDIR\resources\native-host\host.bat" $AstraJsonHostPath

  FileOpen $AstraFileHandle "$LOCALAPPDATA\ASTRA\com.astra.host.json" w
  ${If} $AstraFileHandle == ""
    DetailPrint "ASTRA: WARNING — could not write com.astra.host.json; run resources\native-host\install-host.ps1 after install."
  ${Else}
    FileWrite $AstraFileHandle "{$\r$\n}"
    FileWrite $AstraFileHandle `  "name": "com.astra.host",$\r$\n`
    FileWrite $AstraFileHandle `  "description": "ASTRA Native Messaging Host (registered by ASTRA-Setup)",$\r$\n`
    FileWrite $AstraFileHandle `  "path": "$AstraJsonHostPath",$\r$\n`
    FileWrite $AstraFileHandle `  "type": "stdio",$\r$\n`
    FileWrite $AstraFileHandle `  "allowed_origins": ["chrome-extension://PASTE-YOUR-EXTENSION-ID/"]$\r$\n`
    FileWrite $AstraFileHandle "}"
    FileClose $AstraFileHandle
    DetailPrint "ASTRA: wrote $LOCALAPPDATA\ASTRA\com.astra.host.json"
  ${EndIf}

  ; Registry values point AT the manifest file (plain Windows paths — no escaping here)
  WriteRegStr HKCU "Software\Google\Chrome\NativeMessagingHosts\com.astra.host" "" "$LOCALAPPDATA\ASTRA\com.astra.host.json"
  WriteRegStr HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.astra.host" "" "$LOCALAPPDATA\ASTRA\com.astra.host.json"

  DetailPrint "ASTRA: browser bridge registered. Finalise it with install-host.ps1 -ExtensionId <ID>."
!macroend

; ==========================================================================
; customUnInstall
; ==========================================================================
!macro customUnInstall
  DetailPrint "ASTRA: removing native messaging host registration…"
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.astra.host"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.astra.host"
  Delete "$LOCALAPPDATA\ASTRA\com.astra.host.json"
  ; NOTE: %LOCALAPPDATA%\ASTRA and Documents\ASTRA are intentionally KEPT
  ; (user data: settings, generated files, research notes).
!macroend

!endif ; ASTRA_INSTALLER_NSH
