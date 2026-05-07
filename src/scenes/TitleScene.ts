// 主選單：標題 + 三難度選擇 + 玩法說明

import Phaser from "phaser";
import { DIFFICULTY, type Difficulty } from "../config/difficulty.ts";
import { Analytics } from "../systems/Analytics.ts";
import { MusicSystem } from "../systems/MusicSystem.ts";
import { RunState } from "../systems/RunState.ts";
import { SaveSystem } from "../systems/SaveSystem.ts";
import { SfxSystem } from "../systems/SfxSystem.ts";
import { makeButton } from "../utils/button.ts";
import { enterFullscreenAndLockLandscape } from "../utils/fullscreen.ts";
import { addText } from "../utils/text.ts";

const MEDAL_SIZE = 32;

export class TitleScene extends Phaser.Scene {
	constructor() {
		super({ key: "TitleScene" });
	}

	create(): void {
		const { width, height } = this.scale;

		this.cameras.main.setBackgroundColor("#1e1e2e");
		MusicSystem.play(this, "bgm-title");

		// 背景圖（若 BootScene 已載入 bg-title 則使用）
		if(this.textures.exists("bg-title")) {
			const bg = this.add.image(width / 2, height / 2, "bg-title");
			const scale = Math.max(width / bg.width, height / bg.height);
			bg.setScale(scale);
			bg.setDepth(-10);
		}

		// 標題：優先用 logo 圖；缺檔則 fallback 文字版
		let title: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
		if(this.textures.exists("logo-title")) {
			const logo = this.add.image(width / 2, height / 2 - 200, "logo-title");
			const targetW = Math.min(800, width * 0.5);
			logo.setScale(targetW / logo.width);
			title = logo;
		} else {
			title = addText(this, width / 2, height / 2 - 200, "安鼠之亂", {
				fontSize: "96px",
				color: "#ffeb70",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 10,
			}).setOrigin(0.5);
		}

		this.tweens.add({
			targets: title,
			y: title.y - 8,
			duration: 1400,
			ease: "Sine.InOut",
			yoyo: true,
			repeat: -1,
		});

		// 難度選擇標題
		addText(this, width / 2, height / 2 - 80, "選擇難度", {
			fontSize: "20px",
			color: "#ffeb70",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 4,
		}).setOrigin(0.5);

		// 三顆難度按鈕（橫排）
		const difficulties: Difficulty[] = ["easy", "normal", "hard"];
		const btnW = 220;
		const gap = 24;
		const totalW = difficulties.length * btnW + (difficulties.length - 1) * gap;
		const startX = (width - totalW) / 2 + btnW / 2;
		const btnY = height / 2 + 30;

		difficulties.forEach((d, i) => {
			const x = startX + i * (btnW + gap);
			this.makeDifficultyButton(x, btnY, btnW, d);
		});

		// 玩法說明
		const tipY = height / 2 + 180;
		this.add.rectangle(width / 2, tipY, 760, 120, 0x000000, 0.5).setDepth(-1);
		addText(
			this,
			width / 2,
			tipY,
			[
				"點擊老鼠 🐭 得分；別誤打貓狗 🐱🐶 與天敵 🦉🦅",
				"集滿老鼠藥 💊 後，按 [空白鍵] 或 [三指觸控] 全場投藥",
				"太多老鼠將引爆漢他病毒，直接失敗",
			].join("\n"),
			{
				fontSize: "20px",
				color: "#dddddd",
				align: "center",
				fontStyle: "bold",
				lineSpacing: 8,
				stroke: "#000000",
				strokeThickness: 3,
			},
		).setOrigin(0.5);

		// CG 回憶按鈕（位於玩法說明下方、底部進度提示上方）
		this.makeGalleryButton(width / 2, height - 80);

		// 底部進度提示
		const last = SaveSystem.getLastDifficulty();
		const lastLabel = last ? DIFFICULTY[last].label : "—";
		addText(this, width / 2, height - 30, `上次難度：${lastLabel}`, {
			fontSize: "20px",
			color: "#aaaaaa",
		}).setOrigin(0.5);

		// 手機版：左上角額外放一個「全螢幕」按鈕（StartScene 那次觸發若失敗時的補救）
		const dev = this.game.device;
		const isMobile = !!dev.input.touch && !dev.os.desktop;
		if (isMobile) {
			this.makeFullscreenButton(20, 20);
		}
	}

