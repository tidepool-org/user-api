// Loads the environment and makes it accessible,
// and also has sensible defaults

'use strict';
module.exports = (function() {
    var env = {};

    // The port for the server to listen on.
    env.port = process.env.PORT || 7053;
    env.mongoConnectionString = process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost/user';
    env.userAdminKey = process.env.ADMIN_KEY || ''; // if the admin key isn't specified, disable admin mode.
    env.logName = process.env.LOG_NAME || 'userapi';
    if (!process.env.SALT_DEPLOY) {
        throw "SALT_DEPLOY not specified."
    }
    env.saltDeploy = process.env.SALT_DEPLOY; // you MUST specify a salt -- if you don't, it could corrupt your database
    return env;
})();
