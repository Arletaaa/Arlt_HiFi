; 自定义安装页面：软件安装位置 + 曲库（托管）目录。
; 输入框直接显示“最终路径”（已包含要新建的文件夹名）；浏览时选父目录，
; 安装器自动补子文件夹，并合并多余的反斜杠。
;
; 注意：页面函数必须放在 customPageAfterChangeDir 宏里定义。
; 本文件在 MUI2.nsh 之前被 include，函数体里的 MUI_HEADER_TEXT 只有在
; 页面声明处（宏展开时）才可用。
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"

!define ARLT_LIBRARY_FOLDER "Arlt-HiFi Library"

!ifndef BUILD_UNINSTALLER

Var arltPathsDialog
Var arltInstallField
Var arltLibraryField
Var arltInstallPreview
Var arltLibraryPreview
Var arltInstallTarget
Var arltLibraryTarget
Var arltLibraryEdited
Var arltSyncing
Var arltWritable
Var arltPathValue

; .onInit 里给出默认值：静默安装、升级、以及页面首次显示都依赖这些变量。
!macro customInit
  StrCpy $arltLibraryEdited "0"
  StrCpy $arltSyncing "0"

  ; 安装位置直接沿用 electron-builder 的 $INSTDIR（默认就是 ...\Programs\Arlt-HiFi），不再二次拼接。
  StrCpy $arltInstallTarget "$INSTDIR"

  ; 曲库默认与软件目录同级；升级/重装时沿用 install.ini 里记录的位置。
  ReadINIStr $0 "$APPDATA\${APP_FILENAME}\install.ini" "paths" "libraryRoot"
  ${If} $0 != ""
    StrCpy $arltLibraryTarget "$0"
    StrCpy $arltLibraryEdited "1"
  ${Else}
    ${GetParent} "$INSTDIR" $0
    StrCpy $arltPathValue "$0"
    Call ArltTrimPath
    StrCpy $arltLibraryTarget "$arltPathValue\${ARLT_LIBRARY_FOLDER}"
  ${EndIf}
!macroend

; 安装时创建曲库目录，并把选择结果写给应用读取（userData 与安装目录各写一份）。
!macro customInstall
  CreateDirectory "$arltLibraryTarget"
  CreateDirectory "$APPDATA\${APP_FILENAME}"
  WriteINIStr "$APPDATA\${APP_FILENAME}\install.ini" "paths" "libraryRoot" "$arltLibraryTarget"
  WriteINIStr "$INSTDIR\install.ini" "paths" "libraryRoot" "$arltLibraryTarget"
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

; 检查能否创建目标目录（不再写探针文件，避免第一次安装时的误报）。
Function ArltCheckWritable
  StrCpy $arltWritable "0"

  ${If} ${FileExists} "$arltPathValue\*.*"
    StrCpy $arltWritable "1"
    Return
  ${EndIf}

  ClearErrors
  CreateDirectory "$arltPathValue"
  ${If} ${Errors}
    Return
  ${EndIf}

  StrCpy $arltWritable "1"
FunctionEnd

