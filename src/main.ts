// 安鼠之亂 — Phaser.Game 啟動入口

import "./styles.css";
import Phaser from "phaser";
import { BALANCE } from "./config/balance.ts";
import { showInAppBrowserNoticeIfNeeded } from "./systems/InAppBrowserNotice.ts";
import { BootScene } from "./scenes/BootScene.ts";
import { EndingScene } from "./scenes/EndingScene.ts";
import { GalleryScene } from "./scenes/GalleryScene.ts";
import { GameOverScene } from "./scenes/GameOverScene.ts";
import { GameScene } from "./scenes/GameScene.ts";
import { MuteToggleScene } from "./scenes/MuteToggleScene.ts";
import { StageSelectScene } from "./scenes/StageSelectScene.ts";
import { StartScene } from "./scenes/StartScene.ts";
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
	scene: [BootScene, StartScene, TitleScene, StageSelectScene, GameScene, GameOverScene, EndingScene, GalleryScene, MuteToggleScene],
};

// 偵測 in-app 瀏覽器（FB / IG / LINE 等內嵌 webview）→ 提示用戶改用外部瀏覽器
// 在 Phaser 啟動之前先跑：對話框是純 DOM、會浮在 canvas 之上
showInAppBrowserNoticeIfNeeded();

const game = new Phaser.Game(config);

// 開發模式：將 game 暴露在 window 方便除錯
if (import.meta.env?.MODE === "development") {
	(window as unknown as { __GAME__: Phaser.Game }).__GAME__ = game;
}
