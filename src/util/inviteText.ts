const MEETING_HOST = /https?:\/\/[^\s<>)]*(?:teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|tel\.meet|zoom\.us|zoomgov\.com|webex\.com)[^\s<>)]*/gi;

/** Lines that only ever appear in join text, matched against a whole trimmed line. */
const JOIN_LINES: RegExp[] = [
	/^microsoft teams (?:meeting|need help\??)$/,
	/^join (?:microsoft )?teams meeting$/,
	/^join (?:the )?meeting(?: now)?$/,
	/^click here to join (?:the )?meeting$/,
	/^join on your computer, mobile app or room device$/,
	/^join (?:with )?(?:a )?(?:google meet|zoom meeting|zoom|video conferencing device)$/,
	/^join with google meet$/,
	/^download teams(?:\s*\|.*)?$/,
	/^or call in \(audio only\)$/,
	/^\d{8,}@\S+$/,
	/^system reference$/,
	/^for organizers:.*$/,
	/^(?:meeting options|reset dial-in pin|learn more)(?:\s*\|\s*(?:meeting options|reset dial-in pin|learn more))*$/,
	/^learn more about meet at\s*:?.*$/,
	/^please do not edit this section\.?$/,
];

/** Lines that could be real agenda text on their own, such as a password or a phone number. They are
 * removed only when the description also holds join text, so a plain agenda is never touched. */
const DETAIL_LINES: RegExp[] = [
	/^(?:meeting|video) link:?$/,
	/^need help\?$/,
	/^(?:meeting id|video conference id|phone conference id|conference id|access code|passcode|password|pin)\s*:.*$/,
	/^(?:dial[- ]in(?: by phone)?|join by phone|dial by your location|one tap mobile|find a local number|find your local number|more phone numbers|alternate vtc dialing instructions|join by sip|join by h\.323)\s*:?.*$/,
	/^(?:[\w ]{2,24}:\s*)?(?:\([A-Za-z]{2,3}\)\s*)?\+\d[\d\s().,#*-]{6,}[A-Za-z ,()]{0,40}(?:\s*pin:.*)?$/,
];

const SEPARATOR = /^[\s_=*~#.\u2500\u2501-]{3,}$/;
const LABEL = /^(?:join|meeting link|link|video call link|click here to join(?: the meeting)?|join (?:the )?meeting(?: now)?|join (?:with )?(?:zoom|google meet|teams|microsoft teams)(?: meeting)?)$/i;

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'" };

function stripHtml(text: string): string {
	if (!/<\/?[a-z][^>]*>/i.test(text)) return text;
	return text
		.replace(/<br\s*\/?>|<\/(?:p|div|li|tr|h[1-6])>/gi, "\n")
		.replace(/<\/?[a-z][^>]*>/gi, "")
		.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m);
}

function plainLine(line: string): string {
	return line.replace(MEETING_HOST, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isJoinLine(line: string): boolean {
	return hasHost(line) || JOIN_LINES.some((re) => re.test(plainLine(line)));
}

function isBoilerplate(line: string, joinText: boolean): boolean {
	if (hasHost(line)) {
		const bare = line.replace(MEETING_HOST, "").replace(/[<>()[\]|]/g, "").replace(/[\s:-]+$/, "").trim();
		if (bare === "" || LABEL.test(bare)) return true;
	}
	const plain = plainLine(line);
	return JOIN_LINES.some((re) => re.test(plain)) || (joinText && DETAIL_LINES.some((re) => re.test(plain)));
}

function hasHost(line: string): boolean {
	MEETING_HOST.lastIndex = 0;
	const found = MEETING_HOST.test(line);
	MEETING_HOST.lastIndex = 0;
	return found;
}

/**
 * Removes join links, dial-in numbers and meeting IDs, HTML leftovers and stray
 * separator lines from an invite description. Returns an empty string when
 * nothing real is left. Real agenda text is never reworded.
 */
export function cleanInviteText(raw: string | undefined): string {
	if (!raw) return "";
	const original = stripHtml(raw.replace(/\r\n?/g, "\n"))
		.split("\n")
		.map((l) => l.replace(/\u00a0/g, " ").trimEnd());
	const joinText = original.some((l) => isJoinLine(l.trim()));
	const lines = original.map((l) => (isBoilerplate(l.trim(), joinText) ? "\0" : l));

	// A separator only frames content, so drop it at the edges, next to removed
	// join text, or next to another separator.
	const kind = (l: string | undefined) => (l === undefined || l === "\0" ? "edge" : SEPARATOR.test(l) ? "sep" : "text");
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === "\0") { out.push(line); continue; }
		if (SEPARATOR.test(line)) {
			let before: string | undefined;
			for (let j = out.length - 1; j >= 0; j--) if (out[j].trim()) { before = out[j]; break; }
			let after: string | undefined;
			for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) { after = lines[j]; break; }
			if (kind(before) !== "text" || kind(after) !== "text") continue;
		}
		out.push(line);
	}

	return out.filter((l) => l !== "\0").join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
