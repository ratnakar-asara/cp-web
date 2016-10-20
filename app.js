"use strict";
/* global process */
/* global __dirname */
/*******************************************************************************
 * Copyright (c) 2015 IBM Corp.
 *
 * All rights reserved.
 *
 * Contributors:
 *   David Huffman - Initial implementation
 *   Dale Avery
 *   Ratnakar
 *******************************************************************************/
/////////////////////////////////////////
///////////// Setup Node.js /////////////
/////////////////////////////////////////

process.env.GOPATH = __dirname;   //set the gopath to current dir and place chaincode inside src folder

var express = require('express');
var session = require('express-session');
var compression = require('compression');
var serve_static = require('serve-static');
var path = require('path');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var http = require('http');
var app = express();
var setup = require('./setup');
var cors = require("cors");
var fs = require("fs");

//// Set Server Parameters ////
var host = setup.SERVER.HOST;
var port = setup.SERVER.PORT;

////////  Pathing and Module Setup  ////////
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.engine('.html', require('jade').__express);
app.use(compression());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use('/cc/summary', serve_static(path.join(__dirname, 'cc_summaries')));												//for chaincode investigator
app.use(serve_static(path.join(__dirname, 'public'), { maxAge: '1d', setHeaders: setCustomCC }));							//1 day cache
app.use(session({ secret: 'Somethignsomething1234!test', resave: true, saveUninitialized: true }));
function setCustomCC(res, path) {
    if (serve_static.mime.lookup(path) === 'image/jpeg') res.setHeader('Cache-Control', 'public, max-age=2592000');		//30 days cache
    else if (serve_static.mime.lookup(path) === 'image/png') res.setHeader('Cache-Control', 'public, max-age=2592000');
    else if (serve_static.mime.lookup(path) === 'image/x-icon') res.setHeader('Cache-Control', 'public, max-age=2592000');
}
// Enable CORS preflight across the board.
app.options('*', cors());
app.use(cors());

///////////  Configure Webserver  ///////////
app.use(function (req, res, next) {
    var keys;
    console.log('------------------------------------------ incoming request ------------------------------------------');
    req.bag = {};											//create my object for my stuff
    req.session.count = eval(req.session.count) + 1;
    req.bag.session = req.session;

    var url_parts = require('url').parse(req.url, true);
    req.parameters = url_parts.query;
    keys = Object.keys(req.parameters);
    keys = Object.keys(req.body);
    next();
});

//// Router ////
var router = require('./routes/site_router');
app.use('/', router);

////////////////////////////////////////////
////////////// Error Handling //////////////
////////////////////////////////////////////
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});
app.use(function (err, req, res, next) {		// = development error handler, print stack trace
    console.log("Error Handler -", req.url);
    var errorCode = err.status || 500;
    res.status(errorCode);
    req.bag.error = { msg: err.stack, status: errorCode };
    if (req.bag.error.status == 404) req.bag.error.msg = "Sorry, I cannot locate that file";
    res.render('template/error', { bag: req.bag });
});

// ============================================================================================================================
// 														Launch Webserver
// ============================================================================================================================
var server = http.createServer(app).listen(port, function () { });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
process.env.NODE_ENV = 'production';
server.timeout = 240000;

console.log('------------------------------------------ Server Up - ' + host + ':' + port + ' ------------------------------------------');
var part2 = require('./utils/ws_part2');
var ws = require('ws');
var wss = {};
var user_manager = require('./utils/users');
var testChaincodeID = "cp";
var hfc = require('hfc');
var chaincodeName = 'cp_chaincode'
var chain = hfc.newChain(chaincodeName);
var WebAppAdmin;

// Configure the KeyValStore which is used to store sensitive keys
// as so it is important to secure this storage.
chain.setKeyValStore(hfc.newFileKeyValStore(__dirname+'/keyValStore'));

var peerURLs = [];
var caURL = null;
var users = null;
var registrar = null; //user used to register other users and deploy chaincode
var peerHosts = [];

//hard-coded the peers and CA addresses.
//added for reading configs from config file
try {
    //var manual = JSON.parse(fs.readFileSync('mycreds.json', 'utf8'));
    var manual = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    var peers = manual.credentials.peers;
    peerHosts.push("localhost");
    for (var i in peers) {
         peerURLs.push(peers[i].api_url);
    }
    caURL = manual.credentials.ca.api_url;
    console.log('loading hardcoded peers');
    var users = null;																			//users are only found if security is on
    if (manual.credentials.users) users = manual.credentials.users;
    console.log('loading hardcoded users');
}
catch (e) {
    console.log('Error - could not find hardcoded peers/users, this is okay if running in bluemix');
}

var pwd = "";
for (var z in users) {
    if (users[z].username == "WebAppAdmin") {
        pwd = users[z].secret;
    }
}
console.log("calling network config");
configure_network();

