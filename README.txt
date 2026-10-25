# Department of Unnecessary Decisions

This version preserves the existing DUD look and case archive, changes the dilemma limit to 500 characters, removes the three sliders, and adds an AI-powered investigation flow. The AI can either issue a ruling immediately or ask a follow-up question. The browser stores only the final case history; the API key belongs on the server.

## Files

- `index.html` — updated form, follow-up panel, and verdict notice
- `style.css` — original styling plus follow-up/loading/error styles
- `script.js` — front-end flow and local case history
- `worker.js` — Cloudflare Worker backend that calls the Gemini API


The Worker responds to browser preflight requests and accepts JSON POST requests. It validates the dilemma length on the server and does not return the provider's raw error response.

## Test

- Submit a simple dilemma: it should get a ruling without a follow-up.
- Submit an ambiguous dilemma: it may ask a follow-up question.
- Answer the question: the answer should be included in the next AI request.
- Check the ruling, official notice, loading state, error messages, and local case archive.

## Notes

- The category remains as optional context for the AI; the sliders and their scoring algorithm are removed.
- Dilemma and answer text are limited to 500 characters in the browser and validated by the Worker.
- Case history is stored in local browser storage and is not synced between devices.
- The free tier and its quotas/data-handling terms can change. Check the provider's current terms before using it. Avoid entering sensitive personal information.
- This is a starter implementation