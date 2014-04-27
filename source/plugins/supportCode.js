var _ = require("lodash");

module.exports = function(env, callback) {
	env.helpers.getArticlesList = function (contents) {
		return _.chain(contents["articles"]._.directories)
			.map(function(item){ return item.index })
			.value();
	};

	callback();
};