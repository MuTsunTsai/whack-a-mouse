// HUD：分數、關卡名、關卡倒數、漢他血條、集氣條、嘲諷氣泡
// 排版採「上下兩列」結構，避免文字與集氣條彼此重疊。
//
// 漢他改版：原本是倒數秒數，現在是「畫面上同時存活的老鼠數」。
// HUD 顯示為一條橫向血條（綠 → 黃 → 紅），數量越多越紅、越接近威脅越會閃爍。

import Phaser from "phaser";
import { BALANCE } from "../config/balance.ts";
import { addText, applyDefaultTextStyle } from "../utils/text.ts";

export class HUD {
	private readonly scene: Phaser.Scene;
	private readonly scoreText: Phaser.GameObjects.Text;
	private readonly stageNameText: Phaser.GameObjects.Text;
	private readonly stageTimerText: Phaser.GameObjects.Text;
	private readonly hantaLabelText: Phaser.GameObjects.Text;
	private readonly hantaBarBg: Phaser.GameObjects.Rectangle;
	private readonly hantaBarFill: Phaser.GameObjects.Rectangle;
	private readonly bombHintText: Phaser.GameObjects.Text;
	private readonly bombStockSlots: Phaser.GameObjects.Text[] = [];
	private readonly hantaBarMaxWidth: number = 200;
	private hantaFlickerTween?: Phaser.Tweens.Tween;
	private bombStockReadyTween?: Phaser.Tweens.Tween;

	// 集氣條：三段平行四邊形（EFZ 風格），每段對應一顆炸彈
	// 用 Graphics 物件繪製，每幀以動態色彩 / 高光呈現
	private readonly chargeBarGraphics: Phaser.GameObjects.Graphics;
	private readonly chargeBigNumber: Phaser.GameObjects.Text;
	private readonly chargeBarOriginX: number = 24;
	private readonly chargeBarBaseY: number;
	private readonly chargeSegmentWidth: number = 200; // 三段，每段 200px → 總寬 600px
	private readonly chargeSegmentHeight: number = 22;
	private readonly chargeSegmentSkew: number = 10; // 平行四邊形傾斜量
	private readonly chargeSegmentGap: number = 6;
	private chargeAnimT: number = 0; // 內部脈動時間（用於動態色澤）
	private chargeRatios: number[] = [0, 0, 0]; // 三段各自的填充比例
	private chargeReadyCount: number = 0; // 已成段數（庫存）

	// Combo 顯示（左上角、HUD 條下方）：≥ comboDisplayThreshold 才顯示
	private readonly comboCountText: Phaser.GameObjects.Text;
	private readonly comboLabelText: Phaser.GameObjects.Text;
	private comboPopTween?: Phaser.Tweens.Tween;
	private lastComboShown: number = 0;

	// 過關門檻（由 GameScene 設定）；達到後分數會 pop 一次 + 持續閃光
	private passScore: number = Infinity;
	private passReached: boolean = false;
	private scoreGlowTween?: Phaser.Tweens.Tween;
	private scorePopTween?: Phaser.Tweens.Tween;

