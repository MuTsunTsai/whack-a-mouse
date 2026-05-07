import { defineConfig } from "@rstest/core";

export default defineConfig({
	name: "whack-a-mouse",
	include: ["tests/**/*.test.ts"],
	// 模擬遊戲純邏輯，不需要 jsdom 也不需要 Phaser
	testEnvironment: "node",
});
