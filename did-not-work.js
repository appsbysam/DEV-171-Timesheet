/* v3.9.5 DEV — native/persistent "Did not work" dropdown option and synchronisation. */
(function () {
  const DID_NOT_WORK = "DID_NOT_WORK";
  let initialised = false;

  function addOption(select) {
    if (!select || !select.matches(".shift-row select")) return;
    if ([...select.options].some((option) => option.value === DID_NOT_WORK)) return;

    const option = document.createElement("option");
    option.value = DID_NOT_WORK;
    option.textContent = "Did not work";

    const selectOption = select.options[0];
    if (selectOption && selectOption.nextSibling) {
      select.insertBefore(option, selectOption.nextSibling);
    } else {
      select.appendChild(option);
    }
  }

  function addToAll() {
    document.querySelectorAll(".shift-row select").forEach(addOption);

    /*
      Add the option directly to the employee-row template before the main app
      clones it. This means a saved DID_NOT_WORK value already exists as a valid
      option when saved database rows are restored on startup.
    */
    const template = document.getElementById("employeeRowTemplate");
    template?.content?.querySelectorAll(".shift-row select").forEach(addOption);
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
        if (target instanceof HTMLSelectElement && target.matches(".shift-row select")) {
          addOption(target);
        }
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches?.(".shift-row select")) addOption(node);
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
      if (!(select instanceof HTMLSelectElement) || !select.matches(".shift-row select")) return;

      const row = select.closest(".shift-row");
      if (!row) return;

      const pair = getPair(select, row);
      if (!pair) return;

      const selectedDidNotWork = select.value === DID_NOT_WORK;
      const pairWasDidNotWork = pair.value === DID_NOT_WORK;

      /*
        Start-time changes cause the main app to rebuild the Finish dropdown.
        Run the pairing after that rebuild so the full normal time list remains.
      */
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

  /*
    This file is intentionally loaded from the document head. Registering this
    listener before app.js registers its startup listener lets the template gain
    DID_NOT_WORK before saved rows are rendered.
  */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, { once: true });
  } else {
    initialise();
  }
})();