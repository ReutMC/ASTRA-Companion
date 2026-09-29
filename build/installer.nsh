; ASTRA NSIS custom installer script (electron-builder default include location: build/installer.nsh)
; Registers the ASTRA Native Messaging Host for Chrome and Edge (HKCU - no admin rights needed).

!macro customInstall
  nsExec::Exec 'reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.astra.browser_bridge" /ve /t REG_SZ /d "$APPDATA\ASTRA\native-host\com.astra.browser_bridge.json" /f'
  nsExec::Exec 'reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.astra.browser_bridge" /ve /t REG_SZ /d "$APPDATA\ASTRA\native-host\com.astra.browser_bridge.json" /f'
!macroend

!macro customUnInstall
  nsExec::Exec 'reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.astra.browser_bridge" /f'
  nsExec::Exec 'reg delete "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.astra.browser_bridge" /f'
!macroend
