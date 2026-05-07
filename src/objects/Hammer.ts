// 遊戲場景內的「槌子游標」：取代滑鼠游標
//
// 桌面版：跟著滑鼠絕對位置移動
// 手機版：以「相對位移」方式移動（手指任意位置滑動 → 槌子跟著相對位移）
// 兩者共通：揮擊時旋轉動畫
//
// 命中判定不在這裡做，由 GameScene 監聽 hit 事件後查詢 hammer.tipPosition() 與生物比對

import Phaser from "phaser";
import { HAMMER } from "../config/hammer.ts";

export class Hammer {
	private readonly scene: Phaser.Scene;
	private readonly visual: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
	// 槌子的「指標位置」（滑鼠所在 / 手機累積拖動的位置），實際渲染位置 = 指標 + imageOffset
	private pointerX: number;
	private pointerY: number;
	private swinging: boolean = false;
	private readonly baseScaleX: number;
	private readonly baseScaleY: number;
	// 除錯：十字準心（指出真實命中點與半徑）
	private debugGfx?: Phaser.GameObjects.Graphics;

	constructor(scene: Phaser.Scene, initialX: number, initialY: number) {
		this.scene = scene;
		this.pointerX = initialX;
		this.pointerY = initialY;

		const hasImage = scene.textures.exists("hammer");

		if (hasImage) {
			const img = scene.add.image(0, 0, "hammer");
			img.setOrigin(HAMMER.originX, HAMMER.originY);
			img.setDisplaySize(HAMMER.displaySize, HAMMER.displaySize);
			this.baseScaleX = img.scaleX;
			this.baseScaleY = img.scaleY;
			this.visual = img;
		} else {
			// fallback：emoji 文字「🔨」
			const txt = scene.add.text(0, 0, "🔨", { fontSize: "120px" });
			txt.setOrigin(0.5, 0.5);
			this.baseScaleX = 1;
			this.baseScaleY = 1;
			this.visual = txt;
		}

		this.visual.setDepth(900); // 在生物之上

		// 除錯十字準心（畫一次圖層，每次 refreshPosition 重畫）
		if (HAMMER.debugCrosshair) {
			this.debugGfx = scene.add.graphics().setDepth(901);
		}

		this.refreshPosition();
	}

	/** 桌面版：以絕對座標設定指標位置 */
	setPointerAbsolute(x: number, y: number): void {
		this.pointerX = x;
		this.pointerY = y;
		this.refreshPosition();
	}

	/** 手機版：以相對位移移動指標位置（會夾在畫面範圍內） */
	movePointerRelative(dx: number, dy: number): void {
		const w = this.scene.scale.width;
		const h = this.scene.scale.height;
		this.pointerX = Phaser.Math.Clamp(this.pointerX + dx, 0, w);
		this.pointerY = Phaser.Math.Clamp(this.pointerY + dy, 0, h);
		this.refreshPosition();
	}

	private refreshPosition(): void {
		this.visual.setPosition(
			this.pointerX + HAMMER.imageOffsetX,
			this.pointerY + HAMMER.imageOffsetY,
		);
		this.redrawDebug();
	}

	private redrawDebug(): void {
		if (!this.debugGfx) return;
		const tip = this.tipPosition();
		const g = this.debugGfx;
		g.clear();
		// 半透明命中半徑圓
		g.lineStyle(2, 0xff3030, 0.55);
		g.strokeCircle(tip.x, tip.y, HAMMER.hitRadius);
		// 紅色十字
		const armLen = 14;
		g.lineStyle(2, 0xff3030, 0.95);
		g.beginPath();
		g.moveTo(tip.x - armLen, tip.y);
		g.lineTo(tip.x + armLen, tip.y);
		g.moveTo(tip.x, tip.y - armLen);
		g.lineTo(tip.x, tip.y + armLen);
		g.strokePath();
		// 中心小圓點
		g.fillStyle(0xff3030, 1);
		g.fillCircle(tip.x, tip.y, 3);
	}

	/** 槌頭位置（命中判定用） */
	tipPosition(): { x: number; y: number } {
		return {
			x: this.pointerX + HAMMER.tipOffsetX,
			y: this.pointerY + HAMMER.tipOffsetY,
		};
	}

	/** 觸發揮擊動畫（旋轉、縮放回饋）。可重複呼叫，正在揮擊時會被忽略 */
	swing(): void {
		if (this.swinging) return;
		this.swinging = true;

		// 一個短短的旋轉 yoyo：原始角度 → swingAngleDeg → 原始角度
		this.scene.tweens.add({
			targets: this.visual,
			angle: HAMMER.swingAngleDeg,
			duration: HAMMER.swingDurationMs / 2,
			ease: "Cubic.In",
			yoyo: true,
			onComplete: () => {
				this.visual.setAngle(0);
				this.swinging = false;
			},
		});
	}

	/**
	 * 手機版：在指定座標瞬移、揮擊、然後消失。
	 *  - onImpact：旋轉到底（揮擊「打到」的視覺瞬間）時觸發 → 命中判定該時點才生效
	 *  - onDone：整段動畫結束、槌子已隱藏，可以開始處理下一個 queued 揮擊
	 *
	 * 動畫拆兩段：A) 旋轉到 swingAngleDeg → 觸發 onImpact；B) 反向回 0 → 觸發 onDone。
	 * 比 yoyo 多一次 tween 但能精準回呼「揮到底」的時點。
	 */
	swingAt(x: number, y: number, onImpact?: () => void, onDone?: () => void): void {
		this.pointerX = x;
		this.pointerY = y;
		this.refreshPosition();
		this.setVisible(true);
		this.swinging = true;

		const half = HAMMER.swingDurationMs / 2;
		this.scene.tweens.add({
			targets: this.visual,
			angle: HAMMER.swingAngleDeg,
			duration: half,
			ease: "Cubic.In",
			onComplete: () => {
				// 揮到底 → 命中判定就在這一刻發生
				onImpact?.();
				// 第二段：回到 0 角度
				this.scene.tweens.add({
					targets: this.visual,
					angle: 0,
					duration: half,
					ease: "Cubic.Out",
					onComplete: () => {
						this.swinging = false;
						this.setVisible(false);
						onDone?.();
					},
				});
			},
		});
	}

	destroy(): void {
		this.visual.destroy();
		this.debugGfx?.destroy();
	}

	// 給 GameScene 暫時性顯示/隱藏（例如關卡介紹文字播放期間）
	setVisible(visible: boolean): void {
		this.visual.setVisible(visible);
		this.debugGfx?.setVisible(visible);
	}

	// for tests / debug
	get position(): { x: number; y: number } {
		return { x: this.pointerX, y: this.pointerY };
	}

	get baseScales(): { x: number; y: number } {
		return { x: this.baseScaleX, y: this.baseScaleY };
	}
}
