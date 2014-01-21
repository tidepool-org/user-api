// Loads the environment and makes it accessible,
// and also has sensible defaults

// == BSD2 LICENSE ==
// Copyright (c) 2014, Tidepool Project
// 
// This program is free software; you can redistribute it and/or modify it under
// the terms of the associated License, which is identical to the BSD 2-Clause
// License as published by the Open Source Initiative at opensource.org.
// 
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
// FOR A PARTICULAR PURPOSE. See the License for more details.
// 
// You should have received a copy of the License along with this program; if
// not, you can obtain one from Tidepool Project at tidepool.org.
// == BSD2 LICENSE ==

'use strict';
module.exports = (function() {
    var env = {};

    // The port for the server to listen on.
    env.port = process.env.PORT || 7053;
    env.mongoConnectionString = process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost/user';
    env.userAdminKey = process.env.ADMIN_KEY || ''; // if the admin key isn't specified, disable admin mode.
    env.serverSecret = process.env.SHARED_SERVER_SECRET || ''; // shared secret so machines can log in
    env.logName = process.env.LOG_NAME || 'userapi';
    env.saltDeploy = process.env.SALT_DEPLOY; // you MUST specify a salt -- if you don't, it could corrupt your database
    return env;
})();
