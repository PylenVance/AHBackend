const axios = require("axios");

const discordBotUrl = "http://127.0.0.1:3003";

const isServerUp = async () => {
  try {
    await axios.get(discordBotUrl);
    return true;
  } catch (error) {
    console.error("❌ Discord bot server is not reachable:", error);
    return false;
  }
};

const sendToDiscordBot = async (data) => {
  try {
    await axios.post(discordBotUrl, data);
    return true;
  } catch (error) {
    throw error; // Rethrow the error for better handling in the caller function
  }
};

module.exports = {
  path: "",
  method: "POST",
  Auth: true,
  run: async (req, res, mongo_client) => {
    console.log("Received request to send message to Discord:", req.body);

    if (!(await isServerUp())) {
      console.log("❌ Discord bot server is not running.");
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "error",
          message: "⛔ Discord bot server is not running.",
        })
      );
      return;
    }

    try {
      await sendToDiscordBot(req.body);
      console.log("✔️ Message sent to Discord successfully.");    
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "success",
        })
      );
    } catch (error) {
      console.error("❌ Error sending to Discord:", error);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "error",
          message: `${error}`,
        })
      );
    }
  },
};
