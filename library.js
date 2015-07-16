'use strict';

var user = module.parent.require('./user'),
  meta = module.parent.require('./meta'),
  db = module.parent.require('../src/database'),
  passport = module.parent.require('passport'),
  passportWeibo = require('passport-weibo').Strategy,
  fs = module.parent.require('fs'),
  path = module.parent.require('path'),
  nconf = module.parent.require('nconf'),
  async = module.parent.require('async');

var constants = module.parent.require('../plugin_configs/sso_weibo_constants');

var Weibo = {};

Weibo.getStrategy = function(strategies, callback) {
  passport.use(new passportWeibo({
    clientID: constants.key,
    clientSecret: constants.secret,
    callbackURL: nconf.get('url') + '/auth/weibo/callback'
  }, function(token, tokenSecret, profile, done) {
    Weibo.login(profile.id, profile.displayName, function(err, user) {
      if (err) {
        return done(err);
      }
      done(null, user);
    });
  }));

  strategies.push({
    name: 'weibo',
    url: '/auth/weibo',
    callbackURL: '/auth/weibo/callback',
    icon: 'fa-weibo',
    scope: ''
  });

  callback(null, strategies);
};

Weibo.login = function(wbid, handle, callback) {
  Weibo.getUidByWeiboId(wbid, function(err, uid) {
    if (err) {
      return callback(err);
    }

    if (uid !== null) {
      // Existing User
      callback(null, {
        uid: uid
      });
    } else {
      // New User
      user.create({
        username: handle
      }, function(err, uid) {
        if (err) {
          return callback(err);
        }

        // Save weibo-specific information to the user
        user.setUserField(uid, 'wbid', wbid);
        db.setObjectField('wbid:uid', wbid, uid);

        callback(null, {
          uid: uid
        });
      });
    }
  });
};

Weibo.getUidByWeiboId = function(wbid, callback) {
  db.getObjectField('wbid:uid', wbid, function(err, uid) {
    if (err) {
      return callback(err);
    }
    callback(null, uid);
  });
};

Weibo.deleteUserData = function(uid, callback) {
  async.waterfall([
    async.apply(user.getUserField, uid, 'wbid'),
    function(oAuthIdToDelete, next) {
      db.deleteObjectField('wbid:uid', oAuthIdToDelete, next);
    }
  ], function(err) {
    if (err) {
      winston.error('[sso-weibo] Could not remove OAuthId data for uid ' + uid + '. Error: ' + err);
      return callback(err);
    }
    callback(null, uid);
  });
};

module.exports = Weibo;