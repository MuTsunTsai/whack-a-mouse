// 全螢幕 + 強制橫向的共用 helper
//
// 為什麼：
//   - 手機上遊戲畫面是 16:9 橫式，玩家直立握持時 Phaser FIT 會把畫面縮很小
//   - 進全螢幕的同時試著 lock 到 landscape，讓玩家不需要先手動轉裝置
//   - lock 是「best effort」：iOS Safari 不支援、桌面瀏覽器也通常不支援、Android Chrome 支援
//     失敗時靜默忽略、不影響全螢幕本身

import type Phaser from "phaser";

/**
 * 嘗試進入全螢幕，並（手機上）順便 lock orientation 到 landscape。
 * 必須在「使用者互動的 callback 內」呼叫才會被瀏覽器允許。
 */
export function enterFullscreenAndLockLandscape(scene: Phaser.Scene): void {
	if (scene.scale.isFullscreen) {
		// 已在全螢幕，仍可嘗試 lock orientation
		tryLockLandscape();
		return;
	}
	try {
		scene.scale.startFullscreen();
	} catch {
		// 部分裝置 / iOS Safari 不支援 Fullscreen API，靜默忽略
		return;
	}
	// startFullscreen 是 sync 但 DOM fullscreenchange 是 async；給瀏覽器一點時間進入全螢幕
	// 後再 lock orientation（部分瀏覽器要求先進全螢幕才允許 lock）
	setTimeout(tryLockLandscape, 50);
}

/**
 * 嘗試把螢幕方向 lock 到 landscape。失敗（不支援、權限不足、桌面）時靜默忽略。
 */
function tryLockLandscape(): void {
	const orientation = screen.orientation as ScreenOrientation & {
		lock?: (orientation: OrientationLockType) => Promise<void>;
	} | undefined;
	if (!orientation || typeof orientation.lock !== "function") return;
	orientation.lock("landscape").catch(() => {
		// iOS Safari、桌面瀏覽器、權限不足等都會 reject — 全部視為「best effort 失敗」
	});
}
