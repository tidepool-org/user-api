// Loads the environment and makes it accessible,
// and also has sensible defaults

'use strict';
module.exports = (function() {
    var env = {};

    // The port for the server to listen on.
    env.port = process.env.PORT || 7053;
    env.mongo_connection_string = process.env.MONGO_CONNECTION_STRING || "mongodb://localhost/user";
    env.adminkey = process.env.ADMINKEY || ""; // if the admin key isn't specified, disable admin mode.

    return env;
})();
