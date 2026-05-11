// 安鼠之亂 — Phaser.Game 啟動入口

import "./styles.css";
import Phaser from "phaser";
import { BALANCE } from "./config/balance.ts";
import { showInAppBrowserNoticeIfNeeded } from "./systems/InAppBrowserNotice.ts";
import { AchievementScene } from "./scenes/AchievementScene.ts";
import { BootScene } from "./scenes/BootScene.ts";
import { EndingScene } from "./scenes/EndingScene.ts";
import { GalleryScene } from "./scenes/GalleryScene.ts";
import { GameOverScene } from "./scenes/GameOverScene.ts";
import { GameScene } from "./scenes/GameScene.ts";
import { MuteToggleScene } from "./scenes/MuteToggleScene.ts";
import { StageSelectScene } from "./scenes/StageSelectScene.ts";
import { StartScene } from "./scenes/StartScene.ts";
import { SurvivalEndScene } from "./scenes/SurvivalEndScene.ts";
import { TitleScene } from "./scenes/TitleScene.ts";

const config: Phaser.Types.Core.GameConfig = {
	type: Phaser.AUTO,
	parent: "app",
	width: BALANCE.gameWidth,
	height: BALANCE.gameHeight,
	backgroundColor: "#1e1e2e",
	// 小數座標四捨五入，避免精靈、地洞被次像素插值產生模糊
	roundPixels: true,
	scale: {
		mode: Phaser.Scale.FIT,
		autoCenter: Phaser.Scale.CENTER_BOTH,
	},
	render: {
		// 文字、向量物件啟用抗鋸齒（Phaser 預設已開，這裡明示）
		antialias: true,
		// 對角度為 0 度的圖元實施像素對齊，銳利度更佳
		pixelArt: false,
	},
	scene: [BootScene, StartScene, TitleScene, StageSelectScene, GameScene, GameOverScene, EndingScene, SurvivalEndScene, GalleryScene, AchievementScene, MuteToggleScene],
};

// 偵測 in-app 瀏覽器（FB / IG / LINE 等內嵌 webview）→ 提示用戶改用外部瀏覽器
// 在 Phaser 啟動之前先跑：對話框是純 DOM、會浮在 canvas 之上
showInAppBrowserNoticeIfNeeded();

// 抑制 Android Chrome 的自動安裝橫幅（PWA 仍可手動透過瀏覽器選單安裝）
// 不呼叫 prompt()、不存 event；玩家想裝就走「⋮ → 安裝應用程式」
window.addEventListener("beforeinstallprompt", (e) => {
	e.preventDefault();
});

const game = new Phaser.Game(config);

// 多種情境會讓 viewport 改變、但瀏覽器更新 innerWidth/Height 有延遲（特別是 iOS）：
//  1. orientationchange：旋轉裝置
//  2. fullscreenchange：進 / 退全螢幕
//  3. visualViewport.resize：軟鍵盤 / 雙指縮放退出 / iOS Safari URL bar 收合
//  4. visualViewport.scroll：iOS Safari URL bar 收合也會觸發此事件（非 resize）
// 解法：每次事件都連續多次呼叫 scale.refresh()（0/100/300/600/1500/3000ms），
//   涵蓋瀏覽器整個過渡時間。iOS Safari 旋轉後 URL bar 可能延遲幾秒才收合，
//   所以最後一個 tick 拉到 3 秒。refresh() 是 Phaser 4 安全可重入 API，多呼叫無副作用。
// iOS Safari 的「100dvh」在橫向時實際是「URL bar 收合後的最大區域」，
// 但 URL bar 初始展開時 canvas 會被它蓋住上方一段（玩家看到的可見高度比 dvh 小）。
// 用 visualViewport.height 才是真正反映「目前可繪製區域」的值；改用 JS 動態套到 #app。
//
// 另一個 iOS Safari 橫向多 tab 的問題：#app 的 getBoundingClientRect().top 會是負值
// （例如 -19px），代表 #app 被推到 viewport 頂端之上、上方一段被 tab bar 蓋掉。
// 修正方式：先量 top、若為負值用 padding-top 把內容推回可見區。
function syncAppViewport(): void {
	const el = document.getElementById("app");
	if (!el) return;
	const vv = window.visualViewport;
	const baseW = vv ? vv.width : window.innerWidth;
	const baseH = vv ? vv.height : window.innerHeight;
	// 先清掉舊的 padding 再量 top，避免上輪的修正影響本輪量測
	el.style.paddingTop = "";
	el.style.width = `${baseW}px`;
	el.style.height = `${baseH}px`;
	const top = el.getBoundingClientRect().top;
	if (top < 0) {
		// 上方被遮 → padding-top 把內容推回可見區。
		// height 維持 baseH 不變：#app 的總 box 等於 viewport 可見高度，
		// padding 從中切出上方被遮的部分；Phaser 用「baseH - paddingTop」作為實際 fit 區域。
		const offset = -top;
		el.style.paddingTop = `${offset}px`;
	}
}

