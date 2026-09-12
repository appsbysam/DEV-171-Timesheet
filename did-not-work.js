/* v3.9.7 DEV — make "Did not work" survive the app's native dropdown rebuilds. */
(function () {
  const DID_NOT_WORK = "DID_NOT_WORK";
  let hooksInstalled = false;

  function isTimesheetSelect(select) {
    return select instanceof HTMLSelectElement &&
      (select.classList.contains("start") ||
       select.classList.contains("finish") ||
       select.classList.contains("split-start") ||
       select.classList.contains("split-finish"));
  }

  function addOption(select) {
    if (!isTimesheetSelect(select)) return;
    if ([...select.options].some((option) => option.value === DID_NOT_WORK)) return;

    const option = document.createElement("option");
    option.value = DID_NOT_WORK;
    option.textContent = "Did not work";

    const first = select.options[0];
    if (first && first.nextSibling) {
      select.insertBefore(option, first.nextSibling);
    } else {
      select.appendChild(option);
    }
  }

  function installCoreHooks() {
    if (hooksInstalled) return true;

    if (
      typeof window.populateSelect !== "function" ||
      typeof window.updateFinishOptions !== "function" ||
      typeof window.calculateShiftMinutes !== "function"
    ) {
      return false;
    }

    hooksInstalled = true;

    const originalPopulateSelect = window.populateSelect;
    window.populateSelect = function (select, options) {
      originalPopulateSelect(select, options);
      addOption(select);
    };

    const originalUpdateFinishOptions = window.updateFinishOptions;
    window.updateFinishOptions = function (
      startSelect,
      finishSelect,
      day,
      preferredValue = finishSelect.value
    ) {
      /*
        The normal app rebuilds the Finish dropdown every time Start changes.
        Let it do that, then restore the permanent Did not work option and the
        saved DID_NOT_WORK value if that was the value loaded from Supabase.
      */
      originalUpdateFinishOptions(
        startSelect,
        finishSelect,
        day,
        preferredValue
      );

      addOption(finishSelect);

      if (preferredValue === DID_NOT_WORK) {
        finishSelect.value = DID_NOT_WORK;
      }
    };

    const originalCalculateShiftMinutes = window.calculateShiftMinutes;
    window.calculateShiftMinutes = function (startSelect, finishSelect) {
      const startDidNotWork = startSelect.value === DID_NOT_WORK;
      const finishDidNotWork = finishSelect.value === DID_NOT_WORK;

      if (startDidNotWork && finishDidNotWork) {
        startSelect.classList.remove("invalid");
        finishSelect.classList.remove("invalid");
        return { minutes: 0, complete: true, valid: true };
      }

      if (startDidNotWork || finishDidNotWork) {
        return { minutes: 0, complete: false, valid: true };
      }

      return originalCalculateShiftMinutes(startSelect, finishSelect);
    };

    document.querySelectorAll(".shift-row select").forEach(addOption);
    return true;
  }

  /*
    This file loads before app.js. app.js defines its dropdown functions later
    and immediately starts an async initialisation. Poll briefly so the hooks are
    installed as soon as those functions exist, before the database rows are
    normally rendered.
  */
  if (!installCoreHooks()) {
    const hookTimer = window.setInterval(() => {
      if (installCoreHooks()) {
        window.clearInterval(hookTimer);
      }
    }, 5);

    window.setTimeout(() => {
      window.clearInterval(hookTimer);
      installCoreHooks();
    }, 5000);
  }

  function getPair(select, row) {
    if (select.classList.contains("start")) return row.querySelector(".finish");
    if (select.classList.contains("finish")) return row.querySelector(".start");
    if (select.classList.contains("split-start")) return row.querySelector(".split-finish");
    if (select.classList.contains("split-finish")) return row.querySelector(".split-start");
    return null;
  }

  document.addEventListener("change", (event) => {
    const select = event.target;
    if (!isTimesheetSelect(select)) return;

    const row = select.closest(".shift-row");
    if (!row) return;

    const pair = getPair(select, row);
    if (!pair) return;

    const selectedDidNotWork = select.value === DID_NOT_WORK;
    const pairWasDidNotWork = pair.value === DID_NOT_WORK;

    /* Run after app.js has finished any native Start/Finish dropdown rebuild. */
    window.setTimeout(() => {
      addOption(select);
      addOption(pair);

      if (selectedDidNotWork) {
        pair.value = DID_NOT_WORK;
        return;
      }

      if (pairWasDidNotWork) {
        pair.value = "";
      }
    }, 0);
  }, true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (isTimesheetSelect(node)) addOption(node);
        node.querySelectorAll?.(".shift-row select").forEach(addOption);
      });
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
      document.querySelectorAll(".shift-row select").forEach(addOption);
    }, { once: true });
  }
})();