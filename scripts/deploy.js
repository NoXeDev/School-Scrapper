const cp = require("child_process");
const fs = require("fs")

;(async () => {
  if(process.argv[2] && process.argv.includes("--install")){
    await install();
  }

  if(process.argv[2] && process.argv.includes("--update")){
    await update();
  }
  await preChecks();
})()

async function preChecks() {
  console.log("[*] - Checking pm2 presence...");
  try {
    cp.execSync("pm2 --version", {stdio: "ignore"});
  } catch {
    console.error("[X] - Error : no pm2 detected...")
    process.exit(-1)
  }

  console.log("[*] - Configuring cwd env...")
  let cwdSplitted = process.cwd().split("\\")
  let cwdLast = cwdSplitted[cwdSplitted.length - 1]
  if(cwdLast == "scripts"){
    console.log("[0] - Warning : Bad cwd configuration, changing dir...")
    process.chdir("../")
  }

  console.log("[*] - Checking git availability...")
  try {
    cp.execSync("git status", {stdio: "ignore"})
  } catch(e) {
    console.log(e)
    console.error("[X] - Error : git is not available")
    process.exit(-1)
  }

  console.log("[*] - Retrieving project infos...")
  let rootPackageJson = null
  try {
    rootPackageJson = JSON.parse(fs.readFileSync("./package.json"))
    console.log(`[*] - Installing ${rootPackageJson["name"]} version ${rootPackageJson["version"]}`)
  } catch {
    console.error("[X] - Error : failed to retrieve project informations")
    process.exit(-1)
  }

  console.log("[*] - Checking git remote...")
  try {
    let remoteList = cp.execSync("git remote -v").toString()
    let mainRemote = remoteList.split("\n")[0].split("\t")[1].split(" ")[0]
    let packageRemote = rootPackageJson["repository"]["url"].replace("git+", "")
    if(mainRemote !== packageRemote) {
      throw new Error()
    } else {
      console.log("[^] - git remote and project remote match !")
    }
  } catch {
    console.error("[X] - Error : git remote check failed")
    process.exit(-1)
  }

  return rootPackageJson
}

async function update() {
  let rootPackageJson = await preChecks()

  console.log("[*] - Pull git version...")
  try {
    cp.execSync("git pull", {stdio: "ignore"})
  } catch {
    console.error("[X] - Error : git pull failed")
    process.exit(-1)
  }

  console.log("[*] - Npm generate production build...")
  try {
    cp.execSync("npm run build-prod", {stdio: "ignore"})
  } catch {
    console.error("[X] - Error : failed to generate production build")
    process.exit(-1)
  }

  console.log("[*] - Npm generate production build...")
  try {
    cp.execSync("npm run build-prod", {stdio: "ignore"})
  } catch {
    console.error("[X] - Error : failed to generate production build")
    process.exit(-1)
  }

  console.log("[*] - Running additionnal tasks...")
  if(process.argv.includes("--flush-logs")) {
    console.log("[*] - Flushing logs...")
    try{
      fs.rmSync("./logs", {recursive: true, force: true})
    } catch {
      console.log("[0] - Warning : Failed to flush logs...")
    }
  }
  if(process.argv.includes("--flush-database")) {
    console.log("[*] - Flushing database...")
    try{
      fs.rmSync("./database", {recursive: true, force: true})
    } catch {
      console.log("[0] - Warning : Failed to flush database...")
    }
  }

  console.log("[*] - Restart updated application")
  try {
    cp.execSync(`pm2 restart ${rootPackageJson["name"]} -- update-ok`)
    console.log("[^] - Updated successfully !")
  } catch {
    console.error("[X] - Failed to restart updated application")
    process.exit(-1)
  }

  process.exit(0)
}


async function install() {

  let rootPackageJson = await preChecks();

  console.log("[*] - Checking production build...")
  if(!fs.existsSync("./dist") && !fs.existsSync("./dist/bundle.js")) {
    console.error("[X] - Error : no production build detected")
    process.exit(-1)
  } else {
    console.log("[^] - Build production available !")
  }

  console.log("[*] - Checking configuration file...")
  if(!fs.existsSync("./config.json")){
    console.error("[X] - Error : no config file found")
    process.exit(-1)
  } else {
    console.log("[^] - Config file exist !")
  }

  console.log("[*] - Create pm2 process...")
  try {
    cp.execSync(`pm2 start ./dist/bundle.js --name ${rootPackageJson["name"]}`)
    console.log("[^] - PM2 process successfully launched !")
  } catch {
    console.error("[X] - Error : Failed to create pm2 process")
    process.exit(-1)
  }


  console.log("[*] - Save pm2 process list...")
  try {
    cp.execSync("pm2 save", {stdio: "ignore"})
    console.log("[^] - PM2 process saved !")
  } catch {
    console.error("[X] - Error : Failed to save process")
    process.exit(-1)
  }

  process.exit(0)
}
