(() => {
  const isStagingPreview = window.location.hostname === "npq-company-dev.web.app";
  document.querySelectorAll('[data-career-status="closed"]').forEach((link) => {
    link.hidden = !isStagingPreview;
  });
  const toggles = Array.from(document.querySelectorAll("[data-problem-application-toggle]"));
  const forms = Array.from(document.querySelectorAll(".problem-application-form"));
  if (!forms.length) return;
  const createRequestKey = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };


  const setToggleLabel = (toggle, expanded) => {
    const label = toggle.querySelector("[data-problem-application-label]");
    if (label) label.textContent = expanded ? "해결 방안 닫기" : "해결 방안 보내기";
  };

  const getPanel = (toggle) => {
    const panelId = toggle.getAttribute("aria-controls");
    return panelId ? document.getElementById(panelId) : null;
  };

  const closeApplication = (toggle) => {
    const panel = getPanel(toggle);
    if (panel) panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    setToggleLabel(toggle, false);
  };

  const openApplication = (toggle) => {
    toggles.forEach((item) => {
      if (item !== toggle) closeApplication(item);
    });
    const panel = getPanel(toggle);
    if (!panel) return;
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    setToggleLabel(toggle, true);
    window.requestAnimationFrame(() => {
      panel.querySelector("input[name='name']")?.focus({ preventScroll: true });
    });
  };

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      if (toggle.getAttribute("aria-expanded") === "true") {
        closeApplication(toggle);
      } else {
        openApplication(toggle);
      }
    });

    const card = toggle.closest("details");
    card?.addEventListener("toggle", () => {
      if (!card.open) closeApplication(toggle);
    });
  });

  forms.forEach((form) => {
    if (!(form instanceof HTMLFormElement)) return;

    const status = form.querySelector(".problem-intake-status");
    const submitButton = form.querySelector("button[type='submit']");
    const solutionProposal = form.elements.namedItem("solutionProposal");
    const apiBase = String(
      window.__NPQ_PUBLIC_INTAKE_API_BASE__
      || window.__NPQ_COMPANY_API_BASE__
      || form.dataset.apiBase
      || ""
    ).trim().replace(/\/+$/, "");
    if (!status) return;

    const setStatus = (message, tone = "") => {
      status.textContent = message;
      status.classList.remove("success", "error");
      if (tone) status.classList.add(tone);
    };

    const setSubmitting = (submitting) => {
      if (!(submitButton instanceof HTMLButtonElement)) return;
      submitButton.disabled = submitting;
      submitButton.classList.toggle("is-loading", submitting);
    };

    const clearInvalid = () => {
      form.querySelectorAll(".invalid").forEach((field) => field.classList.remove("invalid"));
    };

    const markInvalid = () => {
      clearInvalid();
      const controls = Array.from(form.querySelectorAll("input[required], textarea[required]"));
      const invalid = controls.filter((control) => {
        if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return false;
        if (control instanceof HTMLInputElement && control.type === "checkbox") return !control.checked;
        if (control === solutionProposal && String(control.value || "").replace(/\s+/g, "").length < 10) return true;
        return !control.checkValidity() || !String(control.value || "").trim();
      });
      invalid.forEach((control) => control.closest("label")?.classList.add("invalid"));
      return invalid;
    };

    form.addEventListener("input", (event) => {
      delete form.dataset.requestKey;
      event.target?.closest?.("label")?.classList.remove("invalid");
      if (status.classList.contains("error")) setStatus("");
    });

    form.addEventListener("change", (event) => {
      delete form.dataset.requestKey;
      event.target?.closest?.("label")?.classList.remove("invalid");
      if (status.classList.contains("error")) setStatus("");
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const invalid = markInvalid();
      if (invalid.length) {
        setStatus("입력 내용을 확인해 주세요.", "error");
        invalid[0].focus();
        return;
      }

      const data = new FormData(form);
      if (String(data.get("website") || "").trim()) {
        form.reset();
        setStatus("제안을 보냈습니다.", "success");
        return;
      }
      if (!apiBase) {
        setStatus("제안을 보내지 못했습니다. 다시 시도해 주세요.", "error");
        return;
      }

      setSubmitting(true);
      setStatus("");
      try {
        const requestKey = form.dataset.requestKey || createRequestKey();
        form.dataset.requestKey = requestKey;
        const response = await fetch(apiBase + "/web-cms/public/company-open-problem-proposals", {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
          body: JSON.stringify({
            problemId: String(data.get("problemId") || "").trim(),
            name: String(data.get("name") || "").trim(),
            email: String(data.get("email") || "").trim(),
            experience: String(data.get("solutionProposal") || "").trim(),
            referenceUrl: String(data.get("resourceUrl") || "").trim() || null,
            consent: Boolean(data.get("consent")),
            locale: "ko",
            sourcePage: window.location.pathname,
            website: String(data.get("website") || "").trim(),
          }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          const retrySeconds = Number(detail.retryAfterSeconds || response.headers.get("Retry-After") || 0);
          if (response.status === 429) {
            const minutes = Math.max(1, Math.ceil(retrySeconds / 60));
            setStatus(`요청이 몰려 접수를 잠시 쉬고 있습니다. ${minutes}분 뒤 다시 시도해 주세요.`, "error");
            return;
          }
          if (response.status === 503) {
            const pauseMessage = String(detail.error || "").trim();
            setStatus(pauseMessage || "안전한 운영을 위해 접수를 잠시 중단했습니다. 잠시 후 다시 확인해 주세요.", "error");
            return;
          }
          if (response.status === 403) {
            setStatus("현재 접수를 잠시 쉬고 있습니다. 잠시 후 다시 확인해 주세요.", "error");
            return;
          }
          if (response.status === 413) {
            setStatus("입력 내용이 너무 깁니다. 내용을 줄여 주세요.", "error");
            return;
          }
          throw new Error("SUBMIT_FAILED");
        }
        form.reset();
        delete form.dataset.requestKey;
        clearInvalid();
        setStatus("제안을 보냈습니다.", "success");
      } catch (error) {
        const offline = !window.navigator.onLine;
        setStatus(offline ? "인터넷 연결을 확인해 주세요." : "현재 접수 서버에 연결할 수 없습니다. 잠시 후 다시 확인해 주세요.", "error");
      } finally {
        setSubmitting(false);
      }
    });
  });
})();
