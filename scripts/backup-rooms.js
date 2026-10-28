// Backward-compatible operator entry point. The implementation now creates the
// authenticated, encrypted multi-source artifact used by backup:state.
const { runCli } = require('./backup-state');

void runCli();
