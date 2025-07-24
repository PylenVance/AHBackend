const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../meowmeowapi/.env") });

const MONGO_URI = process.env.MONGO_URI;
const mongoClient = new MongoClient(MONGO_URI);
let dropCollection;

function userHasRole(interaction) {
  return interaction.member?.roles.cache.has("1385356117072150558");
}

async function connectDb() {
  if (!mongoClient.topology || !mongoClient.topology.isConnected()) {
    await mongoClient.connect();
  }
  const db = mongoClient.db("ArcadeHaven");
  dropCollection = db.collection("dropQueue");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("viewqueue")
    .setDescription("View the current item drop queue")
    .addIntegerOption(option =>
      option.setName("itemid")
        .setDescription("View details for a specific item ID")
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName("name")
        .setDescription("Search drops by item name (partial match)")
        .setRequired(false)
        .setAutocomplete(true)
    ),

  // Autocomplete handler for itemid and name
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    await connectDb();

    // Fetch up to 25 drops that are not done
    const drops = await dropCollection.find({ done: false }).limit(25).toArray();

    if (focusedOption.name === "itemid") {
      const focusedValue = focusedOption.value.toString();

      const choices = drops.map(drop => ({
        name: `${drop.name} (ID: ${drop.itemId})`,
        value: drop.itemId,
      }));

      const filtered = choices.filter(choice =>
        choice.name.toLowerCase().includes(focusedValue.toLowerCase())
      );

      await interaction.respond(filtered.slice(0, 25));
    } else if (focusedOption.name === "name") {
      const focusedValue = focusedOption.value.toLowerCase();

      const choices = drops.map(drop => ({
        name: drop.name,
        value: drop.name,
      }));

      const filtered = choices.filter(choice =>
        choice.name.toLowerCase().includes(focusedValue)
      );

      // Remove duplicates (same name might appear multiple times)
      const uniqueChoices = [];
      const seen = new Set();
      for (const choice of filtered) {
        if (!seen.has(choice.value)) {
          uniqueChoices.push(choice);
          seen.add(choice.value);
        }
      }

      await interaction.respond(uniqueChoices.slice(0, 25));
    }
  },

  async execute(interaction) {
    if (!userHasRole(interaction)) {
      return interaction.reply({
        content: "❌ You don't have permission to use this command.",
        ephemeral: true,
      });
    }
    await connectDb();

    const itemId = interaction.options.getInteger("itemid");
    const nameSearch = interaction.options.getString("name");

    let drop;

    if (itemId) {
      // Prioritize itemid search if provided
      drop = await dropCollection.findOne({ itemId, done: false });
      if (!drop) {
        return interaction.reply({ content: `❌ No active drop found with item ID ${itemId}.`, ephemeral: true });
      }
    } else if (nameSearch) {
      // Search by partial name case-insensitive
      const regex = new RegExp(nameSearch, "i");
      drop = await dropCollection.findOne({ name: regex, done: false });
      if (!drop) {
        return interaction.reply({ content: `❌ No active drop found matching name "${nameSearch}".`, ephemeral: true });
      }
    } else {
      // Show compact list
      const drops = await dropCollection.find({ done: false }).sort({ scheduledAt: 1 }).toArray();

      if (drops.length === 0) {
        return interaction.reply({ content: "The drop queue is currently empty.", ephemeral: true });
      }

      const lines = drops.slice(0, 20).map(drop => {
        const sched = `<t:${drop.scheduledAt}:R>`;
        return `**${drop.name}** (ID: \`${drop.itemId}\`) — Scheduled ${sched}`;
      });

      const embed = new EmbedBuilder()
        .setTitle("📦 Current Drop Queue (Compact View)")
        .setDescription(lines.join("\n"))
        .setColor(0x7289da)
        .setTimestamp();

      if (drops.length > 20) {
        embed.setFooter({ text: `Showing 20 of ${drops.length} drops` });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Show detailed info for found drop (by itemId or name)
    const scheduledAtStr = `<t:${drop.scheduledAt}:F>`;
    const durationStr = drop.duration > 0 ? `${drop.duration}s` : "Unique / Unlimited";

    const embed = new EmbedBuilder()
      .setTitle(`📦 Drop Details: ${drop.name} (ID: ${drop.itemId})`)
      .addFields(
        { name: "Scheduled At", value: scheduledAtStr, inline: false },
        { name: "Quantity", value: drop.quantity.toString(), inline: true },
        { name: "Price", value: `${drop.price} R$`, inline: true },
        { name: "Duration", value: durationStr, inline: true },
        { name: "Type", value: drop.type, inline: true },
        { name: "Description", value: drop.description || "No description available.", inline: false },
      )
      .setColor(0x7289da)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
