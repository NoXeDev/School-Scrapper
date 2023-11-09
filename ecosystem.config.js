module.exports = {
  apps : [{
    name   : "school-scrapper",
    node_args   : "--enable-source-maps",
    script : "./dist/bundle.js",
    cwd: "./",
    max_restarts: 10,
    restart_delay: 3000,
    time: false,
    log_file: "./logs/pm2.log",
  }]
}
