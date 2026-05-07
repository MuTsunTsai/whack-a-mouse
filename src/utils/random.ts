// 隨機工具

export function randomBetween(min: number, max: number): number {
	return Math.random() * (max - min) + min;
}

export function randomIntBetween(min: number, max: number): number {
	return Math.floor(randomBetween(min, max + 1));
}

export function pickRandom<T>(arr: readonly T[]): T {
	if (arr.length === 0) {
		throw new Error("pickRandom 來源陣列為空");
	}
	const idx = Math.floor(Math.random() * arr.length);
	return arr[idx]!;
}

// 加權抽選：weights 物件的 key 為候選項、value 為權重
export function weightedPick<K extends string>(weights: Partial<Record<K, number>>): K {
	const entries = Object.entries(weights).filter(
		(entry): entry is [K, number] => typeof entry[1] === "number" && entry[1] > 0,
	);
	if (entries.length === 0) {
		throw new Error("weightedPick: 沒有任何有效權重");
	}
	const total = entries.reduce((sum, [, w]) => sum + w, 0);
	let r = Math.random() * total;
	for (const [key, w] of entries) {
		r -= w;
		if (r <= 0) {
			return key;
		}
	}
	return entries[entries.length - 1]![0];
}
