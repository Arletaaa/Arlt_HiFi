; 自定义安装页面：软件安装位置 + 曲库（托管）目录。
; 输入框直接显示“最终路径”（已包含要新建的文件夹名），浏览时自动补上子文件夹，
; 下方预览显示规范化后的结果，避免用户选 C:\ 时出现 C:\\Arlt-HiFi 这种双斜杠。
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
Var arltInstallTarget
Var arltLibraryParent
Var arltLibraryRoot
Var arltLibraryEdited
Var arltSyncing
Var arltPathValue
Var arltPathResult
Var arltName

; .onInit 里给出默认值：静默安装、升级、以及页面首次显示都依赖这些变量。
!macro customInit
  StrCpy $arltLibraryEdited "0"
  StrCpy $arltSyncing "0"

  ; 安装目录：沿用 electron-builder 的 $INSTDIR，去掉尾部的 \Arlt-HiFi 再规范化回来。
  StrCpy $arltPathValue "$INSTDIR"
  StrCpy $arltName "${APP_FILENAME}"
  Call ArltStripName
  StrCpy $arltInstallParent "$arltPathResult"
  StrCpy $arltPathValue "$arltInstallParent"
  Call ArltResolvePath
  StrCpy $INSTDIR "$arltPathResult"

  ; 升级/重装时沿用上次安装记录的曲库目录，避免把已有曲库“改回默认”。
  ReadINIStr $0 "$APPDATA\${APP_FILENAME}\install.ini" "paths" "libraryRoot"
  ${If} $0 != ""
    StrCpy $arltPathValue "$0"
    StrCpy $arltName "${ARLT_LIBRARY_FOLDER}"
    Call ArltStripName
    StrCpy $arltLibraryParent "$arltPathResult"
    StrCpy $arltLibraryEdited "1"
  ${Else}
    StrCpy $arltLibraryParent "$arltInstallParent"
  ${EndIf}

  StrCpy $arltPathValue "$arltLibraryParent"
  StrCpy $arltName "${ARLT_LIBRARY_FOLDER}"
  Call ArltResolvePath
  StrCpy $arltLibraryRoot "$arltPathResult"
!macroend

; 安装时创建曲库目录，并把选择结果写给应用读取。
!macro customInstall
  CreateDirectory "$arltLibraryRoot"
  CreateDirectory "$APPDATA\${APP_FILENAME}"
  WriteINIStr "$APPDATA\${APP_FILENAME}\install.ini" "paths" "libraryRoot" "$arltLibraryRoot"
!macroend

; 去掉结尾多余的反斜杠（C:\ 会收敛成 C:，拼接后仍是 C:\xxx）。
Function ArltTrimPath
  ${Do}
    StrLen $0 "$arltPathValue"
    ${If} $0 <= 2
      ${ExitDo}
    ${EndIf}
    StrCpy $1 "$arltPathValue" 1 -1
    ${If} $1 != "\"
      ${ExitDo}
    ${EndIf}
    IntOp $2 $0 - 1
    StrCpy $arltPathValue "$arltPathValue" $2
  ${Loop}
FunctionEnd

; 输入 $arltPathValue（父目录或完整路径）+ $arltName，输出以 \name 结尾的 $arltPathResult。
Function ArltResolvePath
  Call ArltTrimPath
  StrLen $0 "$arltName"
  StrLen $1 "$arltPathValue"
  ${If} $1 > $0
    IntOp $2 $1 - $0
    StrCpy $3 "$arltPathValue" $0 $2
    ${If} $3 == "\$arltName"
      StrCpy $arltPathResult "$arltPathValue"
      Return
    ${EndIf}
  ${EndIf}
  StrCpy $arltPathResult "$arltPathValue\$arltName"
FunctionEnd

; 输入 $arltPathValue + $arltName，输出去掉尾部 \name 的父目录 $arltPathResult。
Function ArltStripName
  StrLen $0 "$arltName"
  StrLen $1 "$arltPathValue"
  StrCpy $arltPathResult "$arltPathValue"
  ${If} $1 > $0
    IntOp $2 $1 - $0
    StrCpy $3 "$arltPathValue" $0 $2
    ${If} $3 == "\$arltName"
      StrCpy $arltPathResult "$arltPathValue" $2
    ${EndIf}
  ${EndIf}
FunctionEnd