	constructor(scene: Phaser.Scene, width: number, height: number) {
		this.scene = scene;

		// HUD 背景條（高度容納兩列）
		const barHeight = 96;
		const bar = scene.add.rectangle(width / 2, barHeight / 2, width, barHeight, 0x000000, 0.55);
		bar.setDepth(100);

		// === 上列（y ≈ 8~36）===
		this.scoreText = addText(scene, 20, 8, "分數 0", {
			fontSize: "22px",
			color: "#ffeb70",
			fontStyle: "bold",
		}).setDepth(101);

		this.stageNameText = addText(scene, width / 2, 8, "", {
			fontSize: "22px",
			color: "#ffffff",
			fontStyle: "bold",
		})
			.setOrigin(0.5, 0)
			.setDepth(101);

		// === 漢他血條（右上角，避開靜音按鈕）===
		// 標籤在條左邊
		const hantaRightX = width - 80;
		const hantaY = 22;
		this.hantaLabelText = addText(scene, hantaRightX - this.hantaBarMaxWidth, hantaY, "🦠 漢他", {
			fontSize: "20px",
			color: "#ff8888",
			fontStyle: "bold",
		})
			.setOrigin(1, 0.5)
			.setDepth(101);

		this.hantaBarBg = scene.add
			.rectangle(
				hantaRightX - this.hantaBarMaxWidth / 2,
				hantaY,
				this.hantaBarMaxWidth,
				14,
				0x222222,
				0.8,
			)
			.setStrokeStyle(2, 0xffffff, 0.6)
			.setDepth(101);

		this.hantaBarFill = scene.add
			.rectangle(
				hantaRightX - this.hantaBarMaxWidth,
				hantaY,
				0,
				12,
				0x66dd66,
				1,
			)
			.setOrigin(0, 0.5)
			.setDepth(102);

		// === 下列（y ≈ 50~80）===
		this.stageTimerText = addText(scene, 20, 52, "關卡剩餘 60 秒", {
			fontSize: "20px",
			color: "#aaeaff",
		}).setDepth(101);

		// === 集氣條 + 炸彈庫存（左下角，格鬥遊戲必殺技風格 EFZ 風）===
		// 佈局（範圍 y ≈ height-86 ~ height-12）：
		//   y1：三段平行四邊形進度條（每段 200×22px，總寬 ~636px）
		//        旁邊有大字數字「N / 3」
		const baseY = height - 86;
		const labelX = 24;
		this.chargeBarBaseY = baseY + 30;
		
		// 集氣條本體：用 Graphics 畫三段平行四邊形（含底色框、填色、高光）
		this.chargeBarGraphics = scene.add.graphics().setDepth(102);

		// 大字數字（顯示目前已成段數，例如「2 / 3」）
		const totalWidth =
			this.chargeSegmentWidth * 3 + this.chargeSegmentGap * 2 + this.chargeSegmentSkew;
		const numberX = labelX + totalWidth + 24;
		this.chargeBigNumber = addText(scene, numberX, this.chargeBarBaseY, "0/3", {
			fontSize: "44px",
			color: "#ffffff",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 6,
		})
			.setOrigin(0, 0.5)
			.setDepth(103);

		// 炸彈庫存槽：3 顆 emoji 放在大字數字右側、稍微小一點
		const slotStartX = numberX + 110;
		const slotY = this.chargeBarBaseY;
		for (let i = 0; i < 3; i++) {
			const slot = addText(scene, slotStartX + i * 28, slotY, "💣", {
				fontSize: "22px",
			})
				.setOrigin(0, 0.5)
				.setDepth(102)
				.setAlpha(0.25); // 預設灰底
			this.bombStockSlots.push(slot);
		}

		// 「按空白鍵投放」提示文字：放在集氣條上方
		this.bombHintText = addText(scene, labelX, baseY - 22, "", {
			fontSize: "20px",
			color: "#ffee77",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 3,
		})
			.setOrigin(0, 0)
			.setDepth(101)
			.setAlpha(0);

		// === Combo 顯示（左上角、HUD 條下方）===
		// 格鬥遊戲風格：「N HITS」+ 大字數字、有顏色與描邊
		this.comboCountText = addText(scene, 24, barHeight + 12, "", {
			fontSize: "44px",
			color: "#ffeb70",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 6,
		})
			.setOrigin(0, 0)
			.setDepth(101)
			.setAlpha(0);

		this.comboLabelText = addText(scene, 28, barHeight + 60, "COMBO", {
			fontSize: "20px",
			color: "#ff8866",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 4,
		})
			.setOrigin(0, 0)
			.setDepth(101)
			.setAlpha(0);
	}

	setStageName(name: string): void {
		this.stageNameText.setText(name);
	}

	/**
	 * 設定本關過關門檻。分數第一次跨過此值 → 觸發 pop + 持續閃光動畫。
	 * 必須在第一次呼叫 setScore 之前呼叫，否則「跨過」事件可能錯過。
	 */
	setPassScore(passScore: number): void {
		this.passScore = passScore;
		this.passReached = false;
	}

	setScore(score: number): void {
		this.scoreText.setText(`分數 ${score}`);
		// 第一次跨過 passScore → 放大 pop + 啟動持續閃光循環
		if (!this.passReached && score >= this.passScore) {
			this.passReached = true;
			this.playPassReachedAnimation();
		}
	}

	/**
	 * 過關達標慶祝動畫：
	 *  1. 一次性 pop：縮放 1.0 → 1.4 → 1.0（150+150ms, Back.Out / Back.In）
	 *  2. 持續閃光：循環變色（金黃 ↔ 亮白）+ 微微呼吸縮放（1.0 ↔ 1.08）
	 * 整關期間都會持續播放，直到 HUD destroy。
	 */
	private playPassReachedAnimation(): void {
		// pop 動畫：先停掉舊 tween 確保乾淨初始化
		this.scorePopTween?.stop();
		this.scoreText.setScale(1);
		this.scorePopTween = this.scene.tweens.add({
			targets: this.scoreText,
			scale: 1.4,
			duration: 150,
			ease: "Back.Out",
			yoyo: true,
			onYoyo: () => {
				// yoyo 回程改用 Back.In 收得乾淨
			},
			onComplete: () => {
				this.scoreText.setScale(1);
				// 接續啟動「持續閃光」循環
				this.startScoreGlow();
			},
		});
	}

