// CJS-compatible mock for uuid (ESM-only in v13+)
let counter = 0
const v4 = () => `test-uuid-${++counter}`
module.exports = { v4 }
