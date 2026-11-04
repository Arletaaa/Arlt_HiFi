const BOOT_SCREEN_ID = "boot-screen";
const BOOT_EXIT_MS = 520;

/** 3D 场景画出首帧后调用：淡出启动画面；重复调用安全。 */
export const dismissBootScreen = (): void => {
  const node = document.getElementById(BOOT_SCREEN_ID);

  if (!node || node.dataset.leaving === "true") {
    return;
  }

  node.dataset.leaving = "true";
  window.setTimeout(() => node.remove(), BOOT_EXIT_MS);
};
