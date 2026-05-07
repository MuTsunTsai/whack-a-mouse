import { defineConfig } from "@rsbuild/core";

// 安鼠之亂：以 Rsbuild 建置的 Phaser 4 網頁遊戲
export default defineConfig({
	html: {
		template: "./src/index.html",
		title: "安鼠之亂",
	},
	source: {
		entry: {
			index: "./src/main.ts",
		},
	},
	output: {
		distPath: {
			root: "dist",
		},
	},
	server: {
		base: "/whack-a-mouse/",
		port: 3000,
		host: true,
	},
});
