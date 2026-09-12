/* v3.9.6 DEV — persistent "Did not work" dropdown option and synchronisation. */
(function () {
  const DID_NOT_WORK = "DID_NOT_WORK";
  let initialised = false;

  function isTimesheetSelect(select) {
    return select instanceof HTMLSelectElement &&
      (select.classList.contains("start") ||
       select.classList.contains("finish") ||
       select.classList.contains("split-start") ||
       select.classList.contains("split-finish"));
  }

  function makeDidNotWorkOption() {
    const option = document.createElement("option");
    option.value = DID_NOT_WORK;
    option.textContent = "Did not work";
    return option;
  }

  function addOption(select) {
    if (!isTimesheetSelect(select)) return;
    if ([...select.options].some((option) => option.value === DID_NOT_WORK)) return;

    const option = makeDidNotWorkOption();
    const firstOption = select.options[0];
    if (firstOption && firstOption.nextSibling) {
      select.insertBefore(option, firstOption.nextSibling);
    } else {
      select.appendChild(option);
    }
  }

  /*
    app.js builds and rebuilds the time dropdowns before restoring saved values.
    Hook appendChild immediately (this file loads in the document head) so
    DID_NOT_WORK is inserted as soon as the first normal dropdown option is
    created. That makes DID_NOT_WORK a valid value before app.js attempts to
    restore a saved database row.
  */
  const nativeSelectAppendChild = HTMLSelectElement.prototype.appendChild;
  HTMLSelectElement.prototype.appendChild = function (node) {
    const result = nativeSelectAppendChild.call(this, node);

    if (
      isTimesheetSelect(this) &&
      this.options.length === 1 &&
      ![...this.options].some((option) => option.value === DID_NOT_WORK)
    ) {
      nativeSelectAppendChild.call(this, makeDidNotWorkOption());
    }

    return result;
  };

  function addToAll() {
    document.querySelectorAll(".shift-row select").forEach(addOption);
    const template = document.getElementById("employeeRowTemplate");
    template?.content?.querySelectorAll("select").forEach(addOption);
  }

  function getPair(select, row) {
    if (select.classList.contains("start")) return row.querySelector(".finish");
    if (select.classList.contains("finish")) return row.querySelector(".start");
    if (select.classList.contains("split-start")) return row.querySelector(".split-finish");
    if (select.classList.contains("split-finish")) return row.querySelector(".split-start");
    return null;
  }

  function initialise() {
    if (initialised) return;
    initialised = true;
    addToAll();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue;
        const target = mutation.target;
        if (isTimesheetSelect(target)) addOption(target);
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (isTimesheetSelect(node)) addOption(node);
          node.querySelectorAll?.(".shift-row select").forEach(addOption);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    if (typeof window.calculateShiftMinutes === "function") {
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

      setTimeout(() => {
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, { once: true });
  } else {
    initialise();
  }
})();