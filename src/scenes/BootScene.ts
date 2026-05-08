// BootScene：預掃所有預期資源（生物頭像、背景、結局插畫、BGM），
// 只把實際存在的排進 Phaser loader

import Phaser from "phaser";
import { getAllCreatureImages } from "../config/creatures.ts";
import { STAGES } from "../config/stages.ts";
import { MuteSystem } from "../systems/MuteSystem.ts";
import { resolveAudioUrl, resolveImageUrl } from "../utils/assetResolver.ts";
import { addText } from "../utils/text.ts";

export class BootScene extends Phaser.Scene {
	constructor() {
		super({ key: "BootScene" });
	}

	private loadingText?: Phaser.GameObjects.Text;
	private progressFill?: Phaser.GameObjects.Rectangle;

	async preload(): Promise<void> {
		const { width, height } = this.scale;

		addText(this, width / 2, height / 2 - 60, "安鼠之亂", {
			fontSize: "36px",
			color: "#ffffff",
			fontStyle: "bold",
		}).setOrigin(0.5);

		this.loadingText = addText(this, width / 2, height / 2, "資源載入中…", {
			fontSize: "20px",
			color: "#aaaaaa",
		}).setOrigin(0.5);

		// 進度條
		this.add
			.rectangle(width / 2, height / 2 + 30, 320, 12, 0x222222, 0.8)
			.setStrokeStyle(2, 0xffffff, 0.4);
		this.progressFill = this.add
			.rectangle(width / 2 - 160, height / 2 + 30, 0, 10, 0x66dd66, 1)
			.setOrigin(0, 0.5);

		// 預掃所有預期資源（檔案不存在時靜默退回 fallback）
		const creatures = getAllCreatureImages();
		const stages = STAGES.map((s) => ({ key: `bg-${s.key}`, name: `bg-${s.key}` }));
		const extras = [
			{ key: "bg-title", name: "bg-title" },
			// 三套選關背景，依難度切換
			{ key: "bg-stage-select-easy", name: "bg-stage-select-easy" },
			{ key: "bg-stage-select-normal", name: "bg-stage-select-normal" },
			{ key: "bg-stage-select-hard", name: "bg-stage-select-hard" },
			// 通用 fallback：若上面三張都缺，退回單張
			{ key: "bg-stage-select", name: "bg-stage-select" },
			// 結局插畫
			{ key: "bg-ending-good", name: "bg-ending-good" },
			{ key: "bg-ending-bad", name: "bg-ending-bad" },
			// 失敗插畫（依失敗原因）
			{ key: "bg-gameover-hanta", name: "bg-gameover-hanta" },
			{ key: "bg-gameover-fail", name: "bg-gameover-fail" },
			// 生存模式結局背景
			{ key: "bg-survival-end", name: "bg-survival-end" },
			// 各關卡過關插畫（依關卡 key）
			...STAGES.map((s) => ({ key: `bg-clear-${s.key}`, name: `bg-clear-${s.key}` })),
			// UI 圖示
			{ key: "icon-sound-on", name: "icon-sound-on" },
			{ key: "icon-sound-off", name: "icon-sound-off" },
			// 遊戲內的槌子游標
			{ key: "hammer", name: "hammer" },
			// 標題 logo（用在 StartScene / TitleScene）
			{ key: "logo-title", name: "logo-title" },
			// UI 按鈕整套（每張內含多顆按鈕，載入後在 create() 切割成 frames）
			{ key: "btn-difficulty-set", name: "btn-difficulty-set" },
			{ key: "btn-set", name: "btn-set" },
			{ key: "btn-survival", name: "btn-survival" },
			{ key: "card-stage-set", name: "card-stage-set" },
			{ key: "card-achv-set", name: "card-achv-set" },
			{ key: "medal-ending-set", name: "medal-ending-set" },
		];

		// 音訊資源（mp3 / ogg / wav 任一存在即可）
		// 註：bgm-game-boss / bgm-ending-good / bgm-ending-bad 三支大檔（共 ~15MB）
		//     改由 LazyLoader 在 StartScene 後背景下載
		const audios = [
			// BGM
			{ key: "bgm-title", name: "bgm-title" },
			{ key: "bgm-game", name: "bgm-game" },
			{ key: "bgm-stage-clear", name: "bgm-stage-clear" },
			{ key: "bgm-gameover", name: "bgm-gameover" },
			// 音效
			{ key: "sfx-click", name: "sfx-click" },
			{ key: "sfx-hit", name: "sfx-hit" },
			{ key: "sfx-bomb", name: "sfx-bomb" },
			{ key: "sfx-alarm", name: "sfx-alarm" },
			// 友善動物個別叫聲（被打 / 被炸時與 sfx-hit / sfx-bomb 疊播）
			{ key: "sfx-cat", name: "sfx-cat" },
			{ key: "sfx-dog", name: "sfx-dog" },
			{ key: "sfx-owl", name: "sfx-owl" },
			{ key: "sfx-hawk", name: "sfx-hawk" },
		];

		this.loadingText.setText("檢查遊戲資源…");

		const creaturesResolved = await Promise.all(
			creatures.map(({ name }) => resolveImageUrl(name)),
		);
		const stagesResolved = await Promise.all(stages.map(({ name }) => resolveImageUrl(name)));
		const extrasResolved = await Promise.all(extras.map(({ name }) => resolveImageUrl(name)));
		const audiosResolved = await Promise.all(audios.map(({ name }) => resolveAudioUrl(name)));

		// 排程實際載入
		this.load.on("progress", (value: number) => {
			if(this.progressFill) {
				this.progressFill.width = 320 * value;
			}
		});

		creatures.forEach((c, i) => {
			const url = creaturesResolved[i];
			if(url) {
				this.load.image(c.key, url);
			}
		});

		stages.forEach((s, i) => {
			const url = stagesResolved[i];
			if(url) {
				this.load.image(s.key, url);
			}
		});

		extras.forEach((e, i) => {
			const url = extrasResolved[i];
			if(url) {
				this.load.image(e.key, url);
			}
		});

		audios.forEach((a, i) => {
			const url = audiosResolved[i];
			if(url) {
				this.load.audio(a.key, url);
			}
		});

		const anyAsset =
			creaturesResolved.some((u) => u !== null) ||
			stagesResolved.some((u) => u !== null) ||
			extrasResolved.some((u) => u !== null) ||
			audiosResolved.some((u) => u !== null);

		if(!anyAsset) {
			this.startNextScene();
			return;
		}

		// preload() 是 async — Phaser 不會等它，Phaser 已經以為 loader 跑完了。
		// 我們手動再跑一次 loader，等真正完成後才切到主選單。
		this.loadingText?.setText("遊戲載入中…");
		this.load.once("complete", () => {
			this.sliceUiSpriteSheets();
			this.startNextScene();
		});
		this.load.start();
	}

