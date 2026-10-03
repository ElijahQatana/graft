import { test } from "node:test";
import { strict as assert } from "node:assert";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";

const bundled = await build({ entryPoints: ["src/ics/fetch.ts"], bundle: true, write: false, platform: "node", format: "cjs", external: ["obsidian"] });
const module = { exports: {} };
let request;
runInNewContext(bundled.outputFiles[0].text, {
	module, exports: module.exports, require: () => ({ requestUrl: (...args) => request(...args) }),
});
const { fetchIcs, IcsFetchError } = module.exports;
const url = "https://example.com/calendar.ics?key=synthetic";

test("fetch errors contain no request URL, raw response, or underlying error", async () => {
	for (const fail of [new Error(url), { response: "Synthetic private content" }]) {
		request = async () => { throw fail; };
		await assert.rejects(fetchIcs(url), (error) => {
			assert.ok(error instanceof IcsFetchError);
			assert.equal(error.message, "Could not reach the calendar feed.");
			assert.equal("url" in error, false);
			assert.equal("cause" in error, false);
			assert.equal(error.stack.includes(url), false);
			return true;
		});
	}
	request = async () => ({ status: 401, text: "Synthetic private response" });
	await assert.rejects(fetchIcs(url), { message: "Calendar feed returned HTTP 401" });
	request = async () => ({ status: 200, text: "Synthetic private response" });
	await assert.rejects(fetchIcs(url), { message: "Response doesn't look like an ICS calendar (no BEGIN:VCALENDAR)" });
});

test("valid calendar text is returned using Obsidian requestUrl", async () => {
	const text = "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR";
	request = async (options) => {
		assert.equal(options.url, url);
		assert.equal(options.throw, false);
		return { status: 200, text };
	};
	assert.equal(await fetchIcs(url), text);
});
