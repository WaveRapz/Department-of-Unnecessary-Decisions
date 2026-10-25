// Current generation models for Google & Groq
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-pro"];
const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
const OPENROUTER_MODEL = "deepseek/deepseek-chat:free";

const MAX_CHARS = 500;
const MAX_CONVERSATION_ITEMS = 6;
const TIMEOUT_MS = 5000;

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ error: "This office accepts POST applications only." }, 405, corsHeaders);
    }

    if (!env.GEMINI_API_KEY && !env.GROQ_API_KEY && !env.OPENROUTER_API_KEY) {
      return json({ error: "No AI contractor has been configured in Cloudflare secrets." }, 503, corsHeaders);
    }

    let body;
    try {
      const raw = await request.text();
      body = JSON.parse(raw);
    } catch {
      return json({ error: "The application form could not be read." }, 400, corsHeaders);
    }

    const dilemma = typeof body.dilemma === "string" ? body.dilemma.trim() : "";
    const category = typeof body.category === "string" ? body.category.slice(0, 50) : "other";
    const followupCount = Math.max(0, Math.min(2, Number(body.followupCount) || 0));

    const conversation = Array.isArray(body.conversation)
      ? body.conversation.slice(-MAX_CONVERSATION_ITEMS).map((item) => ({
          role: item?.role === "assistant" ? "assistant" : "user",
          content: String(item?.content || "").slice(0, MAX_CHARS),
        }))
      : [];

    if (!dilemma || dilemma.length > MAX_CHARS) {
      return json({ error: "Please provide a dilemma between 1 and 500 characters." }, 400, corsHeaders);
    }

    const prompt = `
You are the Department of Unnecessary Decisions (DUD), an absurdly official government office that rules on everyday dilemmas.

WRITING STYLE:
- Be genuinely funny, witty, and conversational. Roast the decision, not the person.
- Match the user's tone. Casual slang deserves a casual, clever response.
- Keep explanations to 2–4 sentences.
- Use plain English. Avoid purple prose, random jargon, fake statistics, and meaningless phrases.
- Make jokes specific to the actual dilemma.
- Use government bureaucracy sparingly: one absurd official term is usually enough.
- The official notice should add a new joke instead of repeating the explanation.
- Titles should be short, memorable, and funny.
- Do not invent details about the user's situation.
- Be decisive. Do not bury the verdict under unnecessary exposition.
- Sound like a funny friend delivering an absurdly official ruling.

Original dilemma:
${JSON.stringify(dilemma)}

Classification:
${JSON.stringify(category)}

Follow-up questions already answered:
${followupCount}

Conversation so far:
${conversation.length
  ? conversation.map((m) => `${m.role === "assistant" ? "BUREAU QUESTION" : "USER ANSWER"}: ${JSON.stringify(m.content)}`).join("\n")
  : "(No follow-up conversation yet.)"}

Return ONLY valid JSON with exactly one of these shapes:

For a follow-up:
{
  "type": "question",
  "question": "One concise follow-up question, under 300 characters."
}

For a final ruling:
{
  "type": "verdict",
  "ruling": "REQUEST DENIED",
  "stamp": "DENIED",
  "title": "A funny headline",
  "explanation": "A funny explanation.",
  "notice": "A ridiculous official notice.",
  "confidence": 87,
  "wisdom": 12
}
`;

    let generatedText = null;
    let errors = [];

    async function fetchWithTimeout(url, options = {}) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
      } catch (err) {
        clearTimeout(id);
        throw err;
      }
    }

    // -------------------------------------------------------------
    // 1. GOOGLE GEMINI (Iterates active model strings)
    // -------------------------------------------------------------
    if (env.GEMINI_API_KEY && !generatedText) {
      for (const model of GEMINI_MODELS) {
        try {
          const response = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": env.GEMINI_API_KEY,
              },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                  responseMimeType: "application/json",
                  temperature: 0.9,
                },
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              generatedText = rawText.trim();
              break; // Success! Break loop
            }
          } else {
            const errText = await response.text();
            errors.push(`Gemini (${model}) ${response.status}: ${errText.slice(0, 60)}`);
          }
        } catch (err) {
          errors.push(`Gemini (${model}) error: ${err.name === "AbortError" ? "Timed out" : err.message}`);
        }
      }
    }

    // -------------------------------------------------------------
    // 2. GROQ FALLBACK
    // -------------------------------------------------------------
    if (env.GROQ_API_KEY && !generatedText) {
      for (const model of GROQ_MODELS) {
        try {
          const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: "system", content: "You output valid JSON only." },
                { role: "user", content: prompt },
              ],
              temperature: 0.9,
              response_format: { type: "json_object" },
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const rawText = data?.choices?.[0]?.message?.content;
            if (rawText) {
              generatedText = rawText.trim();
              break; // Success! Break loop
            }
          } else {
            const errText = await response.text();
            errors.push(`Groq (${model}) ${response.status}: ${errText.slice(0, 60)}`);
          }
        } catch (err) {
          errors.push(`Groq (${model}) error: ${err.name === "AbortError" ? "Timed out" : err.message}`);
        }
      }
    }

    // -------------------------------------------------------------
    // 3. OPENROUTER FALLBACK
    // -------------------------------------------------------------
    if (env.OPENROUTER_API_KEY && !generatedText) {
      try {
        const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            "HTTP-Referer": "https://dud-ai-backend.waveraps11.workers.dev",
            "X-Title": "DUD AI Worker",
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: [
              { role: "system", content: "You output valid JSON only." },
              { role: "user", content: prompt },
            ],
            temperature: 0.9,
            response_format: { type: "json_object" },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const rawText = data?.choices?.[0]?.message?.content;
          if (rawText) generatedText = rawText.trim();
        } else {
          const errText = await response.text();
          errors.push(`OpenRouter ${response.status}: ${errText.slice(0, 60)}`);
        }
      } catch (err) {
        errors.push(`OpenRouter error: ${err.name === "AbortError" ? "Timed out" : err.message}`);
      }
    }

    // -------------------------------------------------------------
    // RESPONSE HANDLING
    // -------------------------------------------------------------
    if (!generatedText) {
      return json({ error: `All contractors failed: [${errors.join(" | ")}]` }, 502, corsHeaders);
    }

    let result;
    try {
      result = JSON.parse(generatedText);
    } catch {
      return json({ error: "Invalid JSON from AI contractor.", raw: generatedText, debug: errors }, 502, corsHeaders);
    }

    if (result.type === "question" && followupCount < 2 && typeof result.question === "string") {
      return json({ type: "question", question: result.question.trim().slice(0, 500) }, 200, corsHeaders);
    }

    const validRuling = String(result.ruling || "UNDER INVESTIGATION").slice(0, 60);

    return json(
      {
        type: "verdict",
        ruling: validRuling,
        stamp: String(result.stamp || validRuling).slice(0, 24),
        title: String(result.title || validRuling).slice(0, 120),
        explanation: String(result.explanation || "No explanation provided.").slice(0, 1800),
        notice: String(result.notice || "Decision is final.").slice(0, 500),
        confidence: clamp(result.confidence, 1, 100, 72),
        wisdom: clamp(result.wisdom, 0, 100, 13),
      },
      200,
      corsHeaders
    );
  },
};

function clamp(value, min, max, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(min, Math.min(max, Math.round(num))) : fallback;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}
