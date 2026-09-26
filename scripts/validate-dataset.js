"use strict";
// Same full validator and reviewed baseline used by CI.
import("./validate-data.mjs").then(({ validateData }) => validateData({ useBaseline: true }))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
