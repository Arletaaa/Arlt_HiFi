; 自定义安装页面：软件安装位置 + 曲库（托管）目录。
; 两个路径都由用户选择“父目录”，安装器在其下新建子文件夹，
; 避免把文件直接铺在用户选择的目录里；页面上实时显示将要新建的文件夹。
;
; 注意：页面函数必须放在 customPageAfterChangeDir 宏里定义。
; 本文件在 MUI2.nsh 之前被 include，函数体里的 MUI_HEADER_TEXT 只有在
; 页面声明处（宏展开时）才可用。
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!define ARLT_LIBRARY_FOLDER "Arlt-HiFi Library"

!ifndef BUILD_UNINSTALLER

Var arltPathsDialog
Var arltInstallField
Var arltLibraryField
Var arltInstallPreview
Var arltLibraryPreview
Var arltInstallParent
Var arltLibraryParent
Var arltLibraryRoot
Var arltLibraryEdited
Var arltPathValue

; .onInit 里给出默认值：静默安装、升级、以及页面首次显示都依赖这些变量。
!macro customInit
  StrCpy $arltInstallParent "$INSTDIR"
  Call ArltStripAppFolder
  StrCpy $INSTDIR "$arltInstallParent\${APP_FILENAME}"
  StrCpy $arltLibraryEdited "0"

  ; 升级/重装时沿用上次安装记录的曲库目录，避免把已有曲库“改回默认”。
  ReadINIStr $0 "$APPDATA\${APP_FILENAME}\install.ini" "paths" "libraryRoot"
  ${If} $0 != ""
    StrCpy $arltLibraryRoot "$0"
    StrCpy $arltLibraryParent "$0"
    Call ArltStripLibraryFolder
    StrCpy $arltLibraryEdited "1"
  ${Else}
    StrCpy $arltLibraryParent "$arltInstallParent"
    StrCpy $arltLibraryRoot "$arltInstallParent\${ARLT_LIBRARY_FOLDER}"
  ${EndIf}
!macroend

; 安装时创建曲库目录，并把选择结果写给应用读取。
!macro customInstall
  CreateDirectory "$arltLibraryRoot"
  CreateDirectory "$APPDATA\${APP_FILENAME}"
  WriteINIStr "$APPDATA\${APP_FILENAME}\install.ini" "paths" "libraryRoot" "$arltLibraryRoot"
!macroend

