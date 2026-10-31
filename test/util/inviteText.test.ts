import { test } from "node:test";
import { strict as assert } from "node:assert";
import { cleanInviteText, inviteAgendaText, neutralizeInviteText } from "../../src/util/inviteText.ts";

const SEP = "_".repeat(80);

const teams = [
	"Agenda: review the Q3 plan.",
	"",
	SEP,
	"Microsoft Teams meeting",
	"Join on your computer, mobile app or room device",
	"Click here to join the meeting<https://teams.microsoft.com/l/meetup-join/19%3ameeting_example/0>",
	"Meeting ID: 123 456 789 0",
	"Passcode: AbCdEf",
	"Download Teams | Join on the web",
	"Or call in (audio only)",
	"+1 555-010-0100,,123456789#   United States, Example City",
	"Phone Conference ID: 123 456 789#",
	"Find a local number | Reset PIN",
	"Need help?<https://example.com/help>",
	"System reference<https://example.com/ref>",
	"For organizers: Meeting options | Reset dial-in PIN",
	SEP,
].join("\n");

test("removes Teams join text and keeps the agenda", () => {
	const out = cleanInviteText(teams);
	assert.match(out, /^Agenda: review the Q3 plan\./);
	assert.doesNotMatch(out, /teams\.microsoft\.com|Meeting ID|Passcode|\+1 555|Phone Conference|Need help|_{3}/);
});

test("removes Google Meet join text", () => {
	const text = [
		"Walk through the launch checklist.",
		"",
		"Join with Google Meet",
		"Meeting link: https://meet.google.com/abc-defg-hij",
		"",
		"Join by phone",
		"(US) +1 555-010-0101 PIN: 123 456 789#",
		"More phone numbers: https://tel.meet/abc-defg-hij?pin=1234567890123",
		"",
		"Learn more about Meet at: https://support.example.com/meet/help",
		"",
		"Please do not edit this section.",
	].join("\n");
	assert.equal(cleanInviteText(text), "Walk through the launch checklist.");
});

test("removes Zoom join text", () => {
	const text = [
		"Topics:",
		"- Budget",
		"- Hiring",
		"",
		"Join Zoom Meeting",
		"https://example.zoom.us/j/12345678901?pwd=abc",
		"",
		"Meeting ID: 123 4567 8901",
		"Passcode: 123456",
		"One tap mobile",
		"+15550100100,,12345678901#,,,,*123456# US",
		"+15550100101,,12345678901#,,,,*123456# US (Example)",
		"",
		"Dial by your location",
		"        +1 555 010 0100 US",
		"Find your local number: https://example.zoom.us/u/abcdef",
		"Join by SIP",
		"12345678901@zoomcrc.example.com",
	].join("\n");
	assert.equal(cleanInviteText(text), "Topics:\n- Budget\n- Hiring");
});

test("keeps a plain agenda exactly as written", () => {
	const text = "1. Intro\n2. Demo\n\nNotes: bring the draft.\nCall Sam before the meeting.";
	assert.equal(cleanInviteText(text), text);
});

test("keeps a meaningful divider between agenda sections", () => {
	const text = "Part one\n\n---\n\nPart two";
	assert.equal(cleanInviteText(text), text);
});

test("keeps ordinary links and phone numbers inside prose", () => {
	const text = "Review the doc at https://example.com/plan\nCall the vendor on +1 555 010 0199 about pricing.";
	assert.equal(cleanInviteText(text), text);
});

test("returns empty when only join text is present", () => {
	assert.equal(cleanInviteText(`${SEP}\nMicrosoft Teams meeting\nMeeting ID: 1 2 3\n${SEP}`), "");
	assert.equal(cleanInviteText("Join Zoom Meeting\nhttps://example.zoom.us/j/1"), "");
	assert.equal(cleanInviteText("   \n\n  "), "");
	assert.equal(cleanInviteText(undefined), "");
});

test("strips HTML tags and entities", () => {
	assert.equal(cleanInviteText("<p>Plan &amp; review</p><p>Second&nbsp;line<br>third</p>"), "Plan & review\nSecond line\nthird");
});

test("leaves text with a stray less-than sign alone", () => {
	assert.equal(cleanInviteText("Keep cost < budget"), "Keep cost < budget");
});

test("collapses repeated blank lines, repeated separators and CRLF", () => {
	const out = cleanInviteText("One\r\n\r\n\r\n\r\nTwo\r\n=====\r\n=====\r\nThree  \r\n");
	assert.equal(out, "One\n\nTwo\n=====\nThree");
});

test("is stable when run on its own output", () => {
	for (const text of [teams, "Plain agenda\n\n---\n\nMore"]) {
		const once = cleanInviteText(text);
		assert.equal(cleanInviteText(once), once);
	}
});