	/**
	 * 手機版左上角「全螢幕」按鈕。直接用 rectangle + 文字繪製，不依賴美術素材。
	 * 已在全螢幕中時自動隱藏。
	 */
	private makeFullscreenButton(x: number, y: number): void {
		const w = 56;
		const h = 56;
		const refresh = () => {
			container.setVisible(!this.scale.isFullscreen);
		};

		const bg = this.add
			.rectangle(0, 0, w, h, 0x000000, 0.55)
			.setStrokeStyle(2, 0xffffff, 0.7)
			.setOrigin(0, 0);
		const icon = addText(this, w / 2, h / 2, "⛶", {
			fontSize: "32px",
			color: "#ffffff",
		}).setOrigin(0.5);

		const container = this.add.container(x, y, [bg, icon]).setDepth(500).setSize(w, h);
		bg.setInteractive({ useHandCursor: true });
		bg.on("pointerover", () => bg.setFillStyle(0x222244, 0.7));
		bg.on("pointerout", () => bg.setFillStyle(0x000000, 0.55));
		bg.on("pointerdown", () => {
			SfxSystem.play(this, "sfx-click");
			enterFullscreenAndLockLandscape(this);
			refresh();
		});

		// 進入 / 退出全螢幕事件 → 同步可見性
		this.scale.on("enterfullscreen", refresh);
		this.scale.on("leavefullscreen", refresh);
		refresh();
	}

	private makeGalleryButton(x: number, y: number): void {
		makeButton({
			scene: this, x, y,
			targetH: 90, fallbackW: 180, fallbackH: 40,
			textureKey: "btn-gallery", fallbackColor: 0x4a4a6a,
			label: "CG 回憶", fontSize: "22px",
			onClick: () => this.scene.start("GalleryScene"),
		});
	}

