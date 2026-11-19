'use strict';
require('dotenv').config();
const {initDatabase} = require('./db');
const {startServer} = require('./server');
initDatabase();
startServer();
