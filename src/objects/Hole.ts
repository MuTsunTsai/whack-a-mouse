// 地洞：負責畫一個橢圓土堆背景，並提供生物冒出的座標

import Phaser from "phaser";

const HOLE_SCALE = 1.1;

export class Hole {
	readonly x: number;
	readonly y: number;
	readonly index: number;
	private readonly graphic: Phaser.GameObjects.Graphics;

	constructor(scene: Phaser.Scene, index: number, x: number, y: number) {
		this.index = index;
		this.x = x;
		this.y = y;

		this.graphic = scene.add.graphics();
		this.graphic.setPosition(x, y);
		this.graphic.setDepth(0);
		this.draw();
	}

	private draw(): void {
		const g = this.graphic;
		// 土堆陰影
		g.fillStyle(0x000000, 0.35);
		g.fillEllipse(0, 6, 130 * HOLE_SCALE, 28 * HOLE_SCALE);
		// 土堆主體
		g.fillStyle(0x4a3324, 1);
		g.fillEllipse(0, 0, 130 * HOLE_SCALE, 38 * HOLE_SCALE);
		// 洞口（深褐色橢圓）
		g.fillStyle(0x1a0d05, 1);
		g.fillEllipse(0, -2, 96 * HOLE_SCALE, 24 * HOLE_SCALE);
	}

	destroy(): void {
		this.graphic.destroy();
	}
}
