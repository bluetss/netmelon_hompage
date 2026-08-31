(() => {
  const toggles = Array.from(document.querySelectorAll("[data-problem-application-toggle]"));
  const forms = Array.from(document.querySelectorAll(".problem-application-form"));
  if (!forms.length) return;

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
      window.__NPQ_COMPANY_API_BASE__
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
      event.target?.closest?.("label")?.classList.remove("invalid");
      if (status.classList.contains("error")) setStatus("");
    });

    form.addEventListener("change", (event) => {
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
        const response = await fetch(apiBase + "/web-cms/public/company-open-problem-proposals", {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            problemId: String(data.get("problemId") || "").trim(),
            name: String(data.get("name") || "").trim(),
            email: String(data.get("email") || "").trim(),
            experience: String(data.get("solutionProposal") || "").trim(),
            referenceUrl: String(data.get("resourceUrl") || "").trim() || null,
            consent: Boolean(data.get("consent")),
            locale: "ko",
            sourcePage: window.location.pathname,
          }),
        });
        if (!response.ok) throw new Error("SUBMIT_FAILED");
        form.reset();
        clearInvalid();
        setStatus("제안을 보냈습니다.", "success");
      } catch {
        setStatus("제안을 보내지 못했습니다. 다시 시도해 주세요.", "error");
      } finally {
        setSubmitting(false);
      }
    });
  });
})();
