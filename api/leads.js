import fs from 'fs';
import path from 'path';

const googleScriptUrlFile = path.join(process.cwd(), 'google-script-url.txt');
let googleScriptUrl = process.env.GOOGLE_SCRIPT_URL || "";

if (!googleScriptUrl && fs.existsSync(googleScriptUrlFile)) {
  try {
    googleScriptUrl = fs.readFileSync(googleScriptUrlFile, 'utf8').trim();
  } catch (e) {
    console.error("Failed to read google-script-url.txt:", e);
  }
}

function validateLead(payload) {
  const normalizedPhone = String(payload.phone || "").replace(/[^\d]/g, "");
  const errors = [];

  if (!payload.name || !String(payload.name).trim()) {
    errors.push("이름을 입력해주세요.");
  }

  if (!/^01[0-9]\d{7,8}$/.test(normalizedPhone)) {
    errors.push("연락처를 정확히 입력해주세요.");
  }

  if (!payload.type || !String(payload.type).trim()) {
    errors.push("관심 타입을 선택해주세요.");
  }

  if (!payload.consent) {
    errors.push("개인정보 수집 및 이용 동의가 필요합니다.");
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      ...payload,
      phone: normalizedPhone,
    },
  };
}

async function forwardLeadToGoogleScript(lead) {
  if (!googleScriptUrl) {
    return { forwarded: false, reason: "GOOGLE_SCRIPT_URL is not configured." };
  }

  try {
    const response = await fetch(googleScriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(lead),
    });

    const text = await response.text();
    return {
      forwarded: response.ok,
      status: response.status,
      responseText: text,
    };
  } catch (error) {
    console.error("Forwarding to Google Script failed:", error);
    return { forwarded: false, error: error.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, errors: ["Method Not Allowed"] });
  }

  try {
    const payload = req.body || {};
    const { ok, errors, normalized } = validateLead(payload);

    if (!ok) {
      return res.status(400).json({ ok: false, errors });
    }

    const lead = {
      name: String(normalized.name).trim(),
      phone: normalized.phone,
      lead_kind: String(normalized.lead_kind || "inquiry").trim(),
      type: String(normalized.type).trim(),
      time: String(normalized.time || "").trim(),
      message: String(normalized.message || "").trim(),
      utm_source: String(normalized.utm_source || "").trim(),
      utm_medium: String(normalized.utm_medium || "").trim(),
      utm_campaign: String(normalized.utm_campaign || "").trim(),
      utm_content: String(normalized.utm_content || "").trim(),
      utm_term: String(normalized.utm_term || "").trim(),
      landing_path: String(normalized.landing_path || "").trim(),
      submittedAt: new Date().toISOString(),
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
      userAgent: req.headers["user-agent"] || "",
    };

    // Attempt to write to a temp file, but ignore failure on read-only environments
    try {
      const dataDir = path.join('/tmp', 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.appendFileSync(path.join(dataDir, 'leads.ndjson'), JSON.stringify(lead) + '\n', 'utf8');
    } catch (e) {
      console.warn("Temp append failed:", e);
    }

    const forwarding = await forwardLeadToGoogleScript(lead);
    
    return res.status(200).json({
      ok: true,
      message: "상담 신청이 정상적으로 접수되었습니다.",
      forwardedToGoogleSheets: Boolean(forwarding.forwarded),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      errors: ["상담 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."],
      detail: error.message,
    });
  }
}