!macro customPageAfterChangeDir
  Page custom ArltPathsPageCreate ArltPathsPageLeave

  Function ArltPathsPageCreate
    !insertmacro MUI_HEADER_TEXT "选择安装位置" "安装程序会在你选择的路径下新建文件夹；曲库目录存放导入后复制的音乐，卸载时不会删除。"

    ; 每次显示都从 $INSTDIR 重新推导，用户切换安装模式后路径仍然正确。
    StrCpy $arltInstallParent "$INSTDIR"
    Call ArltStripAppFolder
    ${If} $arltLibraryEdited == 0
      StrCpy $arltLibraryParent "$arltInstallParent"
    ${EndIf}

    nsDialogs::Create 1018
    Pop $arltPathsDialog
    ${If} $arltPathsDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 10u "软件安装位置（在该路径下新建 ${APP_FILENAME} 文件夹）："
    Pop $0
    ${NSD_CreateDirRequest} 0 12u 78% 12u "$arltInstallParent"
    Pop $arltInstallField
    ${NSD_OnChange} $arltInstallField ArltInstallChanged
    ${NSD_CreateBrowseButton} 79% 12u 21% 12u "浏览…"
    Pop $0
    ${NSD_OnClick} $0 ArltBrowseInstall
    ${NSD_CreateLabel} 0 27u 100% 10u "将安装到："
    Pop $arltInstallPreview

    ${NSD_CreateLabel} 0 43u 100% 10u "曲库位置（在该路径下新建 ${ARLT_LIBRARY_FOLDER} 文件夹）："
    Pop $0
    ${NSD_CreateDirRequest} 0 55u 78% 12u "$arltLibraryParent"
    Pop $arltLibraryField
    ${NSD_OnChange} $arltLibraryField ArltLibraryChanged
    ${NSD_CreateBrowseButton} 79% 55u 21% 12u "浏览…"
    Pop $0
    ${NSD_OnClick} $0 ArltBrowseLibrary
    ${NSD_CreateLabel} 0 70u 100% 10u "将新建："
    Pop $arltLibraryPreview

    ${NSD_CreateLabel} 0 84u 100% 14u "默认与软件目录同级，避免卸载时误删曲库；也可以放到其他盘。"
    Pop $0

    Call ArltRefreshPreviews
    nsDialogs::Show
  FunctionEnd

  Function ArltPathsPageLeave
    ${NSD_GetText} $arltInstallField $arltInstallParent
    StrCpy $0 "$arltInstallParent" 1
    ${If} $0 == ""
      MessageBox MB_ICONEXCLAMATION "请选择软件安装位置。"
      Abort
    ${EndIf}

    StrCpy $arltPathValue "$arltInstallParent"
    Call ArltTrimTrailingSlash
    StrCpy $INSTDIR "$arltPathValue\${APP_FILENAME}"

    ${NSD_GetText} $arltLibraryField $arltLibraryParent
    StrCpy $0 "$arltLibraryParent" 1
    ${If} $0 == ""
      MessageBox MB_ICONEXCLAMATION "请选择曲库位置。"
      Abort
    ${EndIf}

    StrCpy $arltPathValue "$arltLibraryParent"
    Call ArltTrimTrailingSlash
    StrCpy $arltLibraryRoot "$arltPathValue\${ARLT_LIBRARY_FOLDER}"
  FunctionEnd

  Function ArltRefreshPreviews
    ${NSD_GetText} $arltInstallField $arltInstallParent
    StrCpy $arltPathValue "$arltInstallParent"
    Call ArltTrimTrailingSlash
    StrCpy $arltPathValue "$arltPathValue\${APP_FILENAME}"
    ${NSD_SetText} $arltInstallPreview "将安装到：$arltPathValue"

    ${NSD_GetText} $arltLibraryField $arltLibraryParent
    StrCpy $arltPathValue "$arltLibraryParent"
    Call ArltTrimTrailingSlash
    StrCpy $arltPathValue "$arltPathValue\${ARLT_LIBRARY_FOLDER}"
    ${NSD_SetText} $arltLibraryPreview "将新建：$arltPathValue"
  FunctionEnd

  Function ArltInstallChanged
    ${NSD_GetText} $arltInstallField $arltInstallParent
    ${If} $arltLibraryEdited == 0
      ${NSD_SetText} $arltLibraryField "$arltInstallParent"
      StrCpy $arltLibraryParent "$arltInstallParent"
    ${EndIf}
    Call ArltRefreshPreviews
  FunctionEnd

  Function ArltLibraryChanged
    ${NSD_GetText} $arltLibraryField $arltLibraryParent
    StrCpy $arltLibraryEdited "1"
    Call ArltRefreshPreviews
  FunctionEnd

  Function ArltBrowseInstall
    ${NSD_GetText} $arltInstallField $0
    nsDialogs::SelectFolderDialog "选择软件安装位置（会在其中新建 ${APP_FILENAME} 文件夹）" "$0"
    Pop $0
    ${If} $0 != "error"
      ${NSD_SetText} $arltInstallField "$0"
      Call ArltInstallChanged
    ${EndIf}
  FunctionEnd

  Function ArltBrowseLibrary
    ${NSD_GetText} $arltLibraryField $0
    nsDialogs::SelectFolderDialog "选择曲库位置（会在其中新建 ${ARLT_LIBRARY_FOLDER} 文件夹）" "$0"
    Pop $0
    ${If} $0 != "error"
      ${NSD_SetText} $arltLibraryField "$0"
      Call ArltLibraryChanged
    ${EndIf}
  FunctionEnd
!macroend

; 去掉末尾的 \Arlt-HiFi，得到用户选择的父目录。
Function ArltStripAppFolder
  StrLen $0 "${APP_FILENAME}"
  StrLen $1 "$arltInstallParent"
  ${If} $1 > $0
    StrCpy $2 "$arltInstallParent" "" -$0
    ${If} $2 == "\${APP_FILENAME}"
      IntOp $3 $1 - $0
      StrCpy $arltInstallParent "$arltInstallParent" $3
    ${EndIf}
  ${EndIf}
FunctionEnd

; 去掉末尾的 \Arlt-HiFi Library，得到曲库父目录。
Function ArltStripLibraryFolder
  StrLen $0 "${ARLT_LIBRARY_FOLDER}"
  StrLen $1 "$arltLibraryParent"
  ${If} $1 > $0
    StrCpy $2 "$arltLibraryParent" "" -$0
    ${If} $2 == "\${ARLT_LIBRARY_FOLDER}"
      IntOp $3 $1 - $0
      StrCpy $arltLibraryParent "$arltLibraryParent" $3
    ${EndIf}
  ${EndIf}
FunctionEnd

; 去掉结尾多余的反斜杠，但保留 D:\ 这类根路径。
Function ArltTrimTrailingSlash
  StrLen $0 "$arltPathValue"
  ${If} $0 > 3
    StrCpy $1 "$arltPathValue" 1 -1
    ${If} $1 == "\"
      IntOp $2 $0 - 1
      StrCpy $arltPathValue "$arltPathValue" $2
    ${EndIf}
  ${EndIf}
FunctionEnd

!endif
