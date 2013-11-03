#!/usr/bin/env node
// Sample Facebook Application that runs on Canvas, Page Tabs, Website
// (including Mobile). Please look at the associated readme for more
// information.
// https://github.com/daaku/nodejs-fb-sample-app
var fs = require('fs')
var url = require('url')
var querystring = require('querystring')
var signedRequest = require('signed-request')
var express = require('express')
var request = require('request')
var signedRequestMaxAge = 86400
var FBAPP = {
    id: process.env.FACEBOOK_APP_ID,
    secret: process.env.FACEBOOK_SECRET,
    ns: process.env.FACEBOOK_NAMESPACE,
    scope: process.env.FACEBOOK_SCOPE
}

// The URL to our Canvas Application.
// https://developers.facebook.com/docs/guides/canvas/
var canvasURL = url.format({
    protocol: 'https',
    host: 'apps.facebook.com',
    pathname: FBAPP.ns + '/'
})

// Makes a URL to the Facebook Login dialog.
// https://developers.facebook.com/docs/authentication/canvas/
function loginURL(redirectURI) {
    return url.format({
        protocol: 'https',
        host: 'www.facebook.com',
        pathname: 'dialog/oauth',
        query: {
            client_id: FBAPP.id,
            redirect_uri: redirectURI,
            scope: FBAPP.scope,
            response_type: 'none'
        }
    })
}

// Get the access_token from the signed request.
// https://developers.facebook.com/docs/authentication/server-side/
function getAccessToken(sr, cb) {
    if (!sr) return process.nextTick(cb.bind(null, new Error('no signed request')))
    if (sr.oauth_token)
        return process.nextTick(cb.bind(null, null, sr.oauth_token))
    if (!sr.code)
        return process.nextTick(cb.bind(null, new Error('no token or code')))
    request.get(
        { url: 'https://graph.facebook.com/oauth/access_token',
            qs: {
                client_id: FBAPP.id,
                client_secret: FBAPP.secret,
                code: sr.code,
                redirect_uri: '' // the cookie uses a empty redirect_uri
            },
            encoding: 'utf8'
        },
        function getAccessTokenCb(er, res, body) {
            if (er) return cb(er)
            var r = querystring.parse(body)
            if (r && r.access_token) return cb(null, r.access_token)
            cb(new Error('unexpected access_token exchange: ' + body))
        }
    )
}

// Get the /me response for the user.
// https://developers.facebook.com/docs/reference/api/user/
function graphMe(sr, cb) {
    getAccessToken(sr, function graphMeAccessTokenCb(er, accessToken) {
        if (er) return cb(er)
        request.get(
            {
                url: 'https://graph.facebook.com/me',
                qs: { access_token: accessToken },
                json: true
            },
            function graphMeRequestCb(er, res, body) {
                if (er) return cb(er)
                console.log(body)
                cb(null, body)
            }
        )
    })
}

// Send the login page response.
function sendLogin(req, res, next) {
    var conf = {canvasURL: canvasURL,
        appId: FBAPP.id,
        scope: FBAPP.scope,
        reloadOnLogout: false,
        reloadOnLogin: true};
    res.render('login', {conf: conf});
}

// Our Express Application:
// http://expressjs.com/
var app = express()
app.use(express.bodyParser())
app.use(express.cookieParser())
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');

// Notify the developer when the configuration is bad.
app.all('*', function (req, res, next) {
    if (!FBAPP.id || !FBAPP.secret || !FBAPP.ns) {
        return res.send(
            500,
            '<a href="https://github.com/daaku/nodejs-fb-sample-app">' +
                'Facebook application has not been configured. Follow the readme.' +
                '</a>'
        )
    }
    next()
})

// Parses the signed_request sent on Canvas requests or from the cookie.
// https://developers.facebook.com/docs/authentication/signed_request/
app.all('*', function (req, res, next) {
    var raw = req.param('signed_request')
    if (!raw) raw = req.cookies['fbsr_' + FBAPP.id]
    if (!raw) return next()
    try {
        req.signedRequest = signedRequest.parse(
            raw,
            FBAPP.secret,
            signedRequestMaxAge
        )
        return next()
    } catch (e) {
        return res.send(400, String(e))
    }
})

app.all('/', function (req, res, next) {
    if (req.signedRequest && req.signedRequest.user_id) {
        graphMe(
            req.signedRequest,
            function (er, me) {
                if (er) {
                    console.error(er)
                    return sendLogin(req, res, next)
                }
                var conf = {canvasURL: canvasURL,
                    appId: FBAPP.id,
                    reloadOnLogout: true,
                    reloadOnLogin: false};

                res.render('canvas', {me: me, conf: conf});
            }
        )
    } else {
        sendLogin(req, res, next)
    }
})

// Start your engines.
var port = process.env.PORT || 5000
app.listen(port, function () {
    console.log('Listening on ' + port)
})
