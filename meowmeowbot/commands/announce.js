const { SlashCommandBuilder } = require("discord.js");
const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../meowmeowapi/.env") });

const UNIVERSE_ID = "7951799810";
const OPEN_CLOUD_TOKEN = process.env.DATASTORE_KEY;

function userHasRole(interaction) {
  return interaction.member?.roles.cache.has("1391438244259823758");
}

async function publishAnnouncement(message) {
  const url = `https://apis.roblox.com/cloud/v2/universes/${UNIVERSE_ID}:publishMessage`;

  const data = {
    topic: "GlobalSystems",
    message: JSON.stringify({
      system: "Announcement",
      message: message,
    }),
  };

  const res = await axios.post(url, data, {
    headers: {
      "x-api-key": OPEN_CLOUD_TOKEN,
      "Content-Type": "application/json",
    },
  });

  return res.data;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send an announcement to all in-game players.")
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription('The announcement message (use "empty" for blank)')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!userHasRole(interaction)) {
      return interaction.reply({
        content: "❌ You are not authorized to use this command.",
        ephemeral: true,
      });
    }

    let msg = interaction.options.getString("message");

    if (msg.trim().toLowerCase() === "empty") {
      msg = "";
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await publishAnnouncement(msg);
      await interaction.editReply({ content: "✅ Announcement sent!" });
    } catch (err) {
      console.error("Announcement failed:", err);
      await interaction.editReply({ content: "❌ Failed to send announcement." });
    }
  },
};