!macro customPageAfterChangeDir
  Page custom ArltPathsPageCreate ArltPathsPageLeave

  Function ArltPathsPageCreate
    !insertmacro MUI_HEADER_TEXT "选择安装位置" "安装程序会在你选择的路径下新建文件夹；曲库目录存放导入后复制的音乐，卸载时不会删除。安装后可在应用内更改曲库位置。"

    ; 每次显示都从 $INSTDIR 重新推导，切换安装模式后仍然正确。
    StrCpy $arltInstallTarget "$INSTDIR"
    ${If} $arltLibraryEdited == 0
      ${GetParent} "$INSTDIR" $0
      StrCpy $arltPathValue "$0"
      Call ArltTrimPath
      StrCpy $arltLibraryTarget "$arltPathValue\${ARLT_LIBRARY_FOLDER}"
    ${EndIf}

    nsDialogs::Create 1018
    Pop $arltPathsDialog
    ${If} $arltPathsDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 10u "软件安装位置："
    Pop $0
    ${NSD_CreateDirRequest} 0 11u 78% 12u "$arltInstallTarget"
    Pop $arltInstallField
    ; 禁止手写路径，只能通过“浏览”选择，避免手输导致的路径问题。
    SendMessage $arltInstallField 0x00CF 1 0
    ${NSD_OnChange} $arltInstallField ArltInstallChanged
    ${NSD_CreateBrowseButton} 79% 11u 21% 12u "浏览…"
    Pop $0
    ${NSD_OnClick} $0 ArltBrowseInstall
    ${NSD_CreateLabel} 0 25u 100% 12u "将安装到："
    Pop $arltInstallPreview
    ${NSD_CreateLabel} 0 39u 100% 10u "曲库位置："
    Pop $0
    ${NSD_CreateDirRequest} 0 50u 78% 12u "$arltLibraryTarget"
    Pop $arltLibraryField
    SendMessage $arltLibraryField 0x00CF 1 0
    ${NSD_OnChange} $arltLibraryField ArltLibraryChanged
    ${NSD_CreateBrowseButton} 79% 50u 21% 12u "浏览…"
    Pop $0
    ${NSD_OnClick} $0 ArltBrowseLibrary
    ${NSD_CreateLabel} 0 64u 100% 12u "将新建："
    Pop $arltLibraryPreview

    Call ArltRefreshPreviews
    nsDialogs::Show
  FunctionEnd

  Function ArltPathsPageLeave
    ${NSD_GetText} $arltInstallField $arltInstallTarget
    StrCpy $0 "$arltInstallTarget" 1
    ${If} $0 == ""
      MessageBox MB_ICONEXCLAMATION "请选择软件安装位置。"
      Abort
    ${EndIf}
    StrCpy $arltPathValue "$arltInstallTarget"
    Call ArltTrimPath
    StrCpy $INSTDIR "$arltPathValue"

    StrCpy $arltPathValue "$INSTDIR"
    Call ArltCheckWritable
    ${If} $arltWritable != "1"
      MessageBox MB_ICONEXCLAMATION "无法创建安装目录：$INSTDIR$\r$\n可能是权限不足或该位置受保护。请返回上一步换一个目录（例如 H:\Apps\Arlt-HiFi）；若必须装到系统目录，请在安装模式页选择“为所有用户安装”让安装器提权。"
      Abort
    ${EndIf}

    ${NSD_GetText} $arltLibraryField $arltLibraryTarget
    StrCpy $0 "$arltLibraryTarget" 1
    ${If} $0 == ""
      MessageBox MB_ICONEXCLAMATION "请选择曲库位置。"
      Abort
    ${EndIf}
    StrCpy $arltPathValue "$arltLibraryTarget"
    Call ArltTrimPath
    StrCpy $arltLibraryTarget "$arltPathValue"

    StrCpy $arltPathValue "$arltLibraryTarget"
    Call ArltCheckWritable
    ${If} $arltWritable != "1"
      MessageBox MB_ICONEXCLAMATION "无法创建曲库目录：$arltLibraryTarget$\r$\n请换一个位置（例如 H:\Apps\Arlt-HiFi Library）。"
      Abort
    ${EndIf}
  FunctionEnd

  Function ArltRefreshPreviews
    ${NSD_GetText} $arltInstallField $arltPathValue
    Call ArltTrimPath
    ${NSD_SetText} $arltInstallPreview "将安装到：$arltPathValue"

    ${NSD_GetText} $arltLibraryField $arltPathValue
    Call ArltTrimPath
    ${NSD_SetText} $arltLibraryPreview "将新建：$arltPathValue"
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
      Call ArltTrimPath
      ${GetFileName} "$arltPathValue" $1
      ${If} $1 == "${APP_FILENAME}"
        StrCpy $arltInstallTarget "$arltPathValue"
      ${Else}
        StrCpy $arltInstallTarget "$arltPathValue\${APP_FILENAME}"
      ${EndIf}
      ${NSD_SetText} $arltInstallField "$arltInstallTarget"

      ${If} $arltLibraryEdited == 0
        ${GetParent} "$arltInstallTarget" $1
        StrCpy $arltPathValue "$1"
        Call ArltTrimPath
        StrCpy $arltLibraryTarget "$arltPathValue\${ARLT_LIBRARY_FOLDER}"
        StrCpy $arltSyncing "1"
        ${NSD_SetText} $arltLibraryField "$arltLibraryTarget"
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
      Call ArltTrimPath
      ${GetFileName} "$arltPathValue" $1
      ${If} $1 == "${ARLT_LIBRARY_FOLDER}"
        StrCpy $arltLibraryTarget "$arltPathValue"
      ${Else}
        StrCpy $arltLibraryTarget "$arltPathValue\${ARLT_LIBRARY_FOLDER}"
      ${EndIf}
      StrCpy $arltLibraryEdited "1"
      StrCpy $arltSyncing "1"
      ${NSD_SetText} $arltLibraryField "$arltLibraryTarget"
      StrCpy $arltSyncing "0"
      Call ArltRefreshPreviews
    ${EndIf}
  FunctionEnd
!macroend

!endif
