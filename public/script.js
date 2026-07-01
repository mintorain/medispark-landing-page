const leadForm = document.querySelector(".lead-form");
const feedback = document.querySelector(".form-feedback");
const callForm = document.querySelector(".call-form");
const callFeedback = document.querySelector(".call-feedback");
const callModal = document.querySelector(".modal");
const callTriggers = document.querySelectorAll(".js-call-trigger");
const modalClosers = document.querySelectorAll(".js-modal-close");
const trackingKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const callNumber = "01066892348";

function normalizePhone(raw) {
  return raw.replace(/[^\d]/g, "");
}

function isValidPhone(phone) {
  return /^01[0-9]\d{7,8}$/.test(phone);
}

function buildLeadPayload(formData) {
  const payload = {};
  for (const [key, value] of formData.entries()) {
    payload[key] = typeof value === "string" ? value.trim() : value;
  }
  payload.phone = normalizePhone(payload.phone || "");
  payload.submittedAt = new Date().toISOString();
  payload.lead_kind = payload.lead_kind || "inquiry";
  return payload;
}

function storeLead(payload) {
  const storageKey = "medispark-leads";
  const leads = JSON.parse(localStorage.getItem(storageKey) || "[]");
  leads.push(payload);
  localStorage.setItem(storageKey, JSON.stringify(leads));
}

function captureTrackingParams() {
  const url = new URL(window.location.href);
  trackingKeys.forEach((key) => {
    const value = url.searchParams.get(key);
    if (value) {
      localStorage.setItem(`tracking:${key}`, value);
    }
  });
}

function hydrateTrackingFields(form) {
  trackingKeys.forEach((key) => {
    const input = form.querySelector(`[name="${key}"]`);
    if (input) {
      input.value = localStorage.getItem(`tracking:${key}`) || "";
    }
  });

  const pathInput = form.querySelector('[name="landing_path"]');
  if (pathInput) {
    pathInput.value = window.location.pathname + window.location.search;
  }
}

async function submitLead(payload) {
  const response = await fetch("/api/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.errors?.[0] || "상담 접수에 실패했습니다.");
  }

  return result;
}

function openCallModal(type = "phone_consultation") {
  if (!callModal || !callForm) {
    return;
  }

  callModal.setAttribute("aria-hidden", "false");
  callModal.classList.add("is-open");
  document.body.classList.add("modal-open");
  callFeedback.textContent = "";
  const leadKindInput = callForm.querySelector('[name="lead_kind"]');
  if (leadKindInput) {
    leadKindInput.value = type;
  }
  hydrateTrackingFields(callForm);
}

function closeCallModal() {
  if (!callModal) {
    return;
  }

  callModal.setAttribute("aria-hidden", "true");
  callModal.classList.remove("is-open");
  document.body.classList.remove("modal-open");
}

function validateLeadPayload(payload, form, statusNode) {
  const nameInput = form.querySelector('[name="name"]');
  const phoneInput = form.querySelector('[name="phone"]');
  const typeInput = form.querySelector('[name="type"]');
  const consentInput = form.querySelector('[name="consent"]');

  if (!payload.name) {
    statusNode.textContent = "이름을 입력해주세요.";
    nameInput?.focus();
    return false;
  }

  if (!isValidPhone(payload.phone)) {
    statusNode.textContent = "연락처를 정확히 입력해주세요. 예: 01012345678";
    phoneInput?.focus();
    return false;
  }

  if (!payload.type) {
    statusNode.textContent = "관심 타입을 선택해주세요.";
    typeInput?.focus();
    return false;
  }

  if (!consentInput?.checked) {
    statusNode.textContent = "개인정보 수집 및 이용 동의가 필요합니다.";
    consentInput?.focus();
    return false;
  }

  return true;
}

captureTrackingParams();

if (leadForm && feedback) {
  hydrateTrackingFields(leadForm);

  leadForm.addEventListener("submit", (event) => {
    event.preventDefault();
    feedback.textContent = "";

    const formData = new FormData(leadForm);
    const payload = buildLeadPayload(formData);
    if (!validateLeadPayload(payload, leadForm, feedback)) {
      return;
    }

    submitLead(payload)
      .then(() => {
        storeLead(payload);
        feedback.textContent =
          "상담 신청이 정상 접수되었습니다. 빠른 확인이 필요하시면 010-6689-2348로 바로 연락해주세요.";
        leadForm.reset();
        hydrateTrackingFields(leadForm);
      })
      .catch((error) => {
        feedback.textContent =
          error.message || "상담 접수 중 오류가 발생했습니다. 010-6689-2348로 문의해주세요.";
      });
  });
}

if (callForm && callFeedback) {
  hydrateTrackingFields(callForm);

  callForm.addEventListener("submit", (event) => {
    event.preventDefault();
    callFeedback.textContent = "";

    const formData = new FormData(callForm);
    const payload = buildLeadPayload(formData);

    if (!validateLeadPayload(payload, callForm, callFeedback)) {
      return;
    }

    submitLead(payload)
      .then(() => {
        storeLead(payload);
        callFeedback.textContent = "상담 정보가 저장되었습니다. 잠시 후 전화 연결을 진행합니다.";
        setTimeout(() => {
          window.location.href = `tel:${callNumber}`;
          callForm.reset();
          hydrateTrackingFields(callForm);
          closeCallModal();
        }, 500);
      })
      .catch((error) => {
        callFeedback.textContent =
          error.message || "전화상담 접수 중 오류가 발생했습니다. 010-6689-2348로 문의해주세요.";
      });
  });
}

callTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openCallModal(trigger.dataset.callType || "phone_consultation");
  });
});

modalClosers.forEach((closer) => {
  closer.addEventListener("click", () => {
    closeCallModal();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCallModal();
  }
});
