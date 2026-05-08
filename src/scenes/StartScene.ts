// 啟動畫面：解鎖瀏覽器自動播放限制 + 提示玩家點擊進入
// BootScene 載完資源後切到此 scene，使用者點擊任意處 → 進 TitleScene
// 由於這次點擊算「使用者互動」，TitleScene 一進去就能直接播放 BGM

import Phaser from "phaser";
import { LazyLoader } from "../systems/LazyLoader.ts";
import { SfxSystem } from "../systems/SfxSystem.ts";
import { enterFullscreenAndLockLandscape } from "../utils/fullscreen.ts";
import { addText } from "../utils/text.ts";

export class StartScene extends Phaser.Scene {
	constructor() {
		super({ key: "StartScene" });
	}

	create(): void {
		const { width, height } = this.scale;

		// 與 TitleScene 一樣的背景圖（若存在）
		if (this.textures.exists("bg-title")) {
			const bg = this.add.image(width / 2, height / 2, "bg-title");
			const scale = Math.max(width / bg.width, height / bg.height);
			bg.setScale(scale);
			bg.setDepth(-10);
		} else {
			this.cameras.main.setBackgroundColor("#1e1e2e");
		}

		// 整體再壓暗一層，凸顯中央按鈕
		this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55).setDepth(-5);

		// 標題：優先用 logo 圖；缺檔則 fallback 文字版
		if (this.textures.exists("logo-title")) {
			const logo = this.add.image(width / 2, height / 2 - 80, "logo-title");
			// 等比縮放：讓寬度約佔畫面 65%（不超過 800px）
			const targetW = Math.min(800, width * 0.65);
			const scale = targetW / logo.width;
			logo.setScale(scale);
		} else {
			addText(this, width / 2, height / 2 - 80, "安鼠之亂", {
				fontSize: "96px",
				color: "#ffeb70",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 10,
			}).setOrigin(0.5);
		}

		// 中央 CTA：點擊任意處進入
		const cta = addText(this, width / 2, height / 2 + 70, "▶  點擊任意處進入", {
			fontSize: "32px",
			color: "#ffffff",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 5,
		}).setOrigin(0.5);

		// 呼吸燈效果，吸引注意
		this.tweens.add({
			targets: cta,
			alpha: 0.55,
			scale: 0.96,
			duration: 900,
			ease: "Sine.InOut",
			yoyo: true,
			repeat: -1,
		});

		// 小字補充
		addText(this, width / 2, height - 40, "© MuTsunTsai 2026", {
			fontSize: "20px",
			color: "#aaaaaa",
		}).setOrigin(0.5);

		// 在背景啟動延遲資源下載（魔王關 BGM、結局 BGM 等大檔）
		// 不阻擋啟動畫面，玩家進到 TitleScene / 第 1 關時通常已下載完成
		LazyLoader.start(this.game);

		// 點擊 / 觸控 / 鍵盤皆可進入；趁這次互動主動 resume AudioContext，
		// 並 await 完成、確認真的進入 running 狀態才切 scene。
		// 否則 ctx.resume() 是 async，scene.start 會在 resume 完成前就把 TitleScene 啟動，
		// 此時 MusicSystem.play 看到 ctx.state==="suspended" 又會被 pending 卡住。
		const enter = async () => {
			const ctx = (this.sound as Phaser.Sound.WebAudioSoundManager).context;
			if (ctx) {
				if (ctx.state === "suspended") {
					try {
						await ctx.resume();
					} catch {
						// 忽略：即使失敗，後面的 unlock listener 仍會接力
					}
				}
				// Phaser 4 的 sound.locked 也手動清掉，避免它阻擋後續播放
				try {
					(this.sound as { locked?: boolean }).locked = false;
				} catch {
					// 唯讀屬性的話忽略
				}
			}
			SfxSystem.play(this, "sfx-click");

			// 手機版：嘗試進入全螢幕 + lock 到 landscape（必須在使用者互動的 callback 內）
			const dev = this.game.device;
			const isMobile = !!dev.input.touch && !dev.os.desktop;
			if (isMobile) {
				enterFullscreenAndLockLandscape(this);
			}

			this.scene.start("TitleScene");
		};
		this.input.once("pointerdown", () => void enter());
		this.input.keyboard?.once("keydown", () => void enter());
	}
}
