(function(module) {
	"use strict";

	var user = module.parent.require('./user'),
		meta = module.parent.require('./meta'),
		db = module.parent.require('../src/database'),
		passport = module.parent.require('passport'),
		passportWeibo = require('passport-weibo').Strategy,
		fs = module.parent.require('fs'),
		path = module.parent.require('path'),
		nconf = module.parent.require('nconf'),
		async = module.parent.require('async');

	var constants = Object.freeze({
		'name': "Weibo",
		'admin': {
			'route': '/plugins/sso-weibo',
			'icon': 'fa-weibo'
		}
	});

	var Weibo = {};

	Weibo.init = function(data, callback) {
		function render(req, res, next) {
			res.render('admin/plugins/sso-weibo', {});
		}

		data.router.get('/admin/plugins/sso-weibo', data.middleware.admin.buildHeader, render);
		data.router.get('/api/admin/plugins/sso-weibo', render);

		callback();
	};

	Weibo.getStrategy = function(strategies, callback) {
		if (meta.config['social:weibo:key'] && meta.config['social:weibo:secret']) {
			passport.use(new passportWeibo({
				clientID: meta.config['social:weibo:key'],
				clientSecret: meta.config['social:weibo:secret'],
				callbackURL: nconf.get('url') + '/auth/weibo/callback'
			}, function(token, tokenSecret, profile, done) {
				Weibo.login(profile.id, profile.username, profile.photos, function(err, user) {
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
				icon: constants.admin.icon,
				scope: ''
			});
		}

		callback(null, strategies);
	};

	Weibo.login = function(wbid, handle, photos, callback) {
		Weibo.getUidByWeiboId(wbid, function(err, uid) {
			if(err) {
				return callback(err);
			}

			if (uid !== null) {
				// Existing User
				callback(null, {
					uid: uid
				});
			} else {
				// New User
				user.create({username: handle}, function(err, uid) {
					if(err) {
						return callback(err);
					}

					// Save weibo-specific information to the user
					user.setUserField(uid, 'wbid', wbid);
					db.setObjectField('wbid:uid', wbid, uid);

					// Save their photo, if present
					if (photos && photos.length > 0) {
						var photoUrl = photos[0].value;
						photoUrl = path.dirname(photoUrl) + '/' + path.basename(photoUrl, path.extname(photoUrl)).slice(0, -6) + 'bigger' + path.extname(photoUrl);
						user.setUserField(uid, 'uploadedpicture', photoUrl);
						user.setUserField(uid, 'picture', photoUrl);
					}

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

	Weibo.addMenuItem = function(custom_header, callback) {
		custom_header.authentication.push({
			"route": constants.admin.route,
			"icon": constants.admin.icon,
			"name": constants.name
		});

		callback(null, custom_header);
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
}(module));
