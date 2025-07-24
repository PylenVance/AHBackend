const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const os = require("os");
const si = require("systeminformation");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../meowmeowapi/.env"),
});

function userHasRole(interaction) {
  return interaction.member?.roles.cache.has("1397899730943479930");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Get current game players and VPS stats."),
  
  async execute(interaction) {
    if (!userHasRole(interaction)) {
      return interaction.reply({
        content: "❌ You don't have permission to use this command.",
        ephemeral: true,
      });
    }
    
    const placeId = "7951799810";

    await interaction.deferReply();

    // Fetch ROBLOX player count
    let robloxPlayers = "Unavailable";
    try {
      const response = await axios.get(`https://games.roblox.com/v1/games?universeIds=${placeId}`);
      robloxPlayers = response.data.data[0]?.playing ?? "Unknown";
    } catch (err) {
      console.error("Error fetching Roblox data:", err.message);
    }

    // VPS Stats
    const totalMem = os.totalmem() / (1024 * 1024 * 1024);
    const freeMem = os.freemem() / (1024 * 1024 * 1024);
    const usedMem = totalMem - freeMem;

    const cpuLoad = await si.currentLoad();
    const netStats = await si.networkStats();

    const embed = new EmbedBuilder()
      .setTitle("📊 System & Game Status")
      .addFields(
        { name: "🎮 Roblox Players", value: `${robloxPlayers} currently playing`, inline: true },
        { name: "🧠 RAM Usage", value: `${usedMem.toFixed(2)} / ${totalMem.toFixed(2)} GB`, inline: true },
        { name: "💻 CPU Load", value: `${cpuLoad.currentLoad.toFixed(2)}%`, inline: true },
        { name: "🌐 Network", value: `↑ ${(netStats[0].tx_sec / 1024).toFixed(2)} KB/s | ↓ ${(netStats[0].rx_sec / 1024).toFixed(2)} KB/s`, inline: true }
      )
      .setColor(0x00bfff)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