function configure_network() {
    chain.setMemberServicesUrl(caURL);
    for (var i in peerURLs) {
        chain.addPeer(peerURLs[i]);
    }

    chain.getMember("WebAppAdmin", function (err, WebAppAdmin) {
        if (err) {
            console.log("Failed to get WebAppAdmin member " + " ---> " + err);
        } else {
            console.log("Successfully got WebAppAdmin member" + " ---> " /*+ JSON.stringify(crypto)*/);

            // Enroll the WebAppAdmin member with the certificate authority using
            // the one time password hard coded inside the membersrvc.yaml.
            WebAppAdmin.enroll(pwd, function (err, crypto) {
                if (err) {
                    console.log("Failed to enroll WebAppAdmin member " + " ---> " + err);
                    //t.end(err);
                } else {
                    console.log("Successfully enrolled WebAppAdmin member" + " ---> " /*+ JSON.stringify(crypto)*/);

                    // Confirm that the WebAppAdmin token has been created in the key value store
                    path = chain.getKeyValStore().dir + "/member." + WebAppAdmin.getName();

                    fs.exists(path, function (exists) {
                        if (exists) {
                            console.log("Successfully stored client token for" + " ---> " + WebAppAdmin.getName());
                        } else {
                            console.log("Failed to store client token for " + WebAppAdmin.getName() + " ---> " + err);
                        }
                    });
                }
                chain.setRegistrar(WebAppAdmin);
                deploy(WebAppAdmin);
            });
        }
    });
}

var gccID = {};
function deploy(WebAppAdmin) {
    var deployRequest = {
        fcn: "init",
        args: ['a', '100'],
        chaincodePath: "chain_code"
    };
    var deployTx = WebAppAdmin.deploy(deployRequest);

    deployTx.on('submitted', function (results) {
        console.log("Successfully submitted chaincode deploy transaction" + " ---> " + "function: " + deployRequest.fcn + ", args: " + deployRequest.args + " : " + results.chaincodeID);
    });

    deployTx.on('complete', function (results) {
        console.log("Successfully completed chaincode deploy transaction" + " ---> " + "function: " + deployRequest.fcn + ", args: " + deployRequest.args + " : " + results.chaincodeID);
        part2.setup(results.chaincodeID, chain, peerHosts);
        user_manager.setup(results.chaincodeID, chain, cb_deployed);
    });

    deployTx.on('error', function (err) {
        // Invoke transaction submission failed
        console.log("Failed to submit chaincode deploy transaction" + " ---> " + "function: " + deployRequest.function + ", args: " + deployRequest.arguments + " : " + err);
    });
}

// ============================================================================================================================
// 												WebSocket Communication Madness
// ============================================================================================================================
function cb_deployed(e, d) {
    if (e != null) {
        //look at tutorial_part1.md in the trouble shooting section for help
        console.log('! looks like the final configuration failed, holding off on the starting the socket\n', e);
        if (!process.error) process.error = { type: 'deploy', msg: e.details };
    }
    else {
        console.log('------------------------------------------ Websocket Up ------------------------------------------');
        var gws = {};														//save it here for chaincode investigator
        wss = new ws.Server({ server: server });												//start the websocket now
        wss.on('connection', function connection(ws) {
            ws.on('message', function incoming(message) {
                console.log('received ws msg:', message);
                var data = JSON.parse(message);
                part2.process_msg(ws, data);

            });
            ws.on('close', function () {
            });
        });

        wss.broadcast = function broadcast(data) {											//send to all connections
            wss.clients.forEach(function each(client) {
                try {
                    data.v = '2';
                    client.send(JSON.stringify(data));
                }
                catch (e) {
                    console.log('error broadcast ws', e);
                }
            });
        };
        //clients will need to know if blockheight changes
        setInterval(function () {
            var options = {
                host: peerHosts[0],
                port: '7050',
                path: '/chain',
                method: 'GET'
            };

            function success(statusCode, headers, resp) {
                resp = JSON.parse(resp);
                if (resp && resp.height) {
                    wss.broadcast({ msg: 'reset' });
                }
            };
            function failure(statusCode, headers, msg) {
                console.log('chainstats failure :(');
                console.log('status code: ' + statusCode);
                console.log('headers: ' + headers);
                console.log('message: ' + msg);
            };

            var goodJSON = false;
            var request = http.request(options, function (resp) {
                var str = '', temp, chunks = 0;
                resp.setEncoding('utf8');
                resp.on('data', function (chunk) {                                                            //merge chunks of request
                    str += chunk;
                    chunks++;
                });
                resp.on('end', function () {
                    if (resp.statusCode == 204 || resp.statusCode >= 200 && resp.statusCode <= 399) {
                        success(resp.statusCode, resp.headers, str);
                    }
                    else {
                        failure(resp.statusCode, resp.headers, str);
                    }
                });
            });

            request.on('error', function (e) {                                                                //handle error event
                failure(500, null, e);
            });

            request.setTimeout(20000);
            request.on('timeout', function () {                                                                //handle time out event
                failure(408, null, 'Request timed out');
            });

            request.end();
        }, 5000);
    }
}
