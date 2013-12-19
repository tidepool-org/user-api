// Loads the environment and makes it accessible,
// and also has sensible defaults

'use strict';
module.exports = (function() {
    var env = {};

    // The port for the server to listen on.
    env.port = process.env.PORT || 7053;

    return env;
})();
