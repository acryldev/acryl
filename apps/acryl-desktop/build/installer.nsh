; electron-builder includes this file in the NSIS installer and uninstaller (build resources, "installer.nsh").
;
; The installer keeps a copy of itself in %LOCALAPPDATA%\<app>-updater\installer.exe (about 225 MB) so that electron-updater can download
; only the changed blocks of the next release; electron-updater also leaves downloaded updates under the same folder. electron-builder's
; uninstaller never removes that folder, so an uninstalled ACRYL left a quarter of a gigabyte behind (spec 001 T090). Remove it on a real
; uninstall only: an update runs the old uninstaller too (isUpdated), and the folder must survive it.
!macro customUnInstall
  !ifdef APP_INSTALLER_STORE_FILE
    ${ifNot} ${isUpdated}
      ; The installer always writes the copy into the current user's local app data, also for an all-users install.
      ${if} $installMode == "all"
        SetShellVarContext current
      ${endif}
      ${GetParent} "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}" $R0
      RMDir /r "$R0"
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endif}
    ${endif}
  !endif
!macroend