	/** 過關後持續播放：色彩在金黃 ↔ 亮白之間平滑切換 + 微微呼吸縮放 */
	private startScoreGlow(): void {
		this.scoreGlowTween?.stop();
		this.scoreGlowTween = this.scene.tweens.addCounter({
			from: 0,
			to: 1,
			duration: 700,
			yoyo: true,
			repeat: -1,
			ease: "Sine.InOut",
			onUpdate: (tween) => {
				const t = tween.getValue() ?? 0;
				// 金黃 #ffeb70 ↔ 亮白 #ffffff 之間插值
				const r = 0xff;
				const g = Math.round(0xeb + (0xff - 0xeb) * t);
				const b = Math.round(0x70 + (0xff - 0x70) * t);
				const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
				this.scoreText.setColor(hex);
				// 微微呼吸縮放（1.0 ↔ 1.08）
				const s = 1 + 0.08 * t;
				this.scoreText.setScale(s);
			},
		});
	}

	setStageTimer(secondsLeft: number): void {
		this.stageTimerText.setText(`關卡剩餘 ${Math.max(0, Math.ceil(secondsLeft))} 秒`);
	}

	/**
	 * 漢他血條更新。
	 *  current：畫面上目前活著的老鼠數
	 *  threshold：達此數量即 game over
	 *  flickerIntervalMs：> 0 時血條閃爍紅光（警告）；<= 0 時停止閃爍
	 */
	setHanta(current: number, threshold: number, flickerIntervalMs: number = 0): void {
		const ratio = Math.max(0, Math.min(1, current / threshold));
		this.hantaBarFill.width = this.hantaBarMaxWidth * ratio;

		// 顏色依比例：< 0.4 綠、< 0.7 黃、>= 0.7 紅
		let color: number;
		if (ratio < 0.4) color = 0x66dd66;
		else if (ratio < 0.7) color = 0xddcc44;
		else color = 0xff4444;
		this.hantaBarFill.fillColor = color;

		// 標籤文字也順便顯示比例
		this.hantaLabelText.setText(`🦠 漢他 ${current}/${threshold}`);
		this.hantaLabelText.setColor(ratio >= 0.7 ? "#ff5555" : ratio >= 0.4 ? "#ffcc66" : "#ff8888");

		this.applyHantaFlicker(flickerIntervalMs);
	}

	private applyHantaFlicker(intervalMs: number): void {
		this.hantaFlickerTween?.stop();
		this.hantaFlickerTween = undefined;
		if (intervalMs <= 0) {
			this.hantaBarBg.setStrokeStyle(2, 0xffffff, 0.6);
			return;
		}
		// 閃紅邊框，搭配填色 alpha 變化
		this.hantaFlickerTween = this.scene.tweens.add({
			targets: this.hantaBarBg,
			alpha: { from: 0.6, to: 1 },
			duration: intervalMs,
			yoyo: true,
			repeat: -1,
			onUpdate: () => {
				this.hantaBarBg.setStrokeStyle(3, 0xff3030, this.hantaBarBg.fillAlpha);
			},
		});
	}

	/**
	 * 設定 combo 顯示。combo < threshold 時隱藏；≥ threshold 時顯示，
	 * 數字遞增時跳動放大一下作為視覺回饋；歸零時直接淡出。
	 */
	setCombo(combo: number): void {
		const threshold = BALANCE.comboDisplayThreshold;

		if (combo < threshold) {
			// 直接淡出
			if (this.lastComboShown >= threshold) {
				this.scene.tweens.add({
					targets: [this.comboCountText, this.comboLabelText],
					alpha: 0,
					duration: 180,
				});
			}
			this.lastComboShown = combo;
			return;
		}

		// 顯示
		this.comboCountText.setText(String(combo));
		this.comboLabelText.setText(`COMBO`);

		const wasHidden = this.lastComboShown < threshold;
		if (wasHidden) {
			this.comboCountText.setAlpha(1);
			this.comboLabelText.setAlpha(1);
		}

		// 跳動效果：每次數字變化時做一次縮放 yoyo
		this.comboPopTween?.stop();
		this.comboCountText.setScale(1);
		this.comboPopTween = this.scene.tweens.add({
			targets: this.comboCountText,
			scale: 1.3,
			duration: 90,
			yoyo: true,
			ease: "Cubic.Out",
		});

		this.lastComboShown = combo;
	}