test("keeps password, PIN and phone lines when the text holds no join text", () => {
	const text = "Password: rotate the shared keys\nVendor: +1 555 010 0199\nPIN: reset the door code";
	assert.equal(cleanInviteText(text), text);
});

test("removes detail lines next to join text", () => {
	assert.equal(cleanInviteText("Agenda\n\nJoin Zoom Meeting\nPasscode: 123456\nDial by your location\n+1 555 010 0100 US"), "Agenda");
});

test("shows a dataviewjs block as literal text", () => {
	const out = neutralizeInviteText("Agenda\n\n```dataviewjs\ndv.paragraph(app.vault.getName());\n```\n\nThanks");
	assert.doesNotMatch(out, /^`{3}/m);
	assert.match(out, /^\\```dataviewjs$/m);
	assert.match(out, /^Agenda\n\n/);
	assert.match(out, /\n\nThanks$/);
});

test("shows dataview, tilde and indented fences as literal text", () => {
	const out = neutralizeInviteText("```dataview\nTABLE file.name\n```\n~~~js\nrun();\n~~~\n- ```dataviewjs\n  >  ```js\n   ```");
	for (const line of out.split("\n")) assert.doesNotMatch(line, /^[\s>*+-]*(?:`{3}|~{3})/);
	assert.equal(out.split("\n")[0], "\\```dataview");
});

test("breaks Templater tags", () => {
	const out = neutralizeInviteText("Hi <% tp.date.now() %> and <%* tR += 'x' %> and <%+ tp.file.title %>");
	assert.doesNotMatch(out, /<%/);
	assert.equal(out, "Hi &lt;% tp.date.now() %> and &lt;%* tR += 'x' %> and &lt;%+ tp.file.title %>");
});

test("shows remote images and embeds as links, not loads", () => {
	const out = neutralizeInviteText("![](https://example.com/pixel.png)\n![logo][ref]\n![[Private note]]\n![[photo.png|200]]\n\n[ref]: https://example.com/a.png");
	assert.doesNotMatch(out, /(?<!\\)!\[/);
	assert.match(out, /^\\!\[\]\(https:\/\/example\.com\/pixel\.png\)$/m);
	assert.match(out, /^\\!\[\[Private note\]\]$/m);
});

test("breaks inline Dataview queries but not other inline code", () => {
	const out = neutralizeInviteText("Run `$= dv.current()` and `= this.file.name` and ``$=x`` but keep `npm test`");
	assert.equal(out, "Run \\`$= dv.current()` and \\`= this.file.name` and \\`\\`$=x`` but keep `npm test`");
});

test("breaks active HTML tags", () => {
	const out = neutralizeInviteText("<img src=\"https://example.com/p.gif\"> <iframe src=x></iframe> <b>bold</b>");
	assert.doesNotMatch(out, /<img|<iframe/);
	assert.match(out, /<b>bold<\/b>/);
});

test("leaves ordinary agenda text, lists and links unchanged", () => {
	const text = "Agenda\n\n- Review Q3 plan: 50% done!\n- Budget > $5,000 & <10 people\n1. [Roadmap](https://example.com/roadmap)\n> quoted line\n\nSee https://example.com/doc?a=1&b=2 or [[Project plan]].\nUse `npm test` and a == b, a = b.\nWow![ok]";
	assert.equal(neutralizeInviteText(text), text.replace("Wow![ok]", "Wow\\![ok]"));
});

test("neutralizing is stable on its own output", () => {
	const text = "```dataviewjs\nx\n```\n<%* y %>\n![](https://example.com/p.png)\n![[A]]\n`$= z`\n``$=z``\n<img src=x>";
	const once = neutralizeInviteText(text);
	assert.equal(neutralizeInviteText(once), once);
});

test("does not double-escape text the sender already escaped", () => {
	assert.equal(neutralizeInviteText("\\![x](a.png) \\`$= y`"), "\\![x](a.png) \\`$= y`");
});

test("inviteAgendaText neutralizes with clean-up on and off", () => {
	const description = "Plan\n\n<%* await tp.file.delete() %>\n```dataviewjs\ndv.view('x')\n```\n\nJoin Zoom Meeting\nhttps://example.zoom.us/j/12345678901";
	const on = inviteAgendaText(description, true);
	const off = inviteAgendaText(description, false);
	for (const out of [on, off]) {
		assert.doesNotMatch(out, /<%/);
		assert.doesNotMatch(out, /^`{3}/m);
	}
	assert.doesNotMatch(on, /zoom\.us/);
	assert.match(off, /zoom\.us/);
	assert.equal(inviteAgendaText("  \n ", false), "");
	assert.equal(inviteAgendaText(undefined), "");
});