	/**
	 * 把整張的 UI spritesheet 圖（btn-set / btn-difficulty-set / card-stage-set）
	 * 切成 frames，讓場景以個別 texture key 取用。
	 *
	 * 切片支援三種模式：
	 *   1. sliceHorizontal — 等距均分水平切（適合 AI 產出剛好排好的圖）
	 *   2. sliceGrid       — 等距均分 cols × rows
	 *   3. sliceCustom     — 自訂每個 frame 的 (x, y, w, h)。AI 圖中按鈕位置常有偏差，
	 *                        想精準切割用這個。座標以源圖左上為 (0,0)、單位是像素。
	 */
	private sliceUiSpriteSheets(): void {
		this.sliceCustom("btn-difficulty-set", [
			{ key: "btn-difficulty-easy", x: 40, y: 70, w: 620, h: 500 },
			{ key: "btn-difficulty-normal", x: 660, y: 70, w: 620, h: 500 },
			{ key: "btn-difficulty-hard", x: 1280, y: 70, w: 620, h: 500 },
		], { override: true });
		this.sliceCustom("card-stage-set", [
			{ key: "card-stage-wanhua", x: 55, y: 60, w: 640, h: 905 },
			{ key: "card-stage-datong", x: 755, y: 60, w: 640, h: 905 },
			{ key: "card-stage-zhongzheng", x: 1445, y: 60, w: 640, h: 905 },
			{ key: "card-stage-zhongshan", x: 55, y: 1020, w: 640, h: 905 },
			{ key: "card-stage-daan", x: 755, y: 1020, w: 640, h: 905 },
		], { override: true });
		this.sliceCustom("btn-set", [
			{ key: "btn-next-stage", x: 85, y: 140, w: 650, h: 270 },
			{ key: "btn-next-ending", x: 810, y: 140, w: 650, h: 270 },
			{ key: "btn-replay", x: 1540, y: 140, w: 650, h: 270 },
			{ key: "btn-stage-select", x: 85, y: 590, w: 650, h: 270 },
			{ key: "btn-main-menu", x: 810, y: 590, w: 650, h: 270 },
			{ key: "btn-replay-run", x: 1540, y: 590, w: 650, h: 270 },
			{ key: "btn-back", x: 85, y: 1034, w: 650, h: 270 },
			{ key: "btn-gallery", x: 810, y: 1034, w: 650, h: 270 },
			{ key: "btn-difficulty-easy-alt", x: 1540, y: 1034, w: 650, h: 270 },
		], { override: true });
		this.sliceHorizontal("medal-ending-set", [
			"medal-ending-good",
			"medal-ending-bad",
		]);
		// 成就卡片整套（4 欄 × 3 列，每張 5:7 直式；最後一列右邊 2 格留空）
		// 實際素材尺寸 2016 × 2112，每張卡片約 480 × 670、padding 25、間距 25
		// 對應 ACHIEVEMENTS 陣列順序：
		//   row 1: iron_fan / expert_easy / expert_normal / expert_hard
		//   row 2: poison_maniac / animal_killer / last_gasp / bad_start
		//   row 3: precision_strike / survivor / [空] / [空]
		this.sliceCustom("card-achv-set", [
			{ key: "card-achv-iron-fan",         x: 51,   y: 60,   w: 441, h: 635 },
			{ key: "card-achv-expert-easy",      x: 541,  y: 60,   w: 441, h: 635 },
			{ key: "card-achv-expert-normal",    x: 1032, y: 60,   w: 441, h: 635 },
			{ key: "card-achv-expert-hard",      x: 1523, y: 60,   w: 441, h: 635 },
			{ key: "card-achv-poison-maniac",    x: 51,   y: 745,  w: 441, h: 635 },
			{ key: "card-achv-animal-killer",    x: 541,  y: 745,  w: 441, h: 635 },
			{ key: "card-achv-last-gasp",        x: 1032, y: 745,  w: 441, h: 635 },
			{ key: "card-achv-bad-start",        x: 1523, y: 745,  w: 441, h: 635 },
			{ key: "card-achv-precision-strike", x: 51,   y: 1429, w: 441, h: 635 },
			{ key: "card-achv-survivor",         x: 541,  y: 1429, w: 441, h: 635 },
		], { override: true });
		void this.sliceGrid; // 函式留著等需要時用，避免「未使用」警告
	}

