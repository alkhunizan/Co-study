// Backward-compatible operator entry point. Restore is dry-run by default and
// uses the encrypted artifact validator from restore:state.
const { runCli } = require('./restore-state');

void runCli();