	private makeDifficultyButton(x: number, y: number, w: number, d: Difficulty): void {
		const mod = DIFFICULTY[d];
		const lastChosen = SaveSystem.getLastDifficulty() === d;

		// 若有美術資源（btn-difficulty-{d}）→ 用圖片按鈕（上插畫 + 下純色文字區）
		// 否則 fallback 為原本的純色 rectangle
		const imageKey = `btn-difficulty-${d}`;
		const useImage = this.textures.exists(imageKey);

		// 圖片版高度依 texture 實際 aspect 算（給定寬度 w → 高 = w / aspect），純色版維持 80
		let renderH = 80;
		if (useImage) {
			const src = this.textures.get(imageKey).getSourceImage() as { width: number; height: number };
			renderH = Math.round(w * (src.height / src.width));
		}

		// 圖片版：平時不透明、hover 時加垂直飄動（類似主標題）；不繪製額外框線
		// rectangle fallback：仍保留邊框與 lastChosen 金色高亮（純色版本沒有圖能傳達層次）
		const bg: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = useImage
			? this.add.image(x + 7, y + 10, imageKey).setDisplaySize(w, renderH)
			: this.add
				.rectangle(x, y, w, renderH, mod.uiColor, 1)
				.setStrokeStyle(lastChosen ? 4 : 3, lastChosen ? 0xffeb70 : 0xffffff);
		bg.setInteractive({ useHandCursor: true });

		// 文字位置：圖片版疊在「下半 30%」中央；rectangle 版維持原本 -14 / +16 的兩行佈局
		const labelY = useImage ? y + renderH * 0.22 : y - 14;
		const labelText = addText(this, x, labelY, mod.label, {
			fontSize: useImage ? "30px" : "26px",
			color: "#ffffff",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 4,
		}).setOrigin(0.5);

		// 圖片版的下半色塊空間有限，描述文字不顯示（避免擠壓 label）
		const descText = !useImage
			? addText(this, x, y + 16, mod.description, {
				fontSize: "20px",
				color: "#ffffff",
				align: "center",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 3,
				wordWrap: { width: w - 20 },
			}).setOrigin(0.5)
			: undefined;

		// 顯示該難度最佳結局：優先用圖片獎章；缺檔 fallback 為 emoji
		const bestEnding = SaveSystem.getBestEnding(d);
		if(bestEnding) {
			const medalKey = bestEnding === "good" ? "medal-ending-good" : "medal-ending-bad";
			const medalX = x + w / 2 - 18;
			const medalY = y - renderH / 2 + 18;
			if(this.textures.exists(medalKey)) {
				this.add.image(medalX, medalY, medalKey).setDisplaySize(MEDAL_SIZE, MEDAL_SIZE).setDepth(5);
			} else {
				const icon = bestEnding === "good" ? "✅" : "💀";
				addText(this, medalX, medalY, icon, { fontSize: "20px" }).setOrigin(0.5);
			}
		}

		if(!useImage) {
			const rect = bg as Phaser.GameObjects.Rectangle;
			bg.on("pointerover", () => rect.setStrokeStyle(4, 0xffeb70));
			bg.on("pointerout", () =>
				rect.setStrokeStyle(lastChosen ? 4 : 3, lastChosen ? 0xffeb70 : 0xffffff),
			);
		} else {
			// 圖片版：hover 時放大 5%（以中心為準，因為 image origin 預設 0.5、文字也是 0.5）
			// 注意：image 用 setDisplaySize 後內部 scaleX/Y 已被算過，直接 tween scale: 1.05 會
			// 把圖跳回原始尺寸再 ×1.05；改 tween displayWidth/Height 才正確。
			const img = bg as Phaser.GameObjects.Image;
			const baseW = w;
			const baseH = renderH;
			bg.on("pointerover", () => {
				this.tweens.add({
					targets: img,
					displayWidth: baseW * 1.05,
					displayHeight: baseH * 1.05,
					duration: 120,
					ease: "Quad.Out",
				});
				this.tweens.add({
					targets: labelText,
					scale: 1.05,
					duration: 120,
					ease: "Quad.Out",
				});
			});
			bg.on("pointerout", () => {
				this.tweens.add({
					targets: img,
					displayWidth: baseW,
					displayHeight: baseH,
					duration: 120,
					ease: "Quad.Out",
				});
				this.tweens.add({
					targets: labelText,
					scale: 1,
					duration: 120,
					ease: "Quad.Out",
				});
			});
		}

		// 按下時的縮放回饋：rectangle / 文字可以直接用 scale，但 image 用了 setDisplaySize
		// 後其內部 scaleX/Y 已被算過，再 tween scale: 0.92 會把圖回復到原始尺寸再 ×0.92，造成
		// 視覺上突然放大。對 image 改 tween displayWidth/Height 才正確（同樣的原因之前修過靜音按鈕）。
		bg.on("pointerdown", () => {
			SfxSystem.play(this, "sfx-click");
			const onComplete = () => {
				SaveSystem.setLastDifficulty(d);
				RunState.start(d);
				Analytics.startRun(d);
				this.scene.start("StageSelectScene");
			};
			if(useImage) {
				const img = bg as Phaser.GameObjects.Image;
				this.tweens.add({
					targets: img,
					displayWidth: w * 0.92,
					displayHeight: renderH * 0.92,
					duration: 80,
					yoyo: true,
				});
				this.tweens.add({
					targets: [labelText],
					scale: 0.92,
					duration: 80,
					yoyo: true,
					onComplete,
				});
			} else {
				const targets: Phaser.GameObjects.GameObject[] = [bg, labelText];
				if(descText) targets.push(descText);
				this.tweens.add({
					targets,
					scale: 0.92,
					duration: 80,
					yoyo: true,
					onComplete,
				});
			}
		});
	}
}