	private sliceHorizontal(sourceKey: string, frameKeys: string[]): void {
		if(!this.textures.exists(sourceKey)) return;
		const src = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
		const totalW = src.width;
		const totalH = src.height;
		const frameW = totalW / frameKeys.length;
		frameKeys.forEach((key, i) => {
			if(this.textures.exists(key)) return;
			const canvas = this.textures.createCanvas(key, Math.round(frameW), totalH);
			if(!canvas) return;
			canvas.context.drawImage(
				src,
				i * frameW, 0, frameW, totalH,
				0, 0, Math.round(frameW), totalH,
			);
			canvas.refresh();
		});
	}

	private sliceGrid(sourceKey: string, cols: number, rows: number, frameKeys: string[]): void {
		if(!this.textures.exists(sourceKey)) return;
		const src = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
		const totalW = src.width;
		const totalH = src.height;
		const frameW = totalW / cols;
		const frameH = totalH / rows;
		for(let r = 0; r < rows; r++) {
			for(let c = 0; c < cols; c++) {
				const idx = r * cols + c;
				const key = frameKeys[idx];
				if(!key) continue;
				if(this.textures.exists(key)) continue;
				const canvas = this.textures.createCanvas(key, Math.round(frameW), Math.round(frameH));
				if(!canvas) continue;
				canvas.context.drawImage(
					src,
					c * frameW, r * frameH, frameW, frameH,
					0, 0, Math.round(frameW), Math.round(frameH),
				);
				canvas.refresh();
			}
		}
	}