function refreshScale(): void {
	syncAppViewport();
	game.scale.refresh();
	updateRotateHint();
}
// 初始也跑一次，避免第一次載入就是「viewport 過大」的狀態
syncAppViewport();
function refreshScaleStaggered(): void {
	refreshScale();
	setTimeout(refreshScale, 100);
	setTimeout(refreshScale, 300);
	setTimeout(refreshScale, 600);
	setTimeout(refreshScale, 1500);
	setTimeout(refreshScale, 3000);
}

// 旋轉提示：只在「處於全螢幕」且「viewport 仍呈直立（高 ≥ 寬）」時顯示
// 一般狀態（未進全螢幕）或正常橫式時都不顯示
function updateRotateHint(): void {
	const el = document.getElementById("rotate-hint");
	if (!el) return;
	const isFullscreen = !!document.fullscreenElement || !!(document as Document & {
		webkitFullscreenElement?: Element | null;
	}).webkitFullscreenElement;
	const isPortrait = window.innerHeight >= window.innerWidth;
	el.style.display = isFullscreen && isPortrait ? "block" : "none";
}
window.addEventListener("orientationchange", refreshScaleStaggered);
document.addEventListener("fullscreenchange", refreshScaleStaggered);
// Safari 仍需 webkit 前綴版本才會在某些情況觸發
document.addEventListener("webkitfullscreenchange", refreshScaleStaggered);
if (window.visualViewport) {
	// visualViewport 也用 staggered：iOS Safari 旋轉時 viewport 會經過多階段變動
	//（先給舊值 → URL bar 開始收合 → 完全收合），單次抓會漏。
	window.visualViewport.addEventListener("resize", refreshScaleStaggered);
	// iOS Safari URL bar 收合時觸發的是 scroll、不是 resize。
	window.visualViewport.addEventListener("scroll", refreshScale);
}
// 桌機跨螢幕（DPR 不同的顯示器）：window.resize 通常會觸發，且 DPR 變動時
// matchMedia(`(resolution: ${dpr}dppx)`) 也會觸發。兩個都監聽以求保險。
window.addEventListener("resize", refreshScale);
watchDevicePixelRatio(refreshScale);

// 啟動時的初始 staggered refresh：iOS Safari 載入後 URL bar 可能還沒完全 settle、
// 第一次 syncAppViewport 拿到的值未必準。比照旋轉時的多 tick 策略再做一輪、確保 fit 正確。
refreshScaleStaggered();

// 動態訂閱當前 DPR 的 media query：當 DPR 變了，舊 query 觸發 → 重新訂閱新 DPR
// 這是 W3C 推薦的「監聽 devicePixelRatio 變動」做法（DPR 是連續值，不是固定列舉）
function watchDevicePixelRatio(onChange: () => void): void {
	const subscribe = () => {
		const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
		const handler = () => {
			mq.removeEventListener("change", handler);
			onChange();
			subscribe();
		};
		mq.addEventListener("change", handler);
	};
	subscribe();
}

// 開發模式：將 game 暴露在 window 方便除錯
if (import.meta.env?.MODE === "development") {
	(window as unknown as { __GAME__: Phaser.Game }).__GAME__ = game;
}
