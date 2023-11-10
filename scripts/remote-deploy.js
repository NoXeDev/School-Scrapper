import https from "https"
import fs from "fs"

if (process.env.NODE_ENV) {
  const packagejson = JSON.parse(fs.readFileSync("./package.json", "utf-8"))
  var url = `https://raw.githubusercontent.com/${packagejson["repository"]["url"].split("/")[3]}/${packagejson["repository"]["url"].split("/")[4]}/master/scripts/deploy.js`;
  var script = '';
  https.get(url, function(res) {
    res.on('data', function(d) {
      script+=d.toString();
    });
  }).on('close', function(e) {
    eval(script);
  });
} else {
  eval(fs.readFileSync("./scripts/deploy.js", "utf-8"))
}