!macro customPageAfterChangeDir
  Page custom ArltPathsPageCreate ArltPathsPageLeave

  Function ArltPathsPageCreate
    !insertmacro MUI_HEADER_TEXT "选择安装位置" "安装程序会在你选择的路径下新建文件夹；曲库目录存放导入后复制的音乐，卸载时不会删除。"

    ; 每次显示都从 $INSTDIR 重新推导，用户切换安装模式后路径仍然正确。
    StrCpy $arltPathValue "$INSTDIR"
    StrCpy $arltName "${APP_FILENAME}"
    Call ArltStripName
    StrCpy $arltInstallParent "$arltPathResult"
    StrCpy $arltPathValue "$arltInstallParent"
    Call ArltResolvePath
    StrCpy $arltInstallTarget "$arltPathResult"

    ${If} $arltLibraryEdited == 0
      StrCpy $arltPathValue "$arltInstallParent"
      StrCpy $arltName "${ARLT_LIBRARY_FOLDER}"
      Call ArltResolvePath
      StrCpy $arltLibraryRoot "$arltPathResult"
    ${EndIf}

    nsDialogs::Create 1018
    Pop $arltPathsDialog
    ${If} $arltPathsDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 10u "软件安装位置："
    Pop $0
    ${NSD_CreateDirRequest} 0 12u 78% 12u "$arltInstallTarget"
    Pop $arltInstallField
    ${NSD_OnChange} $arltInstallField ArltInstallChanged
    ${NSD_CreateBrowseButton} 79% 12u 21% 12u "浏览…"
    Pop $0
    ${NSD_OnClick} $0 ArltBrowseInstall
    ${NSD_CreateLabel} 0 27u 100% 10u "将安装到："
    Pop $arltInstallPreview

    ${NSD_CreateLabel} 0 43u 100% 10u "曲库位置："
    Pop $0
    ${NSD_CreateDirRequest} 0 55u 78% 12u "$arltLibraryRoot"
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
    ${NSD_GetText} $arltInstallField $arltPathValue
    StrCpy $0 "$arltPathValue" 1
    ${If} $0 == ""
      MessageBox MB_ICONEXCLAMATION "请选择软件安装位置。"
      Abort
    ${EndIf}
    StrCpy $arltName "${APP_FILENAME}"
    Call ArltResolvePath
    StrCpy $INSTDIR "$arltPathResult"

    ${NSD_GetText} $arltLibraryField $arltPathValue
    StrCpy $0 "$arltPathValue" 1
    ${If} $0 == ""
      MessageBox MB_ICONEXCLAMATION "请选择曲库位置。"
      Abort
    ${EndIf}
    StrCpy $arltName "${ARLT_LIBRARY_FOLDER}"
    Call ArltResolvePath
    StrCpy $arltLibraryRoot "$arltPathResult"
  FunctionEnd

  Function ArltRefreshPreviews
    ${NSD_GetText} $arltInstallField $arltPathValue
    StrCpy $arltName "${APP_FILENAME}"
    Call ArltResolvePath
    ${NSD_SetText} $arltInstallPreview "将安装到：$arltPathResult"

    ${NSD_GetText} $arltLibraryField $arltPathValue
    StrCpy $arltName "${ARLT_LIBRARY_FOLDER}"
    Call ArltResolvePath
    ${NSD_SetText} $arltLibraryPreview "将新建：$arltPathResult"
  FunctionEnd

  Function ArltInstallChanged
    Call ArltRefreshPreviews
  FunctionEnd

  Function ArltLibraryChanged
    ; 浏览安装位置时同步写入曲库输入框，不应该算作“用户手工改过曲库路径”。
    ${If} $arltSyncing == "1"
      Call ArltRefreshPreviews
      Return
    ${EndIf}
    StrCpy $arltLibraryEdited "1"
    Call ArltRefreshPreviews
  FunctionEnd

  Function ArltBrowseInstall
    ${NSD_GetText} $arltInstallField $0
    nsDialogs::SelectFolderDialog "选择软件安装位置" "$0"
    Pop $0
    ${If} $0 != "error"
      StrCpy $arltPathValue "$0"
      StrCpy $arltName "${APP_FILENAME}"
      Call ArltResolvePath
      ${NSD_SetText} $arltInstallField "$arltPathResult"

      StrCpy $arltPathValue "$arltPathResult"
      Call ArltStripName
      StrCpy $arltInstallParent "$arltPathResult"

      ${If} $arltLibraryEdited == 0
        StrCpy $arltPathValue "$arltInstallParent"
        StrCpy $arltName "${ARLT_LIBRARY_FOLDER}"
        Call ArltResolvePath
        StrCpy $arltSyncing "1"
        ${NSD_SetText} $arltLibraryField "$arltPathResult"
        StrCpy $arltSyncing "0"
      ${EndIf}

      Call ArltRefreshPreviews
    ${EndIf}
  FunctionEnd

  Function ArltBrowseLibrary
    ${NSD_GetText} $arltLibraryField $0
    nsDialogs::SelectFolderDialog "选择曲库位置" "$0"
    Pop $0
    ${If} $0 != "error"
      StrCpy $arltPathValue "$0"
      StrCpy $arltName "${ARLT_LIBRARY_FOLDER}"
      Call ArltResolvePath
      StrCpy $arltLibraryEdited "1"
      ${NSD_SetText} $arltLibraryField "$arltPathResult"
      Call ArltRefreshPreviews
    ${EndIf}
  FunctionEnd
!macroend

!endif