	/**
	 * 更新集氣條與炸彈庫存槽。
	 *  charge：當前集氣值（0~chargeMax，這裡 chargeMax 一律視為 100）
	 *  bombs：當前庫存炸彈數（0~3）
	 *
	 * 集氣條視覺：三段平行四邊形，每段獨立 0~1 填充。
	 *  - 第 i 段（0-based）若 bombs > i：完整滿格（已成型）
	 *  - 第 i 段 == bombs：用 charge / 100 部分填充
	 *  - 第 i 段 > bombs：空
	 */
	setCharge(charge: number, bombs: number): void {
		this.chargeReadyCount = bombs;
		const partial = Math.max(0, Math.min(1, charge / 100));
		this.chargeRatios = [0, 0, 0].map((_v, i) => {
			if (i < bombs) return 1;
			if (i === bombs) return partial;
			return 0;
		});

		this.redrawChargeBar();
		this.chargeBigNumber.setText(`${bombs}/3`);
		this.chargeBigNumber.setColor(bombs >= 3 ? "#ffe070" : "#ffffff");

		// 庫存槽：前 N 個亮、其他半透明
		this.bombStockSlots.forEach((slot, i) => {
			const filled = i < bombs;
			slot.setAlpha(filled ? 1 : 0.25);
		});

		// 有庫存 → 顯示投放提示；依環境（手機 vs 桌面）顯示對應的操作說明
		if (bombs > 0) {
			const dev = this.scene.game.device;
			const isMobile = !!dev.input.touch && !dev.os.desktop;
			const hintText = isMobile
				? "[ 三指觸控 ] 全場投放老鼠藥！"
				: "按 [ 空白鍵 ] 全場投放老鼠藥！";
			this.bombHintText.setText(hintText);
			if (this.bombHintText.alpha < 1) {
				this.scene.tweens.add({
					targets: this.bombHintText,
					alpha: 1,
					duration: 200,
				});
			}
			// 庫存從 0 變正數的瞬間，做一次「庫存可用」的脈動效果
			if (!this.bombStockReadyTween && bombs > 0) {
				this.bombStockReadyTween = this.scene.tweens.add({
					targets: this.bombStockSlots.filter((_s, i) => i < bombs),
					scale: { from: 1, to: 1.2 },
					duration: 600,
					yoyo: true,
					repeat: -1,
				});
			}
		} else {
			this.bombHintText.setAlpha(0);
			this.bombStockReadyTween?.stop();
			this.bombStockReadyTween = undefined;
			this.bombStockSlots.forEach((s) => s.setScale(1));
		}
	}

	/**
	 * 每幀推進集氣條的色澤動畫，由外部 GameScene.update 呼叫。
	 * 用 dt（毫秒）累積一個內部時間軸，做出緩慢呼吸 + 已成段高光掃描的 EFZ 風格。
	 */
	tickCharge(dtMs: number): void {
		this.chargeAnimT += dtMs;
		this.redrawChargeBar();
	}

	/**
	 * 重畫集氣條本體：三段平行四邊形，每段有
	 *   1) 深色底框（含外框）
	 *   2) 漸變色填充（依段別不同色 + 隨時間波動明度）
	 *   3) 半透明高光掃光帶（已成段才有）
	 */
	private redrawChargeBar(): void {
		const g = this.chargeBarGraphics;
		g.clear();

		const x0 = this.chargeBarOriginX;
		const y0 = this.chargeBarBaseY - this.chargeSegmentHeight / 2;
		const w = this.chargeSegmentWidth;
		const h = this.chargeSegmentHeight;
		const skew = this.chargeSegmentSkew;
		const gap = this.chargeSegmentGap;

		// 三段不同基色（綠 → 黃 → 紅，象徵「越接近三顆越強」）
		const baseColors: Array<[number, number]> = [
			[0x55cc66, 0x88ee99],
			[0xddbb44, 0xffe080],
			[0xff5555, 0xff9966],
		];

		for (let i = 0; i < 3; i++) {
			const segLeft = x0 + i * (w + gap);
			this.drawSegment(g, segLeft, y0, w, h, skew, baseColors[i]!, this.chargeRatios[i]!, i);
		}
	}

