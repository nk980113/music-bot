# Tammy Music Bot
 This is a music bot on Discord, for my friend Tammy#1121.
# Usage
 1. Clone this repo.
 ```sh
 $ git clone https://github.com/nk980113/music-bot.git
 ```
 2. Install dependcies.
 ```sh
 $ npm install
 ```
 3. Build bot file.
 ```sh
 $ npm run build
 ```
 4. Edit [ex.config.json](ex.config.json), and rename it "config.json".
 ```json
 {
    "clientId": "ID here",
    "token": "token here",
    "deploy": true
 }
 ```
 5. Deploy slash commands.
 ```sh
 $ node deploy.js
 ```
 6. Make your bot online.
 ```sh
 $ node bot.js
 ```
 PS. Step 5. and 6. can be done in 1 line:
 ```sh
 $ npm run deploy-and-start
 ```