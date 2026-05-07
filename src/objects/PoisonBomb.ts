// 老鼠藥炸彈：粒子爆炸 + 鏡頭震動 + 全螢幕清場

import Phaser from "phaser";
import { BALANCE } from "../config/balance.ts";
import { SfxSystem } from "../systems/SfxSystem.ts";
import { applyDefaultTextStyle } from "../utils/text.ts";

export class PoisonBomb {
	constructor(private readonly scene: Phaser.Scene) {}

	detonate(centerX: number, centerY: number): void {
		SfxSystem.play(this.scene, "sfx-bomb");

		// 鏡頭震動
		this.scene.cameras.main.shake(BALANCE.bombShakeDurationMs, BALANCE.bombShakeIntensity);
		this.scene.cameras.main.flash(180, 180, 230, 180);

		// 用程式生成的圓形 texture 當粒子貼圖
		const partKey = "poison-particle";
		if (!this.scene.textures.exists(partKey)) {
			const g = this.scene.add.graphics();
			g.fillStyle(0x88dd55, 1);
			g.fillCircle(8, 8, 8);
			g.generateTexture(partKey, 16, 16);
			g.destroy();
		}

		// 噴發毒霧粒子（Phaser v4 ParticleEmitter）
		const emitter = this.scene.add.particles(centerX, centerY, partKey, {
			lifespan: BALANCE.bombParticleLifespanMs,
			speed: { min: 200, max: 520 },
			angle: { min: 0, max: 360 },
			scale: { start: 1.2, end: 0 },
			alpha: { start: 1, end: 0 },
			rotate: { min: 0, max: 360 },
			tint: [0x88dd55, 0xddff66, 0x66bb33],
			quantity: BALANCE.bombParticleCount,
			emitting: false,
		});
		emitter.setDepth(500);
		emitter.explode(BALANCE.bombParticleCount);
		this.scene.time.delayedCall(BALANCE.bombParticleLifespanMs + 200, () => emitter.destroy());

		// 中央骷髏 + 「💊」字樣彈跳
		const skull = this.scene.add
			.text(centerX, centerY, "💊☠️", applyDefaultTextStyle({ fontSize: "120px" }))
			.setOrigin(0.5)
			.setDepth(501);
		this.scene.tweens.add({
			targets: skull,
			scale: { from: 0.2, to: 1.6 },
			alpha: { from: 1, to: 0 },
			duration: 700,
			ease: "Cubic.Out",
			onComplete: () => skull.destroy(),
		});
	}
}