	/**
	 * 畫單一段平行四邊形：四個頂點是
	 *   左上 (lx + skew, y)
	 *   右上 (lx + w + skew, y)
	 *   右下 (lx + w, y + h)
	 *   左下 (lx,         y + h)
	 * 也就是上邊整體往右偏移 skew，做出右傾的平行四邊形。
	 */
	private drawSegment(
		g: Phaser.GameObjects.Graphics,
		lx: number,
		y: number,
		w: number,
		h: number,
		skew: number,
		baseColor: [number, number],
		ratio: number,
		segIndex: number,
	): void {
		const isReady = segIndex < this.chargeReadyCount;
		const t = this.chargeAnimT / 1000;

		// 1) 底框（深色）
		g.fillStyle(0x101018, 0.85);
		g.beginPath();
		g.moveTo(lx + skew, y);
		g.lineTo(lx + w + skew, y);
		g.lineTo(lx + w, y + h);
		g.lineTo(lx, y + h);
		g.closePath();
		g.fillPath();

		// 2) 填充（依 ratio 取部分平行四邊形）
		if (ratio > 0) {
			const fillW = w * ratio;

			// 已成段：脈動明度（呼吸感）；未成段：固定亮度
			let pulse = 1;
			if (isReady) {
				pulse = 0.85 + 0.15 * Math.sin(t * 4 + segIndex * 0.7);
			}

			const [dark, light] = baseColor;
			const cTop = lerpColor(dark, light, 0.7 * pulse);
			const cBot = lerpColor(dark, light, 0.2 * pulse);

			// 用 fillGradientStyle 上下漸層（4 顆顏色：左上、右上、左下、右下）
			g.fillGradientStyle(cTop, cTop, cBot, cBot, 1);
			g.beginPath();
			g.moveTo(lx + skew, y);
			g.lineTo(lx + skew + fillW, y);
			g.lineTo(lx + fillW, y + h);
			g.lineTo(lx, y + h);
			g.closePath();
			g.fillPath();

			// 3) 上半部反射高光（細白條）
			const hl = h * 0.32;
			g.fillStyle(0xffffff, 0.18);
			g.beginPath();
			g.moveTo(lx + skew, y);
			g.lineTo(lx + skew + fillW, y);
			g.lineTo(lx + fillW * (1 - skew / w * 0.0), y + hl);
			g.lineTo(lx + skew * (1 - hl / h), y + hl);
			g.closePath();
			g.fillPath();

			// 4) 已成段：跑光帶（從左掃到右、循環）
			if (isReady) {
				const sweepW = w * 0.18;
				const sweepCycle = 1.6; // 秒
				const sweepProg = ((t / sweepCycle) % 1);
				const sx = lx - sweepW + (w + sweepW * 2) * sweepProg;
				// 把高光裁在這個 segment 範圍內
				const left = Math.max(sx, lx);
				const right = Math.min(sx + sweepW, lx + fillW);
				if (right > left) {
					g.fillStyle(0xffffff, 0.32);
					g.beginPath();
					g.moveTo(left + skew, y);
					g.lineTo(right + skew, y);
					g.lineTo(right, y + h);
					g.lineTo(left, y + h);
					g.closePath();
					g.fillPath();
				}
			}
		}

		// 5) 外框（白色細線）
		const frameAlpha = isReady ? 0.9 : 0.55;
		g.lineStyle(2, 0xffffff, frameAlpha);
		g.beginPath();
		g.moveTo(lx + skew, y);
		g.lineTo(lx + w + skew, y);
		g.lineTo(lx + w, y + h);
		g.lineTo(lx, y + h);
		g.closePath();
		g.strokePath();
	}

	showTaunt(text: string, x: number, y: number, color: string = "#ffffff"): void {
		const style = applyDefaultTextStyle({
			fontSize: "20px",
			color,
			backgroundColor: "#000000aa",
		});
		const bubble = this.scene.add
			.text(x, y, text, style)
			.setOrigin(0.5, 1)
			.setDepth(200);

		this.scene.tweens.add({
			targets: bubble,
			y: y - 60,
			alpha: 0,
			duration: 1100,
			ease: "Quad.Out",
			onComplete: () => bubble.destroy(),
		});
	}
}

/**
 * 在兩個 0xRRGGBB 顏色之間做線性插值。
 *  t = 0 → a；t = 1 → b。
 */
function lerpColor(a: number, b: number, t: number): number {
	const tt = Math.max(0, Math.min(1, t));
	const ar = (a >> 16) & 0xff;
	const ag = (a >> 8) & 0xff;
	const ab = a & 0xff;
	const br = (b >> 16) & 0xff;
	const bg = (b >> 8) & 0xff;
	const bb = b & 0xff;
	const r = Math.round(ar + (br - ar) * tt);
	const g = Math.round(ag + (bg - ag) * tt);
	const bch = Math.round(ab + (bb - ab) * tt);
	return (r << 16) | (g << 8) | bch;
}
