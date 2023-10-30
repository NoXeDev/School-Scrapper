module.exports = {
  apps : [{
    name   : "school-scrapper",
    script : "./dist/bundle.js",
    cwd: "./",
    max_restarts: 10,
    restart_delay: 3000,
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    log_file: "./logs/pm2.log",
  }]
}