	/**
	 * 自訂每個 frame 的精準座標切割。
	 * @param sourceKey 源圖 texture key（必須已 load）
	 * @param frames    陣列：{ key, x, y, w, h }，座標以源圖左上 (0,0) 為基準、單位像素
	 * @param opts.override 預設 false：若 key 已存在則略過。設為 true 會先移除既有 frame 再重切。
	 */
	private sliceCustom(
		sourceKey: string,
		frames: Array<{ key: string; x: number; y: number; w: number; h: number }>,
		opts: { override?: boolean } = {},
	): void {
		if(!this.textures.exists(sourceKey)) return;
		const src = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
		// 診斷：把源圖實際尺寸與每個 frame 預期座標印出，比對是否與測量值一致
		console.log(
			`[sliceCustom] ${sourceKey} src size:`,
			src.width, "×", src.height,
		);
		for(const f of frames) {
			console.log(
				`  → ${f.key}: x=${f.x} y=${f.y} w=${f.w} h=${f.h} ` +
				`(右下角 = ${f.x + f.w}, ${f.y + f.h})`,
			);
			if(this.textures.exists(f.key)) {
				if(!opts.override) continue;
				this.textures.remove(f.key);
			}
			const canvas = this.textures.createCanvas(f.key, f.w, f.h);
			if(!canvas) continue;
			canvas.context.drawImage(src, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
			canvas.refresh();
		}
	}

	private startNextScene(): void {
		// 把儲存的靜音狀態套用到 sound system
		MuteSystem.apply(this.game);
		// 啟動覆蓋層 scene（永遠在最上層、不會被 scene.start 取代）
		this.scene.launch("MuteToggleScene");

		// === TODO: 暫時的 dev 跳場（微調特定畫面用，調完移除這整個 if 區塊）===
		// 直接跳到要微調的畫面，方便 HMR 即時比對視覺
		// 移除步驟：刪掉這整段 if、保留下面的 this.scene.start("StartScene")
		// if (import.meta.env?.DEV) {
		// 	RunState.start("normal");
		// 	// 模擬一場全破跑完的 run state（給 EndingScene 顯示總分用）
		// 	for (const s of STAGES) {
		// 		RunState.registerStageResult({
		// 			stageId: s.id,
		// 			passed: true,
		// 			score: 1500,
		// 			mouseHit: 60,
		// 			innocentHit: 2,
		// 		});
		// 	}
		// 	// good ending：不呼叫 markBombUsed
		// 	this.scene.start("EndingScene", { ending: "bad" });
		// 	return;
		// }
		// === 暫時 dev 跳場結束 ===

		// 進入啟動畫面（讓使用者點一下解鎖音訊，再進 TitleScene）
		this.scene.start("StartScene");
	}

	create(): void {
		// 場景切換改由 preload 內 loader complete 觸發；
		// 這個 create 仍會被 Phaser 呼叫一次，留空無害。
	}
}

// resolveImageUrl / resolveAudioUrl 已抽到 src/utils/assetResolver.ts 共用
