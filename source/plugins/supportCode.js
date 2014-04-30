var _ = require("lodash");

module.exports = function(env, callback) {
	env.helpers.getArticlesList = function (contents) {
		return _.chain(contents["articles"]._.directories)
			.map(function(item){ return item.index })
			.value();
	};

	env.helpers.formatDate = function(date) {
		var month = date.getMonth()+1;
		if (month < 10) {
			month = "0" + month;
		}
     	return date.getDate() + "." + month + "." + date.getFullYear();
	}

	callback();
};