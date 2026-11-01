(() => {
  const form = document.getElementById("ir-request-form");
  const status = document.getElementById("ir-request-status");
  if (!form || !status) return;

  const isEnglish = document.documentElement.lang.toLowerCase().startsWith("en");
  const messages = isEnglish ? {
    submit: "Submit request", submitting: "Submitting...", required: "Please check the required fields.",
    unavailable: "IR request intake is being prepared. Please contact us by email.",
    busy: (minutes) => `Request intake is busy. Please try again in ${minutes} minute(s).`,
    paused: "IR request intake is temporarily paused. Please contact us by email.",
    tooLarge: "The submitted content is too long.", success: "Your request has been submitted.",
    offline: "Please check your internet connection.", failed: "The IR request service is currently unavailable. Please contact us by email.",
  } : {
    submit: "요청하기", submitting: "처리중...", required: "필수 항목을 확인해주세요.",
    unavailable: "현재 IR 요청 접수 설정을 준비 중입니다. 이메일로 문의해주세요.",
    busy: (minutes) => `요청이 몰려 접수를 잠시 쉬고 있습니다. ${minutes}분 뒤 다시 시도해주세요.`,
    paused: "안전한 운영을 위해 IR 요청 접수를 잠시 중단했습니다. 이메일로 문의해주세요.",
    tooLarge: "입력 내용이 너무 깁니다. 내용을 줄여주세요.", success: "요청성공!",
    offline: "인터넷 연결을 확인해주세요.", failed: "현재 IR 접수 서버에 연결할 수 없습니다. 이메일로 문의해주세요.",
  };
  const submitButton = form.querySelector("button[type='submit']");
  const submitLabel = submitButton?.querySelector(".ir-submit-label");
  const apiBase = String(window.__NPQ_PUBLIC_INTAKE_API_BASE__ || window.__NPQ_IR_API_BASE__ || "").trim().replace(/\/+$/, "");
  let requestKey = "";
  const setStatus = (message, type = "") => {
    status.textContent = message;
    status.classList.remove("success", "error");
    if (type) status.classList.add(type);
  };
  const setSubmitting = (active) => {
    if (!submitButton) return;
    submitButton.disabled = active;
    submitButton.classList.toggle("is-loading", active);
    if (submitLabel) submitLabel.textContent = active ? messages.submitting : messages.submit;
  };
  const invalidControls = () => Array.from(form.querySelectorAll("input[required], select[required], textarea[required]")).filter((control) => {
    const invalid = control.type === "checkbox" ? !control.checked : !String(control.value || "").trim() || !control.checkValidity();
    control.closest(".ir-field")?.classList.toggle("invalid", invalid);
    return invalid;
  });
  form.addEventListener("input", (event) => {
    requestKey = "";
    event.target?.closest?.(".ir-field")?.classList.remove("invalid");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (invalidControls().length) return setStatus(messages.required, "error");
    if (!apiBase) return setStatus(messages.unavailable, "error");
    const data = new FormData(form);
    if (String(data.get("website") || "").trim()) return;
    setSubmitting(true);
    setStatus("");
    try {
      requestKey ||= window.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await fetch(`${apiBase}/ir/requests`, {
        method: "POST", mode: "cors", credentials: "omit",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
        body: JSON.stringify({
          name: String(data.get("name") || "").trim(), email: String(data.get("email") || "").trim(),
          organization: String(data.get("organization") || "").trim(), title: String(data.get("title") || "").trim(),
          phone: String(data.get("phone") || "").trim(), investorType: String(data.get("investor_type") || "").trim(),
          requestedMaterial: String(data.get("requested_material") || "").trim(), ndaPreference: String(data.get("nda_preference") || "").trim(),
          requestNote: String(data.get("request_note") || "").trim(), consent: Boolean(data.get("consent")),
          locale: isEnglish ? "en" : "ko", sourcePage: window.location.pathname, landingPath: `${window.location.pathname}${window.location.search}`,
          website: String(data.get("website") || "").trim(),
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        if (response.status === 429) throw new Error(`BUSY:${Math.max(1, Math.ceil(Number(detail.retryAfterSeconds || response.headers.get("Retry-After") || 0) / 60))}`);
        if (response.status === 403 || response.status === 503) throw new Error("PAUSED");
        if (response.status === 413) throw new Error("TOO_LARGE");
        throw new Error("FAILED");
      }
      form.reset(); requestKey = ""; setStatus(messages.success, "success");
    } catch (error) {
      const code = String(error?.message || "");
      if (code.startsWith("BUSY:")) setStatus(messages.busy(code.split(":")[1]), "error");
      else if (code === "PAUSED") setStatus(messages.paused, "error");
      else if (code === "TOO_LARGE") setStatus(messages.tooLarge, "error");
      else setStatus(window.navigator.onLine ? messages.failed : messages.offline, "error");
    } finally { setSubmitting(false); }
  });
})();
