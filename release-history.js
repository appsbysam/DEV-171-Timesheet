window.RELEASE_HISTORY = [
  {
    version: "2.4.2-dev",
    date: "3 August 2026",
    changes: [
      "Removed the Current Week badge while viewing the current week.",
      "Added a Go to Current Week button that appears only when another week is selected.",
      "The new button returns directly to the current week and reloads its data."
    ]
  },
  {
    version: "2.4.1-dev",
    date: "3 August 2026",
    changes: [
      "Moved the DEV BUILD badge beside the ONLINE MODE badge.",
      "Added a green highlight and Current Week badge for the active current week.",
      "Made Finish dropdowns automatically begin 30 minutes after the selected Start time.",
      "Applied the same dynamic time filtering to split shifts.",
      "Prevented shifts shorter than 30 minutes."
    ]
  },
  {
    version: "2.4.0-dev",
    date: "3 August 2026",
    changes: [
      "Added a clickable version number.",
      "Added an in-app What’s New and version-history window.",
      "Added a scrollable release history designed for mobile screens."
    ]
  },
  {
    version: "2.3.1-dev",
    date: "3 August 2026",
    changes: [
      "Added automatic DEV and production environment detection.",
      "Separated Supabase and app identity settings into config.js.",
      "Added safe one-command environment switching."
    ]
  },
  {
    version: "2.3.0-dev",
    date: "3 August 2026",
    changes: [
      "Added prominent DEV BUILD identification.",
      "Added separate development app naming and labels."
    ]
  },
  {
    version: "2.2.4",
    date: "2 August 2026",
    changes: [
      "Hidden the combined Total row unless a split shift is active."
    ]
  },
  {
    version: "2.2.2",
    date: "2 August 2026",
    changes: [
      "Introduced the compact split-shift layout.",
      "Aligned Start, Finish and Total fields beneath their headings.",
      "Restored completed-row green highlighting."
    ]
  },
  {
    version: "2.2.0",
    date: "2 August 2026",
    changes: [
      "Added support for one optional split shift per employee per day.",
      "Added automatic split-shift calculations, saving, loading and printing."
    ]
  },
  {
    version: "2.1.2",
    date: "2 August 2026",
    changes: [
      "Corrected the Sunday-to-Saturday week-start behaviour."
    ]
  },
  {
    version: "2.1.0",
    date: "2 August 2026",
    changes: [
      "Added Manager Mode.",
      "Restricted staff management, clear-week controls and manager notes to managers."
    ]
  }
];
